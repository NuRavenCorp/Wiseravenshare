import asyncio
import json
import logging
import math
import os
import re
from datetime import datetime, timezone
from typing import Any

import psycopg
import redis

from feed_ranker import rank_post_feed
from live_ranker import rank_live_feed

logger = logging.getLogger("python-job-handlers")

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://wiseravenshare_user:wiseravenshare_dev_password@postgres:5432/wiseravenshare_db",
)
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0").strip()
NURAVEN_CORP_LLM_SCORER_URL = os.environ.get("NURAVEN_CORP_LLM_SCORER_URL", "").strip()
RANKER_MODEL_TIMEOUT_SECONDS = float(os.environ.get("RANKER_MODEL_TIMEOUT_SECONDS", "1.5"))
MAX_LIVE_FEED_LIMIT = 100
MAX_TRAINING_SAMPLE_LIMIT = 5000

ACTION_WEIGHTS = {
    "post": 10,
    "repost": 8,
    "comment": 5,
    "like": 1,
    "dislike": -2,
}

_redis_client: redis.Redis | None = None


def get_connection() -> psycopg.Connection:
    return psycopg.connect(DATABASE_URL)


def get_redis_client() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
    return _redis_client


def _derive_rank_label(watch_seconds: float, liked: bool, commented: bool, shared: bool, followed_after: bool) -> float:
    watch_component = min(1.0, max(0.0, watch_seconds) / 300.0)
    label = (
        0.6 * watch_component
        + (0.15 if liked else 0.0)
        + (0.1 if commented else 0.0)
        + (0.1 if shared else 0.0)
        + (0.05 if followed_after else 0.0)
    )
    return round(min(1.0, label), 4)


def score_stream_with_nuraven_model(_: dict[str, float]) -> float | None:
    # Queue workers can use heuristic ranking without external scorer by default.
    # This remains intentionally conservative for reliability.
    return None


