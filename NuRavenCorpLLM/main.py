"""
NuRavenCorpLLM — front-facing conversation service for WiseRavenShare.

Exposes the REST API that NuRavenCorpLlmChatService.cs bridges to:
  POST /api/assistant/conversations
  POST /api/assistant/conversations/{id}/messages
  GET  /api/assistant/conversations/{id}
  GET  /health

Calls any OpenAI-compatible LLM backend (Ollama, llama.cpp, vLLM, etc.).
Configure via environment variables or .env file:
  NURAVENCORP_LLM_BASE_URL    e.g. http://localhost:11434   (default)
  NURAVENCORP_LLM_MODEL       e.g. llama3.2                 (default)
  NURAVENCORP_LLM_API_KEY     optional bearer token for the upstream LLM
  NURAVENCORP_PORT            HTTP port to listen on         (default 5011)
"""

from __future__ import annotations

import os
import uuid
import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("nuravencorpllm")

# ── Config ───────────────────────────────────────────────────────────────────

LLM_BASE_URL: str = os.getenv("NURAVENCORP_LLM_BASE_URL", "http://localhost:11434").rstrip("/")
LLM_MODEL: str    = os.getenv("NURAVENCORP_LLM_MODEL", "llama3.2")
LLM_API_KEY: str  = os.getenv("NURAVENCORP_LLM_API_KEY", "")
PORT: int         = int(os.getenv("NURAVENCORP_PORT", "5011"))
WAIT_FOR_LLM_TIMEOUT_SECONDS: int = int(os.getenv("NURAVENCORP_WAIT_FOR_LLM_TIMEOUT_SECONDS", "300"))
WAIT_FOR_LLM_INTERVAL_SECONDS: int = int(os.getenv("NURAVENCORP_WAIT_FOR_LLM_INTERVAL_SECONDS", "5"))
REQUIRE_LLM_READY_ON_STARTUP: bool = os.getenv("NURAVENCORP_REQUIRE_LLM_READY_ON_STARTUP", "true").strip().lower() not in ("0", "false", "no")

# Fallback chain: try Ollama native → OpenAI-compat → llama.cpp
CHAT_ENDPOINTS: list[str] = [
    f"{LLM_BASE_URL}/v1/chat/completions",   # OpenAI-compat (Ollama ≥ 0.1.24, llama.cpp, vLLM)
    f"{LLM_BASE_URL}/api/chat",              # Ollama native
]

SYSTEM_PROMPT = (
    "You are WiseRaven, the in-app AI assistant for WiseRavenShare — "
    "a comprehensive media, podcast, and social engagement platform for creators, "
    "journalists, and teams.\n\n"
    "Core behaviour:\n"
    "• Be accurate and concise; expand only when asked.\n"
    "• Never invent facts. If unsure, say so.\n"
    "• Respect user privacy; never reveal other users' private data.\n"
    "• Use WiseRavenShare platform context when relevant.\n\n"
    "Platform highlights: Ravensight video studio, Podcast Studio, FM Radio Creator, "
    "cross-platform syndication (Facebook/Instagram/TikTok/YouTube/X/LinkedIn), "
    "TruthSeeker fact-checking, WiseCoin engagement currency, Team Launchpad.\n\n"
    "Symbol notation (use often): $ = valuable/excellent. % = partial/incomplete.\n"
    "Tone: warm, practical. For out-of-scope issues suggest support@wiseravenshare.com."
)

# ── In-memory conversation store ─────────────────────────────────────────────

class Message:
    def __init__(self, role: str, content: str) -> None:
        self.id = str(uuid.uuid4())
        self.role = role
        self.content = content
        self.created_at = datetime.now(timezone.utc).isoformat()

class Conversation:
    def __init__(self, title: str = "RavenChat", persona: str = "Default") -> None:
        self.id = str(uuid.uuid4())
        self.title = title
        self.persona = persona
        self.messages: list[Message] = []
        self.created_at = datetime.now(timezone.utc).isoformat()
        self.last_message_at = self.created_at

