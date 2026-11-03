import os
from typing import Any

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security.api_key import APIKeyHeader
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from starlette.status import HTTP_403_FORBIDDEN

from model import LlmModel


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
    if req.stream:
        return StreamingResponse(
            llm.stream_generate(
                prompt=req.prompt,
                max_new_tokens=req.max_new_tokens,
                temperature=req.temperature,
                top_k=req.top_k,
                top_p=req.top_p,
                system_prompt=req.system_prompt,
            ),
            media_type="text/plain",
        )

    try:
        if req.response_format == "json" or req.strict_json:
            completion = llm.generate_json(
                prompt=req.prompt,
                required_keys=req.json_schema_keys,
                max_new_tokens=req.max_new_tokens,
                temperature=req.temperature,
                top_k=req.top_k,
                top_p=req.top_p,
                system_prompt=req.system_prompt,
                retries=req.json_retries,
                retry_token_buffer=req.json_retry_token_buffer,
                max_retry_tokens=req.json_max_new_tokens_cap,
            )
        else:
            completion = llm.generate(
                prompt=req.prompt,
                max_new_tokens=req.max_new_tokens,
                temperature=req.temperature,
                top_k=req.top_k,
                top_p=req.top_p,
                system_prompt=req.system_prompt,
            )
    except ValueError as ex:
        raise HTTPException(status_code=422, detail=str(ex)) from ex

    return {"text": completion}


def sse_token_generator(req: StreamingRequest):
    for text in llm.stream_generate(
        prompt=req.prompt,
        max_new_tokens=req.max_new_tokens,
        temperature=req.temperature,
        top_k=req.top_k,
        top_p=req.top_p,
        system_prompt=req.system_prompt,
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
