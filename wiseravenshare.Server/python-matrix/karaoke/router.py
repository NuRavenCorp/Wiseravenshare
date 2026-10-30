from __future__ import annotations

import asyncio
from collections import defaultdict

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

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


@router.websocket("/stream")
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
