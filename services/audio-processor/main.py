"""Audio compatibility + AssemblyAI Sync transcription service with WebSocket relay.

AssemblyAI Sync API (sync.assemblyai.com/v1/transcribe):
  - Synchronous: POST and wait for the completed response (no polling).
  - Accepts files up to 20 minutes / 256 MB over HTTP.
  - Request: multipart/form-data with two parts:
      audio  -- the audio/video file bytes
      config -- JSON string, e.g. {"timestamps": true}
  - Model: X-AAI-Model header (not a body field).
  - Word timestamps: must be explicitly set -- {"timestamps": true} -- treat as opt-in.
  - Words missing start/end (unaligned) are filtered out; gaps are handled client-side.
  - Translation: NOT in the same request. Use the Understanding endpoint separately.

Translation (separate call):
  POST https://llm-gateway.assemblyai.com/v1/understanding
  Body: { transcript_id, speech_understanding: { request: { translation: { target_languages } } } }

WebSocket relay (/karaoke/relay):
  - Clients connect to receive karaoke_ready broadcasts.
  - POST /karaoke/process triggers async transcription + broadcast.

Endpoints:
  GET  /health
  POST /browser-compatible           -- ffmpeg MP3 conversion
  POST /extract-audio                -- ffmpeg video -> 16kHz mono WAV
  POST /assemblyai/warm              -- verify API key connectivity
  POST /assemblyai/transcribe-file   -- Sync API (multipart), returns words[]
  POST /assemblyai/transcribe-url    -- download URL audio, then Sync API
  POST /assemblyai/translate         -- Understanding endpoint (after transcription)
  WS   /karaoke/relay                -- broadcast channel for karaoke_ready events
  POST /karaoke/process              -- trigger async transcribe + broadcast
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import subprocess
from typing import Any

import httpx
import imageio_ffmpeg
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("audio-processor")

app = FastAPI(title="WiseRavenShare Audio Compatibility")

MAX_UPLOAD_BYTES = 500 * 1024 * 1024      # 500 MB cap for this service
AAI_MAX_FILE_BYTES = 256 * 1024 * 1024   # AssemblyAI 256 MB limit

ASSEMBLYAI_API_KEY = (os.getenv("ASSEMBLYAI_API_KEY") or "").strip()
# Sync API base -- synchronous, accepts files up to 20 minutes
AAI_SYNC_BASE = (os.getenv("ASSEMBLYAI_SYNC_BASE") or "https://sync.assemblyai.com").rstrip("/")
# Async API base -- for translation (Understanding endpoint)
AAI_API_BASE = (os.getenv("ASSEMBLYAI_API_BASE") or "https://api.assemblyai.com").rstrip("/")
AAI_LLM_BASE = (os.getenv("ASSEMBLYAI_LLM_BASE") or "https://llm-gateway.assemblyai.com").rstrip("/")
# Model to use via X-AAI-Model header
ASSEMBLYAI_SPEECH_MODEL = (os.getenv("ASSEMBLYAI_SPEECH_MODEL") or "universal-3-5-pro").strip()
# Sync API timeout: 20 min songs + margin. Do NOT use 120s (that's the SDK live cap).
ASSEMBLYAI_SYNC_TIMEOUT = int(os.getenv("ASSEMBLYAI_SYNC_TIMEOUT", "1800"))  # 30 min
ASSEMBLYAI_URL_TIMEOUT = int(os.getenv("ASSEMBLYAI_URL_TIMEOUT", "300"))     # 5 min download

# ── WebSocket relay state ─────────────────────────────────────────────────────
_connected_clients: set[WebSocket] = set()


# ── Request models ────────────────────────────────────────────────────────────

class TranscribeFileOptions(BaseModel):
    speech_model: str = Field(default=ASSEMBLYAI_SPEECH_MODEL)
    timestamps: bool = Field(default=True)     # MUST be True for karaoke
    speaker_labels: bool = Field(default=False)
    extract_audio_first: bool = Field(default=False)


class TranscribeUrlRequest(BaseModel):
    audio_url: str
    speech_model: str = Field(default=ASSEMBLYAI_SPEECH_MODEL)
    timestamps: bool = Field(default=True)
    speaker_labels: bool = Field(default=False)
    extract_audio_first: bool = Field(default=False)


class TranslateRequest(BaseModel):
    transcript_id: str
    target_languages: list[str] = Field(default=["en"])
    formal: bool = Field(default=False)


class ProcessRequest(BaseModel):
    audio_path: str
    audio_url: str
    speech_model: str = Field(default=ASSEMBLYAI_SPEECH_MODEL)


# ── Core helpers ──────────────────────────────────────────────────────────────

def _ensure_api_key() -> None:
    if not ASSEMBLYAI_API_KEY:
        raise HTTPException(status_code=503, detail="ASSEMBLYAI_API_KEY is not configured.")


def _ffmpeg_to_mono_wav(source: bytes) -> bytes:
    """Extract / convert audio to 16 kHz mono PCM WAV (optimal for speech models)."""
    cmd = [
        imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error",
        "-i", "pipe:0",
        "-vn",                    # strip video
        "-acodec", "pcm_s16le",
        "-ar", "16000",           # 16 kHz
        "-ac", "1",               # mono
        "-f", "wav", "pipe:1",
    ]
    try:
        result = subprocess.run(cmd, input=source, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=300, check=False)
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="Audio extraction timed out.") from exc
    if result.returncode != 0 or not result.stdout:
        detail = result.stderr.decode("utf-8", errors="replace")[-800:]
        raise HTTPException(status_code=422, detail=detail or "Could not extract audio from file.")
    return result.stdout


def _build_config(timestamps: bool, speaker_labels: bool) -> str:
    """Build the JSON config part for the Sync API multipart request."""
    cfg: dict[str, Any] = {"timestamps": timestamps}
    if speaker_labels:
        cfg["speaker_labels"] = True
    return json.dumps(cfg)


def _normalize_words(raw_words: list[dict]) -> list[dict]:
    """
    Convert AssemblyAI word objects to our standard shape.
    Timestamps are in milliseconds from the API; normalize to seconds.
    Filter words where start/end is absent (unaligned) per docs.
    """
    out = []
    for w in raw_words:
        start = w.get("start")
        end = w.get("end")
        if start is None or end is None:
            # Docs: "Words that can't be aligned will have start/end omitted, not approximated."
            continue
        out.append({
            "word": w.get("text", ""),
            "start": round(start / 1000.0, 3),   # ms -> seconds
            "end": round(end / 1000.0, 3),
            "confidence": w.get("confidence"),
            "speaker": w.get("speaker"),
        })
    return out


async def _sync_transcribe(audio_bytes: bytes, speech_model: str, timestamps: bool, speaker_labels: bool) -> dict[str, Any]:
    """
    POST to AssemblyAI Sync API (sync.assemblyai.com/v1/transcribe).
    Synchronous -- waits for the completed transcript in one HTTP call.
    Supports up to 20 minutes / 256 MB. No polling required.
    """
    _ensure_api_key()
    if len(audio_bytes) > AAI_MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail=f"Audio exceeds AssemblyAI 256 MB limit ({len(audio_bytes)//1024//1024} MB).")

    config_json = _build_config(timestamps=timestamps, speaker_labels=speaker_labels)
    headers = {
        "Authorization": ASSEMBLYAI_API_KEY,
        "X-AAI-Model": speech_model,
    }

    async with httpx.AsyncClient(timeout=ASSEMBLYAI_SYNC_TIMEOUT) as client:
        response = await client.post(
            f"{AAI_SYNC_BASE}/v1/transcribe",
            headers=headers,
            files={
                "audio": ("audio.wav", audio_bytes, "audio/wav"),
                "config": (None, config_json, "application/json"),
            },
        )

    if not response.is_success:
        raise HTTPException(
            status_code=502,
            detail=f"AssemblyAI Sync API failed ({response.status_code}): {response.text[:500]}"
        )

    data = response.json()
    words = _normalize_words(data.get("words") or [])
    logger.info(
        "AssemblyAI Sync transcript complete: model=%s words=%d duration=%.1fs",
        speech_model, len(words), (data.get("audio_duration") or 0)
    )
    return {
        "text": data.get("text") or "",
        "words": words,
        "word_count": len(words),
        "transcript_id": data.get("id"),
        "language_code": data.get("language_code"),
        "confidence": data.get("confidence"),
        "audio_duration_seconds": data.get("audio_duration"),
        "speech_model": speech_model,
        "timestamps_requested": timestamps,
        "utterances": data.get("utterances"),
    }


# ── WebSocket relay ───────────────────────────────────────────────────────────

@app.websocket("/karaoke/relay")
async def websocket_relay(websocket: WebSocket):
    """Clients subscribe here to receive karaoke_ready broadcasts."""
    await websocket.accept()
    _connected_clients.add(websocket)
    logger.info("Karaoke relay client connected (%d total)", len(_connected_clients))
    try:
        while True:
            await websocket.receive_text()   # keep alive; ignore client messages
    except WebSocketDisconnect:
        pass
    finally:
        _connected_clients.discard(websocket)
        logger.info("Karaoke relay client disconnected (%d remaining)", len(_connected_clients))


async def _broadcast(payload: dict) -> None:
    message = json.dumps(payload)
    dead: set[WebSocket] = set()
    for client in list(_connected_clients):
        try:
            await client.send_text(message)
        except Exception:
            dead.add(client)
    _connected_clients.difference_update(dead)


async def _process_song(audio_path: str, audio_url: str, speech_model: str) -> dict:
    """Read file, transcribe with Sync API, broadcast karaoke_ready."""
    try:
        with open(audio_path, "rb") as f:
            audio_bytes = f.read()
        result = await _sync_transcribe(audio_bytes, speech_model=speech_model, timestamps=True, speaker_labels=False)
        payload = {
            "type": "karaoke_ready",
            "audio": audio_url,
            "words": result["words"],
            "text": result["text"],
            "transcript_id": result.get("transcript_id"),
        }
        await _broadcast(payload)
        return payload
    except Exception as exc:
        logger.exception("process_song failed for %s", audio_path)
        err_payload = {"type": "karaoke_error", "audio": audio_url, "error": str(exc)}
        await _broadcast(err_payload)
        raise


# ── HTTP endpoints ────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "audio-processor",
        "assemblyai_configured": bool(ASSEMBLYAI_API_KEY),
        "assemblyai_sync_base": AAI_SYNC_BASE,
        "assemblyai_speech_model": ASSEMBLYAI_SPEECH_MODEL,
        "relay_clients": len(_connected_clients),
    }


@app.post("/browser-compatible")
async def browser_compatible(file: UploadFile = File(...)):
    source = await file.read(MAX_UPLOAD_BYTES + 1)
    if not source:
        raise HTTPException(status_code=400, detail="The audio file is empty.")
    if len(source) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Audio files must be 500 MB or smaller.")
    cmd = [
        imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error",
        "-i", "pipe:0", "-vn", "-codec:a", "libmp3lame", "-b:a", "192k", "-f", "mp3", "pipe:1",
    ]
    try:
        result = subprocess.run(cmd, input=source, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=240, check=False)
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="Audio conversion timed out.") from exc
    if result.returncode != 0 or not result.stdout:
        detail = result.stderr.decode("utf-8", errors="replace")[-800:]
        raise HTTPException(status_code=422, detail=detail or "This audio file could not be converted.")
    return Response(content=result.stdout, media_type="audio/mpeg", headers={"Cache-Control": "private, no-store"})


@app.post("/extract-audio")
async def extract_audio(file: UploadFile = File(...)):
    """Extract audio from video/audio file -> 16 kHz mono WAV (optimal for AssemblyAI)."""
    source = await file.read(MAX_UPLOAD_BYTES + 1)
    if not source:
        raise HTTPException(status_code=400, detail="File is empty.")
    if len(source) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File must be 500 MB or smaller.")
    wav_bytes = _ffmpeg_to_mono_wav(source)
    return Response(content=wav_bytes, media_type="audio/wav", headers={"Cache-Control": "private, no-store"})


@app.post("/assemblyai/warm")
async def warm(request: TranscribeFileOptions):
    """Ping AssemblyAI Sync API to verify the key is valid."""
    _ensure_api_key()
    # A HEAD or lightweight GET on the sync base isn't documented;
    # use the async API /v1/transcript list endpoint as a fast key check.
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(
            f"{AAI_API_BASE}/v1/transcript?limit=1",
            headers={"Authorization": ASSEMBLYAI_API_KEY},
        )
    if not response.is_success:
        raise HTTPException(status_code=502, detail=f"AssemblyAI key check failed ({response.status_code}).")
    return {
        "warmed": True,
        "speech_model": request.speech_model,
        "sync_base": AAI_SYNC_BASE,
    }


@app.post("/assemblyai/transcribe-file")
async def transcribe_file(
    file: UploadFile = File(...),
    speech_model: str = Form(default=ASSEMBLYAI_SPEECH_MODEL),
    timestamps: bool = Form(default=True),
    speaker_labels: bool = Form(default=False),
    extract_audio_first: bool = Form(default=False),
):
    """
    Transcribe an uploaded audio/video file via AssemblyAI Sync API.
    No 120-second cap -- accepts up to 20 minutes.
    Set extract_audio_first=true to pre-extract 16 kHz mono WAV (recommended for karaoke).
    """
    source = await file.read(MAX_UPLOAD_BYTES + 1)
    if not source:
        raise HTTPException(status_code=400, detail="Audio file is required.")
    if len(source) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Audio file must be 500 MB or smaller.")

    audio_bytes = _ffmpeg_to_mono_wav(source) if extract_audio_first else source
    return await _sync_transcribe(audio_bytes, speech_model=speech_model, timestamps=timestamps, speaker_labels=speaker_labels)


@app.post("/assemblyai/transcribe-url")
async def transcribe_url(req: TranscribeUrlRequest):
    """
    Download a public audio/video URL and transcribe via AssemblyAI Sync API.
    AssemblyAI also accepts URLs directly -- if the URL is publicly reachable by
    AssemblyAI servers, you can pass it through their CDN upload instead.
    This endpoint downloads locally first so you control auth/headers.
    """
    if not req.audio_url.lower().startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="audio_url must be http/https.")

    async with httpx.AsyncClient(timeout=ASSEMBLYAI_URL_TIMEOUT) as client:
        response = await client.get(req.audio_url)
    if not response.is_success:
        raise HTTPException(status_code=422, detail=f"Could not download audio_url ({response.status_code}).")

    audio_bytes = response.content
    if not audio_bytes:
        raise HTTPException(status_code=422, detail="Downloaded audio is empty.")

    if req.extract_audio_first:
        audio_bytes = _ffmpeg_to_mono_wav(audio_bytes)

    return await _sync_transcribe(audio_bytes, speech_model=req.speech_model, timestamps=req.timestamps, speaker_labels=req.speaker_labels)


@app.post("/assemblyai/translate")
async def translate_transcript(req: TranslateRequest):
    """
    Run AssemblyAI Speech Understanding translation on a completed transcript.
    Translation is NOT part of the Sync API -- call this AFTER transcription.
    Returns translated_texts[lang] but word-level timing alignment with translated
    text is NOT guaranteed; line-level approximation may be needed for karaoke.
    """
    _ensure_api_key()
    body = {
        "transcript_id": req.transcript_id,
        "speech_understanding": {
            "request": {
                "translation": {
                    "target_languages": req.target_languages,
                    "formal": req.formal,
                }
            }
        }
    }
    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(
            f"{AAI_LLM_BASE}/v1/understanding",
            headers={"Authorization": ASSEMBLYAI_API_KEY, "Content-Type": "application/json"},
            json=body,
        )
    if not response.is_success:
        raise HTTPException(status_code=502, detail=f"AssemblyAI translation failed ({response.status_code}): {response.text[:400]}")
    return response.json()


@app.post("/karaoke/process")
async def karaoke_process(req: ProcessRequest):
    """
    Trigger async transcription of a local audio file and broadcast karaoke_ready
    to all connected WebSocket relay clients when complete.
    """
    asyncio.create_task(_process_song(req.audio_path, req.audio_url, req.speech_model))
    return {"status": "processing_started", "audio_url": req.audio_url}
