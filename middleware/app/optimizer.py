"""Step 3 of the pipeline: optimize media for Facebook's standards.

Images (Pillow)
    * Re-encoded as JPEG (or PNG when transparency is present).
    * Long edge capped at ``IMAGE_MAX_WIDTH`` px (1200 default) — Facebook's
      recommended width for timeline photos; larger files are downscaled,
      smaller ones are left alone.
    * EXIF orientation applied so sideways shots post upright.
    * CMYK / palette images converted to RGB to avoid washed-out colors.

Videos (ffmpeg via subprocess)
    * H.264 + AAC in an MP4 container — the only combination Facebook
      reliably accepts from all clients.
    * Scaled down to fit inside VIDEO_MAX_WIDTH x VIDEO_MAX_HEIGHT while
      preserving aspect ratio, only when the source is larger.
    * ``+faststart`` moves the moov atom to the front so playback starts
      while Facebook is still processing.
"""
from __future__ import annotations

import logging
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageOps

from .config import settings

logger = logging.getLogger("wr.facebook.optimize")


class OptimizationError(RuntimeError):
    """Raised when media cannot be processed into a Facebook-ready form."""


@dataclass(frozen=True)
class OptimizedMedia:
    path: Path
    mime_type: str


def _optimize_image(src: Path) -> OptimizedMedia:
    try:
        with Image.open(src) as img:
            img.load()
            # Respect EXIF rotation before touching dimensions.
            img = ImageOps.exif_transpose(img)

            has_alpha = (
                img.mode in ("RGBA", "LA")
                or (img.mode == "P" and "transparency" in img.info)
            )
            if has_alpha:
                png_path = src.with_suffix(".png")
                img.save(png_path, format="PNG", optimize=True)
                return OptimizedMedia(path=png_path, mime_type="image/png")

            if img.mode != "RGB":
                img = img.convert("RGB")

            max_edge = settings.image_max_width
            if max(img.size) > max_edge:
                img.thumbnail((max_edge, max_edge), Image.LANCZOS)

            jpg_path = src.with_suffix(".jpg")
            img.save(
                jpg_path,
                format="JPEG",
                quality=settings.image_quality,
                optimize=True,
                progressive=True,
            )
            return OptimizedMedia(path=jpg_path, mime_type="image/jpeg")
    except (OSError, ValueError) as exc:
        raise OptimizationError(f"image optimization failed: {exc}") from exc


def _has_ffmpeg() -> bool:
    return shutil.which(settings.ffmpeg_bin) is not None


def _probe_width(src: Path) -> int | None:
    """Return the video width using ffprobe; None when unavailable."""
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return None
    try:
        out = subprocess.run(
            [
                ffprobe,
                "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", "stream=width",
                "-of", "csv=p=0",
                str(src),
            ],
            capture_output=True,
            text=True,
            timeout=30,
            check=True,
        )
        return int(out.stdout.strip().splitlines()[0])
    except (subprocess.SubprocessError, ValueError, IndexError):
        return None


def _optimize_video(src: Path) -> OptimizedMedia:
    if not _has_ffmpeg():
        # Pass-through keeps the pipeline alive on hosts without ffmpeg;
        # Facebook still accepts most native MP4s unchanged.
        logger.warning("ffmpeg not found - passing video through unoptimized")
        return OptimizedMedia(path=src, mime_type="video/mp4")

    out_path = src.with_suffix(".fb.mp4")
    width = _probe_width(src)

    scale_filter = "scale='min({w},iw)':'min({h},ih)':force_original_aspect_ratio=decrease".format(
        w=settings.video_max_width, h=settings.video_max_height
    )
    if width is not None and width <= settings.video_max_width:
        # Already within bounds; re-encode for codec safety but skip scaling.
        scale_filter = "null"

    cmd = [
        settings.ffmpeg_bin,
        "-y",
        "-i", str(src),
        "-vf", scale_filter,
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", str(settings.video_crf),
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        str(out_path),
    ]

    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=1800, check=False
        )
    except subprocess.TimeoutExpired as exc:
        raise OptimizationError("ffmpeg timed out after 30 minutes") from exc

    if result.returncode != 0 or not out_path.exists():
        tail = (result.stderr or "")[-800:]
        raise OptimizationError(f"ffmpeg failed ({result.returncode}): {tail}")

    return OptimizedMedia(path=out_path, mime_type="video/mp4")


def optimize_media(path: Path, mime_type: str) -> OptimizedMedia:
    """Dispatch to the image or video optimizer based on sniffed MIME."""
    if mime_type.startswith("image/"):
        if mime_type == "image/gif":
            # Animated GIFs post better as MP4s on Facebook.
            return _optimize_video(path) if _has_ffmpeg() else _optimize_image(path)
        return _optimize_image(path)
    if mime_type.startswith("video/"):
        return _optimize_video(path)
    raise OptimizationError(f"no optimization path for {mime_type}")
