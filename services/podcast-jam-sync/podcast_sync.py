"""
podcast_sync.py — WiseRavenShare podcast device synchronization.

Uses PostgreSQL LISTEN/NOTIFY for real-time push between devices and a
state machine for script card progression.  Designed to survive device
reconnects and logouts: register_device() always returns the last known
state so a returning device resumes exactly where it left off.
"""

import asyncio
import json
from enum import Enum
from typing import AsyncIterator, Optional

import asyncpg


class CardState(str, Enum):
    PENDING   = "pending"
    ACTIVE    = "active"
    ADVANCING = "advancing"
    COMPLETE  = "complete"


class RecordingState(str, Enum):
    IDLE      = "idle"
    RECORDING = "recording"
    PAUSED    = "paused"
    UPLOADING = "uploading"


class PodcastSyncEngine:
    """
    Per-session engine.  One instance per active podcast recording session.
    Runs inside FastAPI's event loop; durable state lives in PostgreSQL.
    """

    def __init__(self, session_id: str, pg_dsn: str):
        self.session_id = session_id
        self.pg_dsn     = pg_dsn

    # ------------------------------------------------------------------
    # DEVICE REGISTRATION & RECONNECT
    # ------------------------------------------------------------------
    async def register_device(
        self,
        device_id:    str,
        device_type:  str,
        capabilities: dict,
    ) -> dict:
        """
        Called when a podcast device (phone/tablet/laptop) connects.
        On reconnect returns the *last known* state so the device resumes
        exactly where it left off — survives login/logout.
        """
        conn = await asyncpg.connect(self.pg_dsn)
        try:
            row = await conn.fetchrow(
                """
                INSERT INTO podcast_device_sessions
                    (session_id, device_id, device_type, capabilities,
                     connected_at, last_seen_at)
                VALUES ($1, $2, $3, $4, now(), now())
                ON CONFLICT (session_id, device_id) DO UPDATE
                    SET last_seen_at = now(),
                        capabilities = EXCLUDED.capabilities,
                        connected_at = COALESCE(
                            podcast_device_sessions.connected_at, now())
                RETURNING id, connected_at, recording_state,
                          current_card_index, video_feed_active
                """,
                self.session_id, device_id, device_type,
                json.dumps(capabilities),
            )
            payload = json.dumps({
                "event":         "device_joined",
                "session_id":    self.session_id,
                "device_id":     device_id,
                "device_type":   device_type,
                "resumed_state": {
                    "recording_state":    row["recording_state"],
                    "current_card_index": row["current_card_index"],
                    "video_feed_active":  row["video_feed_active"],
                },
            })
            await conn.execute("NOTIFY podcast_session_events, $1", payload)
            return dict(row)
        finally:
            await conn.close()

    # ------------------------------------------------------------------
    # RECORDING STATE
    # ------------------------------------------------------------------
    async def set_recording_state(
        self, device_id: str, state: RecordingState
    ) -> dict:
        conn = await asyncpg.connect(self.pg_dsn)
        try:
            await conn.execute(
                "UPDATE podcast_sessions SET recording_state=$2, updated_at=now() WHERE session_id=$1",
                self.session_id, state.value,
            )
            await conn.execute(
                "UPDATE podcast_device_sessions SET recording_state=$3, last_seen_at=now() WHERE session_id=$1 AND device_id=$2",
                self.session_id, device_id, state.value,
            )
            payload = json.dumps({
                "event":           "recording_state_changed",
                "session_id":      self.session_id,
                "device_id":       device_id,
                "recording_state": state.value,
            })
            await conn.execute("NOTIFY podcast_session_events, $1", payload)
            return {"recording_state": state.value, "device_id": device_id}
        finally:
            await conn.close()

    # ------------------------------------------------------------------
    # SCRIPT CARD STATE MACHINE
    # ------------------------------------------------------------------
    async def advance_card(self, device_id: str, direction: str = "forward") -> dict:
        """
        Moves the active script card forward or back.  Row-level lock
        ensures one-active-card invariant across all devices.
        """
        conn = await asyncpg.connect(self.pg_dsn)
        try:
            async with conn.transaction():
                session = await conn.fetchrow(
                    "SELECT current_card_index, total_cards FROM podcast_sessions WHERE session_id=$1 FOR UPDATE",
                    self.session_id,
                )
                current   = session["current_card_index"]
                total     = session["total_cards"]
                new_index = min(current + 1, total - 1) if direction == "forward" else max(current - 1, 0)

                await conn.execute(
                    "UPDATE podcast_sessions SET current_card_index=$2, card_state=$3, updated_at=now() WHERE session_id=$1",
                    self.session_id, new_index, CardState.ACTIVE.value,
                )
                card = await conn.fetchrow(
                    "SELECT card_index, title, body, media_url, media_type, duration_seconds, speaker_hint FROM podcast_script_cards WHERE session_id=$1 AND card_index=$2",
                    self.session_id, new_index,
                )
                payload = {
                    "event":       "card_advanced",
                    "session_id":  self.session_id,
                    "card_index":  new_index,
                    "card":        dict(card) if card else None,
                    "advanced_by": device_id,
                    "direction":   direction,
                }
                await conn.execute("NOTIFY podcast_session_events, $1", json.dumps(payload))
                return payload
        finally:
            await conn.close()

    # ------------------------------------------------------------------
    # VIDEO FEED MANAGEMENT
    # ------------------------------------------------------------------
    async def update_video_feed(self, device_id: str, feed_active: bool, feed_type: str = "camera") -> dict:
        """Enforces a single active video source across all devices."""
        conn = await asyncpg.connect(self.pg_dsn)
        try:
            async with conn.transaction():
                if feed_active:
                    await conn.execute(
                        "UPDATE podcast_device_sessions SET video_feed_active=FALSE WHERE session_id=$1 AND device_id!=$2 AND video_feed_active=TRUE",
                        self.session_id, device_id,
                    )
                await conn.execute(
                    "UPDATE podcast_device_sessions SET video_feed_active=$2, video_feed_type=$3, last_seen_at=now() WHERE session_id=$1 AND device_id=$4",
                    self.session_id, feed_active, feed_type, device_id,
                )
                payload = {
                    "event":            "video_feed_changed",
                    "session_id":       self.session_id,
                    "active_device_id": device_id if feed_active else None,
                    "feed_type":        feed_type,
                }
                await conn.execute("NOTIFY podcast_session_events, $1", json.dumps(payload))
                return payload
        finally:
            await conn.close()

    # ------------------------------------------------------------------
    # CHUNK REGISTRATION (resumable recording)
    # ------------------------------------------------------------------
    async def register_chunk(self, device_id: str, chunk_index: int, storage_key: str, size_bytes: int, sha256: str) -> dict:
        """Idempotent: re-uploading an existing chunk is silently ignored."""
        conn = await asyncpg.connect(self.pg_dsn)
        try:
            await conn.execute(
                "INSERT INTO podcast_recording_chunks (session_id, device_id, chunk_index, storage_key, size_bytes, sha256) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (session_id, device_id, chunk_index) DO NOTHING",
                self.session_id, device_id, chunk_index, storage_key, size_bytes, sha256,
            )
            rows = await conn.fetch(
                "SELECT chunk_index FROM podcast_recording_chunks WHERE session_id=$1 AND device_id=$2 ORDER BY chunk_index",
                self.session_id, device_id,
            )
            return {"registered": chunk_index, "uploaded_chunks": [r["chunk_index"] for r in rows]}
        finally:
            await conn.close()

    # ------------------------------------------------------------------
    # REAL-TIME SUBSCRIPTION
    # ------------------------------------------------------------------
    async def listen(self) -> AsyncIterator[dict]:
        """Yields events for this session.  Wire to a WebSocket endpoint."""
        conn  = await asyncpg.connect(self.pg_dsn)
        queue: asyncio.Queue = asyncio.Queue()

        def _handler(_conn, _pid, _channel, raw):
            try:
                data = json.loads(raw)
                if data.get("session_id") == self.session_id:
                    queue.put_nowait(data)
            except Exception:
                pass

        try:
            await conn.add_listener("podcast_session_events", _handler)
            while True:
                yield await queue.get()
        finally:
            await conn.remove_listener("podcast_session_events", _handler)
            await conn.close()
