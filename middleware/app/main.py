"""Wiseravenshare -> Facebook publishing middleware (FastAPI entrypoint).

Endpoints
---------
GET  /health          liveness probe
GET  /webhook         Meta-style hub.challenge verification
POST /webhook         receives Wiseravenshare post payloads, enqueues a job
GET  /jobs/recent     last N journal entries (observability)

Design
------
* The POST handler validates, authenticates, and enqueues - it never runs the
  pipeline inline, so Facebook latency can never block the listener.
* A single background worker drains an in-process queue; swap in Redis/RQ or
  SQS by replacing ``queue`` + ``worker`` without touching the pipeline code.
"""
from __future__ import annotations

import asyncio
import uuid
from contextlib import asynccontextmanager

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse

from .config import settings
from .logging_utils import configure_logging, log_job_event, read_recent_jobs
from .models import PipelineResult, WebhookPayload
from .pipeline import run_pipeline

configure_logging()

queue: asyncio.Queue[WebhookPayload] = asyncio.Queue(maxsize=settings.queue_max_size)


async def worker() -> None:
    """Drain the queue forever; one job at a time keeps Graph API rate limits happy."""
    while True:
        payload = await queue.get()
        try:
            result = run_pipeline(payload)
            log_job_event(
                payload.job_id,
                "job_finished",
                status=result.status,
                error=result.error,
            )
        except Exception as exc:  # pragma: no cover - last-resort guard
            log_job_event(payload.job_id, "job_crashed", error=str(exc))
        finally:
            queue.task_done()


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(worker())
    yield
    task.cancel()


app = FastAPI(title="Wiseravenshare Facebook Middleware", version="1.0.0", lifespan=lifespan)


def _authorize(token: str | None) -> None:
    if token != settings.webhook_token:
        raise HTTPException(status_code=401, detail="invalid webhook token")


@app.get("/health")
async def health() -> dict:
    problems = settings.validate()
    return {
        "status": "ok" if not problems else "degraded",
        "dry_run": settings.dry_run,
        "queued": queue.qsize(),
        "problems": problems,
    }


@app.get("/webhook")
async def verify(
    hub_mode: str = Query(default="", alias="hub.mode"),
    hub_verify_token: str = Query(default="", alias="hub.verify_token"),
    hub_challenge: str = Query(default="", alias="hub.challenge"),
):
    """Meta-style subscription handshake."""
    if hub_mode == "subscribe" and hub_verify_token == settings.webhook_token:
        return JSONResponse(content=hub_challenge or "", media_type="text/plain")
    raise HTTPException(status_code=403, detail="verification failed")


@app.post("/webhook", status_code=202)
async def receive(
    request: Request,
    background_tasks: BackgroundTasks,
    x_wr_webhook_token: str | None = Header(default=None),
) -> dict:
    _authorize(x_wr_webhook_token)

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="body must be valid JSON")

    try:
        payload = WebhookPayload(**body)
    except Exception as exc:
        # 4xx tells Wiseravenshare the payload is malformed and should not retry as-is.
        raise HTTPException(status_code=422, detail=f"invalid payload: {exc}")

    job_id = payload.job_id or f"wr-{uuid.uuid4().hex[:12]}"
    payload.job_id = job_id

    try:
        queue.put_nowait(payload)
    except asyncio.QueueFull:
        # 503 signals the caller to retry later with backoff.
        raise HTTPException(status_code=503, detail="publish queue is full; retry later")

    log_job_event(job_id, "enqueued", event=payload.event, media_type=payload.media_type)
    return {"accepted": True, "job_id": job_id, "queued": queue.qsize()}


@app.get("/jobs/recent")
async def recent_jobs(limit: int = Query(default=50, ge=1, le=500)) -> list[dict]:
    return read_recent_jobs(limit)
