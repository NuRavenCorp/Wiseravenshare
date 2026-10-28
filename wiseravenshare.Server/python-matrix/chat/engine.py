"""
chat/engine.py — core chat logic.

Handles:
  • DM creation (idempotent deduplication)
  • Group creation
  • send / edit / delete message
  • Threading (parent_message_id → thread_root_id)
  • Post cross-link (shared_post_id, shared_kind)
  • Read receipts — bulk batch per mark_read call
  • Reactions — upsert
  • Typing indicators — Redis-only, 5s TTL, fan-out via WS

All heavy I/O goes through ChatStore; WS delivery goes through ConnectionManager.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import redis.asyncio as aredis

from chat.store import ChatStore
from chat.ws import ConnectionManager
from chat.notifications import ChatNotificationService

logger = logging.getLogger("chat.engine")

TYPING_TTL_SECONDS = 5
MAX_CONTENT = 4_000
MAX_GROUP_SIZE = 500


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ChatEngine:
    def __init__(
        self,
        store: ChatStore,
        ws: ConnectionManager,
        notifier: ChatNotificationService,
        redis_client: aredis.Redis,
    ) -> None:
        self.store = store
        self.ws = ws
        self.notifier = notifier
        self.rc = redis_client

    # ── conversations ──────────────────────────────────────────────────────

    async def get_or_create_dm(self, user_a: str, user_b: str) -> dict:
        if user_a == user_b:
            raise ValueError("Cannot DM yourself")

        existing = await self.store.find_dm(user_a, user_b)
        if existing:
            existing["members"] = await self.store.get_member_ids(existing["id"])
            return existing

        conv_id = str(uuid.uuid4())
        conv = await self.store.create_conversation(conv_id, "dm", user_a)
        await self.store.add_member(conv_id, user_a, "member")
        await self.store.add_member(conv_id, user_b, "member")
        conv["members"] = [user_a, user_b]

        await self._broadcast([user_a, user_b], {
            "type": "conversation.created",
            "conversation_id": conv_id,
            "kind": "dm",
        })
        return conv

    async def create_group(
        self, creator_id: str, member_ids: list[str], title: str,
    ) -> dict:
        members = list({creator_id} | set(member_ids))
        if len(members) < 2:
            raise ValueError("Group needs at least 2 members")
        if len(members) > MAX_GROUP_SIZE:
            raise ValueError(f"Group too large (max {MAX_GROUP_SIZE})")

        conv_id = str(uuid.uuid4())
        conv = await self.store.create_conversation(conv_id, "group", creator_id, title)
        for uid in members:
            await self.store.add_member(
                conv_id, uid, "owner" if uid == creator_id else "member",
            )
        conv["members"] = members

        await self._broadcast(members, {
            "type": "conversation.created",
            "conversation_id": conv_id,
            "kind": "group",
            "title": title,
        })
        return conv

    async def list_conversations(self, user_id: str) -> list[dict]:
        rows = await self.store.list_conversations_for_user(user_id)
        result = []
        epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)
        for row in rows:
            since = row.get("last_read_at") or epoch
            unread = await self.store.count_unread(row["id"], user_id, since)
            result.append({
                "id": row["id"],
                "kind": row["kind"],
                "title": row["title"],
                "last_message_at": row["last_message_at"].isoformat() if row["last_message_at"] else None,
                "unread": unread,
                "role": row.get("role", "member"),
                "muted_until": row["muted_until"].isoformat() if row.get("muted_until") else None,
            })
        return result

    # ── messages ───────────────────────────────────────────────────────────

    async def send_message(
        self,
        author_id: str,
        conversation_id: str,
        content: str,
        parent_message_id: Optional[str] = None,
        shared_post_id: Optional[str] = None,
        shared_kind: Optional[str] = None,
        attachments: Optional[list] = None,
    ) -> dict:
        if not content.strip() and not shared_post_id and not (attachments or []):
            raise ValueError("Message needs content, post share, or attachment")
        if len(content) > MAX_CONTENT:
            raise ValueError(f"Message exceeds {MAX_CONTENT} chars")

        member = await self.store.get_member(conversation_id, author_id)
        if not member:
            raise PermissionError("Not a conversation member")

        # Resolve threading
        thread_root_id = None
        if parent_message_id:
            parent = await self.store.get_message(parent_message_id)
            if not parent or parent["conversation_id"] != conversation_id:
                raise ValueError("Invalid parent message")
            thread_root_id = parent.get("thread_root_id") or parent["id"]

        msg_id = str(uuid.uuid4())
        row = await self.store.insert_message({
            "id": msg_id,
            "conversation_id": conversation_id,
            "author_id": author_id,
            "content": content,
            "parent_message_id": parent_message_id,
            "thread_root_id": thread_root_id,
            "shared_post_id": shared_post_id,
            "shared_kind": shared_kind,
            "attachments": attachments or [],
        })
        await self.store.update_last_message_at(conversation_id, _now())

        # Author implicitly read their own message
        await self.store.batch_insert_reads([(msg_id, author_id)])

        other_members = await self.store.get_other_member_ids(conversation_id, author_id)

        msg_payload = _row_to_json(row)
        await self._broadcast(other_members, {
            "type": "message.new",
            "message": msg_payload,
        })

        # Chat notifications for offline members
        preview = (content or "")[:80]
        for uid in other_members:
            await self.notifier.on_message(
                uid, author_id, conversation_id, msg_id, preview,
            )

        return msg_payload

    async def edit_message(
        self, author_id: str, message_id: str, new_content: str,
    ) -> dict:
        if len(new_content) > MAX_CONTENT:
            raise ValueError("Message too long")
        msg = await self.store.get_message(message_id)
        if not msg or msg["author_id"] != author_id:
            raise PermissionError("Cannot edit this message")
        if msg.get("deleted_at"):
            raise ValueError("Message is deleted")

        updated = await self.store.edit_message(message_id, new_content)
        other_members = await self.store.get_other_member_ids(
            msg["conversation_id"], author_id,
        )
        payload = _row_to_json(updated)
        await self._broadcast(other_members, {"type": "message.edited", "message": payload})
        return payload

    async def delete_message(self, author_id: str, message_id: str) -> None:
        msg = await self.store.get_message(message_id)
        if not msg or msg["author_id"] != author_id:
            raise PermissionError("Cannot delete this message")
        await self.store.soft_delete_message(message_id)
        other_members = await self.store.get_other_member_ids(
            msg["conversation_id"], author_id,
        )
        await self._broadcast(
            other_members,
            {"type": "message.deleted", "message_id": message_id},
        )

    async def list_messages(
        self, user_id: str, conversation_id: str,
        before: Optional[datetime] = None, limit: int = 50,
    ) -> list[dict]:
        if not await self.store.get_member(conversation_id, user_id):
            raise PermissionError("Not a member")
        rows = await self.store.list_messages(conversation_id, before, limit)
        return [_row_to_json(r) for r in rows]

    # ── read receipts ──────────────────────────────────────────────────────

    async def mark_read(
        self, user_id: str, conversation_id: str, up_to_message_id: str,
    ) -> dict:
        if not await self.store.get_member(conversation_id, user_id):
            raise PermissionError("Not a member")

        target = await self.store.get_message(up_to_message_id)
        if not target or target["conversation_id"] != conversation_id:
            raise ValueError("Invalid message")

        unread_ids = await self.store.get_unread_message_ids(
            conversation_id, user_id, target["created_at"],
        )
        if unread_ids:
            await self.store.batch_insert_reads([(mid, user_id) for mid in unread_ids])

        await self.store.update_read_marker(conversation_id, user_id, up_to_message_id)

        # Notify authors whose messages were read
        authors = await self.store.get_read_authors(unread_ids)
        for actor in authors:
            if actor != user_id:
                await self.ws.deliver(actor, {
                    "type": "message.read",
                    "conversation_id": conversation_id,
                    "reader_id": user_id,
                    "up_to_message_id": up_to_message_id,
                })

        # Clear inbox notifications for this conversation
        await self.notifier.clear_conversation_notifications(user_id, conversation_id)

        return {"marked": len(unread_ids), "up_to": up_to_message_id}

    # ── reactions ──────────────────────────────────────────────────────────

    async def react(
        self, user_id: str, message_id: str, emoji: str,
    ) -> None:
        msg = await self.store.get_message(message_id)
        if not msg:
            raise ValueError("Message not found")

        await self.store.upsert_reaction(message_id, user_id, emoji)

        other_members = await self.store.get_other_member_ids(
            msg["conversation_id"], user_id,
        )
        await self._broadcast(
            other_members,
            {
                "type": "message.reaction",
                "message_id": message_id,
                "user_id": user_id,
                "emoji": emoji,
            },
        )

        # Notify message author
        if msg["author_id"] != user_id:
            await self.notifier.on_reaction(
                msg["author_id"], user_id, message_id,
                msg["conversation_id"], emoji,
            )

    async def remove_reaction(self, user_id: str, message_id: str) -> None:
        await self.store.delete_reaction(message_id, user_id)
        msg = await self.store.get_message(message_id)
        if msg:
            other_members = await self.store.get_other_member_ids(
                msg["conversation_id"], user_id,
            )
            await self._broadcast(
                other_members,
                {
                    "type": "message.reaction_removed",
                    "message_id": message_id,
                    "user_id": user_id,
                },
            )

    # ── typing indicators (ephemeral) ──────────────────────────────────────

    async def set_typing(
        self, user_id: str, conversation_id: str, typing: bool,
    ) -> None:
        key = f"typing:{conversation_id}:{user_id}"
        if typing:
            await self.rc.set(key, "1", ex=TYPING_TTL_SECONDS)
        else:
            await self.rc.delete(key)

        other_members = await self.store.get_other_member_ids(conversation_id, user_id)
        await self._broadcast(
            other_members,
            {
                "type": "typing",
                "conversation_id": conversation_id,
                "user_id": user_id,
                "typing": typing,
            },
        )

    # ── helpers ────────────────────────────────────────────────────────────

    async def _broadcast(self, user_ids: list[str], payload: dict) -> None:
        await asyncio.gather(
            *[self.ws.deliver(uid, payload) for uid in user_ids],
            return_exceptions=True,
        )


def _row_to_json(row: dict) -> dict:
    def _iso(v: Any) -> Optional[str]:
        if isinstance(v, datetime):
            return v.isoformat()
        return v

    attachments = row.get("attachments") or []
    if isinstance(attachments, str):
        import json as _json
        try:
            attachments = _json.loads(attachments)
        except Exception:
            attachments = []

    return {
        "id": row["id"],
        "conversation_id": row["conversation_id"],
        "author_id": row["author_id"],
        "content": row.get("content") or "",
        "parent_message_id": row.get("parent_message_id"),
        "thread_root_id": row.get("thread_root_id"),
        "shared_post_id": row.get("shared_post_id"),
        "shared_kind": row.get("shared_kind"),
        "attachments": attachments,
        "created_at": _iso(row.get("created_at")),
        "edited_at": _iso(row.get("edited_at")),
        "deleted_at": _iso(row.get("deleted_at")),
    }
