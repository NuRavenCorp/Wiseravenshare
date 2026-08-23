"""Step 4+5 of the pipeline: Facebook Graph API client.

Sequence per the checklist:
    1. ``POST /{page-id}/photos``  (multipart ``source``, ``published=false``)
       -> returns a photo id; the media now lives on Facebook's servers.
    2. ``POST /{page-id}/feed``    (``message`` + ``attached_media[0][media_fbid]``)
       -> finalizes the post combining text + uploaded photo.

Videos use the ``/{page-id}/videos`` edge directly with multipart bytes
(``source`` + ``description``) - that single call publishes.

All calls retry transient failures (429 / 5xx / network) with exponential
backoff, and raise :class:`FacebookError` with the Graph error message
otherwise.
"""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path

import httpx

from .config import settings

logger = logging.getLogger("wr.facebook.client")


class FacebookError(RuntimeError):
    """Raised when the Graph API rejects or fails a call."""


def _graph_post(
    path: str,
    data: dict[str, str],
    *,
    files: dict[str, tuple[str, bytes, str]] | None = None,
) -> dict:
    """POST to the Graph API with retries; returns the parsed JSON body."""
    if not settings.page_id or not settings.page_access_token:
        raise FacebookError(
            "Facebook is not configured (FACEBOOK_PAGE_ID / FACEBOOK_PAGE_ACCESS_TOKEN)"
        )

    url = f"{settings.graph_base_url}/{settings.page_id}/{path}"
    payload = {"access_token": settings.page_access_token, **data}

    last_error = ""
    for attempt in range(1, settings.max_attempts + 1):
        try:
            with httpx.Client(timeout=settings.http_timeout_seconds * 5) as client:
                response = client.post(url, data=payload, files=files)
        except httpx.HTTPError as exc:
            last_error = f"network error: {exc}"
            logger.warning("attempt %d/%d failed: %s", attempt, settings.max_attempts, last_error)
            time.sleep(min(2 ** attempt, 30))
            continue

        body = response.text
        if response.status_code in (429, 500, 502, 503, 504):
            last_error = f"HTTP {response.status_code}: {body[:300]}"
            logger.warning("transient failure %d/%d: %s", attempt, settings.max_attempts, last_error)
            time.sleep(min(2 ** attempt, 30))
            continue

        if response.status_code >= 400:
            # Permanent rejection - do not retry.
            raise FacebookError(f"HTTP {response.status_code}: {body[:500]}")

        try:
            return json.loads(body)
        except json.JSONDecodeError as exc:
            raise FacebookError(f"non-JSON response: {body[:200]}") from exc

    raise FacebookError(f"gave up after {settings.max_attempts} attempts: {last_error}")


def _upload_photo_unpublished(image_path: Path) -> str:
    """Upload image bytes unpublished; return the photo id."""
    raw = image_path.read_bytes()
    mime = "image/png" if image_path.suffix == ".png" else "image/jpeg"
    result = _graph_post(
        "photos",
        {"published": "false"},
        files={"source": (image_path.name, raw, mime)},
    )
    photo_id = result.get("id")
    if not photo_id:
        raise FacebookError(f"photo upload returned no id: {result}")
    logger.info("uploaded photo id=%s (%d bytes)", photo_id, len(raw))
    return str(photo_id)


def _publish_photo_post(message: str, photo_id: str) -> dict:
    """Create the final feed post referencing the uploaded photo."""
    return _graph_post(
        "feed",
        {
            "message": message,
            "attached_media[0][media_fbid]": photo_id,
        },
    )


def _publish_video(video_path: Path, message: str) -> dict:
    """Upload video bytes and publish in one call via /videos."""
    raw = video_path.read_bytes()
    return _graph_post(
        "videos",
        {"description": message},
        files={"source": (video_path.name, raw, "video/mp4")},
    )


def publish_media(message: str, media_path: Path | None, mime_type: str | None) -> dict:
    """Publish text/photo/video to the Page. Returns the Graph JSON response.

    Response shapes:
        feed post   -> {"id": "<post_id>"}
        photo post  -> {"id": "<post_id>", ...}
        video post  -> {"id": "<video_id>"}  (id IS the post id for videos)
    """
    if media_path is None or mime_type is None:
        return _graph_post("feed", {"message": message})

    if mime_type.startswith("image/"):
        photo_id = _upload_photo_unpublished(media_path)
        return _publish_photo_post(message, photo_id)

    if mime_type.startswith("video/"):
        return _publish_video(media_path, message)

    raise FacebookError(f"unsupported media type for publishing: {mime_type}")


def post_id_to_permalink(page_id: str, post_id: str) -> str:
    """Build a human URL from a Graph object id (works for posts/videos)."""
    if "_" in post_id:
        return f"https://www.facebook.com/{post_id.replace('_', '/posts/')}"
    return f"https://www.facebook.com/{page_id}/posts/{post_id}"
