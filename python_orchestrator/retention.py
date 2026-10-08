"""
Retention manager for WiseRavenShare Python Orchestrator

Provides:
- Temp blob retention and cleanup
- Music file persistence (copy to persistent storage)
- Music retention/purging policy
- Creation of companion metadata files for music files when missing

Usage (example):
    from retention import RetentionManager
    rm = RetentionManager()
    rm.ensure_dirs()
    await rm.enforce_temp_retention()        # delete old temp files
    await rm.persist_music_file(path)        # persist a single music file and create .meta.json
    await rm.enforce_music_retention()       # purge old persisted music files
    asyncio.create_task(rm.run_periodic_cleanup())  # run periodic enforcement in background
"""

from __future__ import annotations

import os
import shutil
import json
import hashlib
import logging
import asyncio
from pathlib import Path
from datetime import datetime, timedelta

logger = logging.getLogger("wiseravenshare.retention")
_log_level = os.getenv("WRS_RETENTION_LOGLEVEL", "INFO").upper()
logger.setLevel(getattr(logging, _log_level, logging.INFO))


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name, str(default))
    try:
        return int(raw)
    except (TypeError, ValueError):
        logger.warning("Invalid integer for %s=%r. Falling back to %d.", name, raw, default)
        return default

class RetentionManager:
    def __init__(
        self,
        temp_dir: Path | None = None,
        music_persist_dir: Path | None = None,
        temp_retention_days: int | None = None,
        music_retention_days: int | None = None,
        periodic_interval_seconds: int = 3600
    ):
        self.temp_dir = Path(temp_dir) if temp_dir is not None else Path(os.getenv("PYTHON_TEMP_DIR", "/tmp/wiseravenshare"))
        self.music_persist_dir = (
            Path(music_persist_dir)
            if music_persist_dir is not None
            else Path(os.getenv("MUSIC_PERSIST_DIR", str(self.temp_dir / "music_persist")))
        )
        self.temp_retention_days = int(temp_retention_days) if temp_retention_days is not None else _env_int("TEMP_RETENTION_DAYS", 1)
        self.music_retention_days = int(music_retention_days) if music_retention_days is not None else _env_int("MUSIC_RETENTION_DAYS", 365)
        self.periodic_interval_seconds = (
            int(periodic_interval_seconds)
            if periodic_interval_seconds is not None
            else _env_int("RETENTION_INTERVAL_SECONDS", 3600)
        )

    def ensure_dirs(self):
        """Create required directories if they don't exist."""
        for d in (self.temp_dir, self.music_persist_dir):
            try:
                d.mkdir(parents=True, exist_ok=True)
                logger.debug("Ensured directory exists: %s", str(d))
            except Exception:
                logger.exception("Failed to ensure directory: %s", str(d))

    async def persist_music_file(self, src_path: str, create_meta: bool = True) -> Path:
        """
        Persist a music file into the persistent store.
        - Copies the file into the music_persist_dir preserving the filename.
        - If create_meta is True, creates a .meta.json companion file with basic metadata
          (original path, size, sha256, persisted_at).
        Returns the Path to the persisted file.
        """
        src = Path(src_path)
        if not src.exists():
            raise FileNotFoundError(f"Source music file not found: {src}")

        self.ensure_dirs()

        dest = self.music_persist_dir / src.name
        # If file already exists with same size and mtime, skip copy
        try:
            if dest.exists():
                if dest.stat().st_size == src.stat().st_size and int(dest.stat().st_mtime) == int(src.stat().st_mtime):
                    logger.info("Destination already up-to-date: %s", dest)
                else:
                    dest = self._unique_dest(dest)
                    shutil.copy2(src, dest)
                    logger.info("Copied music file to: %s", dest)
            else:
                shutil.copy2(src, dest)
                logger.info("Copied music file to: %s", dest)
        except Exception:
            logger.exception("Failed to copy music file: %s -> %s", src, dest)
            raise

        if create_meta:
            try:
                meta_path = dest.with_suffix(dest.suffix + ".meta.json")
                if not meta_path.exists():
                    meta = self._build_metadata(src, dest)
                    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
                    logger.info("Created metadata file: %s", meta_path)
            except Exception:
                logger.exception("Failed to create metadata for: %s", dest)

        return dest

    def _build_metadata(self, src: Path, dest: Path) -> dict:
        """Create metadata dict for a persisted music file."""
        size = dest.stat().st_size if dest.exists() else (src.stat().st_size if src.exists() else None)
        sha256 = self._compute_sha256(dest) if dest.exists() else None
        now = datetime.utcnow().isoformat() + "Z"
        meta = {
            "original_path": str(src.resolve(strict=False)),
            "persisted_path": str(dest.resolve(strict=False)),
            "size_bytes": size,
            "sha256": sha256,
            "persisted_at": now,
            "retention_days": self.music_retention_days
        }
        return meta

    def _compute_sha256(self, p: Path, chunk_size: int = 8192) -> Optional[str]:
        """Compute sha256 hash of a file. Returns hex digest or None on failure."""
        try:
            h = hashlib.sha256()
            with p.open("rb") as f:
                for chunk in iter(lambda: f.read(chunk_size), b""):
                    h.update(chunk)
            return h.hexdigest()
        except Exception:
            logger.exception("Failed to compute sha256 for: %s", p)
            return None

    def _unique_dest(self, dest: Path) -> Path:
        """Return a non-colliding destination Path by appending a numeric suffix."""
        base = dest.stem
        suffix = dest.suffix
        for i in range(1, 1000):
            candidate = dest.with_name(f"{base}.{i}{suffix}")
            if not candidate.exists():
                return candidate
        raise FileExistsError("Unable to find unique destination for: %s" % dest)

    async def enforce_temp_retention(self):
        """Remove files in temp_dir older than temp_retention_days."""
        cutoff = datetime.utcnow() - timedelta(days=self.temp_retention_days)
        removed = 0
        self.ensure_dirs()
        for p in self.temp_dir.iterdir():
            try:
                # Skip directories (optional: could recurse)
                if p.is_dir():
                    continue
                mtime = datetime.utcfromtimestamp(p.stat().st_mtime)
                if mtime < cutoff:
                    p.unlink()
                    removed += 1
                    logger.info("Removed temp file by retention policy: %s", p)
            except Exception:
                logger.exception("Failed to evaluate/remove temp file: %s", p)
        logger.info("Temp retention run complete. Removed: %d", removed)
        return removed

    async def enforce_music_retention(self):
        """Remove persisted music files older than music_retention_days along with their .meta.json files."""
        cutoff = datetime.utcnow() - timedelta(days=self.music_retention_days)
        removed = 0
        self.ensure_dirs()
        for p in self.music_persist_dir.iterdir():
            try:
                if p.is_dir():
                    continue
                mtime = datetime.utcfromtimestamp(p.stat().st_mtime)
                if mtime < cutoff:
                    # remove file
                    meta = p.with_suffix(p.suffix + ".meta.json")
                    try:
                        p.unlink()
                        removed += 1
                        logger.info("Removed persisted music file by retention policy: %s", p)
                    except Exception:
                        logger.exception("Failed to remove persisted file: %s", p)
                    # remove metadata if present
                    try:
                        if meta.exists():
                            meta.unlink()
                            logger.info("Removed metadata file: %s", meta)
                    except Exception:
                        logger.exception("Failed to remove metadata file: %s", meta)
            except Exception:
                logger.exception("Failed to evaluate/remove persisted music file: %s", p)
        logger.info("Music retention run complete. Removed: %d", removed)
        return removed

    async def run_periodic_cleanup(self):
        """Run periodic retention enforcement loops until cancelled."""
        logger.info("Starting periodic retention cleanup: temp=%dd music=%dd interval=%ds",
                    self.temp_retention_days, self.music_retention_days, self.periodic_interval_seconds)
        self.ensure_dirs()
        try:
            while True:
                try:
                    await self.enforce_temp_retention()
                    await self.enforce_music_retention()
                except Exception:
                    logger.exception("Error during retention enforcement cycle")
                await asyncio.sleep(self.periodic_interval_seconds)
        except asyncio.CancelledError:
            logger.info("Periodic retention cleanup cancelled")
            raise

# Convenience factory function for use by orchestrator
def get_retention_manager() -> RetentionManager:
    return RetentionManager(
        temp_dir=Path(os.getenv("PYTHON_TEMP_DIR", "/tmp/wiseravenshare")),
        music_persist_dir=Path(os.getenv("MUSIC_PERSIST_DIR", str(Path(os.getenv("PYTHON_TEMP_DIR", "/tmp/wiseravenshare")) / "music_persist"))),
        temp_retention_days=int(os.getenv("TEMP_RETENTION_DAYS", "1")),
        music_retention_days=int(os.getenv("MUSIC_RETENTION_DAYS", "365")),
        periodic_interval_seconds=int(os.getenv("RETENTION_INTERVAL_SECONDS", "3600"))
    )