"""
chat/router.py — FastAPI REST endpoints for the chat layer.

Endpoint map
────────────
POST   /chat/dm                                create or retrieve a DM
POST   /chat/groups                            create a group conversation
GET    /chat/conversations                     list user's conversations
POST   /chat/conversations/{conv_id}/messages  send a message
GET    /chat/conversations/{conv_id}/messages  list messages (cursor)
PATCH  /chat/messages/{msg_id}                 edit a message
DELETE /chat/messages/{msg_id}                 soft-delete a message
POST   /chat/messages/{msg_id}/react           add/change reaction
DELETE /chat/messages/{msg_id}/react           remove reaction
POST   /chat/conversations/{conv_id}/read      mark read
POST   /chat/conversations/{conv_id}/typing    typing indicator

Post ↔ Chat bridge:
POST   /chat/conversations/{conv_id}/share-post   share post into conversation
POST   /chat/private-reply                        private reply to a post
POST   /chat/bridge-mention                       trigger mention bridge (internal)

Notifications:
GET    /chat/notifications                     get inbox
POST   /chat/conversations/{conv_id}/mute      mute a conversation
DELETE /chat/conversations/{conv_id}/mute      unmute a conversation

WebSocket:
WS     /chat/ws?user_id=...                    real-time channel
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

logger = logging.getLogger("chat.router")

router = APIRouter(prefix="/chat", tags=["chat"])


# ── Pydantic request models ────────────────────────────────────────────────

class DMCreateReq(BaseModel):
    other_user_id: str

class GroupCreateReq(BaseModel):
    member_ids: list[str]
    title: str = Field(..., min_length=1, max_length=128)

class MessageSendReq(BaseModel):
    content: str = ""
    parent_message_id: Optional[str] = None
    shared_post_id: Optional[str] = None
    shared_kind: Optional[str] = None
    attachments: list = []

class MessageEditReq(BaseModel):
    content: str = Field(..., min_length=1, max_length=4000)

class ReactReq(BaseModel):
    emoji: str = Field(..., min_length=1, max_length=16)

class ReadReq(BaseModel):
    message_id: str

class TypingReq(BaseModel):
    typing: bool

class SharePostReq(BaseModel):
    post_id: str
    note: str = ""

class PrivateReplyReq(BaseModel):
    post_author_id: str
    post_id: str
    content: str = Field(..., min_length=1, max_length=4000)

class BridgeMentionReq(BaseModel):
    post_author_id: str
    post_id: str
    mentioned_user_ids: list[str]

class MuteReq(BaseModel):
    until: Optional[datetime] = None   # None = permanent


# ── helpers ────────────────────────────────────────────────────────────────

def _get_state(key: str) -> Any:
    """Late import to avoid circular dependency on app startup."""
    from chat.state import _chat_state
    return _chat_state.get(key)


def _chat() -> Any:
    return _get_state("chat")


def _bridge() -> Any:
    return _get_state("bridge")


def _notifier() -> Any:
    return _get_state("notifier")


def _ws() -> Any:
    return _get_state("ws")


# ── conversations ──────────────────────────────────────────────────────────

@router.post("/dm")
async def create_dm(body: DMCreateReq, user_id: str = Query(...)):
    try:
        conv = await _chat().get_or_create_dm(user_id, body.other_user_id)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return conv


@router.post("/groups", status_code=201)
async def create_group(body: GroupCreateReq, user_id: str = Query(...)):
    try:
        conv = await _chat().create_group(user_id, body.member_ids, body.title)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return conv


@router.get("/conversations")
async def list_conversations(user_id: str = Query(...)):
    return await _chat().list_conversations(user_id)


# ── messages ───────────────────────────────────────────────────────────────

@router.post("/conversations/{conv_id}/messages", status_code=201)
async def send_message(conv_id: str, body: MessageSendReq, user_id: str = Query(...)):
    try:
        msg = await _chat().send_message(
            author_id=user_id,
            conversation_id=conv_id,
            content=body.content,
            parent_message_id=body.parent_message_id,
            shared_post_id=body.shared_post_id,
            shared_kind=body.shared_kind,
            attachments=body.attachments,
        )
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))
    return msg


@router.get("/conversations/{conv_id}/messages")
async def list_messages(
    conv_id: str,
    user_id: str = Query(...),
    before: Optional[datetime] = None,
    limit: int = Query(50, ge=1, le=200),
):
    try:
        msgs = await _chat().list_messages(user_id, conv_id, before=before, limit=limit)
    except PermissionError as e:
        raise HTTPException(403, str(e))
    return msgs


@router.patch("/messages/{msg_id}")
async def edit_message(msg_id: str, body: MessageEditReq, user_id: str = Query(...)):
    try:
        return await _chat().edit_message(user_id, msg_id, body.content)
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.delete("/messages/{msg_id}", status_code=204)
async def delete_message(msg_id: str, user_id: str = Query(...)):
    try:
        await _chat().delete_message(user_id, msg_id)
    except PermissionError as e:
        raise HTTPException(403, str(e))


@router.post("/messages/{msg_id}/react")
async def react(msg_id: str, body: ReactReq, user_id: str = Query(...)):
    try:
        await _chat().react(user_id, msg_id, body.emoji)
    except ValueError as e:
        raise HTTPException(404, str(e))
    return {"ok": True}


@router.delete("/messages/{msg_id}/react", status_code=204)
async def remove_reaction(msg_id: str, user_id: str = Query(...)):
    await _chat().remove_reaction(user_id, msg_id)


# ── read + typing ──────────────────────────────────────────────────────────

@router.post("/conversations/{conv_id}/read")
async def mark_read(conv_id: str, body: ReadReq, user_id: str = Query(...)):
    try:
        return await _chat().mark_read(user_id, conv_id, body.message_id)
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/conversations/{conv_id}/typing")
async def typing(conv_id: str, body: TypingReq, user_id: str = Query(...)):
    await _chat().set_typing(user_id, conv_id, body.typing)
    return {"ok": True}


# ── post ↔ chat bridge ─────────────────────────────────────────────────────

@router.post("/conversations/{conv_id}/share-post")
async def share_post(conv_id: str, body: SharePostReq, user_id: str = Query(...)):
    try:
        return await _bridge().share_post_to_conversation(
            user_id, body.post_id, conv_id, body.note,
        )
    except (PermissionError, ValueError) as e:
        raise HTTPException(400, str(e))


@router.post("/private-reply", status_code=201)
async def private_reply(body: PrivateReplyReq, user_id: str = Query(...)):
    try:
        return await _bridge().send_private_reply(
            user_id, body.post_author_id, body.post_id, body.content,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/bridge-mention")
async def bridge_mention(body: BridgeMentionReq):
    """
    Internal endpoint — called by the post engine after create_post.
    Not user-facing; secure with an internal token in production.
    """
    count = await _bridge().bridge_mentions_to_dm(
        body.post_author_id, body.post_id, body.mentioned_user_ids,
    )
    return {"bridged": count}


# ── notifications ──────────────────────────────────────────────────────────

@router.get("/notifications")
async def get_notifications(
    user_id: str = Query(...),
    unread_only: bool = Query(False),
):
    return _notifier().get_inbox(user_id, unread_only=unread_only)


@router.post("/conversations/{conv_id}/mute")
async def mute_conversation(
    conv_id: str, body: MuteReq, user_id: str = Query(...),
):
    await _notifier().set_mute(user_id, conv_id, body.until)
    return {"ok": True, "until": body.until.isoformat() if body.until else None}


@router.delete("/conversations/{conv_id}/mute", status_code=204)
async def unmute_conversation(conv_id: str, user_id: str = Query(...)):
    await _notifier().clear_mute(user_id, conv_id)


# ── WebSocket ──────────────────────────────────────────────────────────────

@router.websocket("/ws")
async def ws_endpoint(websocket: WebSocket, user_id: str = Query(...)):
    """
    Client → server frames:
      { "type": "ping" }
      { "type": "typing",  "conversation_id": "...", "typing": true }
      { "type": "read",    "conversation_id": "...", "message_id": "..." }

    Server → client frames:
      { "type": "connected", "user_id": "..." }
      { "type": "conversation.created", ... }
      { "type": "message.new", "message": {...} }
      { "type": "message.edited", "message": {...} }
      { "type": "message.deleted", "message_id": "..." }
      { "type": "message.reaction", ... }
      { "type": "message.reaction_removed", ... }
      { "type": "message.read", ... }
      { "type": "typing", ... }
      { "type": "pong" }
    """
    ws_mgr = _ws()
    chat = _chat()

    if not ws_mgr or not chat:
        await websocket.close(code=1011)
        return

    await ws_mgr.connect(user_id, websocket)
    await websocket.send_json({"type": "connected", "user_id": user_id})

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                frame = json.loads(raw)
            except Exception:
                continue
            t = frame.get("type")
            if t == "ping":
                await websocket.send_json({"type": "pong"})
            elif t == "typing":
                await chat.set_typing(
                    user_id,
                    frame.get("conversation_id", ""),
                    bool(frame.get("typing", False)),
                )
            elif t == "read":
                try:
                    await chat.mark_read(
                        user_id,
                        frame.get("conversation_id", ""),
                        frame.get("message_id", ""),
                    )
                except Exception as exc:
                    logger.debug("mark_read via WS failed: %s", exc)
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.debug("WS error for user=%s: %s", user_id, exc)
    finally:
        await ws_mgr.disconnect(user_id, websocket)
