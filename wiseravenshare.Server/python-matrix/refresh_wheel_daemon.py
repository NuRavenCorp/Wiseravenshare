from __future__ import annotations

import argparse
import json
import logging
import os
import subprocess
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import psycopg

logger = logging.getLogger("refresh-wheel-daemon")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def parse_iso8601(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


@dataclass
class Config:
    database_url: str
    model_name: str
    state_path: Path
    output_dir: Path
    anchor_path: Path | None
    min_examples: int
    min_days: int
    quality_threshold: float
    min_text_length: int
    bootstrap_days: int
    max_samples: int
    interval_hours: int
    ensure_anchor: bool
    run_init: bool
    refresh_wheel_bin: str


def load_config(args: argparse.Namespace) -> Config:
    database_url = str(
        args.database_url
        or os.environ.get("DATABASE_URL")
        or "postgresql://wiseravenshare_user:******@localhost:5432/wiseravenshare-db"
    )
    model_name = str(args.model or os.environ.get("REFRESH_WHEEL_MODEL") or "NuRavenCorpLLM-base")
    state_path = Path(args.state_path or os.environ.get("REFRESH_WHEEL_STATE_PATH") or "./refresh-wheel-state.json")
    output_dir = Path(args.output_dir or os.environ.get("REFRESH_WHEEL_OUTPUT_DIR") or "./refresh-wheel-data")
    anchor_value = args.anchor_path or os.environ.get("REFRESH_WHEEL_ANCHOR_PATH")
    anchor_path = Path(anchor_value) if anchor_value else None
    return Config(
        database_url=database_url,
        model_name=model_name,
        state_path=state_path,
        output_dir=output_dir,
        anchor_path=anchor_path,
        min_examples=max(1, int(args.min_examples or os.environ.get("REFRESH_WHEEL_MIN_EXAMPLES", "100"))),
        min_days=max(1, int(args.min_days or os.environ.get("REFRESH_WHEEL_MIN_DAYS", "7"))),
        quality_threshold=max(
            0.0,
            min(1.0, float(args.quality_threshold or os.environ.get("REFRESH_WHEEL_QUALITY_THRESHOLD", "0.8"))),
        ),
        min_text_length=max(20, int(args.min_text_length or os.environ.get("REFRESH_WHEEL_MIN_TEXT_LENGTH", "32"))),
        bootstrap_days=max(1, int(args.bootstrap_days or os.environ.get("REFRESH_WHEEL_BOOTSTRAP_DAYS", "7"))),
        max_samples=max(10, int(args.max_samples or os.environ.get("REFRESH_WHEEL_MAX_SAMPLES", "3000"))),
        interval_hours=max(1, int(args.every_hours or os.environ.get("REFRESH_WHEEL_EVERY_HOURS", "24"))),
        ensure_anchor=(args.ensure_anchor if args.ensure_anchor is not None else os.environ.get("REFRESH_WHEEL_ENSURE_ANCHOR", "1") != "0"),
        run_init=(args.run_init if args.run_init is not None else os.environ.get("REFRESH_WHEEL_RUN_INIT", "1") != "0"),
        refresh_wheel_bin=str(args.refresh_wheel_bin or os.environ.get("REFRESH_WHEEL_BIN") or "refresh-wheel"),
    )


def read_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def write_state(path: Path, state: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2, sort_keys=True), encoding="utf-8")


