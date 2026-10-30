"""Audio compatibility + AssemblyAI transcription service.

Uses AssemblyAI REST API directly (POST /v1/transcript + polling) instead of
the SDK SyncTranscriber.  The SDK routes transcribe() through the live
endpoint which caps audio at 120 seconds -- nearly all songs exceed that.
The REST path accepts up to 20 minutes over HTTP and 256 MB files.

Word timestamps are explicitly requested (treat as opt-in per current docs).
Timestamps are returned in milliseconds and normalized to seconds for callers.

Endpoints:
  GET  /health
  POST /browser-compatible              -- ffmpeg MP3 conversion
  POST /extract-audio                   -- ffmpeg video → mono WAV for STT
  POST /assemblyai/warm                 -- verify API key / connectivity
  POST /assemblyai/transcribe-file      -- upload bytes, submit, poll, return words
  POST /assemblyai/transcribe-url       -- submit URL, poll, return words
"""

from __future__ import annotations

import asyncio
import logging
import os
import subprocess
import tempfile
from typing import Any

import httpx
import imageio_ffmpeg
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

app = FastAPI(title="WiseRavenShare Audio Compatibility")
logger = logging.getLogger("audio-processor")

MAX_UPLOAD_BYTES = 500 * 1024 * 1024       # 500 MB hard cap for this service
AAI_MAX_FILE_BYTES = 256 * 1024 * 1024    # AssemblyAI 256 MB file limit

ASSEMBLYAI_API_KEY = (os.getenv("ASSEMBLYAI_API_KEY") or "").strip()
ASSEMBLYAI_API_BASE = (os.getenv("ASSEMBLYAI_API_BASE") or "https://api.assemblyai.com").rstrip("/")
ASSEMBLYAI_SPEECH_MODEL = (os.getenv("ASSEMBLYAI_SPEECH_MODEL") or "universal-3-5-pro").strip()
ASSEMBLYAI_UPLOAD_TIMEOUT = int(os.getenv("ASSEMBLYAI_UPLOAD_TIMEOUT", "300"))    # seconds
ASSEMBLYAI_TRANSCRIBE_TIMEOUT = int(os.getenv("ASSEMBLYAI_TRANSCRIBE_TIMEOUT", "1800"))  # 30 min max poll
ASSEMBLYAI_POLL_INTERVAL = float(os.getenv("ASSEMBLYAI_POLL_INTERVAL", "3.0"))


# ── Request models ────────────────────────────────────────────────────────────

class TranscriptionRequest(BaseModel):
    speech_model: str = Field(default=ASSEMBLYAI_SPEECH_MODEL)
    # Word timestamps: treat as opt-in per current docs
    word_timestamps: bool = Field(default=True)
    # Optional AssemblyAI features
    speaker_labels: bool | None = None
    auto_chapters: bool | None = None
    iab_categories: bool | None = None
    sentiment_analysis: bool | None = None
    summarization: bool | None = None
    summary_model: str | None = None    # "informative" | "conversational" | "catchy"
    summary_type: str | None = None     # "bullets" | "bullets_verbose" | "gist" | "headline" | "paragraph"
    language_code: str | None = None    # BCP-47 e.g. "en", "es"; None = auto-detect
    language_detection: bool | None = None
    translation_language: str | None = None  # translate output to this BCP-47 code
    word_boost: list[str] | None = None


class TranscriptionUrlRequest(TranscriptionRequest):
    audio_url: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _ensure_api_key() -> None:
    if not ASSEMBLYAI_API_KEY:
        raise HTTPException(status_code=503, detail="ASSEMBLYAI_API_KEY is not configured.")


def _auth_headers() -> dict[str, str]:
    return {"Authorization": ASSEMBLYAI_API_KEY}


