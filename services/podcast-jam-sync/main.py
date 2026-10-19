"""
main.py — WiseRavenShare Podcast + Jam Sync FastAPI service.

Endpoints:
  GET  /health
  POST /podcast/sessions
  POST /podcast/sessions/{id}/cards          (bulk add script cards)
  GET  /podcast/sessions/{id}/chunks         (list uploaded chunks for a device)
  POST /podcast/sessions/{id}/chunks/presign (generate presigned PUT URL)
  POST /podcast/sessions/{id}/chunks         (register a completed chunk)
  WS   /ws/podcast/{session_id}              (real-time device sync)
  POST /jam/sessions
  POST /jam/sessions/{id}/musicians
  POST /jam/sessions/{id}/metronome
  GET  /jam/sessions/{id}/audio-config/{musician_id}
  GET  /jam/sessions/{id}/offset-matrix
  WS   /ws/jam/{jam_id}                      (real-time jam sync)
"""

import json
import os
import time
import uuid
from typing import Optional

import asyncpg
import boto3
from botocore.client import Config
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from podcast_sync import PodcastSyncEngine, RecordingState
from jam_sync import JamSyncEngine, JamRole, Musician

# ── Configuration ──────────────────────────────────────────────────────────
PG_DSN      = os.environ["DATABASE_URL"]
DO_KEY      = os.environ.get("DO_SPACES_KEY", "")
DO_SECRET   = os.environ.get("DO_SPACES_SECRET", "")
DO_BUCKET   = os.environ.get("DO_SPACES_BUCKET", "wise-raven-media")
DO_ENDPOINT = os.environ.get("DO_SPACES_ENDPOINT", "https://nyc3.digitaloceanspaces.com")
DO_REGION   = os.environ.get("DO_SPACES_REGION", "nyc3")
SERVICE_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*").split(",")

app = FastAPI(title="WiseRavenShare Podcast & Jam Sync", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=SERVICE_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ──────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "service": "podcast-jam-sync"}


# ── Podcast REST ─────────────────────────────────────────────────────────────

class CreateSessionRequest(BaseModel):
    host_user_id: str
    title:        str
    cards:        list[dict] = []


class CardRequest(BaseModel):
    cards: list[dict]


class ChunkPresignRequest(BaseModel):
    device_id:   str
    chunk_index: int
    content_type: str = "video/webm"


class ChunkRegisterRequest(BaseModel):
    device_id:   str
    chunk_index: int
    storage_key: str
    size_bytes:  int
    sha256:      str


class RecordingStateRequest(BaseModel):
    device_id: str
    state:     str


@app.post("/podcast/sessions")
async def create_podcast_session(req: CreateSessionRequest):
    session_id = str(uuid.uuid4())
    conn = await asyncpg.connect(PG_DSN)
    try:
        await conn.execute(
            """
            INSERT INTO podcast_sessions
                (session_id, host_user_id, title, total_cards)
            VALUES ($1, $2, $3, $4)
            """,
            session_id, req.host_user_id, req.title, len(req.cards),
        )
        if req.cards:
            await _upsert_cards(conn, session_id, req.cards)
        return {"session_id": session_id, "total_cards": len(req.cards)}
    finally:
        await conn.close()


@app.post("/podcast/sessions/{session_id}/cards")
async def add_cards(session_id: str, req: CardRequest):
    conn = await asyncpg.connect(PG_DSN)
    try:
        await _upsert_cards(conn, session_id, req.cards)
        await conn.execute(
            "UPDATE podcast_sessions SET total_cards=$2, updated_at=now() WHERE session_id=$1",
            session_id, len(req.cards),
        )
        return {"total_cards": len(req.cards)}
    finally:
        await conn.close()


async def _upsert_cards(conn, session_id: str, cards: list[dict]):
    for i, card in enumerate(cards):
        await conn.execute(
            """
            INSERT INTO podcast_script_cards
                (session_id, card_index, title, body, media_url,
                 media_type, duration_seconds, speaker_hint)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            ON CONFLICT (session_id, card_index) DO UPDATE
                SET title=$3, body=$4, media_url=$5,
                    media_type=$6, duration_seconds=$7, speaker_hint=$8
            """,
            session_id, i,
            card.get("title", ""),
            card.get("body", ""),
            card.get("media_url"),
            card.get("media_type"),
            card.get("duration_seconds"),
            card.get("speaker_hint"),
        )


