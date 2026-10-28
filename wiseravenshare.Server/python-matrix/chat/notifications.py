"""
chat/notifications.py — chat-specific notification layer.

Extends the base notification primitives already used by the post engine:
  • per-conversation grouping (max 10 per 5-minute window)
  • mute check via Redis (hot path)
  • clear-conversation clears all grouped notifs for that conversation

The inbox is in-memory (same as the post notifier). For production scale,
back it with the existing PG notifications table.
"""
from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

import redis.asyncio as aredis

logger = logging.getLogger("chat.notifications")

GROUPING_WINDOW_SECONDS = 300   # 5 min
MAX_GROUP_SIZE = 10


@dataclass
class ChatNotif:
    id: str
    recipient_id: str
    actor_id: str
    kind: str                   # "message_group" | "reaction" | "joined" etc.
    payload: dict = field(default_factory=dict)
    read: bool = False
    created_ts: float = field(default_factory=time.time)


class ChatNotificationService:
    """
    Manages message-group notifications for chat.
    Groups consecutive messages from the same conversation into a single
    inbox entry — prevents flooding when a conversation is active.
    """

    def __init__(self, redis_client: aredis.Redis) -> None:
        self.rc = redis_client
        # recipient_id → list[ChatNotif]
        self._inboxes: dict[str, list[ChatNotif]] = {}

    # ── API ────────────────────────────────────────────────────────────────

    async def on_message(
        self,
        recipient_id: str,
        actor_id: str,
        conversation_id: str,
        message_id: str,
        preview: str,
        priority: int = 3,
    ) -> Optional[ChatNotif]:
        """
        Called for every message sent to an offline/background member.
        Returns the grouped notif, or None if muted.
        """
        if await self._is_muted(recipient_id, conversation_id):
            return None

        group = self._find_unread_group(recipient_id, conversation_id)
        if group:
            group.payload["count"] = group.payload.get("count", 1) + 1
            group.payload["last_message_id"] = message_id
            group.payload["last_preview"] = preview
            group.payload["last_actor"] = actor_id
            group.payload["updated_ts"] = datetime.now(timezone.utc).isoformat()
            return group

        notif = ChatNotif(
            id=f"notif-{int(time.time() * 1000)}-{conversation_id[:8]}",
            recipient_id=recipient_id,
            actor_id=actor_id,
            kind="message_group",
            payload={
                "conversation_id": conversation_id,
                "first_message_id": message_id,
                "last_message_id": message_id,
                "first_preview": preview,
                "last_preview": preview,
                "count": 1,
                "last_actor": actor_id,
            },
        )
        self._inboxes.setdefault(recipient_id, []).append(notif)
        return notif

    async def on_reaction(
        self,
        recipient_id: str,
        actor_id: str,
        message_id: str,
        conversation_id: str,
        emoji: str,
    ) -> Optional[ChatNotif]:
        if await self._is_muted(recipient_id, conversation_id):
            return None
        notif = ChatNotif(
            id=f"notif-react-{int(time.time() * 1000)}",
            recipient_id=recipient_id,
            actor_id=actor_id,
            kind="reaction",
            payload={
                "conversation_id": conversation_id,
                "message_id": message_id,
                "emoji": emoji,
                "actor_id": actor_id,
            },
        )
        self._inboxes.setdefault(recipient_id, []).append(notif)
        return notif

    async def clear_conversation_notifications(
        self, user_id: str, conversation_id: str,
    ) -> int:
        """Called when the user opens a conversation. Marks related notifs read."""
        cleared = 0
        for notif in self._inboxes.get(user_id, []):
            if notif.payload.get("conversation_id") == conversation_id and not notif.read:
                notif.read = True
                cleared += 1
        return cleared

    def get_inbox(
        self, user_id: str, unread_only: bool = False,
    ) -> list[dict]:
        notifs = self._inboxes.get(user_id, [])
        if unread_only:
            notifs = [n for n in notifs if not n.read]
        return [self._notif_json(n) for n in notifs]

    # ── mute helpers ───────────────────────────────────────────────────────

    async def set_mute(
        self,
        user_id: str,
        conversation_id: str,
        until: Optional[datetime] = None,
    ) -> None:
        """
        Set a mute flag in Redis. until=None means permanent.
        TTL is computed from the until timestamp so the key self-expires.
        """
        data = json.dumps({"until": until.isoformat() if until else None})
        key = f"mute:{user_id}:{conversation_id}"
        if until:
            ttl = max(1, int((until - datetime.now(timezone.utc)).total_seconds()))
            await self.rc.set(key, data, ex=ttl)
        else:
            await self.rc.set(key, data)

    async def clear_mute(self, user_id: str, conversation_id: str) -> None:
        await self.rc.delete(f"mute:{user_id}:{conversation_id}")

    # ── internal ───────────────────────────────────────────────────────────

    def _find_unread_group(
        self, user_id: str, conversation_id: str,
    ) -> Optional[ChatNotif]:
        now = time.time()
        for notif in self._inboxes.get(user_id, []):
            if notif.read:
                continue
            if notif.payload.get("conversation_id") != conversation_id:
                continue
            if notif.kind != "message_group":
                continue
            if now - notif.created_ts > GROUPING_WINDOW_SECONDS:
                continue
            if notif.payload.get("count", 0) >= MAX_GROUP_SIZE:
                continue
            return notif
        return None

    async def _is_muted(self, user_id: str, conversation_id: str) -> bool:
        try:
            raw = await self.rc.get(f"mute:{user_id}:{conversation_id}")
            if not raw:
                return False
            data = json.loads(raw)
            until = data.get("until")
            if not until:
                return True   # permanent mute
            return datetime.now(timezone.utc) < datetime.fromisoformat(until)
        except Exception:  # noqa: BLE001
            return False

    @staticmethod
    def _notif_json(n: ChatNotif) -> dict:
        return {
            "id": n.id,
            "kind": n.kind,
            "actor_id": n.actor_id,
            "payload": n.payload,
            "read": n.read,
            "created_ts": n.created_ts,
        }
