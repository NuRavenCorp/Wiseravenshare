from __future__ import annotations

import asyncio
from collections import defaultdict
import json
import os

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

router = APIRouter(prefix="/karaoke", tags=["karaoke-relay"])

_connections: dict[str, set[WebSocket]] = defaultdict(set)
_connections_lock = asyncio.Lock()


async def _register(channel: str, websocket: WebSocket) -> None:
    await websocket.accept()
    async with _connections_lock:
        _connections[channel].add(websocket)


async def _unregister(channel: str, websocket: WebSocket) -> None:
    async with _connections_lock:
        peers = _connections.get(channel)
        if peers is None:
            return
        peers.discard(websocket)
        if not peers:
            _connections.pop(channel, None)


async def _broadcast(channel: str, source: WebSocket, payload: dict) -> None:
    async with _connections_lock:
        recipients = [socket for socket in _connections.get(channel, set()) if socket is not source]

    if not recipients:
        return

    stale: list[WebSocket] = []
    for socket in recipients:
        try:
            if "text" in payload:
                await socket.send_text(payload["text"])
            elif "bytes" in payload:
                await socket.send_bytes(payload["bytes"])
        except Exception:  # noqa: BLE001
            stale.append(socket)

    if stale:
        async with _connections_lock:
            peers = _connections.get(channel)
            if peers is not None:
                for socket in stale:
                    peers.discard(socket)
                if not peers:
                    _connections.pop(channel, None)


async def broadcast_signal(channel: str, payload: dict) -> None:
    relay_channel = (channel or "default").strip() or "default"
    text_payload = payload if isinstance(payload, str) else json.dumps(payload)
    async with _connections_lock:
        recipients = list(_connections.get(relay_channel, set()))

    stale: list[WebSocket] = []
    for socket in recipients:
        try:
            await socket.send_text(text_payload)
        except Exception:  # noqa: BLE001
            stale.append(socket)

    if stale:
        async with _connections_lock:
            peers = _connections.get(relay_channel)
            if peers is not None:
                for socket in stale:
                    peers.discard(socket)
                if not peers:
                    _connections.pop(relay_channel, None)


class KaraokeProcessRequest(BaseModel):
    audio_path: str
    audio_url: str
    channel: str = "default"
    track_name: str | None = None
    artist_name: str | None = None


async def _process_song(request: KaraokeProcessRequest) -> dict:
    try:
        from assemblyai.sync.v1 import SyncTranscriber, SyncTranscriptionConfig
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError("AssemblyAI sync SDK is unavailable in python-matrix.") from exc

    api_key = (os.getenv("ASSEMBLYAI_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("ASSEMBLYAI_API_KEY is not configured.")

    config = SyncTranscriptionConfig(timestamps=True)
    transcriber = SyncTranscriber(api_key=api_key, config=config)
    transcriber.warm()
    try:
        result = await asyncio.to_thread(transcriber.transcribe, request.audio_path)
    finally:
        transcriber.close()

    words = []
    for word in getattr(result, "words", []) or []:
        start = getattr(word, "start", None)
        end = getattr(word, "end", None)
        if start is None or end is None:
            continue
        words.append(
            {
                "text": str(getattr(word, "text", "") or ""),
                "start": start,
                "end": end,
            }
        )

    payload = {
        "type": "karaoke_ready",
        "audio": request.audio_url,
        "words": words,
    }
    if request.track_name:
        payload["trackName"] = request.track_name
    if request.artist_name:
        payload["artistName"] = request.artist_name

    await broadcast_signal(request.channel, payload)
    return payload


@router.post("/process")
async def trigger_processing(request: KaraokeProcessRequest) -> dict:
    if not request.audio_path.strip():
        raise HTTPException(status_code=400, detail="audio_path is required.")
    if not request.audio_url.strip():
        raise HTTPException(status_code=400, detail="audio_url is required.")

    try:
        import assemblyai.sync.v1  # noqa: F401
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail="AssemblyAI sync SDK is unavailable.") from exc

    asyncio.create_task(_process_song(request))
    return {"status": "processing_started", "channel": request.channel}


@router.websocket("/stream")
@router.websocket("/relay")
async def karaoke_relay(websocket: WebSocket, channel: str = Query("default")) -> None:
    relay_channel = (channel or "default").strip() or "default"
    await _register(relay_channel, websocket)

    try:
        while True:
            message = await websocket.receive()
            message_type = message.get("type")
            if message_type == "websocket.disconnect":
                break
            if message_type != "websocket.receive":
                continue

            if isinstance(message.get("text"), str):
                await _broadcast(relay_channel, websocket, {"text": message["text"]})
            elif isinstance(message.get("bytes"), (bytes, bytearray)):
                await _broadcast(relay_channel, websocket, {"bytes": bytes(message["bytes"])})
    except WebSocketDisconnect:
        pass
    finally:
        await _unregister(relay_channel, websocket)