@app.post("/podcast/sessions/{session_id}/chunks/presign")
async def presign_chunk(session_id: str, req: ChunkPresignRequest):
    key = f"podcasts/{session_id}/{req.device_id}/chunk-{req.chunk_index:05d}.webm"
    client = boto3.client(
        "s3",
        region_name=DO_REGION,
        endpoint_url=DO_ENDPOINT,
        aws_access_key_id=DO_KEY,
        aws_secret_access_key=DO_SECRET,
        config=Config(signature_version="s3v4"),
    )
    url = client.generate_presigned_url(
        "put_object",
        Params={"Bucket": DO_BUCKET, "Key": key, "ContentType": req.content_type},
        ExpiresIn=3600,
    )
    return {"upload_url": url, "storage_key": key}


@app.get("/podcast/sessions/{session_id}/chunks")
async def list_chunks(session_id: str, device_id: str):
    conn = await asyncpg.connect(PG_DSN)
    try:
        rows = await conn.fetch(
            "SELECT chunk_index, storage_key, size_bytes FROM podcast_recording_chunks WHERE session_id=$1 AND device_id=$2 ORDER BY chunk_index",
            session_id, device_id,
        )
        return {"chunks": [dict(r) for r in rows]}
    finally:
        await conn.close()


@app.post("/podcast/sessions/{session_id}/chunks")
async def register_chunk(session_id: str, req: ChunkRegisterRequest):
    engine = PodcastSyncEngine(session_id, PG_DSN)
    return await engine.register_chunk(
        req.device_id, req.chunk_index, req.storage_key, req.size_bytes, req.sha256
    )


@app.post("/podcast/sessions/{session_id}/recording-state")
async def set_recording_state(session_id: str, req: RecordingStateRequest):
    engine = PodcastSyncEngine(session_id, PG_DSN)
    return await engine.set_recording_state(req.device_id, RecordingState(req.state))


# ── Podcast WebSocket ─────────────────────────────────────────────────────────

@app.websocket("/ws/podcast/{session_id}")
async def podcast_ws(ws: WebSocket, session_id: str):
    await ws.accept()
    device_id   = ws.query_params.get("device_id",   "unknown")
    device_type = ws.query_params.get("device_type", "browser")
    engine      = PodcastSyncEngine(session_id, PG_DSN)

    try:
        state = await engine.register_device(device_id, device_type, {})
        await ws.send_json({"event": "connected", "resumed_state": state})

        # Fan out NOTIFY events while also handling incoming commands
        async def _relay():
            async for event in engine.listen():
                try:
                    await ws.send_json(event)
                except Exception:
                    break

        relay_task = asyncio.ensure_future(_relay())
        try:
            while True:
                msg = await ws.receive_json()
                action = msg.get("action")
                if action == "advance_card":
                    await engine.advance_card(device_id, msg.get("direction", "forward"))
                elif action == "video_feed":
                    await engine.update_video_feed(device_id, msg.get("active", False), msg.get("feed_type", "camera"))
                elif action == "recording_state":
                    await engine.set_recording_state(device_id, RecordingState(msg.get("state", "idle")))
        finally:
            relay_task.cancel()
    except WebSocketDisconnect:
        pass


# ── Jam REST ──────────────────────────────────────────────────────────────────

class CreateJamRequest(BaseModel):
    host_user_id: str
    title:        str


class JoinJamRequest(BaseModel):
    musician_id:  str
    role:         str = "other"
    display_name: str = ""


class MetronomeRequest(BaseModel):
    bpm: int = 120


class RttReportRequest(BaseModel):
    musician_id: str
    rtt_ms:      float


_jam_engines: dict[str, JamSyncEngine] = {}


