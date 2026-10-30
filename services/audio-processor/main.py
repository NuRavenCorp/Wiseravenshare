"""Audio compatibility + AssemblyAI sync transcription service."""

from __future__ import annotations

import inspect
import logging
import os
import subprocess
import threading
import urllib.request
from typing import Any

import imageio_ffmpeg
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

try:
    import assemblyai as aai
    from assemblyai.sync.v1 import SyncTranscriber, SyncTranscriptionConfig
except Exception:  # pragma: no cover - handled at runtime via API responses
    aai = None
    SyncTranscriber = None
    SyncTranscriptionConfig = None


app = FastAPI(title="WiseRavenShare Audio Compatibility")
logger = logging.getLogger("audio-processor")
MAX_UPLOAD_BYTES = 500 * 1024 * 1024

ASSEMBLYAI_API_KEY = (os.getenv("ASSEMBLYAI_API_KEY") or "").strip()
ASSEMBLYAI_SYNC_MODEL = (os.getenv("ASSEMBLYAI_SYNC_MODEL") or "universal-3-5-pro").strip()
ASSEMBLYAI_KEEPALIVE_EXPIRY = int(os.getenv("ASSEMBLYAI_KEEPALIVE_EXPIRY", "120"))
ASSEMBLYAI_URL_TIMEOUT_SECONDS = int(os.getenv("ASSEMBLYAI_URL_TIMEOUT_SECONDS", "120"))

_sync_lock = threading.Lock()
_sync_transcriber: Any | None = None
_sync_transcriber_started = False


class SyncTranscriptionRequest(BaseModel):
    model: str = Field(default=ASSEMBLYAI_SYNC_MODEL)
    warm_connection: bool = Field(default=True)
    keepalive_expiry: int | None = Field(default=None, ge=30, le=600)

    # Optional AssemblyAI features; only forwarded if supported by installed SDK.
    speaker_labels: bool | None = None
    auto_chapters: bool | None = None
    iab_categories: bool | None = None
    sentiment_analysis: bool | None = None
    summary: bool | None = None


class SyncTranscriptionUrlRequest(SyncTranscriptionRequest):
    audio_url: str


def _ensure_assemblyai_ready() -> None:
    if not ASSEMBLYAI_API_KEY:
        raise HTTPException(status_code=503, detail="ASSEMBLYAI_API_KEY is not configured.")
    if aai is None or SyncTranscriber is None or SyncTranscriptionConfig is None:
        raise HTTPException(status_code=503, detail="assemblyai package is not installed in the audio service.")


def _serialize_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, list):
        return [_serialize_value(item) for item in value]
    if isinstance(value, dict):
        return {str(k): _serialize_value(v) for k, v in value.items()}
    if hasattr(value, "model_dump"):
        return _serialize_value(value.model_dump())
    if hasattr(value, "dict"):
        try:
            return _serialize_value(value.dict())
        except Exception:
            pass
    if hasattr(value, "__dict__"):
        return {
            str(k): _serialize_value(v)
            for k, v in vars(value).items()
            if not str(k).startswith("_")
        }
    return str(value)


def _build_sync_config(request: SyncTranscriptionRequest) -> Any:
    _ensure_assemblyai_ready()
    signature = inspect.signature(SyncTranscriptionConfig)
    accepted_fields = set(signature.parameters.keys())
    payload: dict[str, Any] = {}

    request_dict = request.model_dump()
    for key in ("model", "speaker_labels", "auto_chapters", "iab_categories", "sentiment_analysis", "summary"):
        value = request_dict.get(key)
        if value is not None and key in accepted_fields:
            payload[key] = value

    return SyncTranscriptionConfig(**payload)


def _get_sync_transcriber(*, warm: bool, keepalive_expiry: int | None) -> Any:
    _ensure_assemblyai_ready()
    global _sync_transcriber
    global _sync_transcriber_started

    with _sync_lock:
        requested_keepalive = keepalive_expiry if keepalive_expiry is not None else ASSEMBLYAI_KEEPALIVE_EXPIRY
        aai.settings.keepalive_expiry = max(30, min(600, int(requested_keepalive)))

        if not _sync_transcriber_started:
            _sync_transcriber = SyncTranscriber(api_key=ASSEMBLYAI_API_KEY)
            _sync_transcriber.__enter__()
            _sync_transcriber_started = True
            logger.info("AssemblyAI sync transcriber started with keepalive=%s", aai.settings.keepalive_expiry)

        if warm:
            _sync_transcriber.warm()

        return _sync_transcriber


def _close_sync_transcriber() -> None:
    global _sync_transcriber
    global _sync_transcriber_started
    with _sync_lock:
        if _sync_transcriber_started and _sync_transcriber is not None:
            try:
                _sync_transcriber.__exit__(None, None, None)
            except Exception:
                logger.exception("Failed to close AssemblyAI sync transcriber cleanly.")
        _sync_transcriber = None
        _sync_transcriber_started = False