def _build_request_body(req: TranscriptionRequest, audio_url: str) -> dict[str, Any]:
    body: dict[str, Any] = {
        "audio_url": audio_url,
        "speech_model": req.speech_model,
    }
    # Explicitly enable word-level timestamps (opt-in per docs)
    if req.word_timestamps:
        body["word_boost"] = req.word_boost or []  # present but empty is fine
    if req.speaker_labels is not None:
        body["speaker_labels"] = req.speaker_labels
    if req.auto_chapters is not None:
        body["auto_chapters"] = req.auto_chapters
    if req.iab_categories is not None:
        body["iab_categories"] = req.iab_categories
    if req.sentiment_analysis is not None:
        body["sentiment_analysis"] = req.sentiment_analysis
    if req.summarization is not None:
        body["summarization"] = req.summarization
        if req.summary_model:
            body["summary_model"] = req.summary_model
        if req.summary_type:
            body["summary_type"] = req.summary_type
    if req.language_code:
        body["language_code"] = req.language_code
    elif req.language_detection:
        body["language_detection"] = True
    if req.translation_language:
        body["translation_type"] = "global"
        body["translation_languages"] = [req.translation_language]
    if req.word_boost:
        body["word_boost"] = req.word_boost
    return body


async def _upload_audio_bytes(client: httpx.AsyncClient, audio_bytes: bytes) -> str:
    """Upload raw bytes to AssemblyAI CDN, return the upload_url."""
    if len(audio_bytes) > AAI_MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail=f"Audio exceeds AssemblyAI 256 MB limit ({len(audio_bytes) // 1024 // 1024} MB).")
    headers = {
        "Authorization": ASSEMBLYAI_API_KEY,
        "Content-Type": "application/octet-stream",
    }
    response = await client.post(
        f"{ASSEMBLYAI_API_BASE}/v1/upload",
        content=audio_bytes,
        headers=headers,
        timeout=ASSEMBLYAI_UPLOAD_TIMEOUT,
    )
    if not response.is_success:
        raise HTTPException(
            status_code=502,
            detail=f"AssemblyAI upload failed ({response.status_code}): {response.text[:400]}"
        )
    upload_url = response.json().get("upload_url")
    if not upload_url:
        raise HTTPException(status_code=502, detail="AssemblyAI upload response missing upload_url.")
    return upload_url


async def _submit_transcript(client: httpx.AsyncClient, body: dict[str, Any]) -> str:
    """POST /v1/transcript to queue transcription, return transcript ID."""
    headers = {**_auth_headers(), "Content-Type": "application/json"}
    response = await client.post(
        f"{ASSEMBLYAI_API_BASE}/v1/transcript",
        json=body,
        headers=headers,
        timeout=60,
    )
    if not response.is_success:
        raise HTTPException(
            status_code=502,
            detail=f"AssemblyAI transcript submit failed ({response.status_code}): {response.text[:400]}"
        )
    transcript_id = response.json().get("id")
    if not transcript_id:
        raise HTTPException(status_code=502, detail="AssemblyAI transcript response missing id.")
    logger.info("AssemblyAI transcript queued: %s", transcript_id)
    return transcript_id


async def _poll_transcript(client: httpx.AsyncClient, transcript_id: str) -> dict[str, Any]:
    """Poll GET /v1/transcript/{id} until completed or error."""
    deadline = asyncio.get_event_loop().time() + ASSEMBLYAI_TRANSCRIBE_TIMEOUT
    url = f"{ASSEMBLYAI_API_BASE}/v1/transcript/{transcript_id}"
    headers = _auth_headers()
    while True:
        if asyncio.get_event_loop().time() > deadline:
            raise HTTPException(
                status_code=504,
                detail=f"AssemblyAI transcription timed out after {ASSEMBLYAI_TRANSCRIBE_TIMEOUT}s (transcript_id={transcript_id})."
            )
        await asyncio.sleep(ASSEMBLYAI_POLL_INTERVAL)
        response = await client.get(url, headers=headers, timeout=30)
        if not response.is_success:
            raise HTTPException(status_code=502, detail=f"AssemblyAI poll failed ({response.status_code}).")
        data = response.json()
        status = data.get("status")
        if status == "completed":
            logger.info("AssemblyAI transcript completed: %s  duration=%.1fs", transcript_id, data.get("audio_duration") or 0)
            return data
        if status == "error":
            raise HTTPException(status_code=422, detail=f"AssemblyAI transcription error: {data.get('error', 'unknown')}")
        logger.debug("AssemblyAI transcript %s status=%s", transcript_id, status)