_conversations: dict[str, Conversation] = {}
_llm_ready: bool = False

# ── LLM client ───────────────────────────────────────────────────────────────

def _build_openai_payload(messages: list[dict[str, str]]) -> dict[str, Any]:
    return {
        "model": LLM_MODEL,
        "messages": messages,
        "stream": False,
        "temperature": 0.7,
        "max_tokens": 800,
    }

def _build_ollama_payload(messages: list[dict[str, str]]) -> dict[str, Any]:
    return {
        "model": LLM_MODEL,
        "messages": messages,
        "stream": False,
        "options": {"temperature": 0.7, "num_predict": 800},
    }

def _auth_headers() -> dict[str, str]:
    if LLM_API_KEY:
        return {"Authorization": f"Bearer {LLM_API_KEY}"}
    return {}

async def _call_llm(chat_messages: list[dict[str, str]]) -> str:
    """Try OpenAI-compat endpoint first, fall back to Ollama native."""
    async with httpx.AsyncClient(timeout=120.0) as client:
        # ── Attempt 1: OpenAI-compatible  (/v1/chat/completions) ────────────
        try:
            resp = await client.post(
                f"{LLM_BASE_URL}/v1/chat/completions",
                json=_build_openai_payload(chat_messages),
                headers={"Content-Type": "application/json", **_auth_headers()},
            )
            if resp.status_code == 200:
                data = resp.json()
                return (
                    data.get("choices", [{}])[0]
                    .get("message", {})
                    .get("content", "")
                    .strip()
                )
            log.warning("OpenAI-compat endpoint returned %d; trying Ollama native.", resp.status_code)
        except Exception as exc:
            log.warning("OpenAI-compat call failed (%s); trying Ollama native.", exc)

        # ── Attempt 2: Ollama native  (/api/chat) ───────────────────────────
        try:
            resp = await client.post(
                f"{LLM_BASE_URL}/api/chat",
                json=_build_ollama_payload(chat_messages),
                headers={"Content-Type": "application/json", **_auth_headers()},
            )
            if resp.status_code == 200:
                data = resp.json()
                return data.get("message", {}).get("content", "").strip()
            log.warning("Ollama native endpoint returned %d.", resp.status_code)
        except Exception as exc:
            log.warning("Ollama native call failed: %s", exc)

    return ""

async def _probe_llm_ready() -> tuple[bool, str]:
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(f"{LLM_BASE_URL}/v1/models", headers=_auth_headers())
            if r.status_code == 200:
                return True, "openai-compat /v1/models"
            r2 = await client.get(f"{LLM_BASE_URL}/api/tags", headers=_auth_headers())
            if r2.status_code == 200:
                return True, "ollama /api/tags"
            return False, f"models probe failed ({r.status_code}/{r2.status_code})"
    except Exception as exc:
        return False, f"probe exception: {exc}"

# ── Pydantic models ───────────────────────────────────────────────────────────

class CreateConversationRequest(BaseModel):
    title: str = "RavenChat"
    persona: str = "Default"

class SendMessageRequest(BaseModel):
    text: str
    isVoice: bool = False

# ── FastAPI app ───────────────────────────────────────────────────────────────