def ensure_live_rank_impressions_table() -> None:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS live_rank_impressions (
                    id BIGSERIAL PRIMARY KEY,
                    viewer_id TEXT NOT NULL,
                    stream_id TEXT NOT NULL,
                    score DOUBLE PRECISION NOT NULL,
                    score_source TEXT NOT NULL,
                    rank_position INTEGER NOT NULL,
                    features JSONB NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        connection.commit()


def record_live_rank_impressions(viewer_id: str, streams: list[dict[str, Any]]) -> None:
    if not viewer_id or not streams:
        return
    ensure_live_rank_impressions_table()
    with get_connection() as connection:
        with connection.cursor() as cursor:
            for rank_position, stream in enumerate(streams, start=1):
                cursor.execute(
                    """
                    INSERT INTO live_rank_impressions
                    (viewer_id, stream_id, score, score_source, rank_position, features)
                    VALUES (%s, %s, %s, %s, %s, %s::jsonb)
                    """,
                    (
                        viewer_id,
                        str(stream.get("stream_id", "")),
                        float(stream.get("score", 0.0)),
                        str(stream.get("score_source", "heuristic")),
                        rank_position,
                        json.dumps(stream.get("features") or {}),
                    ),
                )
        connection.commit()


def handle_post_feed_ranked(payload: dict[str, Any]) -> dict[str, Any]:
    viewer_id = str(payload.get("viewer_id", "")).strip()
    if not viewer_id:
        return {"status_code": 400, "body": {"message": "viewer_id is required."}}

    page_size = int(payload.get("page_size", 40))
    window_days = int(payload.get("window_days", 30))
    page_size = max(1, min(100, page_size))
    window_days = max(1, min(90, window_days))

    try:
        with get_connection() as conn:
            posts = rank_post_feed(
                conn,
                viewer_id=viewer_id,
                page_size=page_size,
                candidate_window_days=window_days,
            )
        return {"status_code": 200, "body": {"posts": posts, "count": len(posts), "viewer_id": viewer_id}}
    except psycopg.Error as error:
        logger.warning("Post feed ranking DB error: %s", error)
        return {"status_code": 503, "body": {"message": "Post feed ranking is unavailable.", "error": str(error)}}
    except Exception as error:  # noqa: BLE001
        logger.warning("Post feed ranking failed: %s", error)
        return {"status_code": 500, "body": {"message": "Post feed ranking failed.", "error": str(error)}}


def handle_live_feed(payload: dict[str, Any]) -> dict[str, Any]:
    viewer_id = str(payload.get("viewer_id", "")).strip()
    if not viewer_id:
        return {"status_code": 400, "body": {"message": "viewer_id is required."}}

    limit = int(payload.get("limit", 50))
    limit = max(1, min(MAX_LIVE_FEED_LIMIT, limit))

    try:
        predictor = score_stream_with_nuraven_model if NURAVEN_CORP_LLM_SCORER_URL else None
        streams = asyncio.run(rank_live_feed(DATABASE_URL, viewer_id, limit, predictor))
        try:
            record_live_rank_impressions(viewer_id, streams)
        except psycopg.Error as error:
            logger.warning("Failed to persist live rank impressions: %s", error)
        return {"status_code": 200, "body": {"streams": streams, "count": len(streams)}}
    except Exception as error:  # noqa: BLE001
        logger.warning("Live feed ranking request failed: %s", error)
        return {"status_code": 503, "body": {"message": "Live feed ranking is unavailable.", "error": str(error)}}


def handle_live_training_data(payload: dict[str, Any]) -> dict[str, Any]:
    limit = int(payload.get("limit", 500))
    limit = max(1, min(MAX_TRAINING_SAMPLE_LIMIT, limit))
    try:
        ensure_live_rank_impressions_table()
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        i.id,
                        i.viewer_id,
                        i.stream_id,
                        i.score,
                        i.score_source,
                        i.rank_position,
                        i.features::text,
                        i.created_at,
                        COALESCE(SUM(li.watch_seconds), 0) AS watch_seconds,
                        COALESCE(BOOL_OR(li.liked), FALSE) AS liked,
                        COALESCE(BOOL_OR(li.commented), FALSE) AS commented,
                        COALESCE(BOOL_OR(li.shared), FALSE) AS shared,
                        COALESCE(BOOL_OR(li.followed_after), FALSE) AS followed_after
                    FROM live_rank_impressions i
                    LEFT JOIN live_interactions li
                        ON li.viewer_id = i.viewer_id
                       AND li.stream_id = i.stream_id
                       AND li.created_at >= i.created_at
                       AND li.created_at < i.created_at + interval '24 hours'
                    GROUP BY
                        i.id, i.viewer_id, i.stream_id, i.score, i.score_source,
                        i.rank_position, i.features, i.created_at
                    ORDER BY i.id DESC
                    LIMIT %s
                    """,
                    (limit,),
                )
                rows = cursor.fetchall()
        samples = []
        for row in rows:
            features = json.loads(row[6] or "{}")
            watch_seconds = float(row[8] or 0.0)
            liked = bool(row[9])
            commented = bool(row[10])
            shared = bool(row[11])
            followed_after = bool(row[12])
            label = _derive_rank_label(watch_seconds, liked, commented, shared, followed_after)
            samples.append(
                {
                    "impression_id": row[0],
                    "viewer_id": row[1],
                    "stream_id": row[2],
                    "features": features,
                    "label": label,
                    "metadata": {
                        "scored_at": row[7].isoformat(),
                        "heuristic_or_model_score": float(row[3]),
                        "score_source": row[4],
                        "rank_position": int(row[5]),
                        "watch_seconds_24h": watch_seconds,
                        "liked_24h": liked,
                        "commented_24h": commented,
                        "shared_24h": shared,
                        "followed_after_24h": followed_after,
                    },
                }
            )
        return {"status_code": 200, "body": {"samples": samples, "count": len(samples)}}
    except psycopg.Error as error:
        return {"status_code": 503, "body": {"message": "Training data is unavailable.", "error": str(error)}}


def _utc_date_key(epoch_seconds: float) -> str:
    return datetime.fromtimestamp(epoch_seconds, tz=timezone.utc).strftime("%Y-%m-%d")


def handle_engagement_action(payload: dict[str, Any]) -> dict[str, Any]:
    user_id = str(payload.get("user_id", "")).strip()
    action = str(payload.get("action", "")).strip().lower()
    target_id = str(payload.get("target_id", "")).strip() or None
    timestamp = float(payload.get("timestamp")) if payload.get("timestamp") is not None else datetime.now(timezone.utc).timestamp()

    if not user_id:
        return {"status_code": 400, "body": {"message": "user_id is required."}}
    if action not in ACTION_WEIGHTS:
        return {"status_code": 400, "body": {"message": f"Unsupported action '{action}'."}}

    redis_client = get_redis_client()
    day_key = _utc_date_key(timestamp)
    pipe = redis_client.pipeline()
    pipe.hincrby(f"user:{user_id}:metrics", action, 1)
    pipe.hincrby(f"user:{user_id}:daily:{day_key}", action, 1)
    pipe.zincrby("user:engagement:ranked", ACTION_WEIGHTS[action], user_id)
    if target_id:
        pipe.hincrby(f"post:{target_id}:metrics", action, 1)
        pipe.zincrby("post:engagement:ranked", ACTION_WEIGHTS[action], target_id)
    pipe.execute()
    return {"status_code": 200, "body": {"status": "ok", "user_id": user_id, "action": action}}


def handle_worker_tags(payload: dict[str, Any]) -> dict[str, Any]:
    text_parts = [
        str(payload.get("text", "")),
        str(payload.get("caption", "")),
        str(payload.get("title", "")),
    ]
    text = " ".join(part.strip() for part in text_parts if part and part.strip())
    hashtags = [match.group(1) for match in re.finditer(r"#(\w+)", text)]
    tokens = [token.strip("#").lower() for token in re.findall(r"[#@]?\w+", text) if token.strip("#")]

    unique_hashtags: list[str] = []
    seen = set()
    for tag in hashtags:
        normalized = tag.lower()
        if normalized in seen:
            continue
        seen.add(normalized)
        unique_hashtags.append(f"#{tag}")

    return {
        "status_code": 200,
        "body": {
            "hashtags": unique_hashtags,
            "token_count": len(tokens),
            "tokens": tokens[:100],
        },
    }


def handle_worker_audio(payload: dict[str, Any]) -> dict[str, Any]:
    source_url = str(payload.get("source_url", "")).strip()
    duration_seconds = payload.get("duration_seconds")
    transcript = str(payload.get("transcript", "")).strip()
    words = [word for word in re.findall(r"\w+", transcript) if word]
    normalized_duration: float | None = None
    if duration_seconds is not None and str(duration_seconds).strip():
        try:
            normalized_duration = float(duration_seconds)
        except ValueError:
            normalized_duration = None

    response: dict[str, Any] = {
        "accepted": True,
        "source_url": source_url,
        "duration_seconds": normalized_duration,
        "transcript_word_count": len(words),
        "status": "processed",
    }
    return {"status_code": 200, "body": response}


HANDLERS: dict[str, Any] = {
    "post_feed_ranked": handle_post_feed_ranked,
    "live_feed": handle_live_feed,
    "live_training_data": handle_live_training_data,
    "engagement_action": handle_engagement_action,
    "worker_tags": handle_worker_tags,
    "worker_audio": handle_worker_audio,
}