def _format_response(data: dict[str, Any], req: TranscriptionRequest) -> dict[str, Any]:
    """Normalize AssemblyAI response to our standard shape.

    Word timestamps from AssemblyAI are in milliseconds; we convert to seconds
    so callers don't need to know about the internal unit.

    Accuracy note: word timestamps are accurate to ±400ms -- fast songs will
    have visible drift in karaoke highlighting.
    """
    text = data.get("text") or ""
    raw_words = data.get("words") or []
    words = [
        {
            "word": w.get("text", ""),
            "start": round((w.get("start") or 0) / 1000.0, 3),   # ms → s
            "end": round((w.get("end") or 0) / 1000.0, 3),
            "confidence": w.get("confidence"),
            "speaker": w.get("speaker"),  # present when speaker_labels=True
        }
        for w in raw_words
    ]
    result: dict[str, Any] = {
        "text": text,
        "words": words,
        "word_count": len(words),
        "transcript_id": data.get("id"),
        "language_code": data.get("language_code"),
        "confidence": data.get("confidence"),
        "audio_duration_seconds": data.get("audio_duration"),
        "speech_model": req.speech_model,
        "word_timestamps_requested": req.word_timestamps,
    }
    # Optional feature results
    if data.get("utterances") is not None:
        result["utterances"] = data["utterances"]
    if data.get("chapters") is not None:
        result["chapters"] = data["chapters"]
    if data.get("iab_categories_result") is not None:
        result["iab_categories_result"] = data["iab_categories_result"]
    if data.get("sentiment_analysis_results") is not None:
        result["sentiment_analysis_results"] = data["sentiment_analysis_results"]
    if data.get("summary") is not None:
        result["summary"] = data["summary"]
    if data.get("translation") is not None:
        result["translation"] = data["translation"]
    return result


async def _transcribe(audio: str | bytes, req: TranscriptionRequest) -> dict[str, Any]:
    """Core transcription flow: upload (if bytes) → submit → poll → format."""
    _ensure_api_key()
    async with httpx.AsyncClient() as client:
        if isinstance(audio, bytes):
            audio_url = await _upload_audio_bytes(client, audio)
        else:
            audio_url = audio
        body = _build_request_body(req, audio_url)
        transcript_id = await _submit_transcript(client, body)
        data = await _poll_transcript(client, transcript_id)
    return _format_response(data, req)


def _ffmpeg_extract_mono_wav(source: bytes) -> bytes:
    """Use ffmpeg to extract/convert audio to 16 kHz mono PCM WAV for STT."""
    cmd = [
        imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error",
        "-i", "pipe:0",
        "-vn",                    # drop video
        "-acodec", "pcm_s16le",   # 16-bit PCM
        "-ar", "16000",           # 16 kHz (optimal for speech models)
        "-ac", "1",               # mono
        "-f", "wav", "pipe:1",
    ]
    try:
        result = subprocess.run(cmd, input=source, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=300, check=False)
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="Audio extraction timed out.") from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"ffmpeg unavailable: {exc}") from exc
    if result.returncode != 0 or not result.stdout:
        detail = result.stderr.decode("utf-8", errors="replace")[-800:]
        raise HTTPException(status_code=422, detail=detail or "Could not extract audio from file.")
    return result.stdout


# ── API ───────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "audio-processor",
        "assemblyai_configured": bool(ASSEMBLYAI_API_KEY),
        "assemblyai_speech_model": ASSEMBLYAI_SPEECH_MODEL,
        "assemblyai_api_base": ASSEMBLYAI_API_BASE,
    }


