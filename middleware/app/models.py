"""Models describing the webhook payload and pipeline results."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, Field, HttpUrl, field_validator


class WebhookPayload(BaseModel):
    """JSON body Wiseravenshare POSTs when new content is ready to publish.

    Example:
        {
          "event": "post.published",
          "job_id": "wr-2026-08-22-0001",
          "message": "Breaking: raven sighted over the harbor #News",
          "media_url": "https://cdn.wise-ravens.com/media/abc123.jpg",
          "media_type": "photo",
          "link_url": "https://wise-ravens.com/feed/abc123",
          "source": "wiseravenshare"
        }
    """

    event: str = Field(default="post.published")
    job_id: str = Field(..., min_length=1, max_length=128)
    message: str = Field(default="", max_length=5000)
    media_url: Optional[HttpUrl] = None
    media_type: Literal["photo", "video", "text"] = "text"
    link_url: Optional[HttpUrl] = None
    source: str = Field(default="wiseravenshare", max_length=64)

    @field_validator("event")
    @classmethod
    def _known_event(cls, value: str) -> str:
        allowed = {"post.published", "post.updated", "post.deleted"}
        if value not in allowed:
            raise ValueError(f"unsupported event '{value}'")
        return value


class PipelineStep(BaseModel):
    step: str
    status: Literal["ok", "skipped", "failed"]
    detail: str = ""


class PipelineResult(BaseModel):
    job_id: str
    status: Literal["succeeded", "failed"]
    steps: list[PipelineStep] = Field(default_factory=list)
    facebook_post_id: Optional[str] = None
    facebook_post_url: Optional[str] = None
    error: Optional[str] = None
    finished_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
