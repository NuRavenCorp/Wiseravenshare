"""Step 2 of the pipeline: download raw media bytes from a URL.

Design notes
------------
* Streams to disk in chunks so an 8MB image and a 500MB video both work
  without loading the whole file into RAM.
* Enforces a hard byte cap *while streaming* (Content-Length can lie).
* Sniffs the real content type from magic bytes; the ``Content-Type``
  header is only a hint (CDNs often send ``application/octet-stream``).
"""
from __future__ import annotations

import logging
import mimetypes
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path

import httpx

from .config import settings

logger = logging.getLogger("wr.facebook.download")

CHUNK_SIZE = 1 << 16  # 64 KiB

# Magic-byte signatures for the types we accept.
_SIGNATURES: tuple[tuple[bytes, str], ...] = (
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"GIF8", "image/gif"),
    (b"RIFF", "image/webp"),  # RIFF....WEBP verified below
    (b"\x1a\x45\xdf\xa3", "video/webm"),
    (b"ftyp", "video/mp4"),  # checked at offset 4 below
)


class DownloadError(RuntimeError):
    """Raised when media cannot be fetched or fails validation."""


@dataclass(frozen=True)
class DownloadedMedia:
    path: Path
    mime_type: str
    size_bytes: int


def _sniff(head: bytes, fallback: str | None) -> str:
    for signature, mime in _SIGNATURES:
        if head.startswith(signature):
            if mime == "image/webp" and head[8:12] != b"WEBP":
                continue
            return mime
    # MP4 boxes start with a 4-byte size then 'ftyp'.
    if len(head) >= 8 and head[4:8] == b"ftyp":
        return "video/mp4"
    if fallback and fallback != "application/octet-stream":
        return fallback.split(";")[0].strip()
    raise DownloadError(f"unrecognized media type (head={head[:16]!r})")


def download_media(media_url: str, *, referer: str | None = None) -> DownloadedMedia:
    """Fetch ``media_url`` to a temp file and report its true MIME type.

    Raises :class:`DownloadError` on HTTP failure, oversized files,
    timeouts, or unrecognized content.
    """
    headers = {
        "User-Agent": "Wiseravenshare-Facebook-Middleware/1.0",
        "Accept": "*/*",
    }
    if referer:
        headers["Referer"] = referer

    limit = max(settings.max_image_bytes, settings.max_video_bytes)
    tmp_dir = Path(tempfile.gettempdir()) / "wr-facebook"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    tmp_path = tmp_dir / f"{uuid.uuid4().hex}.bin"

    try:
        with httpx.Client(
            timeout=httpx.Timeout(settings.http_timeout_seconds, read=300.0),
            follow_redirects=True,
        ) as client:
            with client.stream("GET", media_url, headers=headers) as response:
                if response.status_code >= 400:
                    raise DownloadError(
                        f"HTTP {response.status_code} while fetching {media_url}"
                    )

                declared = response.headers.get("content-length")
                if declared and declared.isdigit() and int(declared) > limit:
                    raise DownloadError(
                        f"declared size {declared}B exceeds cap {limit}B"
                    )

                header_type = response.headers.get("content-type")
                head = b""
                written = 0
                with tmp_path.open("wb") as fh:
                    for chunk in response.iter_bytes(chunk_size=CHUNK_SIZE):
                        if len(head) < 32:
                            head += chunk[: 32 - len(head)]
                        written += len(chunk)
                        if written > limit:
                            raise DownloadError(
                                f"download exceeded {limit} byte cap"
                            )
                        fh.write(chunk)

        if written == 0:
            raise DownloadError("empty response body")

        mime = _sniff(head, header_type)
        is_video = mime.startswith("video/")
        hard_cap = settings.max_video_bytes if is_video else settings.max_image_bytes
        if written > hard_cap:
            raise DownloadError(
                f"{mime} payload {written}B exceeds {hard_cap}B cap"
            )

        logger.info("downloaded %s as %s (%d bytes)", media_url, mime, written)
        return DownloadedMedia(path=tmp_path, mime_type=mime, size_bytes=written)

    except httpx.HTTPError as exc:
        tmp_path.unlink(missing_ok=True)
        raise DownloadError(f"network failure fetching {media_url}: {exc}") from exc
    except DownloadError:
        tmp_path.unlink(missing_ok=True)
        raise
    except Exception as exc:  # pragma: no cover - defensive
        tmp_path.unlink(missing_ok=True)
        raise DownloadError(f"unexpected download failure: {exc}") from exc


def guess_extension(mime_type: str) -> str:
    return mimetypes.guess_extension(mime_type) or ".bin"
