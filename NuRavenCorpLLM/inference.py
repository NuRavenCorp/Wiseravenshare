import os
import json
import urllib.error
import urllib.request
from typing import Any

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security.api_key import APIKeyHeader
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from starlette.status import HTTP_403_FORBIDDEN

class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1)
    max_new_tokens: int = Field(default=128, ge=1, le=1024)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    top_k: int = Field(default=50, ge=0)
    top_p: float = Field(default=0.9, gt=0.0, le=1.0)
    system_prompt: str | None = None
    response_format: str = Field(default="text", pattern="^(text|json)$")
    json_schema_keys: list[str] = Field(default_factory=list)
    strict_json: bool = False
    json_retries: int = Field(default=2, ge=0, le=10)
    json_retry_token_buffer: int = Field(default=32, ge=0, le=512)
    json_max_new_tokens_cap: int = Field(default=1024, ge=1, le=4096)
    stream: bool = False


class StreamingRequest(BaseModel):
    prompt: str = Field(min_length=1)
    max_new_tokens: int = Field(default=100, ge=1, le=1024)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    top_k: int = Field(default=50, ge=0)
    top_p: float = Field(default=0.9, ge=0.0, le=1.0)
    system_prompt: str | None = None


app = FastAPI(title="Custom LLM Core")
cors_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_KEY_NAME = "X-API-Key"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)
inference_api_key = os.getenv("INFERENCE_API_KEY", "").strip()
tenant_id = os.getenv("TENANT_ID", "").strip().lower()
tenant_prompt_override = os.getenv("TENANT_SYSTEM_PROMPT", "").strip()
vllm_base_url = os.getenv("VLLM_BASE_URL", "").strip().rstrip("/")
vllm_model = os.getenv("VLLM_MODEL", "").strip()
guided_decoding_backend = os.getenv("GUIDED_DECODING_BACKEND", "outlines").strip() or "outlines"

_TENANT_PROMPTS = {
    "wiseravenshare": "You are NuRaven assistant for wiseravenshare. Keep answers practical and business-ready.",
    "wiseravenstream": "You are NuRaven assistant for wiseravenstream. Prioritize media and stream workflow clarity.",
    "voteralliance": "You are NuRaven assistant for voteralliance. Keep answers policy-safe and civic-focused.",
}


def _extract_json_object(text: str) -> dict | None:
    candidate = text.strip()
    first = candidate.find("{")
    if first == -1:
        return None
    depth = 0
    start = -1
    for i, ch in enumerate(candidate[first:], start=first):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start != -1:
                snippet = candidate[start : i + 1]
                try:
                    parsed = json.loads(snippet)
                    if isinstance(parsed, dict):
                        return parsed
                except json.JSONDecodeError:
                    return None
    return None


def _tenant_system_prompt(user_prompt: str | None) -> str | None:
    pieces: list[str] = []
    if tenant_prompt_override:
        pieces.append(tenant_prompt_override)
    elif tenant_id in _TENANT_PROMPTS:
        pieces.append(_TENANT_PROMPTS[tenant_id])
    if user_prompt and user_prompt.strip():
        pieces.append(user_prompt.strip())
    if not pieces:
        return None
    return "\n\n".join(pieces)


def _post_json(url: str, payload: dict[str, Any], timeout: int = 180) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url=url,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read().decode("utf-8")
        return json.loads(raw)


def _vllm_chat_completion(
    req: GenerateRequest,
    system_prompt: str | None,
    max_new_tokens: int,
    temperature: float,
) -> str:
    if not vllm_base_url:
        raise ValueError("VLLM_BASE_URL is not configured.")

    payload: dict[str, Any] = {
        "model": vllm_model or "default",
        "messages": [{"role": "user", "content": req.prompt}],
        "max_tokens": max_new_tokens,
        "temperature": max(temperature, 0.0),
        "top_p": req.top_p,
        "stream": False,
    }
    if system_prompt:
        payload["messages"] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": req.prompt},
        ]
    if req.top_k > 0:
        payload["top_k"] = req.top_k

    if req.response_format == "json" or req.strict_json:
        payload["response_format"] = {"type": "json_object"}
        payload["guided_decoding_backend"] = guided_decoding_backend
        if req.json_schema_keys:
            schema = {
                "type": "object",
                "properties": {k: {"type": "string"} for k in req.json_schema_keys},
                "required": req.json_schema_keys,
                "additionalProperties": True,
            }
            payload["guided_json"] = schema

    data = _post_json(f"{vllm_base_url}/chat/completions", payload)
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        raise ValueError("Invalid vLLM response: choices missing.")
    message = choices[0].get("message", {})
    content = message.get("content")
    if not isinstance(content, str):
        raise ValueError("Invalid vLLM response: content missing.")
    return content.strip()


