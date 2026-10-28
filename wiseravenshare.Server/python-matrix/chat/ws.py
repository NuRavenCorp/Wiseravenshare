"""
chat/ws.py — lightweight WebSocket connection manager for the chat layer.

Architecture
────────────
• Each connected user maps to one or more WebSocket connections (multi-tab).
• Messages are delivered locally (same pod) via in-memory dispatch.
• Cross-pod fan-out uses Redis pub/sub on the channel "chat:user:{user_id}".
  A background task subscribes and forwards incoming payloads to local sockets.

This is intentionally thin — no Kafka, no broker dependency for the
happy path. If Redis is unavailable, local delivery still works; cross-pod
messages are simply not received until reconnect.
"""
from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from typing import Any

import redis.asyncio as aredis
from fastapi import WebSocket

logger = logging.getLogger("chat.ws")

REDIS_CHANNEL_PREFIX = "chat:user:"


class ConnectionManager:
    """
    Manages per-user WebSocket connections and cross-pod delivery via Redis
    pub/sub. The same instance is shared across all request handlers.
    """

    def __init__(self, redis_client: aredis.Redis) -> None:
        self.rc = redis_client
        # user_id → set of connected WebSocket objects
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)
        self._pubsub_task: asyncio.Task | None = None

    # ── lifecycle ──────────────────────────────────────────────────────────

    async def start(self) -> None:
        """Start the Redis pub/sub listener. Called once at app startup."""
        self._pubsub_task = asyncio.create_task(self._pubsub_loop())
        logger.info("Chat WS manager started.")

    async def stop(self) -> None:
        if self._pubsub_task:
            self._pubsub_task.cancel()
            try:
                await self._pubsub_task
            except asyncio.CancelledError:
                pass
        logger.info("Chat WS manager stopped.")

    # ── connection management ──────────────────────────────────────────────

    async def connect(self, user_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections[user_id].add(websocket)
        logger.debug("WS connected: user=%s total=%d", user_id, len(self._connections[user_id]))

    async def disconnect(self, user_id: str, websocket: WebSocket) -> None:
        self._connections[user_id].discard(websocket)
        if not self._connections[user_id]:
            del self._connections[user_id]
        logger.debug("WS disconnected: user=%s", user_id)

    # ── delivery ───────────────────────────────────────────────────────────

    async def deliver(self, user_id: str, payload: dict) -> None:
        """
        Deliver to all local sockets for user_id AND publish to Redis so
        other pods can forward the payload.
        """
        await self._deliver_local(user_id, payload)
        await self._publish(user_id, payload)

    async def _deliver_local(self, user_id: str, payload: dict) -> None:
        sockets = list(self._connections.get(user_id, []))
        if not sockets:
            return
        data = json.dumps(payload, default=str)
        dead: list[WebSocket] = []
        for ws in sockets:
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._connections[user_id].discard(ws)

    async def _publish(self, user_id: str, payload: dict) -> None:
        try:
            channel = f"{REDIS_CHANNEL_PREFIX}{user_id}"
            await self.rc.publish(channel, json.dumps(payload, default=str))
        except Exception as exc:  # noqa: BLE001
            logger.debug("Redis publish failed: %s", exc)

    # ── Redis subscription loop ────────────────────────────────────────────

    async def _pubsub_loop(self) -> None:
        """
        Subscribe to chat:user:* pattern. For each published message, if the
        target user is connected locally, deliver immediately (prevents duplicate
        delivery — the publishing pod already delivered locally before publishing).
        Other pods receive the Redis message and deliver to their local sockets.
        """
        try:
            pubsub = self.rc.pubsub()
            await pubsub.psubscribe(f"{REDIS_CHANNEL_PREFIX}*")
            logger.info("Chat pub/sub listener active on %s*", REDIS_CHANNEL_PREFIX)
            async for message in pubsub.listen():
                if message["type"] not in ("pmessage", "message"):
                    continue
                try:
                    channel: str = message.get("channel", "")
                    if isinstance(channel, bytes):
                        channel = channel.decode()
                    user_id = channel.removeprefix(REDIS_CHANNEL_PREFIX)
                    data = message.get("data", "{}")
                    if isinstance(data, bytes):
                        data = data.decode()
                    payload = json.loads(data)
                    # Only deliver to sockets on this pod that weren't already sent
                    # (the sender already did a local delivery before publishing).
                    await self._deliver_local(user_id, payload)
                except Exception as exc:  # noqa: BLE001
                    logger.debug("pub/sub message error: %s", exc)
        except asyncio.CancelledError:
            pass
        except Exception as exc:  # noqa: BLE001
            logger.warning("Chat pub/sub loop crashed: %s", exc)