def run_command(command: list[str], cwd: Path | None = None) -> None:
    logger.info("Running command: %s", " ".join(command))
    completed = subprocess.run(
        command,
        cwd=str(cwd) if cwd else None,
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.stdout.strip():
        logger.info(completed.stdout.strip())
    if completed.stderr.strip():
        logger.warning(completed.stderr.strip())
    if completed.returncode != 0:
        raise RuntimeError(f"Command failed ({completed.returncode}): {' '.join(command)}")


def quality_for_post(text: str, likes: int, comments: int, reposts: int, shares: int, views: int) -> float:
    length_score = min(1.0, max(0.0, len(text) / 280.0))
    engagement_score = min(1.0, (likes * 1.0 + comments * 2.0 + reposts * 1.5 + shares * 2.5) / 30.0)
    view_score = min(1.0, views / 1000.0)
    return round(min(1.0, (0.45 * length_score) + (0.45 * engagement_score) + (0.10 * view_score)), 4)


def quality_for_comment(text: str, likes: int, replies: int) -> float:
    length_score = min(1.0, max(0.0, len(text) / 180.0))
    engagement_score = min(1.0, (likes * 1.0 + replies * 2.0) / 12.0)
    return round(min(1.0, (0.55 * length_score) + (0.45 * engagement_score)), 4)


def quality_for_message(text: str) -> float:
    length_score = min(1.0, max(0.0, len(text) / 240.0))
    punctuation_bonus = 0.15 if any(ch in text for ch in ".!?") else 0.0
    return round(min(1.0, 0.65 * length_score + punctuation_bonus + 0.2), 4)


def fetch_training_candidates(conn: psycopg.Connection, since: datetime, max_samples: int) -> list[dict[str, Any]]:
    samples: list[dict[str, Any]] = []

    with conn.cursor() as cursor:
        cursor.execute(
            """
            SELECT
                p."Id"::text,
                p."Content",
                p."LikesCount",
                p."CommentsCount",
                p."RepostsCount",
                p."SharesCount",
                p."ViewsCount",
                p."CreatedAt"
            FROM app_data."Posts" p
            WHERE p."CreatedAt" >= %s
              AND p."IsDeleted" = false
              AND char_length(trim(p."Content")) > 0
            ORDER BY p."CreatedAt" DESC
            LIMIT %s
            """,
            (since, max_samples),
        )
        for row in cursor.fetchall():
            text = (row[1] or "").strip()
            samples.append(
                {
                    "id": row[0],
                    "source": "wiseravenshare.posts",
                    "text": text,
                    "created_at": row[7].isoformat() if row[7] else utc_now().isoformat(),
                    "quality": quality_for_post(
                        text=text,
                        likes=int(row[2] or 0),
                        comments=int(row[3] or 0),
                        reposts=int(row[4] or 0),
                        shares=int(row[5] or 0),
                        views=int(row[6] or 0),
                    ),
                }
            )

        cursor.execute(
            """
            SELECT
                c."Id"::text,
                c."Content",
                c."LikesCount",
                c."RepliesCount",
                c."CreatedAt"
            FROM app_data."Comment" c
            WHERE c."CreatedAt" >= %s
              AND c."IsDeleted" = false
              AND char_length(trim(c."Content")) > 0
            ORDER BY c."CreatedAt" DESC
            LIMIT %s
            """,
            (since, max_samples),
        )
        for row in cursor.fetchall():
            text = (row[1] or "").strip()
            samples.append(
                {
                    "id": row[0],
                    "source": "wiseravenshare.comments",
                    "text": text,
                    "created_at": row[4].isoformat() if row[4] else utc_now().isoformat(),
                    "quality": quality_for_comment(
                        text=text,
                        likes=int(row[2] or 0),
                        replies=int(row[3] or 0),
                    ),
                }
            )

        cursor.execute(
            """
            SELECT
                m."Id"::text,
                m."Content",
                m."CreatedAt"
            FROM app_data."Messages" m
            WHERE m."CreatedAt" >= %s
              AND m."IsDeleted" = false
              AND char_length(trim(m."Content")) > 0
            ORDER BY m."CreatedAt" DESC
            LIMIT %s
            """,
            (since, max_samples),
        )
        for row in cursor.fetchall():
            text = (row[1] or "").strip()
            samples.append(
                {
                    "id": row[0],
                    "source": "wiseravenshare.messages",
                    "text": text,
                    "created_at": row[2].isoformat() if row[2] else utc_now().isoformat(),
                    "quality": quality_for_message(text),
                }
            )

        cursor.execute(
            """
            SELECT
                b.id::text,
                b.content,
                b.created_at
            FROM app_data.bridge_messages b
            WHERE b.created_at >= %s
              AND char_length(trim(COALESCE(b.content, ''))) > 0
            ORDER BY b.created_at DESC
            LIMIT %s
            """,
            (since, max_samples),
        )
        for row in cursor.fetchall():
            text = (row[1] or "").strip()
            samples.append(
                {
                    "id": row[0],
                    "source": "wiseravenshare.bridge_messages",
                    "text": text,
                    "created_at": row[2].isoformat() if row[2] else utc_now().isoformat(),
                    "quality": quality_for_message(text),
                }
            )

    return samples


def filter_and_dedupe(samples: list[dict[str, Any]], min_text_length: int, quality_threshold: float, max_samples: int) -> list[dict[str, Any]]:
    deduped: list[dict[str, Any]] = []
    seen_texts: set[str] = set()
    for sample in sorted(samples, key=lambda item: item["created_at"]):
        text = str(sample.get("text", "")).strip()
        quality = float(sample.get("quality", 0.0))
        if len(text) < min_text_length or quality < quality_threshold:
            continue
        key = text.lower()
        if key in seen_texts:
            continue
        seen_texts.add(key)
        deduped.append(sample)
        if len(deduped) >= max_samples:
            break
    return deduped


def write_jsonl(samples: list[dict[str, Any]], output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    file_path = output_dir / f"new_data_{utc_now().strftime('%Y%m%dT%H%M%SZ')}.jsonl"
    with file_path.open("w", encoding="utf-8") as handle:
        for sample in samples:
            record = {
                "text": sample["text"],
                "metadata": {
                    "source": sample["source"],
                    "sample_id": sample["id"],
                    "created_at": sample["created_at"],
                    "quality": sample["quality"],
                },
            }
            handle.write(json.dumps(record, ensure_ascii=True) + "\n")
    return file_path


def maybe_run_refresh_wheel(config: Config, dataset_path: Path) -> None:
    if config.run_init:
        run_command([config.refresh_wheel_bin, "init"])
    if config.ensure_anchor:
        if not config.anchor_path or not config.anchor_path.exists():
            raise RuntimeError("Anchor set is required but REFRESH_WHEEL_ANCHOR_PATH is missing or not found.")
        run_command([config.refresh_wheel_bin, "anchor", str(config.anchor_path)])
    run_command([config.refresh_wheel_bin, "add", str(dataset_path)])
    run_command([config.refresh_wheel_bin, "refresh", "--model", config.model_name])
    run_command([config.refresh_wheel_bin, "metrics"])


def execute_cycle(config: Config) -> bool:
    state = read_state(config.state_path)
    last_success = parse_iso8601(state.get("last_success_at"))
    now = utc_now()
    if last_success is None:
        last_success = now - timedelta(days=config.bootstrap_days)

    days_since_last = (now - last_success).total_seconds() / 86400.0
    if days_since_last < config.min_days:
        logger.info(
            "Skipping cycle: only %.2f days since last successful cycle (< %s).",
            days_since_last,
            config.min_days,
        )
        return False

    with psycopg.connect(config.database_url) as connection:
        raw_samples = fetch_training_candidates(connection, since=last_success, max_samples=config.max_samples)

    selected = filter_and_dedupe(
        raw_samples,
        min_text_length=config.min_text_length,
        quality_threshold=config.quality_threshold,
        max_samples=config.max_samples,
    )
    logger.info(
        "Collected %s candidate samples, selected %s with quality >= %.2f.",
        len(raw_samples),
        len(selected),
        config.quality_threshold,
    )
    if len(selected) < config.min_examples:
        logger.info(
            "Skipping cycle: selected %s samples (< %s min examples).",
            len(selected),
            config.min_examples,
        )
        return False

    dataset_path = write_jsonl(selected, config.output_dir)
    maybe_run_refresh_wheel(config, dataset_path)
    state.update(
        {
            "last_success_at": now.isoformat(),
            "last_dataset_path": str(dataset_path),
            "last_selected_count": len(selected),
        }
    )
    write_state(config.state_path, state)
    logger.info("Refresh cycle completed with %s samples.", len(selected))
    return True


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Trigger daemon for llm-refresh-wheel using WiseRaven data.")
    parser.add_argument("--once", action="store_true", help="Run exactly one trigger cycle.")
    parser.add_argument("--database-url", help="PostgreSQL DSN. Defaults to DATABASE_URL.")
    parser.add_argument("--model", help="Model name for refresh-wheel refresh.")
    parser.add_argument("--state-path", help="Path to daemon state JSON file.")
    parser.add_argument("--output-dir", help="Directory for generated JSONL datasets.")
    parser.add_argument("--anchor-path", help="Anchor eval JSONL path.")
    parser.add_argument("--every-hours", type=int, help="Daemon interval in hours.")
    parser.add_argument("--min-examples", type=int, help="Minimum selected samples to trigger training.")
    parser.add_argument("--min-days", type=int, help="Minimum days between successful refresh cycles.")
    parser.add_argument("--quality-threshold", type=float, help="Quality threshold in [0, 1].")
    parser.add_argument("--min-text-length", type=int, help="Minimum text length for candidate samples.")
    parser.add_argument("--bootstrap-days", type=int, help="Initial lookback days when no prior state exists.")
    parser.add_argument("--max-samples", type=int, help="Maximum selected samples per cycle.")
    parser.add_argument("--refresh-wheel-bin", help="Path to refresh-wheel executable.")
    parser.add_argument("--ensure-anchor", dest="ensure_anchor", action="store_true")
    parser.add_argument("--no-ensure-anchor", dest="ensure_anchor", action="store_false")
    parser.add_argument("--run-init", dest="run_init", action="store_true")
    parser.add_argument("--no-run-init", dest="run_init", action="store_false")
    parser.set_defaults(ensure_anchor=None, run_init=None)
    return parser


def main() -> int:
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    parser = build_arg_parser()
    args = parser.parse_args()
    config = load_config(args)

    if args.once:
        execute_cycle(config)
        return 0

    sleep_seconds = max(3600, config.interval_hours * 3600)
    while True:
        try:
            execute_cycle(config)
        except Exception as error:  # noqa: BLE001
            logger.exception("Refresh cycle failed: %s", error)
        logger.info("Sleeping for %.2f hours.", sleep_seconds / 3600.0)
        time.sleep(sleep_seconds)


if __name__ == "__main__":
    raise SystemExit(main())
