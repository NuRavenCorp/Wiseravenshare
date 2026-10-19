"""
jam_sync.py — WiseRavenShare distributed musician jamming.

Architecture:
  - Each musician runs a browser WebRTC client.
  - This module handles: session orchestration, latency measurement,
    snowball routing order, and metronome sync.
  - Audio never touches this server; it flows P2P or through an SFU.
  - PostgreSQL stores session state and measured offsets.

Critical insight: disable ALL voice-processing codecs for music.
Voice-optimized Opus (40 kbps mono, noise-suppressed) destroys music.
Use 128 kbps stereo with echoCancellation=false, noiseSuppression=false.
"""

import asyncio
import json
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import AsyncIterator, Optional

import asyncpg


class JamRole(str, Enum):
    DRUMMER      = "drummer"
    BASSIST      = "bassist"
    GUITARIST    = "guitarist"
    KEYBOARDIST  = "keyboardist"
    VOCALIST     = "vocalist"
    OTHER        = "other"


ROLE_PRIORITY = {
    JamRole.DRUMMER:     0,
    JamRole.BASSIST:     1,
    JamRole.KEYBOARDIST: 2,
    JamRole.GUITARIST:   3,
    JamRole.VOCALIST:    4,
    JamRole.OTHER:       5,
}


@dataclass
class Musician:
    musician_id:  str
    role:         JamRole
    display_name: str
    rtt_ms:       float = 0.0
    # measured one-way latency to each *other* musician
    peer_offsets: dict = field(default_factory=dict)


