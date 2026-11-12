from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime, timezone
from typing import Any

import redis
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from chat.state import _chat_state
from job_queue import enqueue_job

router = APIRouter(prefix="/agent/tools", tags=["agent-social-tools"])

AGENT_AUTO_APPLY = os.environ.get("AGENT_AUTO_APPLY", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
AGENT_SOCIAL_TOPIC = os.environ.get("AGENT_SOCIAL_TOPIC", "agent.social.action").strip()
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0").strip()

_redis_client: redis.Redis | None = None
_pending_actions: dict[str, dict[str, Any]] = {}
_pending_lock = asyncio.Lock()


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_redis_client() -> redis.Redis | None:
    global _redis_client
    if _redis_client is None:
        try:
            _redis_client = redis.Redis.from_url(
                REDIS_URL,
                decode_responses=True,
                socket_connect_timeout=1,
                socket_timeout=1,
                retry_on_timeout=True,
            )
        except Exception:  # noqa: BLE001
            return None
    return _redis_client


def _queue_social_action(action: dict[str, Any]) -> dict[str, Any]:
    result = enqueue_job(AGENT_SOCIAL_TOPIC, action)
    status_code = int(result.get("status_code", 200))
    body = result.get("body", {})
    if status_code >= 400:
        raise HTTPException(status_code=status_code, detail=body)
    return body if isinstance(body, dict) else {"result": body}


def _normalize_hashtags(hashtags: list[str]) -> list[str]:
    normalized: list[str] = []
    for tag in hashtags:
        token = (tag or "").strip().lstrip("#")
        if not token:
            continue
        normalized.append(token)
    return normalized


async def _send_dm_via_chat(sender_id: str, recipient_id: str, message_text: str) -> dict[str, Any]:
    chat = _chat_state.get("chat")
    if chat is None:
        raise HTTPException(
            status_code=503,
            detail="Chat engine is not available; cannot auto-send DM.",
        )

    conv = await chat.get_or_create_dm(sender_id, recipient_id)
    msg = await chat.send_message(
        author_id=sender_id,
        conversation_id=conv["id"],
        content=message_text,
    )
    return {
        "status": "dm_sent",
        "conversation_id": conv["id"],
        "message_id": msg["id"],
    }


async def _persist_pending_action(action: dict[str, Any]) -> None:
    action_id = action["action_id"]
    async with _pending_lock:
        _pending_actions[action_id] = action

    rc = _get_redis_client()
    if rc is None:
        return
    try:
        rc.hset("agent:pending_actions", action_id, str(action))
    except redis.RedisError:
        return


class SocialPostCreateRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=5000)
    hashtags: list[str] = Field(default_factory=list)
    media_url: str | None = None
    user_id: str = "agent"
    require_approval: bool | None = None


class CommentCreateRequest(BaseModel):
    post_id: str
    content: str = Field(..., min_length=1, max_length=4000)
    user_id: str = "agent"
    require_approval: bool | None = None


class RepostCreateRequest(BaseModel):
    post_id: str
    quote_text: str | None = None
    user_id: str = "agent"
    require_approval: bool | None = None


class DirectMessageCreateRequest(BaseModel):
    recipient_id: str
    message_text: str = Field(..., min_length=1, max_length=4000)
    sender_id: str = "agent"
    require_approval: bool | None = None


class ApprovalDecisionRequest(BaseModel):
    reviewer_id: str = "system"
    note: str = ""


@router.post("/post")
async def create_social_post(payload: SocialPostCreateRequest) -> dict[str, Any]:
    action_id = str(uuid.uuid4())
    action = {
        "action_id": action_id,
        "action_type": "create_post",
        "created_at": _utc_now(),
        "requires_approval": (
            payload.require_approval if payload.require_approval is not None else not AGENT_AUTO_APPLY
        ),
        "payload": {
            "content": payload.content,
            "hashtags": _normalize_hashtags(payload.hashtags),
            "media_url": payload.media_url,
            "user_id": payload.user_id,
            "created_by_ai": True,
        },
    }
    if action["requires_approval"]:
        await _persist_pending_action(action)
        return {"status": "pending_approval", "action_id": action_id, "action": action}

    queued = _queue_social_action(action)
    return {"status": "queued", "action_id": action_id, "dispatch": queued}


@router.post("/comment")
async def post_comment(payload: CommentCreateRequest) -> dict[str, Any]:
    action_id = str(uuid.uuid4())
    action = {
        "action_id": action_id,
        "action_type": "post_comment",
        "created_at": _utc_now(),
        "requires_approval": (
            payload.require_approval if payload.require_approval is not None else not AGENT_AUTO_APPLY
        ),
        "payload": {
            "post_id": payload.post_id,
            "content": payload.content,
            "user_id": payload.user_id,
            "created_by_ai": True,
        },
    }
    if action["requires_approval"]:
        await _persist_pending_action(action)
        return {"status": "pending_approval", "action_id": action_id, "action": action}

    queued = _queue_social_action(action)
    return {"status": "queued", "action_id": action_id, "dispatch": queued}


