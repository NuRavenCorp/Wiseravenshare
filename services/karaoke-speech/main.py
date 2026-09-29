"""
WiseRavenShare Karaoke Speech Service
Runs on port 8003 alongside karaoke-engine (8002) and audio-processor (8001).

Endpoints:
  WS  /ws/stt           – streaming STT via sherpa-onnx; returns word timestamps
  GET /tts/announce     – spoken queue/countdown announcements (pyttsx3)
  GET /tts/score-feedback – spoken score feedback after a performance
  POST /score           – Levenshtein accuracy score sung vs reference lyrics
  GET  /health
"""

from __future__ import annotations

import io
import logging
import os
import tarfile
import tempfile
import threading
import urllib.request
import zipfile
from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("karaoke-speech")

app = FastAPI(
    title="WiseRavenShare Karaoke Speech",
    description="STT scoring + TTS announcements for karaoke sessions.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# ============================================================
# SHERPA-ONNX RECOGNIZER (lazy-loaded)
# ============================================================

_recognizer = None
_recognizer_lock = threading.Lock()

MODEL_DIR = Path(os.getenv("SHERPA_MODEL_DIR", "/app/models")).resolve()
MODEL_DIR.mkdir(parents=True, exist_ok=True)

SHERPA_TOKENS = os.getenv("SHERPA_TOKENS_PATH") or str(MODEL_DIR / "tokens.txt")
SHERPA_ENCODER = os.getenv("SHERPA_ENCODER_PATH") or str(MODEL_DIR / "encoder.onnx")
SHERPA_DECODER = os.getenv("SHERPA_DECODER_PATH") or str(MODEL_DIR / "decoder.onnx")
SHERPA_JOINER = os.getenv("SHERPA_JOINER_PATH") or str(MODEL_DIR / "joiner.onnx")


def _download_model_archive(model_url: str, destination_dir: Path) -> None:
    """Download a Sherpa model archive when a release URL is provided."""
    if not model_url:
        return

    archive_name = "sherpa-model.tar.gz"
    if model_url.lower().endswith(".zip"):
        archive_name = "sherpa-model.zip"
    elif model_url.lower().endswith(".tar.bz2"):
        archive_name = "sherpa-model.tar.bz2"
    elif model_url.lower().endswith(".tar"):
        archive_name = "sherpa-model.tar"

    archive_path = destination_dir / archive_name
    try:
        log.info("Downloading Sherpa model from %s", model_url)
        urllib.request.urlretrieve(model_url, archive_path)
        log.info("Downloaded Sherpa model archive to %s", archive_path)

        if archive_path.suffix.lower() == ".zip":
            with zipfile.ZipFile(archive_path, "r") as archive:
                archive.extractall(destination_dir)
        else:
            with tarfile.open(archive_path, "r:*") as archive:
                archive.extractall(destination_dir)

        for expected_name in ("tokens.txt", "encoder.onnx", "decoder.onnx", "joiner.onnx"):
            matches = list(destination_dir.rglob(expected_name))
            if not matches:
                continue
            if expected_name == "tokens.txt":
                globals()["SHERPA_TOKENS"] = str(matches[0])
            elif expected_name == "encoder.onnx":
                globals()["SHERPA_ENCODER"] = str(matches[0])
            elif expected_name == "decoder.onnx":
                globals()["SHERPA_DECODER"] = str(matches[0])
            elif expected_name == "joiner.onnx":
                globals()["SHERPA_JOINER"] = str(matches[0])
    except Exception as exc:
        log.warning("Sherpa model download failed: %s", exc)


def ensure_sherpa_models() -> None:
    """Resolve the model paths and optionally download a default archive if available."""
    if all(os.path.exists(p) for p in [SHERPA_TOKENS, SHERPA_ENCODER, SHERPA_DECODER, SHERPA_JOINER]):
        return

    model_url = os.getenv("SHERPA_MODEL_URL")
    if model_url:
        _download_model_archive(model_url, MODEL_DIR)

    if not all(os.path.exists(p) for p in [SHERPA_TOKENS, SHERPA_ENCODER, SHERPA_DECODER, SHERPA_JOINER]):
        log.warning(
            "Sherpa model files are missing. STT will stay degraded until model files are downloaded. "
            "Set SHERPA_MODEL_URL, SHERPA_TOKENS_PATH, SHERPA_ENCODER_PATH, SHERPA_DECODER_PATH, and SHERPA_JOINER_PATH."
        )


def _load_recognizer():
    """
    Lazy-load sherpa-onnx streaming ASR.
    Falls back gracefully if the package or model files are absent
    so the service still starts and TTS / scoring endpoints work.
    """
    global _recognizer
    if _recognizer is not None:
        return _recognizer
    with _recognizer_lock:
        if _recognizer is not None:
            return _recognizer
        try:
            import sherpa_onnx  # type: ignore[import]
            ensure_sherpa_models()
            if not all(os.path.exists(p) for p in [SHERPA_TOKENS, SHERPA_ENCODER, SHERPA_DECODER, SHERPA_JOINER]):
                log.warning(
                    "sherpa-onnx model files not found. STT will return empty transcripts until models are downloaded. "
                    "See: https://github.com/k2-fsa/sherpa-onnx/releases"
                )
                return None
            _recognizer = sherpa_onnx.OnlineRecognizer.from_transducer(
                tokens=SHERPA_TOKENS,
                encoder=SHERPA_ENCODER,
                decoder=SHERPA_DECODER,
                joiner=SHERPA_JOINER,
                num_threads=2,
                sample_rate=16000,
                feature_dim=80,
                enable_endpoint_detection=True,
                rule1_min_trailing_silence=2.4,
                rule2_min_trailing_silence=1.2,
                rule3_min_utterance_length=20,
            )
            log.info("sherpa-onnx recognizer loaded successfully.")
        except ImportError:
            log.warning(
                "sherpa-onnx not installed. Run: pip install sherpa-onnx  "
                "Wheels: https://github.com/k2-fsa/sherpa-onnx/releases"
            )
        return _recognizer


# ============================================================
# TTS ENGINE (pyttsx3, offline)
# ============================================================

_tts_lock = threading.Lock()


def _speak_to_bytes(text: str, rate: int = 160) -> bytes:
    """Synthesize text → WAV bytes using pyttsx3 (offline). Thread-safe."""
    try:
        import pyttsx3  # type: ignore[import]
    except ImportError as exc:
        raise RuntimeError("pyttsx3 not installed. Run: pip install pyttsx3") from exc

    with _tts_lock:
        tmpfile = tempfile.mktemp(suffix=".wav")
        try:
            engine = pyttsx3.init()
            engine.setProperty("rate", rate)
            engine.setProperty("volume", 1.0)
            engine.save_to_file(text, tmpfile)
            engine.runAndWait()
            with open(tmpfile, "rb") as fh:
                return fh.read()
        finally:
            if os.path.exists(tmpfile):
                os.remove(tmpfile)


# ============================================================
# LEVENSHTEIN SCORING
# ============================================================

def levenshtein_ratio(reference: str, hypothesis: str) -> float:
    """Word-level accuracy ratio (0.0–1.0) using Levenshtein edit distance."""
    ref_words = reference.lower().split()
    hyp_words = hypothesis.lower().split()
    if not ref_words:
        return 1.0 if not hyp_words else 0.0

    n, m = len(ref_words), len(hyp_words)
    dp = list(range(m + 1))
    for i in range(1, n + 1):
        prev = dp[:]
        dp[0] = i
        for j in range(1, m + 1):
            if ref_words[i - 1] == hyp_words[j - 1]:
                dp[j] = prev[j - 1]
            else:
                dp[j] = 1 + min(prev[j], dp[j - 1], prev[j - 1])
    return round(1.0 - dp[m] / max(n, m), 4)


def score_label(ratio: float) -> str:
    if ratio >= 0.95: return "Perfect!"
    if ratio >= 0.85: return "Excellent!"
    if ratio >= 0.70: return "Great job!"
    if ratio >= 0.55: return "Good effort!"
    if ratio >= 0.35: return "Keep practicing!"
    return "Better luck next time!"


def tts_feedback_text(score_pct: int, song_title: Optional[str] = None) -> str:
    song_part = f" on {song_title}" if song_title else ""
    if score_pct >= 95: return f"Perfect score{song_part}! You nailed every word!"
    if score_pct >= 85: return f"Excellent performance{song_part}! Score: {score_pct} percent."
    if score_pct >= 70: return f"Great job{song_part}! You scored {score_pct} percent."
    if score_pct >= 50: return f"Good effort{song_part}. Score: {score_pct} percent. Keep practicing!"
    return f"Score: {score_pct} percent{song_part}. Don't give up, keep singing!"


# ============================================================
# WEBSOCKET STT ENDPOINT
# ============================================================

@app.websocket("/ws/stt")
async def stt_stream(websocket: WebSocket):
    """
    Streaming karaoke STT.

    Client sends: raw 16-bit little-endian PCM chunks at 16 kHz mono.
    Server sends JSON:
      {
        "text": "partial transcript",
        "words": [{"word": "hello", "start": 0.12, "end": 0.45}, ...],
        "is_final": false,
        "confidence": 0.97
      }
    """
    await websocket.accept()
    log.info("STT WebSocket connected")
    recognizer = _load_recognizer()

    if recognizer is None:
        # Graceful stub while models are not yet installed
        try:
            while True:
                await websocket.receive_bytes()
                await websocket.send_json({
                    "text": "", "words": [], "is_final": False, "confidence": 0.0,
                    "warning": "STT engine unavailable. Install sherpa-onnx and download models.",
                })
        except WebSocketDisconnect:
            pass
        return

    stream = recognizer.create_stream()
    try:
        while True:
            raw = await websocket.receive_bytes()
            samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
            stream.accept_waveform(16000, samples)
            while recognizer.is_ready(stream):
                recognizer.decode_stream(stream)
            result = recognizer.get_result(stream)
            is_final = recognizer.is_endpoint(stream)

            words = []
            if hasattr(result, "words") and result.words:
                words = [
                    {"word": w.word, "start": round(w.start, 3), "end": round(w.end, 3)}
                    for w in result.words
                ]

            await websocket.send_json({
                "text": result.text if result else "",
                "words": words,
                "is_final": is_final,
                "confidence": float(getattr(result, "confidence", 0.0)),
            })

            if is_final:
                stream = recognizer.create_stream()

    except WebSocketDisconnect:
        log.info("STT WebSocket disconnected")
    except Exception as exc:
        log.exception("STT stream error: %s", exc)
        try:
            await websocket.send_json({"error": str(exc), "is_final": True})
        except Exception:
            pass


# ============================================================
# TTS ENDPOINTS
# ============================================================

@app.get("/tts/announce")
def tts_announce(
    text: str = Query(..., description="Announcement text"),
    rate: int = Query(160, description="Speech rate (wpm)"),
):
    """Spoken queue/countdown announcement → WAV stream."""
    if not text.strip():
        raise HTTPException(status_code=400, detail="text must not be empty")
    if len(text) > 500:
        raise HTTPException(status_code=400, detail="text must be 500 characters or fewer")
    try:
        wav_bytes = _speak_to_bytes(text.strip(), rate=rate)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return StreamingResponse(io.BytesIO(wav_bytes), media_type="audio/wav")


@app.get("/tts/score-feedback")
def tts_score_feedback(
    score: int = Query(..., ge=0, le=100),
    song: Optional[str] = Query(None),
):
    """Spoken score feedback after a karaoke performance → WAV stream."""
    feedback = tts_feedback_text(score, song)
    try:
        wav_bytes = _speak_to_bytes(feedback, rate=150)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return StreamingResponse(io.BytesIO(wav_bytes), media_type="audio/wav")


# ============================================================
# SCORING ENDPOINT
# ============================================================

class ScoreRequest(BaseModel):
    reference: str
    hypothesis: str
    song_title: Optional[str] = None


@app.post("/score")
def score_performance(body: ScoreRequest):
    """Word-level Levenshtein accuracy: sung transcript vs reference lyrics."""
    ratio = levenshtein_ratio(body.reference, body.hypothesis)
    score_pct = round(ratio * 100)
    return {
        "score": score_pct,
        "ratio": ratio,
        "label": score_label(ratio),
        "feedback": tts_feedback_text(score_pct, body.song_title),
        "reference_word_count": len(body.reference.split()),
        "hypothesis_word_count": len(body.hypothesis.split()),
    }


# ============================================================
# HEALTH
# ============================================================

@app.get("/health")
def health():
    recognizer = _load_recognizer()
    return {
        "status": "ok",
        "service": "wiseravenshare-karaoke-speech",
        "version": "1.0.0",
        "stt_engine": "sherpa-onnx" if recognizer is not None else "unavailable (models needed)",
        "tts_engine": "pyttsx3",
    }


if __name__ == "__main__":
    ensure_sherpa_models()
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003, log_level="info")
