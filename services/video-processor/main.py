"""
WiseRavenShare Video Processor
Adaptive HLS segmentation (720p + 360p) via FFmpeg.
Downloads source video from DO Spaces, segments it, uploads .m3u8 + .ts files.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

import boto3
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("video-processor")

app = FastAPI(
    title="WiseRavenShare Video Processor",
    description="Adaptive HLS segmentation for uploaded videos.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

SPACES_ENDPOINT = os.environ["SPACES_ENDPOINT"]
SPACES_REGION = os.environ["SPACES_REGION"]
SPACES_ACCESS_KEY = os.environ["SPACES_ACCESS_KEY"]
SPACES_SECRET_KEY = os.environ["SPACES_SECRET_KEY"]
SPACES_BUCKET = os.environ["SPACES_BUCKET"]
SPACES_CDN_BASE_URL = os.environ.get("SPACES_CDN_BASE_URL", "").rstrip("/")
HLS_DATA_ROOT = Path(os.environ.get("HLS_DATA_ROOT", "./data/hls")).resolve()

JOB_POLL_HINT_SECONDS = 3

_jobs: dict[str, dict] = {}
_JOB_LOCK = threading.Lock()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _s3_client():
    return boto3.client(
        "s3",
        endpoint_url=SPACES_ENDPOINT,
        aws_access_key_id=SPACES_ACCESS_KEY,
        aws_secret_access_key=SPACES_SECRET_KEY,
        region_name=SPACES_REGION,
    )


def _cdn_url(object_key: str) -> str:
    if SPACES_CDN_BASE_URL:
        return f"{SPACES_CDN_BASE_URL}/{object_key}"
    return f"{SPACES_ENDPOINT}/{SPACES_BUCKET}/{object_key}"


def _set_job(job: dict) -> None:
    with _JOB_LOCK:
        _jobs[job["jobId"]] = job


def _get_job(job_id: str) -> dict | None:
    with _JOB_LOCK:
        return _jobs.get(job_id)


def _run_hls_job(job_id: str, object_key: str, user_id: str, title: str) -> None:
    _set_job({**_get_job(job_id), "status": "processing", "updatedAt": _now_iso()})

    work_dir = HLS_DATA_ROOT / job_id
    work_dir.mkdir(parents=True, exist_ok=True)

    try:
        # 1. Download source video from Spaces
        s3 = _s3_client()
        suffix = Path(object_key).suffix or ".mp4"
        input_path = work_dir / f"input{suffix}"
        log.info("Downloading s3://%s/%s -> %s", SPACES_BUCKET, object_key, input_path)
        s3.download_file(SPACES_BUCKET, object_key, str(input_path))

        # 2. Run FFmpeg adaptive HLS segmentation (720p + 360p)
        seg_pattern = str(work_dir / "seg_%v_%03d.ts")
        cmd = [
            "ffmpeg", "-i", str(input_path), "-y",
            "-filter_complex", "[0:v]split=2[v1][v2]",
            "-map", "[v1]", "-map", "0:a?",
            "-s:v", "1280x720", "-b:v", "2500k",
            "-c:v", "libx264", "-preset", "fast",
            "-g", "48", "-sc_threshold", "0",
            "-c:a", "aac", "-b:a", "128k",
            "-map", "[v2]", "-map", "0:a?",
            "-s:v", "640x360", "-b:v", "800k",
            "-c:v", "libx264", "-preset", "fast",
            "-g", "48", "-sc_threshold", "0",
            "-c:a", "aac", "-b:a", "128k",
            "-var_stream_map", "v:0,a:0 v:1,a:1",
            "-master_pl_name", "master.m3u8",
            "-f", "hls",
            "-hls_time", "4",
            "-hls_list_size", "0",
            "-hls_segment_filename", seg_pattern,
            str(work_dir / "output_%v.m3u8"),
        ]
        log.info("Running FFmpeg for job %s ...", job_id)
        subprocess.run(cmd, check=True, capture_output=True)

        # 3. Upload all HLS files to Spaces
        base_key = str(Path(object_key).with_suffix("")).replace("\\", "/")
        hls_prefix = f"{base_key}/hls"

        manifest_object_key = f"{hls_prefix}/master.m3u8"
        content_types = {
            ".m3u8": "application/vnd.apple.mpegurl",
            ".ts": "video/mp2t",
        }

        for file_path in work_dir.iterdir():
            if file_path.suffix not in (".m3u8", ".ts"):
                continue
            dest_key = f"{hls_prefix}/{file_path.name}"
            ct = content_types.get(file_path.suffix, "application/octet-stream")
            log.info("Uploading %s -> s3://%s/%s", file_path.name, SPACES_BUCKET, dest_key)
            with file_path.open("rb") as fh:
                s3.put_object(
                    Bucket=SPACES_BUCKET,
                    Key=dest_key,
                    Body=fh,
                    ContentType=ct,
                    ACL="public-read",
                )

        # 4. Mark completed
        _set_job({
            **_get_job(job_id),
            "status": "completed",
            "updatedAt": _now_iso(),
            "completedAt": _now_iso(),
            "manifestObjectKey": manifest_object_key,
            "manifestUrl": _cdn_url(manifest_object_key),
            "error": None,
        })
        log.info("HLS job %s completed. Manifest: %s", job_id, manifest_object_key)

    except Exception as exc:
        log.exception("HLS job %s failed", job_id)
        _set_job({
            **(_get_job(job_id) or {"jobId": job_id}),
            "status": "failed",
            "updatedAt": _now_iso(),
            "failedAt": _now_iso(),
            "error": str(exc),
        })
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


class HlsJobRequest(BaseModel):
    object_key: str
    user_id: str
    title: str


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "wiseraven-video-processor", "version": "1.0.0"}


@app.post("/hls/jobs")
def create_hls_job(req: HlsJobRequest) -> dict:
    job_id = uuid.uuid4().hex
    now = _now_iso()
    job: dict = {
        "jobId": job_id,
        "userId": req.user_id,
        "objectKey": req.object_key,
        "title": req.title,
        "status": "queued",
        "createdAt": now,
        "updatedAt": now,
        "manifestObjectKey": None,
        "manifestUrl": None,
        "error": None,
    }
    _set_job(job)

    worker = threading.Thread(
        target=_run_hls_job,
        args=(job_id, req.object_key, req.user_id, req.title),
        daemon=True,
    )
    worker.start()

    return {"jobId": job_id, "status": "queued", "pollAfterSeconds": JOB_POLL_HINT_SECONDS}


@app.get("/hls/jobs/{job_id}")
def get_hls_job(job_id: str, user_id: str = Query(...)) -> dict:
    job = _get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    response: dict = {
        "jobId": job.get("jobId"),
        "status": job.get("status"),
        "userId": job.get("userId"),
        "title": job.get("title"),
        "createdAt": job.get("createdAt"),
        "updatedAt": job.get("updatedAt"),
        "error": job.get("error"),
        "pollAfterSeconds": JOB_POLL_HINT_SECONDS,
    }
    if job.get("status") == "completed":
        response["manifestObjectKey"] = job.get("manifestObjectKey")
        response["manifestUrl"] = job.get("manifestUrl")
    return response


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8004, log_level="info")
