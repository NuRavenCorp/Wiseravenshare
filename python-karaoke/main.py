"""
Karaoke Python microservice.
Primary:  audio-separator (Mel-Band RoFormer)  →  SOTA vocal removal
Fallback: demucs-onnx                          →  htdemucs_ft_vocals
LRC:      autolrc-tools / wispr-lrc             →  lyric alignment
Lyrics:   LRCLIB (free) → Genius (fallback)    →  source-of-truth text
"""

import asyncio
import hashlib
import hmac
import json
import logging
import os
import shutil
import tempfile
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import aiofiles
import httpx
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse

# ---------------------------------------------------------------------------
# Config from environment
# ---------------------------------------------------------------------------
PORT = int(os.getenv("PORT", "8002"))
MODELS_CACHE_DIR = Path(os.getenv("MODELS_CACHE_DIR", "/app/models_cache"))
OUTPUT_BASE_DIR = Path(os.getenv("OUTPUT_BASE_DIR", "/tmp/karaoke_jobs"))
INTERNAL_TOKEN = os.getenv("INTERNAL_TOKEN", "")
MAX_JOB_AGE_HOURS = int(os.getenv("MAX_JOB_AGE_HOURS", "24"))

# Separation config
SEPARATOR_MODEL = os.getenv(
    "SEPARATOR_MODEL",
    "mel_band_roformer_karaoke_by_aufr33_viperx_sdr_10.1956.ckpt",
)
DEMUCS_FALLBACK_MODEL = os.getenv("DEMUCS_FALLBACK_MODEL", "htdemucs_ft")

# Lyric providers
LRCLIB_BASE = "https://lrclib.net/api"
GENIUS_TOKEN = os.getenv("GENIUS_TOKEN", "")

# Spaces / S3 upload (optional — if unset results stay local)
S3_ENDPOINT = os.getenv("Storage__Blob__Endpoint", "")
S3_ACCESS_KEY = os.getenv("Storage__Blob__AccessKey__Id", "")
S3_SECRET_KEY = os.getenv("Storage__Blob__SecretKey", "")
S3_BUCKET = os.getenv("Storage__Blob__BucketName", "")
S3_PROJECT_FOLDER = os.getenv("Storage__Blob__ProjectFolder", "wiseravenshare/")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("karaoke")

# In-memory job registry  {job_id: dict}
_jobs: dict[str, dict[str, Any]] = {}

# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(_: FastAPI):
    MODELS_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_BASE_DIR.mkdir(parents=True, exist_ok=True)
    log.info("Karaoke service ready | model=%s | port=%s", SEPARATOR_MODEL, PORT)
    asyncio.create_task(_reap_old_jobs_loop())
    yield


app = FastAPI(title="WiseRavenShare Karaoke Engine", version="1.0.0", lifespan=lifespan)

@app.middleware("http")
async def require_internal_token(request: Request, call_next):
    if request.url.path == "/health" or not INTERNAL_TOKEN:
        return await call_next(request)

    supplied = request.headers.get("X-Internal-Token", "")
    if not supplied or not hmac.compare_digest(supplied, INTERNAL_TOKEN):
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})

    return await call_next(request)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok", "service": "karaoke"}


# ---------------------------------------------------------------------------
# Job submission  (matches KaraokeController → POST /generate-backing/jobs)
# ---------------------------------------------------------------------------

@app.post("/generate-backing/jobs")
async def submit_job(
    file: UploadFile = File(...),
    user_id: str = Form("anonymous"),
    song_title: str = Form(""),
    lyrics_text: str = Form(""),  # optional known lyrics
    fetch_lyrics: bool = Form(True),
    separation_model: str = Form(""),
):
    """Enqueue vocal separation + LRC alignment. Returns job_id immediately."""
    job_id = str(uuid.uuid4())
    job_dir = OUTPUT_BASE_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    # Save upload
    suffix = Path(file.filename or "audio.mp3").suffix or ".mp3"
    audio_path = job_dir / f"input{suffix}"
    async with aiofiles.open(audio_path, "wb") as f:
        content = await file.read()
        await f.write(content)

    model = separation_model.strip() or SEPARATOR_MODEL
    job: dict[str, Any] = {
        "id": job_id,
        "user_id": user_id,
        "song_title": song_title or file.filename or "",
        "status": "queued",
        "created_at": time.time(),
        "audio_path": str(audio_path),
        "job_dir": str(job_dir),
        "model": model,
        "lyrics_text": lyrics_text,
        "fetch_lyrics": fetch_lyrics,
        "instrumental_path": None,
        "lrc_path": None,
        "lrc_url": None,
        "instrumental_url": None,
        "error": None,
    }
    _jobs[job_id] = job
    asyncio.create_task(_process_job(job_id))
    return {"id": job_id, "status": "queued"}


