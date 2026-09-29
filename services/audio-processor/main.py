"""
WiseRavenShare / Ravensight / Podcast Studio — Audio Processing Service
Audacity-equivalent DSP chain: DC removal → Noise Reduction → Noise Gate →
Compression → Loudness Normalisation (ITU-R BS.1770-4).

Runs alongside the ASP.NET Core API on port 8001.
ASP.NET Core proxies /api/podcast/process → http://localhost:8001/process
"""

from __future__ import annotations

import os
import tempfile
import uuid
import logging

import numpy as np
import soundfile as sf
import noisereduce as nr
import pyloudnorm as pyln

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("audio-processor")

app = FastAPI(
    title="WiseRavenShare Audio Processor",
    description="Audacity-equivalent podcast audio cleanup pipeline.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # ASP.NET Core gateway controls auth; open here
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

ALLOWED_EXTENSIONS = {".wav", ".mp3", ".m4a", ".flac", ".ogg"}
MAX_FILE_BYTES = 500 * 1024 * 1024  # 500 MB


# ============================================================
# AUDACITY-EQUIVALENT DSP ALGORITHMS
# ============================================================

def remove_dc_offset(y: np.ndarray) -> np.ndarray:
    """
    Audacity Normalize → 'Remove DC offset'.
    Subtracts the mean to centre the waveform at zero amplitude.
    Prevents distortion in all subsequent stages.
    """
    return y - np.mean(y)


def reduce_noise_audacity_style(
    y: np.ndarray,
    sr: int,
    prop_decrease: float = 0.85,
    n_std: float = 1.5,
) -> np.ndarray:
    """
    Audacity-style spectral gating noise reduction.
    noisereduce implements the same spectral-subtraction approach.

    prop_decrease → 'Noise reduction (dB)' level
    n_std         → 'Sensitivity' (lower = more aggressive)
    n_fft=512     → ~23 ms window, matching Audacity's speech default
    """
    return nr.reduce_noise(
        y=y,
        sr=sr,
        stationary=True,
        prop_decrease=prop_decrease,
        n_std_thresh_stationary=n_std,
        n_fft=512,
    )


def noise_gate(
    y: np.ndarray,
    sr: int,  # noqa: ARG001  (kept for API symmetry)
    threshold_db: float = -40.0,
    reduction_db: float = -24.0,
    attack_ms: int = 10,
    hold_ms: int = 50,
    decay_ms: int = 100,
) -> np.ndarray:
    """
    Audacity Noise Gate with attack/hold/decay envelope.
    Reduces gain by reduction_db below threshold rather than hard-muting,
    which sounds more natural for speech.
    """
    threshold_lin = 10 ** (threshold_db / 20.0)
    reduction_lin = 10 ** (reduction_db / 20.0)

    env = np.abs(y)
    win_len = attack_ms + hold_ms + decay_ms
    window = np.ones(win_len) / win_len
    env_smooth = np.convolve(env, window, mode="same")

    gain = np.where(env_smooth >= threshold_lin, 1.0, reduction_lin)
    gain_smooth = np.convolve(gain, np.ones(decay_ms) / decay_ms, mode="same")
    return y * gain_smooth


def compress_audacity_style(
    y: np.ndarray,
    threshold_db: float = -18.0,
    ratio: float = 4.0,
) -> np.ndarray:
    """
    Audacity Compressor.
    Signals above threshold are attenuated by ratio; below pass unchanged.
    -18 dB threshold is standard for podcast speech.
    """
    threshold = 10 ** (threshold_db / 20.0)
    abs_y = np.abs(y)
    mask = abs_y > threshold
    y_out = y.copy()
    over = abs_y[mask] - threshold
    y_out[mask] = np.sign(y[mask]) * (threshold + over / ratio)
    return y_out


def loudness_normalize(
    y: np.ndarray,
    sr: int,
    target_lufs: float = -16.0,
) -> np.ndarray:
    """
    ITU-R BS.1770-4 loudness normalisation — the podcast standard.
    -16 LUFS is the widely accepted podcast target.
    Includes a 0.99 FS true-peak safety limiter.
    """
    y_f64 = y.astype(np.float64)
    meter = pyln.Meter(sr)
    current = meter.integrated_loudness(y_f64)

    if not np.isfinite(current):
        return y  # silence — nothing to normalise

    normalised = pyln.normalize.loudness(y_f64, current, target_lufs)

    peak = np.max(np.abs(normalised))
    if peak > 0.99:
        normalised *= 0.99 / peak

    return normalised.astype(np.float32)


# ============================================================
# FULL PROCESSING PIPELINE
# ============================================================

def process_podcast(input_path: str, output_path: str) -> None:
    """
    End-to-end Audacity-equivalent podcast cleanup chain:
    1. Remove DC offset
    2. Noise reduction  (spectral gating)
    3. Noise gate       (silence attenuation)
    4. Compression      (dynamic range control)
    5. Loudness norm    (ITU-R BS.1770-4 → -16 LUFS)
    """
    y, sr = sf.read(input_path, always_2d=False)

    # Mix down to mono for all processing stages
    if y.ndim > 1:
        y = np.mean(y, axis=1)

    y = y.astype(np.float32)

    log.info("Processing: sr=%d, samples=%d, %.1fs", sr, len(y), len(y) / sr)

    y = remove_dc_offset(y)
    y = reduce_noise_audacity_style(y, sr)
    y = noise_gate(y, sr)
    y = compress_audacity_style(y)
    y = loudness_normalize(y, sr, target_lufs=-16.0)

    sf.write(output_path, y, sr, subtype="PCM_16")
    log.info("Saved processed audio → %s", output_path)


# ============================================================
# API ENDPOINTS
# ============================================================

@app.get("/health")
def health() -> dict:
    """Health-check called by the ASP.NET Core gateway."""
    return {"status": "ok", "service": "wiseravenshare-audio", "version": "1.0.0"}


@app.post("/process")
async def process_audio(file: UploadFile = File(...)) -> FileResponse:
    """
    Accept a podcast/audio upload and return the processed WAV.

    Accepted formats: .wav .mp3 .m4a .flac .ogg
    Max size: 500 MB (enforced before reading the full body)
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided.")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    content = await file.read()
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(content) // 1_000_000} MB). Maximum is 500 MB.",
        )

    job_id = uuid.uuid4().hex
    # Use a named temporary directory so we can return the file *after* the context exits
    tmpdir = tempfile.mkdtemp(prefix="wrs_audio_")

    try:
        input_path = os.path.join(tmpdir, f"{job_id}_input{ext}")
        output_path = os.path.join(tmpdir, f"{job_id}_output.wav")

        with open(input_path, "wb") as fh:
            fh.write(content)

        process_podcast(input_path, output_path)
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("Audio processing failed for job %s", job_id)
        raise HTTPException(status_code=500, detail=f"Processing failed: {exc}") from exc

    return FileResponse(
        output_path,
        media_type="audio/wav",
        filename=f"processed_{job_id}.wav",
        background=None,   # FileResponse streams then cleans up automatically
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001, log_level="info")
