from __future__ import annotations

import os
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

app = FastAPI(title="WiseRaven Go Live API")

MEDIAMTX_API = os.getenv("MEDIAMTX_API", "http://mediamtx:9997").rstrip("/")
MIN_ACCOUNT_AGE_DAYS = int(os.getenv("MIN_ACCOUNT_AGE_DAYS", "30"))
MIN_FOLLOWERS_TO_GO_LIVE = int(os.getenv("MIN_FOLLOWERS_TO_GO_LIVE", "100"))
TOXIC_AT = float(os.getenv("TOXIC_AT", "0.7"))
SPOILER_AT = float(os.getenv("SPOILER_AT", "0.7"))

RULES = {
    "question": "highlight",
    "hype": "show",
    "conversation": "show",
    "backseat": "hide",
    "spam": "hide",
}


class UserGateRequest(BaseModel):
    user_id: int
    created_at: datetime
    follower_count: int = 0
    age_verified: bool = False
    active_violations: int = 0


class ChatMessage(BaseModel):
    user: str
    text: str


def can_go_live(user: UserGateRequest) -> tuple[bool, str]:
    now = datetime.now(timezone.utc)
    created = user.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)

    if created > now - timedelta(days=MIN_ACCOUNT_AGE_DAYS):
        return False, f"Account must be at least {MIN_ACCOUNT_AGE_DAYS} days old"
    if user.follower_count < MIN_FOLLOWERS_TO_GO_LIVE:
        return False, f"Minimum {MIN_FOLLOWERS_TO_GO_LIVE} followers required"
    if not user.age_verified:
        return False, "Age verification required"
    if user.active_violations > 0:
        return False, "Account under review"
    return True, "Allowed"


def classify_message(message_text: str) -> dict[str, Any]:
    text = (message_text or "").lower()
    toxic = 0.9 if any(token in text for token in ["hate", "kill", "die"]) else 0.1
    spoiler = 0.8 if "spoiler" in text else 0.1
    if "?" in text:
        category = "question"
    elif any(token in text for token in ["buy now", "http://", "https://", "free money"]):
        category = "spam"
    elif any(token in text for token in ["you should", "do this", "backseat"]):
        category = "backseat"
    elif any(token in text for token in ["let's go", "hype", "fire", "wow"]):
        category = "hype"
    else:
        category = "conversation"
    return {"toxic": toxic, "spoiler": spoiler, "category": category}


def moderation_decide(result: dict[str, Any]) -> str:
    if float(result.get("toxic", 0.0)) >= TOXIC_AT:
        return "hide (toxic)"
    category = str(result.get("category", "conversation"))
    action = RULES.get(category, "show")
    if action == "hide":
        return f"hide ({category})"
    if float(result.get("spoiler", 0.0)) >= SPOILER_AT:
        return "blur (spoiler)"
    return action


def moderate_chat_batch(messages: list[ChatMessage]) -> list[dict[str, Any]]:
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda m: classify_message(m.text), messages))
    governed = []
    for message, result in zip(messages, results):
        governed.append(
            {
                "user": message.user,
                "text": message.text,
                "action": moderation_decide(result),
                "scores": result,
                "timestamp": time.time(),
            }
        )
    return governed


def extract_user_from_path(path: str) -> int | None:
    try:
        return int(path.split("_", 1)[1])
    except (IndexError, ValueError, TypeError):
        return None


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "healthy"}


@app.post("/live/entry-check")
async def live_entry_check(user: UserGateRequest) -> dict[str, Any]:
    allowed, reason = can_go_live(user)
    return {"allowed": allowed, "reason": reason}


@app.post("/live/auth")
async def live_auth(request: Request) -> dict[str, str]:
    payload = await request.json()
    action = str(payload.get("action", ""))
    path = str(payload.get("path", ""))

    if action == "publish":
        user_id = extract_user_from_path(path)
        if not user_id:
            raise HTTPException(401, "Invalid stream path")

        # Placeholder user lookup; replace with DB-backed profile in production.
        mock_user = UserGateRequest(
            user_id=user_id,
            created_at=datetime.now(timezone.utc) - timedelta(days=90),
            follower_count=250,
            age_verified=True,
            active_violations=0,
        )
        allowed, reason = can_go_live(mock_user)
        if not allowed:
            raise HTTPException(401, reason)

    return {"status": "ok"}


@app.get("/live/streams")
async def list_streams() -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(f"{MEDIAMTX_API}/v3/paths/list")
        response.raise_for_status()
        return response.json()


@app.post("/live/streams/{path}/kick")
async def kick_stream(path: str) -> dict[str, str]:
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(f"{MEDIAMTX_API}/v3/paths/kick/{path}")
        if response.status_code >= 400:
            raise HTTPException(response.status_code, "Kick failed")
    return {"status": "kicked"}


@app.websocket("/live/{stream_path}/chat")
async def live_chat(stream_path: str, websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        async for raw_message in websocket.iter_text():
            msg = ChatMessage(user="viewer", text=raw_message)
            try:
                governed = moderate_chat_batch([msg])[0]
            except Exception:
                # Safer failure mode: throttle pending review, never auto-allow.
                governed = {
                    "user": msg.user,
                    "text": msg.text,
                    "action": "throttle (pending_review)",
                    "scores": {"toxic": None, "spoiler": None, "category": "unknown"},
                    "timestamp": time.time(),
                    "stream_path": stream_path,
                }
            await websocket.send_json(governed)
    except WebSocketDisconnect:
        return