# ---------------------------------------------------------------------------
# Job status / result retrieval
# ---------------------------------------------------------------------------

@app.get("/jobs/{job_id}")
async def get_job(job_id: str, user_id: str = ""):
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return _job_response(job)


@app.get("/jobs/{job_id}/instrumental")
async def get_instrumental(job_id: str, user_id: str = ""):
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job["status"] != "completed":
        raise HTTPException(409, f"Job status is '{job['status']}', not completed.")
    path = job.get("instrumental_path")
    if not path or not Path(path).exists():
        raise HTTPException(404, "Instrumental file not found on disk.")
    return FileResponse(path, media_type="audio/wav", filename=f"instrumental_{job_id}.wav")


@app.get("/jobs/{job_id}/lrc")
async def get_lrc(job_id: str, user_id: str = ""):
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job["status"] != "completed":
        raise HTTPException(409, f"Job status is '{job['status']}', not completed.")
    path = job.get("lrc_path")
    if not path or not Path(path).exists():
        raise HTTPException(404, "LRC file not found on disk.")
    async with aiofiles.open(path, "r") as f:
        content = await f.read()
    return JSONResponse({"lrc": content})


# ---------------------------------------------------------------------------
# Workspace / library / catalogue stubs (expected by KaraokeController)
# ---------------------------------------------------------------------------

@app.get("/workspace")
async def workspace(user_id: str = ""):
    user_jobs = [_job_response(j) for j in _jobs.values() if j.get("user_id") == user_id]
    return {"jobs": user_jobs}


@app.get("/library")
async def library(user_id: str = ""):
    completed = [_job_response(j) for j in _jobs.values()
                 if j.get("user_id") == user_id and j["status"] == "completed"]
    return {"tracks": completed}


@app.get("/library/{track_id}/instrumental")
async def library_instrumental(track_id: str, user_id: str = ""):
    return await get_instrumental(track_id, user_id)


@app.get("/catalogue")
async def catalogue(user_id: str = ""):
    return {"songs": [], "message": "Upload your own tracks to generate karaoke backing."}


@app.post("/purchase")
async def purchase():
    return {"status": "not_applicable", "message": "User-uploaded tracks are free to process."}


# ---------------------------------------------------------------------------
# Core processing pipeline
# ---------------------------------------------------------------------------

async def _process_job(job_id: str) -> None:
    job = _jobs[job_id]
    job["status"] = "processing"
    job["started_at"] = time.time()
    job_dir = Path(job["job_dir"])
    audio_path = job["audio_path"]

    try:
        # ── Step 1: Vocal separation ──────────────────────────────────────
        instrumental_path = await asyncio.get_event_loop().run_in_executor(
            None, _separate_vocals, audio_path, str(job_dir), job["model"]
        )
        job["instrumental_path"] = instrumental_path

        # ── Step 2: Lyrics acquisition ────────────────────────────────────
        lyrics_text = job.get("lyrics_text", "").strip()
        if not lyrics_text and job.get("fetch_lyrics"):
            lyrics_text = await _fetch_lyrics(job.get("song_title", ""))

        # ── Step 3: LRC alignment (only if lyrics available) ──────────────
        lrc_path: str | None = None
        if lyrics_text:
            lyrics_file = job_dir / "lyrics.txt"
            async with aiofiles.open(lyrics_file, "w") as f:
                await f.write(lyrics_text)
            lrc_path = await asyncio.get_event_loop().run_in_executor(
                None, _align_lyrics, audio_path, str(lyrics_file), str(job_dir)
            )
            job["lrc_path"] = lrc_path

        # ── Step 4: Upload to Spaces (optional) ───────────────────────────
        if S3_BUCKET and S3_ACCESS_KEY and S3_SECRET_KEY:
            inst_url = await asyncio.get_event_loop().run_in_executor(
                None, _upload_to_spaces, instrumental_path, job_id, "instrumental.wav"
            )
            job["instrumental_url"] = inst_url
            if lrc_path:
                lrc_url = await asyncio.get_event_loop().run_in_executor(
                    None, _upload_to_spaces, lrc_path, job_id, "song.lrc"
                )
                job["lrc_url"] = lrc_url

        job["status"] = "completed"
        job["completed_at"] = time.time()
        log.info("Job %s completed in %.1fs", job_id, time.time() - job["started_at"])

    except Exception as exc:  # noqa: BLE001
        log.exception("Job %s failed: %s", job_id, exc)
        job["status"] = "failed"
        job["error"] = str(exc)


