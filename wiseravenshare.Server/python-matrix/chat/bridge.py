"""
chat/bridge.py — Post ↔ Chat integration.

Three flows:
  1. share_post_to_conversation — user shares a post into a DM/group
  2. send_private_reply         — user sends a private reply to a post's author
  3. bridge_mentions_to_dm      — @mentions in posts optionally create bridged DMs
                                  (opt-in via Redis flag pref:dm_mentions:{uid})
"""
from __future__ import annotations

import logging
from typing import Optional

import redis.asyncio as aredis

from chat.engine import ChatEngine

logger = logging.getLogger("chat.bridge")


class PostChatBridge:
    def __init__(
        self,
        chat: ChatEngine,
        redis_client: aredis.Redis,
    ) -> None:
        self.chat = chat
        self.rc = redis_client

    # ── Flow 1: share post to chat ─────────────────────────────────────────

    async def share_post_to_conversation(
        self,
        user_id: str,
        post_id: str,
        conversation_id: str,
        note: str = "",
    ) -> dict:
        msg = await self.chat.send_message(
            author_id=user_id,
            conversation_id=conversation_id,
            content=note,
            shared_post_id=post_id,
            shared_kind="share",
        )
        return {"message_id": msg["id"], "post_id": post_id}

    # ── Flow 2: private reply to a post ────────────────────────────────────

    async def send_private_reply(
        self,
        user_id: str,
        post_author_id: str,
        post_id: str,
        content: str,
    ) -> dict:
        if post_author_id == user_id:
            raise ValueError("Cannot privately reply to your own post")

        conv = await self.chat.get_or_create_dm(user_id, post_author_id)
        msg = await self.chat.send_message(
            author_id=user_id,
            conversation_id=conv["id"],
            content=content,
            shared_post_id=post_id,
            shared_kind="reply_post",
        )
        return {"conversation_id": conv["id"], "message_id": msg["id"]}

    # ── Flow 3: mention bridge ─────────────────────────────────────────────

    async def bridge_mentions_to_dm(
        self,
        post_author_id: str,
        post_id: str,
        mentioned_user_ids: list[str],
    ) -> int:
        """
        For each mentioned user that has pref:dm_mentions:{uid} set in Redis,
        open or reuse a DM with the post author and drop the shared post.
        Returns the number of bridged messages sent.
        """
        count = 0
        for target_uid in mentioned_user_ids:
            if target_uid == post_author_id:
                continue
            try:
                enabled = await self.rc.get(f"pref:dm_mentions:{target_uid}")
                if not enabled:
                    continue
                conv = await self.chat.get_or_create_dm(post_author_id, target_uid)
                await self.chat.send_message(
                    author_id=post_author_id,
                    conversation_id=conv["id"],
                    content="",
                    shared_post_id=post_id,
                    shared_kind="share",
                )
                count += 1
            except Exception:  # noqa: BLE001
                logger.exception(
                    "bridge_mentions_to_dm failed post=%s target=%s",
                    post_id, target_uid,
                )
        return count