llm = None
if not vllm_base_url:
    from model import LlmModel

    llm = LlmModel()


def require_api_key(api_key: str | None = Depends(api_key_header)) -> None:
    if not inference_api_key:
        return
    if api_key == inference_api_key:
        return
    raise HTTPException(status_code=HTTP_403_FORBIDDEN, detail="Invalid or missing API key.")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/generate")
def generate(req: GenerateRequest, _guard: None = Depends(require_api_key)) -> Any:
    effective_system_prompt = _tenant_system_prompt(req.system_prompt)

    if req.stream:
        if vllm_base_url:
            raise HTTPException(status_code=501, detail="Streaming is not supported in vLLM proxy mode.")
        return StreamingResponse(
            llm.stream_generate(  # type: ignore[union-attr]
                prompt=req.prompt,
                max_new_tokens=req.max_new_tokens,
                temperature=req.temperature,
                top_k=req.top_k,
                top_p=req.top_p,
                system_prompt=effective_system_prompt,
            ),
            media_type="text/plain",
        )

    try:
        if vllm_base_url:
            if req.response_format == "json" or req.strict_json:
                attempts = max(1, req.json_retries + 1)
                completion = ""
                parsed = None
                for attempt in range(attempts):
                    temperature = 0.0 if attempt > 0 else req.temperature
                    max_tokens = min(
                        req.json_max_new_tokens_cap,
                        req.max_new_tokens + (attempt * max(0, req.json_retry_token_buffer)),
                    )
                    completion = _vllm_chat_completion(
                        req=req,
                        system_prompt=effective_system_prompt,
                        max_new_tokens=max_tokens,
                        temperature=temperature,
                    )
                    parsed = _extract_json_object(completion)
                    if parsed is None:
                        continue
                    missing = [k for k in req.json_schema_keys if k not in parsed]
                    if missing:
                        continue
                    completion = json.dumps(parsed, ensure_ascii=False)
                    break
                if parsed is None:
                    raise ValueError("Model did not produce valid JSON for requested schema.")
            else:
                completion = _vllm_chat_completion(
                    req=req,
                    system_prompt=effective_system_prompt,
                    max_new_tokens=req.max_new_tokens,
                    temperature=req.temperature,
                )
        elif req.response_format == "json" or req.strict_json:
            completion = llm.generate_json(  # type: ignore[union-attr]
                prompt=req.prompt,
                required_keys=req.json_schema_keys,
                max_new_tokens=req.max_new_tokens,
                temperature=req.temperature,
                top_k=req.top_k,
                top_p=req.top_p,
                system_prompt=effective_system_prompt,
                retries=req.json_retries,
                retry_token_buffer=req.json_retry_token_buffer,
                max_retry_tokens=req.json_max_new_tokens_cap,
            )
        else:
            completion = llm.generate(  # type: ignore[union-attr]
                prompt=req.prompt,
                max_new_tokens=req.max_new_tokens,
                temperature=req.temperature,
                top_k=req.top_k,
                top_p=req.top_p,
                system_prompt=effective_system_prompt,
            )
    except urllib.error.HTTPError as ex:
        detail = ex.read().decode("utf-8", errors="replace")
        raise HTTPException(status_code=502, detail=f"Upstream vLLM error ({ex.code}): {detail}") from ex
    except urllib.error.URLError as ex:
        raise HTTPException(status_code=503, detail=f"Unable to reach upstream vLLM: {ex.reason}") from ex
    except ValueError as ex:
        raise HTTPException(status_code=422, detail=str(ex)) from ex

    return {"text": completion}


def sse_token_generator(req: StreamingRequest):
    for text in llm.stream_generate(  # type: ignore[union-attr]
        prompt=req.prompt,
        max_new_tokens=req.max_new_tokens,
        temperature=req.temperature,
        top_k=req.top_k,
        top_p=req.top_p,
        system_prompt=_tenant_system_prompt(req.system_prompt),
    ):
        yield f"data: {text}\n\n"


@app.post("/stream")
def stream_text(req: StreamingRequest, _guard: None = Depends(require_api_key)) -> StreamingResponse:
    if llm is None:
        raise HTTPException(status_code=503, detail="Pipeline inactive")
    return StreamingResponse(sse_token_generator(req), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host=host, port=port)