# ---------------------------------------------------------------------------
# Vocal separation — primary (audio-separator) with demucs-onnx fallback
# ---------------------------------------------------------------------------

def _separate_vocals(audio_path: str, output_dir: str, model: str) -> str:
    """Returns path to instrumental WAV. Tries audio-separator first."""
    try:
        return _separate_with_audio_separator(audio_path, output_dir, model)
    except Exception as primary_err:
        log.warning("audio-separator failed (%s), falling back to demucs-onnx", primary_err)
        return _separate_with_demucs(audio_path, output_dir)


def _separate_with_audio_separator(audio_path: str, output_dir: str, model: str) -> str:
    from audio_separator.separator import Separator

    sep = Separator(
        output_dir=output_dir,
        model_file_dir=str(MODELS_CACHE_DIR),
        output_format="WAV",
    )
    sep.load_model(model_filename=model)
    stems = sep.separate(audio_path)

    # audio-separator returns [vocals_file, instrumental_file] for karaoke models
    instrumental = next(
        (s for s in stems if "instrumental" in s.lower() or "no_vocals" in s.lower()),
        stems[-1] if stems else None,
    )
    if not instrumental or not Path(instrumental).exists():
        raise RuntimeError(f"audio-separator did not produce an instrumental file. Got: {stems}")
    return instrumental


def _separate_with_demucs(audio_path: str, output_dir: str) -> str:
    from demucs_onnx import separate

    result = separate(
        audio_path,
        output_dir=output_dir,
        model=DEMUCS_FALLBACK_MODEL,
        mix_stems=("drums", "bass", "other"),  # karaoke: all non-vocal stems mixed
    )
    # demucs-onnx places output at {output_dir}/{stem_name}.wav
    candidates = list(Path(output_dir).glob("*karaoke*.wav")) + list(Path(output_dir).glob("*mixed*.wav"))
    if candidates:
        return str(candidates[0])
    # Generic fallback: any wav that isn't the input
    input_name = Path(audio_path).stem
    wavs = [p for p in Path(output_dir).glob("*.wav") if input_name not in p.name]
    if wavs:
        return str(wavs[0])
    raise RuntimeError("demucs-onnx fallback did not produce a usable instrumental file.")


# ---------------------------------------------------------------------------
# Lyric alignment — autolrc primary, wispr-lrc fallback
# ---------------------------------------------------------------------------

def _align_lyrics(audio_path: str, lyrics_txt: str, output_dir: str) -> str:
    """Returns path to .lrc file. autolrc primary, wispr-lrc fallback."""
    try:
        return _align_with_autolrc(audio_path, lyrics_txt, output_dir)
    except Exception as primary_err:
        log.warning("autolrc failed (%s), falling back to wispr-lrc", primary_err)
        return _align_with_wispr(audio_path, lyrics_txt, output_dir)


def _align_with_autolrc(audio_path: str, lyrics_txt: str, output_dir: str) -> str:
    import subprocess

    lrc_out = str(Path(output_dir) / "song.lrc")
    result = subprocess.run(
        [
            "autolrc", "align",
            "--audio", audio_path,
            "--lyrics", lyrics_txt,
            "--enhanced-lrc",
            "--separator-boost",
            "-o", lrc_out,
        ],
        capture_output=True, text=True, timeout=600,
    )
    if result.returncode != 0:
        raise RuntimeError(f"autolrc exited {result.returncode}: {result.stderr[:400]}")
    if not Path(lrc_out).exists():
        raise RuntimeError("autolrc completed but output LRC not found.")
    return lrc_out


def _align_with_wispr(audio_path: str, lyrics_txt: str, output_dir: str) -> str:
    import subprocess

    lrc_out = str(Path(output_dir) / "song.lrc")
    result = subprocess.run(
        [
            "wispr", audio_path, lyrics_txt,
            "--demucs", "--model", "base", "--device", "auto",
            "-o", lrc_out,
        ],
        capture_output=True, text=True, timeout=600,
    )
    if result.returncode != 0:
        raise RuntimeError(f"wispr-lrc exited {result.returncode}: {result.stderr[:400]}")
    return lrc_out