@router.post("/repost")
async def create_repost(payload: RepostCreateRequest) -> dict[str, Any]:
    action_id = str(uuid.uuid4())
    action = {
        "action_id": action_id,
        "action_type": "create_repost",
        "created_at": _utc_now(),
        "requires_approval": (
            payload.require_approval if payload.require_approval is not None else not AGENT_AUTO_APPLY
        ),
        "payload": {
            "post_id": payload.post_id,
            "quote_text": payload.quote_text,
            "user_id": payload.user_id,
            "created_by_ai": True,
        },
    }
    if action["requires_approval"]:
        await _persist_pending_action(action)
        return {"status": "pending_approval", "action_id": action_id, "action": action}

    queued = _queue_social_action(action)
    return {"status": "queued", "action_id": action_id, "dispatch": queued}


@router.post("/dm")
async def send_direct_message(payload: DirectMessageCreateRequest) -> dict[str, Any]:
    requires_approval = payload.require_approval if payload.require_approval is not None else not AGENT_AUTO_APPLY
    action_id = str(uuid.uuid4())
    action = {
        "action_id": action_id,
        "action_type": "send_dm",
        "created_at": _utc_now(),
        "requires_approval": requires_approval,
        "payload": {
            "sender_id": payload.sender_id,
            "recipient_id": payload.recipient_id,
            "message_text": payload.message_text,
            "created_by_ai": True,
        },
    }

    if requires_approval:
        await _persist_pending_action(action)
        return {"status": "pending_approval", "action_id": action_id, "action": action}

    return await _send_dm_via_chat(
        sender_id=payload.sender_id,
        recipient_id=payload.recipient_id,
        message_text=payload.message_text,
    )


@router.get("/notifications/unread")
def fetch_unread_notifications(
    user_id: str = Query(..., min_length=1),
    limit: int = Query(15, ge=1, le=100),
) -> list[dict[str, Any]]:
    notifier = _chat_state.get("notifier")
    if notifier is None:
        raise HTTPException(status_code=503, detail="Notification service is unavailable.")
    entries = notifier.get_inbox(user_id, unread_only=True)
    if not isinstance(entries, list):
        return []
    return entries[:limit]


@router.get("/chat/recent/{conversation_id}")
async def get_recent_chat(
    conversation_id: str,
    user_id: str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=200),
) -> list[dict[str, Any]]:
    chat = _chat_state.get("chat")
    if chat is None:
        raise HTTPException(status_code=503, detail="Chat engine is unavailable.")
    messages = await chat.list_messages(user_id, conversation_id, limit=limit)
    return list(reversed(messages))


@router.get("/partials/{post_id}")
def get_post_partials(
    post_id: str,
    views: int = Query(0, ge=0),
) -> dict[str, Any]:
    rc = _get_redis_client()
    if rc is None:
        raise HTTPException(status_code=503, detail="Redis is unavailable.")
    try:
        metrics = rc.hgetall(f"post:{post_id}:metrics")
    except redis.RedisError as error:
        raise HTTPException(status_code=503, detail=f"Redis read failed: {error}") from error

    likes = int(metrics.get("like", "0") or 0)
    reposts = int(metrics.get("repost", "0") or 0)
    comments = int(metrics.get("comment", "0") or 0)
    total_interactions = likes + reposts + comments
    total_views = views if views > 0 else int(metrics.get("view", "0") or 0)

    if total_interactions <= 0:
        return {
            "post_id": post_id,
            "total_views": total_views,
            "engagement_percentage": 0.0,
            "partials": {"likes_pct": 0.0, "reposts_pct": 0.0, "comments_pct": 0.0},
        }

    engagement_percentage = round((total_interactions / max(total_views, 1)) * 100, 2)
    return {
        "post_id": post_id,
        "total_views": total_views,
        "engagement_percentage": engagement_percentage,
        "partials": {
            "likes_pct": round((likes / total_interactions) * 100, 2),
            "reposts_pct": round((reposts / total_interactions) * 100, 2),
            "comments_pct": round((comments / total_interactions) * 100, 2),
        },
    }


@router.get("/approvals/pending")
async def get_pending_approvals(limit: int = Query(50, ge=1, le=500)) -> dict[str, Any]:
    async with _pending_lock:
        items = list(_pending_actions.values())[:limit]
    return {"count": len(items), "items": items}


@router.post("/approvals/{action_id}/approve")
async def approve_action(action_id: str, payload: ApprovalDecisionRequest) -> dict[str, Any]:
    async with _pending_lock:
        action = _pending_actions.pop(action_id, None)
    if action is None:
        raise HTTPException(status_code=404, detail="Pending action not found.")

    action["approved_at"] = _utc_now()
    action["reviewer_id"] = payload.reviewer_id
    action["note"] = payload.note
    action_type = action.get("action_type")
    data = action.get("payload", {})

    if action_type == "send_dm":
        result = await _send_dm_via_chat(
            sender_id=str(data.get("sender_id", "agent")),
            recipient_id=str(data.get("recipient_id", "")),
            message_text=str(data.get("message_text", "")),
        )
        return {"status": "approved_and_sent", "action_id": action_id, "result": result}

    queued = _queue_social_action(action)
    return {"status": "approved_and_queued", "action_id": action_id, "dispatch": queued}


@router.post("/approvals/{action_id}/reject")
async def reject_action(action_id: str, payload: ApprovalDecisionRequest) -> dict[str, Any]:
    async with _pending_lock:
        action = _pending_actions.pop(action_id, None)
    if action is None:
        raise HTTPException(status_code=404, detail="Pending action not found.")
    return {
        "status": "rejected",
        "action_id": action_id,
        "reviewer_id": payload.reviewer_id,
        "note": payload.note,
        "rejected_at": _utc_now(),
    }