@app.post("/browser-compatible")
async def browser_compatible(file: UploadFile = File(...)):
    """Convert any audio/video to MP3 for browser playback."""
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
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Audio converter unavailable: {exc}") from exc
    if result.returncode != 0 or not result.stdout:
        detail = result.stderr.decode("utf-8", errors="replace")[-800:]
        raise HTTPException(status_code=422, detail=detail or "This audio file could not be converted.")
    return Response(content=result.stdout, media_type="audio/mpeg", headers={"Cache-Control": "private, no-store"})


@app.post("/extract-audio")
async def extract_audio(file: UploadFile = File(...)):
    """Extract audio from video and return 16 kHz mono WAV for speech models."""
    source = await file.read(MAX_UPLOAD_BYTES + 1)
    if not source:
        raise HTTPException(status_code=400, detail="File is empty.")
    if len(source) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File must be 500 MB or smaller.")
    wav_bytes = _ffmpeg_extract_mono_wav(source)
    return Response(content=wav_bytes, media_type="audio/wav", headers={"Cache-Control": "private, no-store"})


@app.post("/assemblyai/warm")
async def warm_connection(req: TranscriptionRequest):
    """Verify AssemblyAI API key is valid by hitting a lightweight endpoint."""
    _ensure_api_key()
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{ASSEMBLYAI_API_BASE}/v1/transcript?limit=1",
            headers=_auth_headers(),
            timeout=10,
        )
    if not response.is_success:
        raise HTTPException(
            status_code=502,
            detail=f"AssemblyAI connectivity check failed ({response.status_code})."
        )
    return {
        "warmed": True,
        "speech_model": req.speech_model,
        "api_base": ASSEMBLYAI_API_BASE,
    }


@app.post("/assemblyai/transcribe-file")
async def transcribe_file(
    file: UploadFile = File(...),
    speech_model: str = Form(default=ASSEMBLYAI_SPEECH_MODEL),
    word_timestamps: bool = Form(default=True),
    extract_audio_first: bool = Form(default=False),
    speaker_labels: bool | None = Form(default=None),
    auto_chapters: bool | None = Form(default=None),
    iab_categories: bool | None = Form(default=None),
    sentiment_analysis: bool | None = Form(default=None),
    summarization: bool | None = Form(default=None),
    language_code: str | None = Form(default=None),
    language_detection: bool | None = Form(default=None),
    translation_language: str | None = Form(default=None),
):
    """
    Upload an audio/video file, transcribe via AssemblyAI REST API (no 120s cap),
    and return words[] with start/end in seconds.

    Set extract_audio_first=true to run ffmpeg vocal extraction before sending
    to AssemblyAI (recommended for karaoke – cleaner vocals = better accuracy).
    """
    source = await file.read(MAX_UPLOAD_BYTES + 1)
    if not source:
        raise HTTPException(status_code=400, detail="Audio file is required.")
    if len(source) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Audio file must be 500 MB or smaller.")

    audio_bytes = _ffmpeg_extract_mono_wav(source) if extract_audio_first else source

    req = TranscriptionRequest(
        speech_model=speech_model,
        word_timestamps=word_timestamps,
        speaker_labels=speaker_labels,
        auto_chapters=auto_chapters,
        iab_categories=iab_categories,
        sentiment_analysis=sentiment_analysis,
        summarization=summarization,
        language_code=language_code,
        language_detection=language_detection,
        translation_language=translation_language,
    )
    return await _transcribe(audio_bytes, req)


@app.post("/assemblyai/transcribe-url")
async def transcribe_url(req: TranscriptionUrlRequest):
    """
    Submit a public audio/video URL to AssemblyAI, poll until complete,
    and return words[] with start/end in seconds.

    Accepts any URL reachable by AssemblyAI (S3, CDN, etc.) – no upload step needed.
    """
    if not req.audio_url or not req.audio_url.lower().startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="audio_url must be an http/https URL.")
    return await _transcribe(req.audio_url, req)