def _get_engine(jam_id: str) -> JamSyncEngine:
    if jam_id not in _jam_engines:
        _jam_engines[jam_id] = JamSyncEngine(jam_id, PG_DSN)
    return _jam_engines[jam_id]


@app.post("/jam/sessions")
async def create_jam_session(req: CreateJamRequest):
    jam_id = str(uuid.uuid4())
    conn   = await asyncpg.connect(PG_DSN)
    try:
        await conn.execute(
            "INSERT INTO jam_sessions (jam_id, host_user_id, title) VALUES ($1,$2,$3)",
            jam_id, req.host_user_id, req.title,
        )
        return {"jam_id": jam_id}
    finally:
        await conn.close()


@app.post("/jam/sessions/{jam_id}/musicians")
async def join_jam(jam_id: str, req: JoinJamRequest):
    conn = await asyncpg.connect(PG_DSN)
    try:
        await conn.execute(
            """
            INSERT INTO jam_musicians (jam_id, musician_id, role, display_name, connected_at)
            VALUES ($1,$2,$3,$4,now())
            ON CONFLICT (jam_id, musician_id) DO UPDATE
                SET role=$3, display_name=$4, last_seen_at=now()
            """,
            jam_id, req.musician_id, req.role, req.display_name,
        )
        engine = _get_engine(jam_id)
        engine.musicians[req.musician_id] = Musician(
            musician_id=req.musician_id,
            role=JamRole(req.role),
            display_name=req.display_name,
        )
        return {"joined": True}
    finally:
        await conn.close()


@app.post("/jam/sessions/{jam_id}/metronome")
async def start_metronome(jam_id: str, req: MetronomeRequest):
    engine = _get_engine(jam_id)
    return await engine.start_metronome(req.bpm)


@app.get("/jam/sessions/{jam_id}/audio-config/{musician_id}")
async def get_audio_config(jam_id: str, musician_id: str):
    engine = _get_engine(jam_id)
    return engine.audio_config_for(musician_id)


@app.get("/jam/sessions/{jam_id}/offset-matrix")
async def get_offset_matrix(jam_id: str):
    engine = _get_engine(jam_id)
    return await engine.build_offset_matrix()


@app.post("/jam/sessions/{jam_id}/rtt")
async def report_rtt(jam_id: str, req: RttReportRequest):
    engine = _get_engine(jam_id)
    await engine.update_rtt(req.musician_id, req.rtt_ms)
    order  = await engine.compute_snowball_order()
    matrix = await engine.build_offset_matrix()
    return {
        "snowball_order": order,
        "offset_matrix":  matrix,
        "audio_config":   engine.audio_config_for(req.musician_id),
    }


# ── Jam WebSocket ─────────────────────────────────────────────────────────────

import asyncio

@app.websocket("/ws/jam/{jam_id}")
async def jam_ws(ws: WebSocket, jam_id: str):
    await ws.accept()
    engine = _get_engine(jam_id)

    init     = await ws.receive_json()
    mid      = init.get("musician_id", str(uuid.uuid4()))
    role     = init.get("role", "other")
    name     = init.get("name", "")
    engine.musicians[mid] = Musician(musician_id=mid, role=JamRole(role), display_name=name)

    await ws.send_json({"event": "connected", "musician_id": mid, "audio_config": engine.audio_config_for(mid)})

    async def _relay():
        async for event in engine.listen():
            try:
                await ws.send_json(event)
            except Exception:
                break

    relay_task = asyncio.ensure_future(_relay())
    try:
        while True:
            msg = await ws.receive_json()
            t   = msg.get("type")
            if t == "ping":
                await ws.send_json(await engine.handle_ping(mid, msg.get("ts", time.time())))
            elif t == "rtt_report":
                await engine.update_rtt(mid, msg.get("rtt_ms", 0))
                order = await engine.compute_snowball_order()
                await ws.send_json({"event": "routing_update", "order": order, "audio_config": engine.audio_config_for(mid)})
            elif t == "start_metronome":
                await engine.start_metronome(msg.get("bpm", 120))
    except WebSocketDisconnect:
        pass
    finally:
        relay_task.cancel()