app = FastAPI(title="NuRavenCorpLLM", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ───────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def wait_for_llm_initialization() -> None:
    global _llm_ready
    if not REQUIRE_LLM_READY_ON_STARTUP:
        ready, detail = await _probe_llm_ready()
        _llm_ready = ready
        if ready:
            log.info("LLM backend reachable at startup (%s).", detail)
        else:
            log.warning("LLM backend not ready at startup (%s), service will continue in degraded mode.", detail)
        return

    attempts = max(1, WAIT_FOR_LLM_TIMEOUT_SECONDS // max(1, WAIT_FOR_LLM_INTERVAL_SECONDS))
    for attempt in range(1, attempts + 1):
        ready, detail = await _probe_llm_ready()
        if ready:
            _llm_ready = True
            log.info("LLM backend is ready (%s). Startup gate cleared.", detail)
            return
        log.warning(
            "Waiting for LLM backend (%d/%d): %s",
            attempt,
            attempts,
            detail,
        )
        await asyncio.sleep(max(1, WAIT_FOR_LLM_INTERVAL_SECONDS))

    log.error(
        "LLM backend did not become ready within %ds at %s. Failing startup.",
        WAIT_FOR_LLM_TIMEOUT_SECONDS,
        LLM_BASE_URL,
    )
    raise RuntimeError("NuRavenCorpLLM startup blocked: upstream LLM is not ready.")

@app.get("/health")
async def health():
    """Connectivity probe used by NuRavenCorpLlmChatService health check."""
    reachable = _llm_ready
    model_name = LLM_MODEL
    try:
        reachable, _ = await _probe_llm_ready()
    except Exception:
        reachable = False

    status = "ok" if reachable else "degraded"
    return {
        "status": status,
        "llm_reachable": reachable,
        "llm_ready": _llm_ready,
        "model": model_name,
        "backend": LLM_BASE_URL,
        "conversations_active": len(_conversations),
    }

@app.post("/api/assistant/conversations")
async def create_conversation(req: CreateConversationRequest):
    conv = Conversation(title=req.title, persona=req.persona)
    _conversations[conv.id] = conv
    log.info("Created conversation %s (persona=%s)", conv.id, conv.persona)
    return {
        "id": conv.id,
        "Id": conv.id,
        "title": conv.title,
        "persona": conv.persona,
        "createdAt": conv.created_at,
    }

@app.get("/api/assistant/conversations/{conversation_id}")
async def get_conversation(conversation_id: str):
    conv = _conversations.get(conversation_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return {
        "id": conv.id,
        "title": conv.title,
        "persona": conv.persona,
        "messages": [
            {"id": m.id, "role": m.role, "content": m.content, "createdAt": m.created_at}
            for m in conv.messages
        ],
    }

@app.post("/api/assistant/conversations/{conversation_id}/messages")
async def send_message(conversation_id: str, req: SendMessageRequest):
    global _llm_ready
    if not _llm_ready:
        ready, _ = await _probe_llm_ready()
        _llm_ready = ready
        if not _llm_ready:
            raise HTTPException(status_code=503, detail="LLM backend is still initializing. Please retry shortly.")

    conv = _conversations.get(conversation_id)
    if conv is None:
        # Auto-create conversation if it wasn't pre-created (defensive path).
        conv = Conversation()
        conv.id = conversation_id
        _conversations[conversation_id] = conv
        log.info("Auto-created conversation %s on first message.", conversation_id)

    user_msg = Message(role="user", content=req.text.strip())
    conv.messages.append(user_msg)

    # Build LLM message list: system + up to 20 history turns + current user turn.
    history_limit = 20
    chat_messages: list[dict[str, str]] = [{"role": "system", "content": SYSTEM_PROMPT}]
    for m in conv.messages[-(history_limit + 1):-1]:
        chat_messages.append({"role": m.role, "content": m.content})
    chat_messages.append({"role": "user", "content": req.text.strip()})

    log.info("Calling LLM for conversation %s (history=%d turns)", conversation_id, len(chat_messages) - 2)

    reply_text = await _call_llm(chat_messages)

    if not reply_text:
        reply_text = (
            "I'm having trouble reaching the language model right now. "
            "Please check that Ollama (or your llama.cpp server) is running and try again."
        )

    assistant_msg = Message(role="assistant", content=reply_text)
    conv.messages.append(assistant_msg)
    conv.last_message_at = assistant_msg.created_at

    return {
        "id": assistant_msg.id,
        "Id": assistant_msg.id,
        "role": "assistant",
        "Role": "assistant",
        "content": reply_text,
        "Content": reply_text,
        "createdAt": assistant_msg.created_at,
        "conversationId": conversation_id,
    }

# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    log.info("Starting NuRavenCorpLLM on port %d (LLM backend: %s / model: %s)", PORT, LLM_BASE_URL, LLM_MODEL)
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False)
