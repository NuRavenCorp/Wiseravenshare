"""Configuration for the Wiseravenshare -> Facebook publishing middleware.

Every value can be overridden with an environment variable of the same name
(upper-case, dots replaced by underscores), e.g. ``MIDDLEWARE_VERIFY_TOKEN``.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field


def _env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name)
    return value if value not in (None, "") else default


@dataclass(frozen=True)
class Settings:
    # --- Webhook receiver -------------------------------------------------
    # Shared secret Wiseravenshare sends as `X-WR-Webhook-Token`.
    webhook_token: str = field(default_factory=lambda: _env("WEBHOOK_TOKEN", "dev-webhook-token") or "")

    # --- Facebook Graph API ----------------------------------------------
    graph_base_url: str = field(
        default_factory=lambda: _env("GRAPH_BASE_URL", "https://graph.facebook.com/v26.0") or ""
    )
    page_id: str = field(default_factory=lambda: _env("FACEBOOK_PAGE_ID", "") or "")
    page_access_token: str = field(default_factory=lambda: _env("FACEBOOK_PAGE_ACCESS_TOKEN", "") or "")

    # --- Pipeline behaviour ------------------------------------------------
    # When true, no Facebook calls are made; results are logged and returned.
    dry_run: bool = field(default_factory=lambda: (_env("DRY_RUN", "true") or "true").lower() == "true")

    # Download limits (bytes). Facebook caps photos at 10MB / videos at 4GB;
    # we stay well below to protect middleware memory.
    max_image_bytes: int = field(default_factory=lambda: int(_env("MAX_IMAGE_BYTES", str(8 * 1024 * 1024)) or "0"))
    max_video_bytes: int = field(default_factory=lambda: int(_env("MAX_VIDEO_BYTES", str(512 * 1024 * 1024)) or "0"))

    # Optimization targets.
    image_max_width: int = field(default_factory=lambda: int(_env("IMAGE_MAX_WIDTH", "1200") or "1200"))
    image_quality: int = field(default_factory=lambda: int(_env("IMAGE_QUALITY", "85") or "85"))
    video_max_width: int = field(default_factory=lambda: int(_env("VIDEO_MAX_WIDTH", "1280") or "1280"))
    video_max_height: int = field(default_factory=lambda: int(_env("VIDEO_MAX_HEIGHT", "1280") or "1280"))
    video_crf: int = field(default_factory=lambda: int(_env("VIDEO_CRF", "23") or "23"))
    ffmpeg_bin: str = field(default_factory=lambda: _env("FFMPEG_BIN", "ffmpeg") or "")

    # Retry policy for outbound HTTP (download + Graph API).
    http_timeout_seconds: float = field(default_factory=lambda: float(_env("HTTP_TIMEOUT_SECONDS", "60") or "60"))
    max_attempts: int = field(default_factory=lambda: int(_env("MAX_ATTEMPTS", "3") or "3"))

    # In-memory queue safety valve.
    queue_max_size: int = field(default_factory=lambda: int(_env("QUEUE_MAX_SIZE", "500") or "500"))

    def validate(self) -> list[str]:
        """Return a list of configuration problems (empty when healthy)."""
        problems: list[str] = []
        if not self.webhook_token:
            problems.append("WEBHOOK_TOKEN is empty")
        if not self.dry_run:
            if not self.page_id:
                problems.append("FACEBOOK_PAGE_ID is required when DRY_RUN=false")
            if not self.page_access_token:
                problems.append("FACEBOOK_PAGE_ACCESS_TOKEN is required when DRY_RUN=false")
        return problems


settings = Settings()
