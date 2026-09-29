"""
WiseRavenShare Karaoke Engine
Vocal separation via demucs-onnx → instrumental (backing track) + reference vocals.
Runs on port 8002 alongside the ASP.NET Core gateway.
"""

from __future__ import annotations

import logging
import os
import tempfile
import uuid

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("karaoke-engine")

app = FastAPI(
    title="WiseRavenShare Karaoke Engine",
    description="Vocal separation and backing-track generation for the Karaoke party feature.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

ALLOWED_EXTENSIONS = {".wav", ".mp3", ".m4a", ".flac", ".ogg"}
MAX_FILE_BYTES = 300 * 1024 * 1024  # 300 MB


def _load_demucs():
    """Lazy import so the service starts even if demucs-onnx isn't installed yet."""
    try:
        from demucs_onnx import separate  # type: ignore[import]
        return separate
    except ImportError as exc:
        raise RuntimeError(
            "demucs-onnx is not installed. Run: pip install demucs-onnx"
        ) from exc


def generate_backing_track(input_path: str, output_dir: str) -> dict:
    """
    Separate a song into stems using htdemucs_ft, then mix non-vocal stems
    into a single instrumental (karaoke) track.

    Returns paths for:
      - instrumental (backing track without vocals)
      - vocals       (reference; used for pitch scoring)
    """
    separate = _load_demucs()
    job_id = uuid.uuid4().hex
    stems_dir = os.path.join(output_dir, job_id)
    os.makedirs(stems_dir, exist_ok=True)

    separate(
        input_path,
        output_dir=stems_dir,
        model="htdemucs_ft",                          # best vocal SDR model
        stems=["drums", "bass", "other", "vocals"],
        mix_stems=("drums", "bass", "other"),          # exclude vocals → karaoke
        mix_output_name="instrumental",
        output_format="wav",
    )

    instrumental_path = os.path.join(stems_dir, "instrumental.wav")
    vocals_path = os.path.join(stems_dir, "vocals.wav")

    if not os.path.exists(instrumental_path):
        raise RuntimeError("Stem separation completed but instrumental.wav was not found.")

    return {
        "job_id": job_id,
        "instrumental_path": instrumental_path,
        "vocals_path": vocals_path if os.path.exists(vocals_path) else None,
    }


# ============================================================
# API ENDPOINTS
# ============================================================

@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "wiseravenshare-karaoke", "version": "1.0.0"}


@app.post("/generate-backing")
async def generate_backing(file: UploadFile = File(...)) -> FileResponse:
    """
    Upload an audio file; receive the instrumental (karaoke) backing track as WAV.
    Stem separation with htdemucs_ft takes ~1–3 minutes on CPU.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided.")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    content = await file.read()
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(content) // 1_000_000} MB). Maximum is 300 MB.",
        )

    tmpdir = tempfile.mkdtemp(prefix="wrs_karaoke_")
    job_id = uuid.uuid4().hex

    try:
        input_path = os.path.join(tmpdir, f"{job_id}_song{ext}")
        with open(input_path, "wb") as fh:
            fh.write(content)

        log.info("Generating backing track for job %s …", job_id)
        result = generate_backing_track(input_path, tmpdir)
        log.info("Backing track ready: %s", result["instrumental_path"])
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        log.exception("Backing track generation failed for job %s", job_id)
        raise HTTPException(status_code=500, detail=f"Separation failed: {exc}") from exc

    return FileResponse(
        result["instrumental_path"],
        media_type="audio/wav",
        filename=f"instrumental_{job_id}.wav",
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002, log_level="info")
