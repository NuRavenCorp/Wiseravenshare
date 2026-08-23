"""Structured logging + a tiny JSONL job journal for the middleware."""
from __future__ import annotations

import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

JOURNAL_PATH = Path(os.environ.get("JOB_JOURNAL", "data/jobs.jsonl"))


def configure_logging() -> None:
    level = os.environ.get("LOG_LEVEL", "INFO").upper()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s %(name)s :: %(message)s")
    )
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level)


def _write_journal(record: dict) -> None:
    try:
        JOURNAL_PATH.parent.mkdir(parents=True, exist_ok=True)
        with JOURNAL_PATH.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, default=str) + "\n")
    except OSError:  # pragma: no cover - journal must never break the pipeline
        pass


def log_job_event(job_id: str, event: str, **details) -> None:
    """Append a structured event for one job to the JSONL journal."""
    record = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "job_id": job_id,
        "event": event,
        **details,
    }
    logging.getLogger("wr.facebook").info("job=%s %s", job_id, event, details)
    _write_journal(record)


def read_recent_jobs(limit: int = 50) -> list[dict]:
    if not JOURNAL_PATH.exists():
        return []
    lines = JOURNAL_PATH.read_text(encoding="utf-8").splitlines()[-limit:]
    jobs: list[dict] = []
    for line in lines:
        try:
            jobs.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return jobs
