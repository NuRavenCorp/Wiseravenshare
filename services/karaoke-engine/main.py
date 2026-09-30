"""
WiseRavenShare Karaoke Engine
Persistent, per-user karaoke processing:
 - Creates user workspace folders on first use
 - Persists all 4 stems (drums/bass/other/vocals) + instrumental
 - Stores user library and purchases
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("karaoke-engine")

app = FastAPI(
    title="WiseRavenShare Karaoke Engine",
    description="Vocal separation and backing-track generation for the Karaoke party feature.",
    version="1.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

ALLOWED_EXTENSIONS = {".wav", ".mp3", ".m4a", ".flac", ".ogg"}
MAX_FILE_BYTES = 300 * 1024 * 1024  # 300 MB
DATA_ROOT = Path(os.environ.get("KARAOKE_DATA_ROOT", str(Path.cwd() / "data" / "karaoke"))).resolve()
JOB_POLL_HINT_SECONDS = 3
JOB_RETENTION_COUNT = 150
_JOB_LOCK = threading.Lock()


CATALOGUE = [
    # Free / public-domain / community
    {"id": "pd-001", "title": "Beethoven – Ode to Joy", "artist": "Public Domain", "durationSeconds": 210, "source": "musopen", "tier": "free"},
    {"id": "pd-002", "title": "Bach – Air on the G String", "artist": "Public Domain", "durationSeconds": 293, "source": "musopen", "tier": "free"},
    {"id": "pd-003", "title": "Vivaldi – Spring", "artist": "Public Domain", "durationSeconds": 200, "source": "musopen", "tier": "free"},
    {"id": "pd-004", "title": "Mozart – Eine Kleine Nachtmusik", "artist": "Public Domain", "durationSeconds": 356, "source": "imslp", "tier": "free"},
    {"id": "pd-005", "title": "Chopin – Nocturne Op.9 No.2", "artist": "Public Domain", "durationSeconds": 286, "source": "imslp", "tier": "free"},
    {"id": "pd-006", "title": "Debussy – Clair de Lune", "artist": "Public Domain", "durationSeconds": 320, "source": "imslp", "tier": "free"},
    {"id": "pd-007", "title": "Strauss – Blue Danube", "artist": "Public Domain", "durationSeconds": 352, "source": "musopen", "tier": "free"},
    {"id": "pd-008", "title": "Saint-Saens – The Swan", "artist": "Public Domain", "durationSeconds": 191, "source": "musopen", "tier": "free"},
    {"id": "us-001", "title": "UltraStar Demo Song", "artist": "UltraStar Community", "durationSeconds": 180, "source": "ultrastar-community", "tier": "free"},
    {"id": "us-002", "title": "Karaoke Pop Practice #1", "artist": "UltraStar Community", "durationSeconds": 204, "source": "ultrastar-community", "tier": "free"},
    {"id": "us-003", "title": "Karaoke Rock Practice #1", "artist": "UltraStar Community", "durationSeconds": 218, "source": "ultrastar-community", "tier": "free"},
    {"id": "us-004", "title": "Karaoke Soul Practice #1", "artist": "UltraStar Community", "durationSeconds": 231, "source": "ultrastar-community", "tier": "free"},
    # Premium placeholders (unlockable/purchasable in-app)
    {"id": "pr-001", "title": "Party Starter Pack 1", "artist": "WiseRaven Licensed", "durationSeconds": 215, "source": "wiseraven-premium", "tier": "premium", "priceUsd": 1.99},
    {"id": "pr-002", "title": "Party Starter Pack 2", "artist": "WiseRaven Licensed", "durationSeconds": 226, "source": "wiseraven-premium", "tier": "premium", "priceUsd": 1.99},
    {"id": "pr-003", "title": "Late Night Ballad Pack", "artist": "WiseRaven Licensed", "durationSeconds": 248, "source": "wiseraven-premium", "tier": "premium", "priceUsd": 2.49},
    {"id": "pr-004", "title": "Throwback Dance Pack", "artist": "WiseRaven Licensed", "durationSeconds": 233, "source": "wiseraven-premium", "tier": "premium", "priceUsd": 2.49},
    {"id": "pr-005", "title": "Indie Vibes Pack", "artist": "WiseRaven Licensed", "durationSeconds": 241, "source": "wiseraven-premium", "tier": "premium", "priceUsd": 1.49},
    {"id": "pr-006", "title": "RnB Session Pack", "artist": "WiseRaven Licensed", "durationSeconds": 252, "source": "wiseraven-premium", "tier": "premium", "priceUsd": 2.99},
]

CATALOGUE_BY_ID = {song["id"]: song for song in CATALOGUE}


class PurchaseRequest(BaseModel):
    user_id: str
    song_id: str


def _load_demucs():
    try:
        from demucs_onnx import separate  # type: ignore[import]
        return separate
    except ImportError as exc:
        raise RuntimeError("demucs-onnx is not installed. Run: pip install demucs-onnx") from exc


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sanitize_user_id(raw: str) -> str:
    cleaned = "".join(ch for ch in (raw or "").strip().lower() if ch.isalnum() or ch in {"-", "_"})
    return cleaned or "anonymous"


def _user_root(user_id: str) -> Path:
    uid = _sanitize_user_id(user_id)
    return DATA_ROOT / "users" / uid


def _ensure_workspace(user_id: str) -> dict:
    root = _user_root(user_id)
    folders = {
        "root": root,
        "uploads": root / "uploads",
        "stems": root / "stems",
        "tracks": root / "tracks",
        "catalogue": root / "catalogue",
        "tmp": root / "tmp",
    }
    for path in folders.values():
        path.mkdir(parents=True, exist_ok=True)
    return folders


def _read_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _write_json(path: Path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _purchases_path(user_id: str) -> Path:
    return _user_root(user_id) / "catalogue" / "purchases.json"


def _library_path(user_id: str) -> Path:
    return _user_root(user_id) / "tracks" / "index.json"


def _jobs_path(user_id: str) -> Path:
    return _user_root(user_id) / "tmp" / "jobs.json"


def _get_purchases(user_id: str) -> set[str]:
    payload = _read_json(_purchases_path(user_id), {"songIds": []})
    return {str(song_id) for song_id in payload.get("songIds", [])}


def _set_purchases(user_id: str, song_ids: set[str]):
    payload = {"songIds": sorted(song_ids), "updatedAt": _now_iso()}
    _write_json(_purchases_path(user_id), payload)


def _append_library_entry(user_id: str, entry: dict):
    library = _read_json(_library_path(user_id), {"tracks": []})
    tracks = library.get("tracks", [])
    tracks.insert(0, entry)
    library["tracks"] = tracks[:250]
    library["updatedAt"] = _now_iso()
    _write_json(_library_path(user_id), library)


def _list_jobs(user_id: str) -> list[dict]:
    payload = _read_json(_jobs_path(user_id), {"jobs": []})
    jobs = payload.get("jobs", [])
    if not isinstance(jobs, list):
        return []
    return jobs


def _set_jobs(user_id: str, jobs: list[dict]):
    payload = {"jobs": jobs[:JOB_RETENTION_COUNT], "updatedAt": _now_iso()}
    _write_json(_jobs_path(user_id), payload)


def _upsert_job(user_id: str, job: dict):
    with _JOB_LOCK:
        jobs = _list_jobs(user_id)
        jobs = [item for item in jobs if item.get("jobId") != job.get("jobId")]
        jobs.insert(0, job)
        _set_jobs(user_id, jobs)


def _get_job(user_id: str, job_id: str) -> dict | None:
    jobs = _list_jobs(user_id)
    return next((item for item in jobs if item.get("jobId") == job_id), None)


def _find_first(root: Path, target_name: str) -> Path | None:
    for path in root.rglob("*"):
        if path.is_file() and path.name.lower() == target_name.lower():
            return path
    return None


def _copy_stem(src: Path | None, target_dir: Path, stem_name: str) -> str:
    target_dir.mkdir(parents=True, exist_ok=True)
    if src is None or not src.exists():
        return ""
    dst = target_dir / f"{stem_name}.wav"
    shutil.copy2(src, dst)
    return str(dst)


def _generate_backing_track(input_path: Path, stems_dir: Path) -> dict:
    separate = _load_demucs()
    separate(
        str(input_path),
        output_dir=str(stems_dir),
        model="htdemucs_ft",
        stems=["drums", "bass", "other", "vocals"],
        mix_stems=("drums", "bass", "other"),
        mix_output_name="instrumental",
        output_format="wav",
    )

    instrumental = _find_first(stems_dir, "instrumental.wav")
    if instrumental is None:
        raise RuntimeError("Stem separation completed but instrumental.wav was not found.")

    drums = _find_first(stems_dir, "drums.wav")
    bass = _find_first(stems_dir, "bass.wav")
    other = _find_first(stems_dir, "other.wav")
    vocals = _find_first(stems_dir, "vocals.wav")

    return {
        "instrumental": instrumental,
        "drums": drums,
        "bass": bass,
        "other": other,
        "vocals": vocals,
    }


def _run_generate_job(job_id: str, user_id: str, original_filename: str, song_title: str, ext: str, content: bytes):
    user_safe = _sanitize_user_id(user_id)
    base_job = _get_job(user_id, job_id) or {}
    started_job = {
        **base_job,
        "status": "processing",
        "updatedAt": _now_iso(),
        "startedAt": _now_iso(),
    }
    _upsert_job(user_id, started_job)

    try:
        workspace = _ensure_workspace(user_id)
        track_id = uuid.uuid4().hex
        stems_dir = workspace["stems"] / track_id
        stems_dir.mkdir(parents=True, exist_ok=True)

        for name in ("drums", "bass", "other", "vocals", "instrumental"):
            (stems_dir / name).mkdir(parents=True, exist_ok=True)

        upload_path = workspace["uploads"] / f"{track_id}{ext}"
        upload_path.write_bytes(content)

        log.info("Generating backing track for user=%s track=%s job=%s ...", user_safe, track_id, job_id)
        result = _generate_backing_track(upload_path, stems_dir)

        drums_path = _copy_stem(result["drums"], stems_dir / "drums", "drums")
        bass_path = _copy_stem(result["bass"], stems_dir / "bass", "bass")
        other_path = _copy_stem(result["other"], stems_dir / "other", "other")
        vocals_path = _copy_stem(result["vocals"], stems_dir / "vocals", "vocals")
        instrumental_path = _copy_stem(result["instrumental"], stems_dir / "instrumental", "instrumental")

        if not instrumental_path:
            raise RuntimeError("Instrumental stem was not persisted.")

        _append_library_entry(
            user_id=user_id,
            entry={
                "trackId": track_id,
                "title": song_title or original_filename or "Uploaded Song",
                "originalFileName": original_filename,
                "createdAt": _now_iso(),
                "uploadPath": str(upload_path),
                "instrumentalPath": instrumental_path,
                "stems": {
                    "drums": drums_path,
                    "bass": bass_path,
                    "other": other_path,
                    "vocals": vocals_path,
                },
            },
        )

        completed_job = {
            **started_job,
            "status": "completed",
            "updatedAt": _now_iso(),
            "completedAt": _now_iso(),
            "trackId": track_id,
            "title": song_title or original_filename or "Uploaded Song",
            "instrumentalPath": instrumental_path,
            "error": None,
        }
        _upsert_job(user_id, completed_job)
    except Exception as exc:
        log.exception("Backing track generation failed for user=%s job=%s", user_safe, job_id)
        failed_job = {
            **started_job,
            "status": "failed",
            "updatedAt": _now_iso(),
            "failedAt": _now_iso(),
            "error": str(exc),
        }
        _upsert_job(user_id, failed_job)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "wiseravenshare-karaoke", "version": "1.2.0"}


@app.get("/workspace")
def workspace(user_id: str = Query(...)) -> dict:
    folders = _ensure_workspace(user_id)
    return {
        "userId": _sanitize_user_id(user_id),
        "workspaceRoot": str(folders["root"]),
        "folders": {k: str(v) for k, v in folders.items() if k != "root"},
    }


@app.get("/catalogue")
def catalogue(user_id: str = Query(default="anonymous")) -> list[dict]:
    purchases = _get_purchases(user_id)
    out = []
    for song in CATALOGUE:
        is_premium = song.get("tier") == "premium"
        unlocked = (not is_premium) or (song["id"] in purchases)
        row = dict(song)
        row["unlocked"] = unlocked
        out.append(row)
    return out


@app.post("/purchase")
def purchase(req: PurchaseRequest) -> dict:
    song = CATALOGUE_BY_ID.get(req.song_id)
    if song is None:
        raise HTTPException(status_code=404, detail="Song not found.")
    if song.get("tier") != "premium":
        return {"ok": True, "alreadyUnlocked": True, "songId": req.song_id}

    _ensure_workspace(req.user_id)
    purchases = _get_purchases(req.user_id)
    purchases.add(req.song_id)
    _set_purchases(req.user_id, purchases)
    return {"ok": True, "songId": req.song_id, "unlocked": True}


@app.get("/library")
def library(user_id: str = Query(...)) -> dict:
    _ensure_workspace(user_id)
    payload = _read_json(_library_path(user_id), {"tracks": []})
    return payload


@app.get("/library/{track_id}/instrumental")
def library_instrumental(track_id: str, user_id: str = Query(...)) -> FileResponse:
    payload = _read_json(_library_path(user_id), {"tracks": []})
    tracks = payload.get("tracks", [])
    match = next((t for t in tracks if t.get("trackId") == track_id), None)
    if not match:
        raise HTTPException(status_code=404, detail="Track not found in user library.")

    instrumental_path = Path(match.get("instrumentalPath") or "")
    if not instrumental_path.exists():
        raise HTTPException(status_code=404, detail="Instrumental file not found on disk.")

    return FileResponse(
        str(instrumental_path),
        media_type="audio/wav",
        filename=f"instrumental_{track_id}.wav",
    )


@app.post("/generate-backing/jobs")
async def create_generate_backing_job(
    file: UploadFile = File(...),
    user_id: str = Form(...),
    song_title: str = Form(default="Uploaded Song"),
) -> dict:
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

    _ensure_workspace(user_id)
    job_id = uuid.uuid4().hex
    user_safe = _sanitize_user_id(user_id)
    submitted_at = _now_iso()
    _upsert_job(
        user_id,
        {
            "jobId": job_id,
            "userId": user_safe,
            "status": "queued",
            "songTitle": song_title or file.filename or "Uploaded Song",
            "originalFileName": file.filename,
            "createdAt": submitted_at,
            "updatedAt": submitted_at,
            "trackId": None,
            "instrumentalPath": None,
            "error": None,
            "pollAfterSeconds": JOB_POLL_HINT_SECONDS,
        },
    )

    worker = threading.Thread(
        target=_run_generate_job,
        args=(job_id, user_id, file.filename, song_title or file.filename or "Uploaded Song", ext, content),
        daemon=True,
    )
    worker.start()

    return {
        "jobId": job_id,
        "status": "queued",
        "userId": user_safe,
        "pollAfterSeconds": JOB_POLL_HINT_SECONDS,
    }


@app.get("/jobs/{job_id}")
def get_job_status(job_id: str, user_id: str = Query(...)) -> dict:
    job = _get_job(user_id, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    status = str(job.get("status") or "queued")
    response = {
        "jobId": job.get("jobId"),
        "status": status,
        "userId": job.get("userId"),
        "songTitle": job.get("songTitle"),
        "createdAt": job.get("createdAt"),
        "updatedAt": job.get("updatedAt"),
        "trackId": job.get("trackId"),
        "error": job.get("error"),
        "pollAfterSeconds": JOB_POLL_HINT_SECONDS,
    }
    if status == "completed":
        response["downloadPath"] = f"/jobs/{job_id}/instrumental?user_id={_sanitize_user_id(user_id)}"
    return response


@app.get("/jobs/{job_id}/instrumental")
def get_job_instrumental(job_id: str, user_id: str = Query(...)) -> FileResponse:
    job = _get_job(user_id, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    if job.get("status") != "completed":
        raise HTTPException(status_code=409, detail="Job is not completed yet.")

    instrumental_path = Path(job.get("instrumentalPath") or "")
    if not instrumental_path.exists():
        raise HTTPException(status_code=404, detail="Instrumental file not found on disk.")

    track_id = str(job.get("trackId") or uuid.uuid4().hex)
    return FileResponse(
        str(instrumental_path),
        media_type="audio/wav",
        filename=f"instrumental_{track_id}.wav",
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8002, log_level="info")
