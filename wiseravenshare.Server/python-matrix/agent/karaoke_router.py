from __future__ import annotations

import asyncio
import gc
import os
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from job_queue import enqueue_job
from karaoke.router import KaraokeProcessRequest, _process_song

router = APIRouter(prefix="/agent/karaoke", tags=["agent-karaoke"])

AGENT_SOCIAL_TOPIC = os.environ.get("AGENT_SOCIAL_TOPIC", "agent.social.action").strip()
AGENT_KARAOKE_AUTOPROMO = os.environ.get("AGENT_KARAOKE_AUTOPROMO", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}

_karaoke_jobs: dict[str, dict[str, Any]] = {}
_karaoke_jobs_lock = asyncio.Lock()
_karaoke_gpu_lock = asyncio.Lock()


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clear_cuda_cache() -> None:
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass
    gc.collect()


class KaraokeJobRequest(BaseModel):
    song_id: str = Field(..., min_length=1, max_length=128)
    audio_path: str = Field(..., min_length=1)
    audio_url: str = Field(..., min_length=1)
    channel: str = "default"
    track_name: str | None = None
    artist_name: str | None = None
    announce_on_social: bool | None = None
    announcement_user_id: str = "agent"


def _queue_karaoke_announcement(song_id: str, payload: dict[str, Any], user_id: str) -> None:
    message = (
        f"New karaoke track is ready: {song_id}. "
        f"Sing now: {payload.get('audio', '')}"
    )
    action = {
        "action_id": str(uuid.uuid4()),
        "action_type": "create_post",
        "created_at": _utc_now(),
        "requires_approval": False,
        "payload": {
            "content": message,
            "hashtags": ["karaoke", "music"],
            "media_url": payload.get("audio"),
            "user_id": user_id,
            "created_by_ai": True,
        },
    }
    enqueue_job(AGENT_SOCIAL_TOPIC, action)


async def _set_job_status(job_id: str, **updates: Any) -> None:
    async with _karaoke_jobs_lock:
        job = _karaoke_jobs.get(job_id)
        if job is None:
            return
        job.update(updates)


async def _run_karaoke_pipeline(job_id: str, request: KaraokeJobRequest) -> None:
    await _set_job_status(job_id, status="running", started_at=_utc_now())

    try:
        async with _karaoke_gpu_lock:
            _clear_cuda_cache()
            relay_request = KaraokeProcessRequest(
                audio_path=request.audio_path,
                audio_url=request.audio_url,
                channel=request.channel,
                track_name=request.track_name,
                artist_name=request.artist_name,
            )
            relay_payload = await _process_song(relay_request)
            _clear_cuda_cache()

        announce = request.announce_on_social
        if announce is None:
            announce = AGENT_KARAOKE_AUTOPROMO
        if announce:
            _queue_karaoke_announcement(
                song_id=request.song_id,
                payload=relay_payload,
                user_id=request.announcement_user_id,
            )

        await _set_job_status(
            job_id,
            status="completed",
            completed_at=_utc_now(),
            result=relay_payload,
        )
    except Exception as error:  # noqa: BLE001
        _clear_cuda_cache()
        await _set_job_status(
            job_id,
            status="failed",
            completed_at=_utc_now(),
            error=str(error),
        )


@router.post("/generate")
async def queue_karaoke_job(
    payload: KaraokeJobRequest,
    background_tasks: BackgroundTasks,
) -> dict[str, Any]:
    if not payload.song_id.strip():
        raise HTTPException(status_code=400, detail="song_id is required.")

    job_id = str(uuid.uuid4())
    job_record = {
        "job_id": job_id,
        "status": "queued",
        "queued_at": _utc_now(),
        "song_id": payload.song_id,
        "channel": payload.channel,
    }
    async with _karaoke_jobs_lock:
        _karaoke_jobs[job_id] = job_record

    background_tasks.add_task(_run_karaoke_pipeline, job_id, payload)
    return job_record


@router.get("/jobs/{job_id}")
async def get_karaoke_job(job_id: str) -> dict[str, Any]:
    async with _karaoke_jobs_lock:
        job = _karaoke_jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job

