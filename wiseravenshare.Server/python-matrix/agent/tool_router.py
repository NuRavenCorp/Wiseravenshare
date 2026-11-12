from __future__ import annotations

import os
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/agent/router", tags=["agent-tool-router"])

AGENT_BASE_URL = os.environ.get("AGENT_BASE_URL", "http://127.0.0.1:8000").strip().rstrip("/")
AGENT_HTTP_TIMEOUT_SECONDS = float(os.environ.get("AGENT_HTTP_TIMEOUT_SECONDS", "30"))

SOCIAL_TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "create_social_post",
            "description": "Publish a post draft or queue it for approval.",
            "parameters": {
                "type": "object",
                "properties": {
                    "content": {"type": "string"},
                    "hashtags": {"type": "array", "items": {"type": "string"}},
                    "media_url": {"type": "string"},
                    "user_id": {"type": "string"},
                    "require_approval": {"type": "boolean"},
                },
                "required": ["content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "post_comment",
            "description": "Comment on a post via the social action queue.",
            "parameters": {
                "type": "object",
                "properties": {
                    "post_id": {"type": "string"},
                    "content": {"type": "string"},
                    "user_id": {"type": "string"},
                    "require_approval": {"type": "boolean"},
                },
                "required": ["post_id", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_repost",
            "description": "Create a repost/quote action.",
            "parameters": {
                "type": "object",
                "properties": {
                    "post_id": {"type": "string"},
                    "quote_text": {"type": "string"},
                    "user_id": {"type": "string"},
                    "require_approval": {"type": "boolean"},
                },
                "required": ["post_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "send_direct_message",
            "description": "Send a DM through chat (or create approval draft).",
            "parameters": {
                "type": "object",
                "properties": {
                    "recipient_id": {"type": "string"},
                    "message_text": {"type": "string"},
                    "sender_id": {"type": "string"},
                    "require_approval": {"type": "boolean"},
                },
                "required": ["recipient_id", "message_text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_post_partials",
            "description": "Get exact interaction split percentages for a post.",
            "parameters": {
                "type": "object",
                "properties": {
                    "post_id": {"type": "string"},
                    "views": {"type": "integer", "minimum": 0},
                },
                "required": ["post_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_unread_notifications",
            "description": "Fetch unread notification entries for a user.",
            "parameters": {
                "type": "object",
                "properties": {
                    "user_id": {"type": "string"},
                    "limit": {"type": "integer", "minimum": 1, "maximum": 100},
                },
                "required": ["user_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_recent_chat",
            "description": "Get recent messages from a chat conversation.",
            "parameters": {
                "type": "object",
                "properties": {
                    "conversation_id": {"type": "string"},
                    "user_id": {"type": "string"},
                    "limit": {"type": "integer", "minimum": 1, "maximum": 200},
                },
                "required": ["conversation_id", "user_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "queue_karaoke_job",
            "description": "Queue a karaoke job with GPU-safe orchestration.",
            "parameters": {
                "type": "object",
                "properties": {
                    "song_id": {"type": "string"},
                    "audio_path": {"type": "string"},
                    "audio_url": {"type": "string"},
                    "channel": {"type": "string"},
                    "track_name": {"type": "string"},
                    "artist_name": {"type": "string"},
                    "announce_on_social": {"type": "boolean"},
                },
                "required": ["song_id", "audio_path", "audio_url"],
            },
        },
    },
]

ENDPOINT_MAP: dict[str, dict[str, Any]] = {
    "create_social_post": {"method": "POST", "path": "/agent/tools/post"},
    "post_comment": {"method": "POST", "path": "/agent/tools/comment"},
    "create_repost": {"method": "POST", "path": "/agent/tools/repost"},
    "send_direct_message": {"method": "POST", "path": "/agent/tools/dm"},
    "get_post_partials": {"method": "GET", "path": "/agent/tools/partials/{post_id}"},
    "fetch_unread_notifications": {"method": "GET", "path": "/agent/tools/notifications/unread"},
    "get_recent_chat": {"method": "GET", "path": "/agent/tools/chat/recent/{conversation_id}"},
    "queue_karaoke_job": {"method": "POST", "path": "/agent/karaoke/generate"},
}


class ToolExecuteRequest(BaseModel):
    tool_name: str
    arguments: dict[str, Any] = Field(default_factory=dict)


async def execute_llm_tool_call(tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    route = ENDPOINT_MAP.get(tool_name)
    if route is None:
        return {"error": f"Unknown tool: {tool_name}"}

    method = route["method"]
    path = route["path"]
    path_args = dict(arguments)
    query_args: dict[str, Any] = {}
    body_args: dict[str, Any] = dict(arguments)

    if "{post_id}" in path:
        post_id = path_args.get("post_id")
        if post_id is None:
            return {"error": "post_id is required."}
        path = path.replace("{post_id}", str(post_id))
        body_args.pop("post_id", None)
        if "views" in arguments:
            query_args["views"] = arguments["views"]
    elif "{conversation_id}" in path:
        conversation_id = path_args.get("conversation_id")
        if conversation_id is None:
            return {"error": "conversation_id is required."}
        path = path.replace("{conversation_id}", str(conversation_id))
        body_args.pop("conversation_id", None)
        query_args = {k: v for k, v in body_args.items()}
        body_args = {}

    if tool_name == "fetch_unread_notifications":
        query_args = {k: v for k, v in body_args.items()}
        body_args = {}

    timeout = httpx.Timeout(AGENT_HTTP_TIMEOUT_SECONDS)
    async with httpx.AsyncClient(base_url=AGENT_BASE_URL, timeout=timeout) as client:
        if method == "POST":
            response = await client.post(path, json=body_args)
        else:
            response = await client.get(path, params=query_args)

    payload: Any
    try:
        payload = response.json()
    except ValueError:
        payload = {"raw": response.text}
    return {"status_code": response.status_code, "body": payload}


@router.get("/schemas")
def get_tool_schemas() -> dict[str, Any]:
    return {"tools": SOCIAL_TOOL_SCHEMAS}


@router.post("/execute")
async def execute_router_tool(payload: ToolExecuteRequest) -> dict[str, Any]:
    result = await execute_llm_tool_call(payload.tool_name, payload.arguments)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