def _download_audio(url: str) -> bytes:
    if not url.lower().startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="audio_url must be http or https.")
    try:
        with urllib.request.urlopen(url, timeout=ASSEMBLYAI_URL_TIMEOUT_SECONDS) as response:
            payload = response.read(MAX_UPLOAD_BYTES + 1)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Unable to download audio_url: {exc}") from exc

    if not payload:
        raise HTTPException(status_code=400, detail="Downloaded audio payload is empty.")
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Downloaded audio exceeds 500 MB limit.")
    return payload


def _run_sync_transcription(audio_bytes: bytes, request: SyncTranscriptionRequest) -> dict[str, Any]:
    transcriber = _get_sync_transcriber(warm=request.warm_connection, keepalive_expiry=request.keepalive_expiry)
    config = _build_sync_config(request)
    result = transcriber.transcribe(audio_bytes, config=config)

    text = getattr(result, "text", "") or ""
    return {
        "text": text,
        "model": request.model or ASSEMBLYAI_SYNC_MODEL,
        "keepalive_expiry": aai.settings.keepalive_expiry if aai is not None else ASSEMBLYAI_KEEPALIVE_EXPIRY,
        "metadata": {
            "has_text": bool(text.strip()),
            "speaker_labels_enabled": bool(request.speaker_labels),
            "auto_chapters_enabled": bool(request.auto_chapters),
            "iab_categories_enabled": bool(request.iab_categories),
            "sentiment_analysis_enabled": bool(request.sentiment_analysis),
            "summary_enabled": bool(request.summary),
        },
        "raw": _serialize_value(result),
    }


@app.on_event("shutdown")
def on_shutdown() -> None:
    _close_sync_transcriber()


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "audio-processor",
        "assemblyai_sync_configured": bool(ASSEMBLYAI_API_KEY),
        "assemblyai_sync_model": ASSEMBLYAI_SYNC_MODEL,
    }


@app.post("/browser-compatible")
async def browser_compatible(file: UploadFile = File(...)):
    source = await file.read(MAX_UPLOAD_BYTES + 1)
    if not source:
        raise HTTPException(status_code=400, detail="The audio file is empty.")
    if len(source) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Audio files must be 500 MB or smaller.")

    command = [
        imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error",
        "-i", "pipe:0", "-vn", "-codec:a", "libmp3lame", "-b:a", "192k",
        "-f", "mp3", "pipe:1",
    ]
    try:
        result = subprocess.run(command, input=source, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, timeout=240, check=False)
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="Audio conversion timed out.") from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Audio converter is unavailable.") from exc

    if result.returncode != 0 or not result.stdout:
        detail = result.stderr.decode("utf-8", errors="replace")[-1000:]
        raise HTTPException(status_code=422, detail=detail or "This audio file could not be converted.")
    return Response(content=result.stdout, media_type="audio/mpeg",
                    headers={"Cache-Control": "private, no-store"})


@app.post("/assemblyai/sync/warm")
async def warm_sync_transcriber(request: SyncTranscriptionRequest):
    _get_sync_transcriber(warm=True, keepalive_expiry=request.keepalive_expiry)
    return {
        "warmed": True,
        "model": request.model or ASSEMBLYAI_SYNC_MODEL,
        "keepalive_expiry": aai.settings.keepalive_expiry if aai is not None else ASSEMBLYAI_KEEPALIVE_EXPIRY,
    }


@app.post("/assemblyai/sync/transcribe-file")
async def transcribe_file_sync(
    file: UploadFile = File(...),
    model: str = Form(default=ASSEMBLYAI_SYNC_MODEL),
    warm_connection: bool = Form(default=True),
    keepalive_expiry: int | None = Form(default=None),
    speaker_labels: bool | None = Form(default=None),
    auto_chapters: bool | None = Form(default=None),
    iab_categories: bool | None = Form(default=None),
    sentiment_analysis: bool | None = Form(default=None),
    summary: bool | None = Form(default=None),
):
    source = await file.read(MAX_UPLOAD_BYTES + 1)
    if not source:
        raise HTTPException(status_code=400, detail="Audio file is required.")
    if len(source) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Audio files must be 500 MB or smaller.")

    request = SyncTranscriptionRequest(
        model=model,
        warm_connection=warm_connection,
        keepalive_expiry=keepalive_expiry,
        speaker_labels=speaker_labels,
        auto_chapters=auto_chapters,
        iab_categories=iab_categories,
        sentiment_analysis=sentiment_analysis,
        summary=summary,
    )
    return _run_sync_transcription(source, request)


@app.post("/assemblyai/sync/transcribe-url")
async def transcribe_url_sync(request: SyncTranscriptionUrlRequest):
    audio_bytes = _download_audio(request.audio_url)
    return _run_sync_transcription(audio_bytes, request)