class JamSyncEngine:
    """
    Orchestrates a jam session.  Does NOT carry audio.
    Responsibilities:
      1. Latency measurement between all pairs of musicians.
      2. Snowball routing order (drummer anchors the chain).
      3. Shared metronome broadcast with per-musician offset correction.
    """

    def __init__(self, jam_id: str, pg_dsn: str):
        self.jam_id              = jam_id
        self.pg_dsn              = pg_dsn
        self.musicians:   dict[str, Musician] = {}
        self.metronome_bpm:  int   = 120
        self.metronome_start_ts: Optional[float] = None
        self._routing_order: list[str] = []

    # ------------------------------------------------------------------
    # LATENCY MEASUREMENT (Ping-Pong)
    # ------------------------------------------------------------------
    async def handle_ping(self, musician_id: str, client_ts: float) -> dict:
        """Echo the ping so the client can measure RTT."""
        return {"pong": True, "server_ts": time.time(), "client_ts": client_ts}

    async def update_rtt(self, musician_id: str, rtt_ms: float) -> None:
        """Store measured RTT and persist to DB for reconnect recovery."""
        if musician_id in self.musicians:
            self.musicians[musician_id].rtt_ms = rtt_ms

        conn = await asyncpg.connect(self.pg_dsn)
        try:
            await conn.execute(
                "UPDATE jam_musicians SET rtt_ms=$3, last_seen_at=now() WHERE jam_id=$1 AND musician_id=$2",
                self.jam_id, musician_id, rtt_ms,
            )
        finally:
            await conn.close()

    # ------------------------------------------------------------------
    # SNOWBALL ROUTING ORDER
    # ------------------------------------------------------------------
    async def compute_snowball_order(self) -> list[str]:
        """
        Sort musicians so each hears only those 'earlier' in the chain.
        Drummer anchors first (lowest perceived latency for rhythm).
        Within role, sort by ascending RTT to server.
        """
        ordered = sorted(
            self.musicians.values(),
            key=lambda m: (ROLE_PRIORITY.get(m.role, 5), m.rtt_ms),
        )
        self._routing_order = [m.musician_id for m in ordered]

        conn = await asyncpg.connect(self.pg_dsn)
        try:
            payload = json.dumps({
                "event":  "snowball_order_computed",
                "jam_id": self.jam_id,
                "order":  self._routing_order,
            })
            await conn.execute("NOTIFY jam_events, $1", payload)
        finally:
            await conn.close()

        return self._routing_order

    # ------------------------------------------------------------------
    # METRONOME SYNC
    # ------------------------------------------------------------------
    async def start_metronome(self, bpm: int = 120) -> dict:
        """
        Starts a shared click track.  Each musician's browser runs a
        local Web Audio metronome synced to the server epoch.
        The 2-second count-in gives everyone time to align.

        Per-musician offset (metronome_offset_for) shifts their local
        clock by half-RTT so their click aligns with the group's
        perception of the beat.
        """
        self.metronome_bpm      = bpm
        self.metronome_start_ts = time.time() + 2.0  # 2-second count-in

        conn = await asyncpg.connect(self.pg_dsn)
        try:
            await conn.execute(
                """
                INSERT INTO jam_metronome_state (jam_id, bpm, start_ts, running)
                VALUES ($1, $2, to_timestamp($3), TRUE)
                ON CONFLICT (jam_id) DO UPDATE
                    SET bpm=EXCLUDED.bpm, start_ts=EXCLUDED.start_ts, running=TRUE
                """,
                self.jam_id, bpm, self.metronome_start_ts,
            )
            payload = {
                "event":    "metronome_started",
                "jam_id":   self.jam_id,
                "bpm":      bpm,
                "start_ts": self.metronome_start_ts,
                "offsets":  {
                    mid: self.metronome_offset_for(mid)
                    for mid in self.musicians
                },
            }
            await conn.execute("NOTIFY jam_events, $1", json.dumps(payload))
            return payload
        finally:
            await conn.close()

    def metronome_offset_for(self, musician_id: str) -> float:
        """
        Returns the ms offset this musician's local metronome should
        apply.  Half-RTT = one-way delay from server to client.
        """
        m = self.musicians.get(musician_id)
        return round(m.rtt_ms / 2.0, 1) if m else 0.0

    # ------------------------------------------------------------------
    # PAIRWISE OFFSET MATRIX
    # ------------------------------------------------------------------
    async def build_offset_matrix(self) -> dict:
        """
        For each pair (A, B): the delay A should add to B's incoming
        audio stream so it aligns with the reference (drummer).

        Positive value = A should buffer B's stream by that many ms.
        Negative value = no buffering needed (B is already ahead).
        """
        matrix: dict[str, dict[str, float]] = {}

        for a_id, a in self.musicians.items():
            matrix[a_id] = {}
            for b_id, b in self.musicians.items():
                if a_id == b_id:
                    continue
                a_one_way = a.rtt_ms / 2.0
                b_one_way = b.rtt_ms / 2.0
                matrix[a_id][b_id] = round(b_one_way - a_one_way, 1)

        conn = await asyncpg.connect(self.pg_dsn)
        try:
            await conn.execute(
                """
                INSERT INTO jam_offset_matrix (jam_id, matrix, computed_at)
                VALUES ($1, $2, now())
                ON CONFLICT (jam_id) DO UPDATE
                    SET matrix=EXCLUDED.matrix, computed_at=now()
                """,
                self.jam_id, json.dumps(matrix),
            )
        finally:
            await conn.close()

        return matrix

    # ------------------------------------------------------------------
    # AUDIO PARAMETERS (client-side guidance)
    # ------------------------------------------------------------------
    def audio_config_for(self, musician_id: str) -> dict:
        """
        Returns WebRTC constraints the browser must apply.
        Voice-processing must be disabled for music quality.
        """
        return {
            "audio": {
                "echoCancellation": False,
                "noiseSuppression": False,
                "autoGainControl":  False,
                "sampleRate":       48000,
                "channelCount":     2,
            },
            "codec": {
                "mimeType":     "audio/opus",
                "clockRate":    48000,
                "channels":     2,
                "bitrate":      128000,   # 128 kbps stereo, NOT 40 kbps voice
                "useinbandfec": True,
                "ptime":        20,       # 20 ms packets
            },
            "metronome_offset_ms": self.metronome_offset_for(musician_id),
            "routing_position":    (
                self._routing_order.index(musician_id)
                if musician_id in self._routing_order else -1
            ),
            "hear_from": self._routing_order[
                :self._routing_order.index(musician_id)
            ] if musician_id in self._routing_order else [],
        }

    # ------------------------------------------------------------------
    # REAL-TIME SUBSCRIPTION
    # ------------------------------------------------------------------
    async def listen(self) -> AsyncIterator[dict]:
        """Yields events for this jam session.  Wire to a WebSocket endpoint."""
        conn  = await asyncpg.connect(self.pg_dsn)
        queue: asyncio.Queue = asyncio.Queue()

        def _handler(_conn, _pid, _channel, raw):
            try:
                data = json.loads(raw)
                if data.get("jam_id") == self.jam_id:
                    queue.put_nowait(data)
            except Exception:
                pass

        try:
            await conn.add_listener("jam_events", _handler)
            while True:
                yield await queue.get()
        finally:
            await conn.remove_listener("jam_events", _handler)
            await conn.close()