# ---------------------------------------------------------------------------
# Lyrics fetch from LRCLIB → Genius fallback
# ---------------------------------------------------------------------------

async def _fetch_lyrics(song_title: str) -> str:
    if not song_title:
        return ""
    # Parse "Artist - Title" convention if present
    parts = song_title.split(" - ", 1)
    artist = parts[0].strip() if len(parts) > 1 else ""
    title = parts[1].strip() if len(parts) > 1 else song_title.strip()

    # 1. LRCLIB (returns synced LRC text directly when available)
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            params = {"artist_name": artist, "track_name": title} if artist else {"q": song_title}
            r = await client.get(f"{LRCLIB_BASE}/search", params=params)
            if r.status_code == 200:
                hits = r.json()
                if hits:
                    best = hits[0]
                    synced = best.get("syncedLyrics") or best.get("plainLyrics", "")
                    if synced:
                        log.info("Lyrics from LRCLIB for '%s'", song_title)
                        return synced
    except Exception as e:  # noqa: BLE001
        log.warning("LRCLIB fetch failed: %s", e)

    # 2. Genius fallback (plain text only)
    if GENIUS_TOKEN:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(
                    "https://api.genius.com/search",
                    params={"q": song_title},
                    headers={"Authorization": f"Bearer {GENIUS_TOKEN}"},
                )
                if r.status_code == 200:
                    hits = r.json().get("response", {}).get("hits", [])
                    if hits:
                        url = hits[0]["result"]["url"]
                        log.info("Genius lyrics URL found for '%s': %s", song_title, url)
                        # Return URL as hint — full scrape requires a separate call
                        return f"[Genius: {url}]"
        except Exception as e:  # noqa: BLE001
            log.warning("Genius fetch failed: %s", e)

    return ""


# ---------------------------------------------------------------------------
# Optional: upload result files to DO Spaces
# ---------------------------------------------------------------------------

def _upload_to_spaces(file_path: str, job_id: str, filename: str) -> str:
    import boto3
    from botocore.client import Config

    s3 = boto3.client(
        "s3",
        endpoint_url=S3_ENDPOINT,
        aws_access_key_id=S3_ACCESS_KEY,
        aws_secret_access_key=S3_SECRET_KEY,
        config=Config(signature_version="s3v4"),
        region_name=os.getenv("Storage__Blob__Region", "nyc3"),
    )
    key = f"{S3_PROJECT_FOLDER}karaoke/{job_id}/{filename}"
    s3.upload_file(file_path, S3_BUCKET, key, ExtraArgs={"ACL": "public-read"})
    endpoint = S3_ENDPOINT.rstrip("/")
    bucket = S3_BUCKET
    # Construct CDN-style URL
    host = endpoint.replace("https://", f"https://{bucket}.").replace("http://", f"http://{bucket}.")
    return f"{host}/{key}"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _job_response(job: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": job["id"],
        "status": job["status"],
        "song_title": job.get("song_title", ""),
        "user_id": job.get("user_id", ""),
        "created_at": job.get("created_at"),
        "started_at": job.get("started_at"),
        "completed_at": job.get("completed_at"),
        "model": job.get("model", ""),
        "instrumental_url": job.get("instrumental_url"),
        "lrc_url": job.get("lrc_url"),
        "has_lrc": bool(job.get("lrc_path")),
        "error": job.get("error"),
    }


async def _reap_old_jobs_loop() -> None:
    """Purge job dirs and registry entries older than MAX_JOB_AGE_HOURS."""
    while True:
        await asyncio.sleep(3600)
        cutoff = time.time() - MAX_JOB_AGE_HOURS * 3600
        to_delete = [jid for jid, j in list(_jobs.items()) if j.get("created_at", 0) < cutoff]
        for jid in to_delete:
            job_dir = _jobs[jid].get("job_dir", "")
            try:
                if job_dir and Path(job_dir).exists():
                    shutil.rmtree(job_dir, ignore_errors=True)
            except Exception:  # noqa: BLE001
                pass
            del _jobs[jid]
        if to_delete:
            log.info("Reaped %d expired jobs", len(to_delete))
