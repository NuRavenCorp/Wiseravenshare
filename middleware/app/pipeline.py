"""Pipeline orchestrator: download -> optimize -> publish, with journaling."""
from __future__ import annotations

import logging
from pathlib import Path

from . import downloader, facebook_client, optimizer
from .config import settings
from .logging_utils import log_job_event
from .models import PipelineResult, PipelineStep, WebhookPayload

logger = logging.getLogger("wr.facebook.pipeline")


def _cleanup(*paths: Path | None) -> None:
    for path in paths:
        if path is not None:
            try:
                path.unlink(missing_ok=True)
            except OSError:  # pragma: no cover
                pass


def run_pipeline(payload: WebhookPayload) -> PipelineResult:
    """Execute the full checklist for one webhook job."""
    steps: list[PipelineStep] = []
    job_id = payload.job_id

    # ---- Step 2: Download -------------------------------------------------
    media_path: Path | None = None
    optimized_path: Path | None = None
    mime_type: str | None = None

    if payload.media_url and payload.media_type in ("photo", "video"):
        try:
            downloaded = downloader.download_media(str(payload.media_url))
            media_path = downloaded.path
            mime_type = downloaded.mime_type
            steps.append(
                PipelineStep(step="download", status="ok", detail=f"{mime_type}, {downloaded.size_bytes}B")
            )
            log_job_event(job_id, "downloaded", mime=mime_type, size=downloaded.size_bytes)
        except downloader.DownloadError as exc:
            steps.append(PipelineStep(step="download", status="failed", detail=str(exc)))
            log_job_event(job_id, "download_failed", error=str(exc))
            return PipelineResult(job_id=job_id, status="failed", steps=steps,
                                  error=f"download failed: {exc}")
    else:
        steps.append(PipelineStep(step="download", status="skipped", detail="text-only post"))

    # ---- Step 3: Optimize --------------------------------------------------
    publish_path: Path | None = media_path
    publish_mime: str | None = mime_type

    if media_path is not None and mime_type is not None:
        try:
            optimized = optimizer.optimize_media(media_path, mime_type)
            optimized_path = optimized.path
            publish_path = optimized.path
            publish_mime = optimized.mime_type
            steps.append(
                PipelineStep(step="optimize", status="ok", detail=publish_mime)
            )
            log_job_event(job_id, "optimized", mime=publish_mime)
        except optimizer.OptimizationError as exc:
            # Fall back to the raw download rather than dropping the post.
            steps.append(PipelineStep(step="optimize", status="failed", detail=str(exc)))
            log_job_event(job_id, "optimize_failed_using_raw", error=str(exc))
            publish_path = media_path
            publish_mime = mime_type

    # ---- Steps 4+5: Upload + Post ------------------------------------------
    try:
        if settings.dry_run:
            steps.append(PipelineStep(
                step="publish",
                status="skipped",
                detail=f"DRY_RUN=true (would post {publish_mime or 'text'} to page)",
            ))
            log_job_event(job_id, "dry_run_publish_skipped", mime=publish_mime)
            result = PipelineResult(job_id=job_id, status="succeeded", steps=steps)
        else:
            response = facebook_client.publish_media(payload.message, publish_path, publish_mime)
            post_id = str(response.get("id", ""))
            permalink = facebook_client.post_id_to_permalink(settings.page_id, post_id) if post_id else None
            steps.append(PipelineStep(step="publish", status="ok", detail=f"id={post_id}"))
            log_job_event(job_id, "published", post_id=post_id, url=permalink)
            result = PipelineResult(
                job_id=job_id,
                status="succeeded",
                steps=steps,
                facebook_post_id=post_id or None,
                facebook_post_url=permalink,
            )
    except facebook_client.FacebookError as exc:
        steps.append(PipelineStep(step="publish", status="failed", detail=str(exc)))
        log_job_event(job_id, "publish_failed", error=str(exc))
        result = PipelineResult(job_id=job_id, status="failed", steps=steps,
                                error=f"facebook publish failed: {exc}")
    finally:
        _cleanup(media_path, optimized_path)

    return result
