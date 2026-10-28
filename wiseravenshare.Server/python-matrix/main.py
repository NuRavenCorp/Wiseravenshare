import asyncio
import json
import logging
import math
import os
import re
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request

import psycopg
import redis
import redis.asyncio as aredis
from fastapi import FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field, field_validator
from live_ranker import rank_live_feed
from feed_ranker import rank_post_feed
from job_queue import enqueue_job
from predict.feedback import FeedbackCollector
from predict.predictor import Predictor


logger = logging.getLogger("python-matrix")

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "******postgres:5432/wiseravenshare_db",
)
MAX_MATRIX_ROWS = 50
MAX_MATRIX_COLUMNS = 50
MAX_HISTORY_LIMIT = 50
MAX_LIVE_FEED_LIMIT = 100
MAX_TRAINING_SAMPLE_LIMIT = 5000
NURAVEN_CORP_LLM_SCORER_URL = os.environ.get("NURAVEN_CORP_LLM_SCORER_URL", "").strip()
RANKER_MODEL_TIMEOUT_SECONDS = float(os.environ.get("RANKER_MODEL_TIMEOUT_SECONDS", "1.5"))
MEDIA_RENDERER_TIMEOUT_SECONDS = float(os.environ.get("MEDIA_RENDERER_TIMEOUT_SECONDS", "12"))
MEDIA_RENDERER_MAX_BYTES = int(os.environ.get("MEDIA_RENDERER_MAX_BYTES", str(200 * 1024 * 1024)))
MEDIA_RENDERER_ORIGIN = os.environ.get("MEDIA_RENDERER_ORIGIN", "http://127.0.0.1:5242").strip().rstrip("/")
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0").strip()
PREDICTOR_ENABLED = os.environ.get("PREDICTOR_ENABLED", "false").strip().lower() in {"1", "true", "yes", "on"}
PREDICTOR_MODELS_DIR = os.environ.get("PREDICTOR_MODELS_DIR", "/var/lib/posting/models").strip()
QUEUE_TOPICS_ENABLED = os.environ.get("QUEUE_TOPICS_ENABLED", "false").strip().lower() in {"1", "true", "yes", "on"}
POST_FEED_TOPIC = os.environ.get("POST_FEED_TOPIC", "post.feed.ranked").strip()
LIVE_FEED_TOPIC = os.environ.get("LIVE_FEED_TOPIC", "live.feed.ranked").strip()
LIVE_TRAINING_TOPIC = os.environ.get("LIVE_TRAINING_TOPIC", "live.training.data").strip()
ENGAGEMENT_ACTION_TOPIC = os.environ.get("ENGAGEMENT_ACTION_TOPIC", "engagement.action").strip()
MEDIA_RENDERER_ALLOWED_HOSTS = {
    value.strip().lower()
    for value in os.environ.get(
        "MEDIA_RENDERER_ALLOWED_HOSTS",
        "127.0.0.1,localhost,134.199.224.48,cdn.wiseravenshare.com,nyc3.digitaloceanspaces.com,.digitaloceanspaces.com",
    ).split(",")
    if value.strip()
}

ACTION_WEIGHTS = {
    "post": 10,
    "repost": 8,
    "comment": 5,
    "like": 1,
    "dislike": -2,
}

FEED_WEIGHTS = {
    "like": 1.0,
    "comment": 5.0,
    "repost": 8.0,
    "share_link": 20.0,
    "dislike": -15.0,
    "report": -50.0,
    "mute": -30.0,
}

HASHTAG_WINDOW_SECONDS = 3600
HASHTAG_RECENCY_HALF_LIFE_MINUTES = 120
_redis_client: redis.Redis | None = None
_predictor_redis_client: aredis.Redis | None = None
_predictor: Predictor | None = None
_feedback_collector: FeedbackCollector | None = None
_feedback_sweeper_task: asyncio.Task | None = None


def get_connection() -> psycopg.Connection:
    return psycopg.connect(DATABASE_URL)


def get_redis_client() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
    return _redis_client


def _utc_date_key(epoch_seconds: float) -> str:
    return datetime.fromtimestamp(epoch_seconds, tz=timezone.utc).strftime("%Y-%m-%d")


def _normalize_hashtag(tag: str) -> str:
    value = (tag or "").strip()
    if value.startswith("#"):
        value = value[1:]
    return value.lower()


def _extract_hashtags(text: str) -> list[str]:
    return [match.group(1) for match in re.finditer(r"#(\w+)", text or "")]


def split_camel_hashtag(tag: str) -> str:
    token = (tag or "").lstrip("#")
    if not token:
        return ""
    return " ".join(part for part in re.split(r"(?=[A-Z])", token) if part)


def find_partial_hashtags(text: str, pattern: str) -> list[str]:
    normalized_pattern = (pattern or "").strip().lower()
    if not normalized_pattern:
        return []
    hashtags = _extract_hashtags(text)
    return [f"#{tag}" for tag in hashtags if normalized_pattern in tag.lower()]


def record_user_action(
    user_id: str,
    action: str,
    target_id: str | None = None,
    timestamp: float | None = None,
) -> None:
    action_key = (action or "").strip().lower()
    if action_key not in ACTION_WEIGHTS:
        raise ValueError(f"Unsupported action '{action}'.")

    now_ts = float(timestamp if timestamp is not None else datetime.now(timezone.utc).timestamp())
    day_key = _utc_date_key(now_ts)
    redis_client = get_redis_client()
    pipe = redis_client.pipeline()
    pipe.hincrby(f"user:{user_id}:metrics", action_key, 1)
    pipe.hincrby(f"user:{user_id}:daily:{day_key}", action_key, 1)
    pipe.zincrby("user:engagement:ranked", ACTION_WEIGHTS[action_key], user_id)
    if target_id:
        pipe.hincrby(f"post:{target_id}:metrics", action_key, 1)
        pipe.zincrby("post:engagement:ranked", ACTION_WEIGHTS[action_key], target_id)
    pipe.execute()


def record_partial_engagement(user_id: str, partial: str, target_id: str) -> None:
    normalized_partial = (partial or "").strip().lower()
    if not normalized_partial:
        raise ValueError("Partial pattern is required.")
    redis_client = get_redis_client()
    key = f"partial:{normalized_partial}"
    pipe = redis_client.pipeline()
    pipe.hincrby(f"user:{user_id}:partials", normalized_partial, 1)
    pipe.zincrby(f"{key}:ranked", 1, target_id)
    pipe.execute()


def record_hashtag_event(hashtag: str, user_id: str, timestamp: float | None = None) -> None:
    normalized_tag = _normalize_hashtag(hashtag)
    if not normalized_tag:
        raise ValueError("Hashtag is required.")
    now_ts = float(timestamp if timestamp is not None else datetime.now(timezone.utc).timestamp())
    cutoff = now_ts - HASHTAG_WINDOW_SECONDS
    redis_client = get_redis_client()
    events_key = f"hashtag:{normalized_tag}:events"
    meta_key = f"hashtag:{normalized_tag}:meta"
    event_member = f"{now_ts:.6f}|{user_id}|{uuid.uuid4().hex}"
    pipe = redis_client.pipeline()
    pipe.zadd(events_key, {event_member: now_ts})
    pipe.zremrangebyscore(events_key, "-inf", cutoff)
    pipe.hsetnx(meta_key, "first_seen", str(now_ts))
    pipe.execute()


def compute_trending_score(hashtag: str, now: float | None = None) -> float:
    normalized_tag = _normalize_hashtag(hashtag)
    if not normalized_tag:
        return 0.0

    now_ts = float(now if now is not None else datetime.now(timezone.utc).timestamp())
    cutoff = now_ts - HASHTAG_WINDOW_SECONDS
    redis_client = get_redis_client()
    events_key = f"hashtag:{normalized_tag}:events"
    meta_key = f"hashtag:{normalized_tag}:meta"

    events = redis_client.zrangebyscore(events_key, cutoff, "+inf", withscores=True)
    if len(events) < 3:
        return 0.0

    user_ids: set[str] = set()
    recent_count = 0
    midpoint = now_ts - (HASHTAG_WINDOW_SECONDS / 2)

    for member, event_ts in events:
        parts = str(member).split("|", 2)
        if len(parts) >= 2:
            user_ids.add(parts[1])
        if float(event_ts) > midpoint:
            recent_count += 1

    total_events = len(events)
    earlier_count = total_events - recent_count
    velocity = total_events / (HASHTAG_WINDOW_SECONDS / 60)
    acceleration = recent_count / max(earlier_count, 1)
    diversity = len(user_ids) / max(total_events, 1)

    first_seen_raw = redis_client.hget(meta_key, "first_seen")
    try:
        first_seen = float(first_seen_raw) if first_seen_raw else now_ts
    except ValueError:
        first_seen = now_ts
    age_minutes = max(0.0, (now_ts - first_seen) / 60)
    recency_factor = math.exp(-age_minutes / HASHTAG_RECENCY_HALF_LIFE_MINUTES)

    score = velocity * (1 + acceleration) * diversity * recency_factor
    return round(score, 4)


def score_post_for_user(post_metrics: dict[str, float], user_affinity: float = 1.0) -> float:
    base_score = sum(
        FEED_WEIGHTS.get(action, 0.0) * float(count)
        for action, count in post_metrics.items()
    )
    return round(base_score * float(user_affinity), 4)


def _dispatch_topic_job(topic: str, payload: dict[str, Any]) -> JSONResponse:
    started_at = time.perf_counter()
    result = enqueue_job(topic, payload)
    status_code = int(result.get("status_code", 200))
    body = result.get("body", {})
    if isinstance(body, dict):
        body.setdefault("topic", topic)
        body.setdefault("queued", True)
        body.setdefault("latency_ms", round((time.perf_counter() - started_at) * 1000, 2))
    return JSONResponse(status_code=status_code, content=body)


def ensure_history_table() -> None:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS matrix_history (
                    id BIGSERIAL PRIMARY KEY,
                    operation TEXT NOT NULL,
                    request_body TEXT NOT NULL,
                    result_body TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        connection.commit()


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
            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_live_rank_impressions_viewer_created
                ON live_rank_impressions (viewer_id, created_at DESC)
                """
            )
            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_live_rank_impressions_stream_created
                ON live_rank_impressions (stream_id, created_at DESC)
                """
            )
        connection.commit()


def record_history(operation: str, request_body: dict[str, Any], result_body: dict[str, Any]) -> None:
    ensure_history_table()
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO matrix_history (operation, request_body, result_body)
                VALUES (%s, %s, %s)
                """,
                (
                    operation,
                    json.dumps(request_body),
                    json.dumps(result_body),
                ),
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


def score_stream_with_nuraven_model(features: dict[str, float]) -> float | None:
    if not NURAVEN_CORP_LLM_SCORER_URL:
        return None

    payload = json.dumps({"features": features}).encode("utf-8")
    req = urllib_request.Request(
        NURAVEN_CORP_LLM_SCORER_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib_request.urlopen(req, timeout=RANKER_MODEL_TIMEOUT_SECONDS) as response:
            raw = response.read().decode("utf-8").strip()
    except (urllib_error.URLError, TimeoutError, ValueError) as error:
        logger.debug("NuRavenCorpLLM scorer unavailable; using heuristic fallback: %s", error)
        return None

    if not raw:
        return None

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        try:
            return float(raw)
        except ValueError:
            return None

    if isinstance(parsed, (float, int)):
        return float(parsed)
    if isinstance(parsed, dict):
        score = parsed.get("score")
        if isinstance(score, (float, int)):
            return float(score)
    return None


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


def _is_allowed_media_host(hostname: str) -> bool:
    normalized = (hostname or "").strip().lower()
    if not normalized:
        return False
    for candidate in MEDIA_RENDERER_ALLOWED_HOSTS:
        if normalized == candidate:
            return True
        if candidate.startswith(".") and normalized.endswith(candidate):
            return True
        if not candidate.startswith(".") and normalized.endswith("." + candidate):
            return True
    return False


def _resolve_media_source_url(source: str, fallback_origin: str) -> str:
    value = (source or "").strip()
    if not value:
        raise ValueError("Missing media source URL.")

    parsed = urllib_parse.urlparse(value)
    if parsed.scheme and parsed.netloc:
        if parsed.scheme.lower() not in {"http", "https"}:
            raise ValueError("Unsupported media source protocol.")
        if not _is_allowed_media_host(parsed.hostname or ""):
            raise ValueError("Media source host is not allowed.")
        return value

    if value.startswith("//"):
        raise ValueError("Protocol-relative URLs are not allowed.")
    if "\\" in value:
        raise ValueError("Invalid media source path.")
    if not value.startswith("/"):
        value = "/" + value
    if not value.startswith("/api/media/") and not value.startswith("/api/videostreaming/"):
        raise ValueError("Media source path is not allowed.")

    origin = (fallback_origin or "").strip().rstrip("/") or MEDIA_RENDERER_ORIGIN
    parsed_origin = urllib_parse.urlparse(origin)
    if parsed_origin.scheme.lower() not in {"http", "https"} or not parsed_origin.netloc:
        raise ValueError("Invalid media renderer origin.")
    if not _is_allowed_media_host(parsed_origin.hostname or ""):
        raise ValueError("Media renderer origin host is not allowed.")

    return f"{origin}{value}"


def validate_matrix(value: list[list[float]], name: str) -> list[list[float]]:
    if not value or not all(isinstance(row, list) and row for row in value):
        raise ValueError(f"{name} must be a non-empty 2D array.")

    if len(value) > MAX_MATRIX_ROWS:
        raise ValueError(f"{name} cannot contain more than {MAX_MATRIX_ROWS} rows.")

    column_count = len(value[0])
    if column_count > MAX_MATRIX_COLUMNS:
        raise ValueError(f"{name} cannot contain more than {MAX_MATRIX_COLUMNS} columns.")

    if any(len(row) != column_count for row in value):
        raise ValueError(f"{name} rows must all have the same length.")

    normalized: list[list[float]] = []
    for row_index, row in enumerate(value, start=1):
        normalized_row: list[float] = []
        for column_index, item in enumerate(row, start=1):
            number = float(item)
            if not math.isfinite(number):
                raise ValueError(
                    f"{name}[{row_index - 1}][{column_index - 1}] must be a finite number."
                )
            normalized_row.append(number)
        normalized.append(normalized_row)

    return normalized


class TransposeRequest(BaseModel):
    matrix: list[list[float]]

    @field_validator("matrix")
    @classmethod
    def validate_matrix_field(cls, value: list[list[float]]) -> list[list[float]]:
        return validate_matrix(value, "matrix")


class MultiplyRequest(BaseModel):
    left: list[list[float]]
    right: list[list[float]]

    @field_validator("left")
    @classmethod
    def validate_left(cls, value: list[list[float]]) -> list[list[float]]:
        return validate_matrix(value, "left")

    @field_validator("right")
    @classmethod
    def validate_right(cls, value: list[list[float]]) -> list[list[float]]:
        return validate_matrix(value, "right")


class EngagementActionRequest(BaseModel):
    user_id: str
    action: str
    target_id: str | None = None
    target_author_id: str | None = None
    hashtags: list[str] = Field(default_factory=list)
    text: str | None = None
    timestamp: float | None = None


class HashtagEventRequest(BaseModel):
    hashtag: str
    user_id: str
    timestamp: float | None = None


class PartialEngagementRequest(BaseModel):
    user_id: str
    partial: str
    target_id: str


class PartialSearchRequest(BaseModel):
    text: str
    pattern: str


class PostScoreRequest(BaseModel):
    post_metrics: dict[str, float]
    user_affinity: float = 1.0


class QueueJobRequest(BaseModel):
    payload: dict[str, Any] = Field(default_factory=dict)


class PredictEngagementRequest(BaseModel):
    user_id: str
    post_author_id: str
    post_tags: list[str] = Field(default_factory=list)


class LearnEngagementRequest(BaseModel):
    user_id: str
    post_author_id: str
    post_tags: list[str] = Field(default_factory=list)
    interacted: bool
    sample_weight: float = 1.0


class LearnChurnRequest(BaseModel):
    user_id: str
    churned: bool
    sample_weight: float = 1.0


class PredictModerationRiskRequest(BaseModel):
    user_id: str
    content: str


class LearnModerationRequest(BaseModel):
    user_id: str
    content: str
    violated: bool
    sample_weight: float = 1.0


class RecordImpressionRequest(BaseModel):
    user_id: str
    post_id: str
    post_author_id: str
    post_tags: list[str] = Field(default_factory=list)
    predicted_probability: float


class MarkEngagedRequest(BaseModel):
    user_id: str
    post_id: str


from ravensight.store import RavensightStore, ensure_ravensight_schema
from ravensight.engine import RavensightEngine
from ravensight.router import router as ravensight_router
from ravensight.state import _rv_state

RAVENSIGHT_ENABLED = os.environ.get("RAVENSIGHT_ENABLED", "true").strip().lower() in {"1", "true", "yes", "on"}
from chat.ws import ConnectionManager as ChatConnectionManager
from chat.notifications import ChatNotificationService
from chat.engine import ChatEngine
from chat.bridge import PostChatBridge
from chat.router import router as chat_router
from chat.state import _chat_state

CHAT_ENABLED = os.environ.get("CHAT_ENABLED", "true").strip().lower() in {"1", "true", "yes", "on"}

_asyncpg_pool: asyncpg.Pool | None = None
_chat_ws: ChatConnectionManager | None = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    global _predictor_redis_client
    global _predictor
    global _feedback_collector
    global _feedback_sweeper_task
    global _asyncpg_pool
    global _chat_ws
    try:
        ensure_history_table()
        ensure_live_rank_impressions_table()
        logger.info("matrix_history table is ready.")
    except psycopg.Error as error:
        logger.warning("Database not ready during startup: %s", error)
    if PREDICTOR_ENABLED:
        try:
            _predictor_redis_client = aredis.Redis.from_url(REDIS_URL, decode_responses=True)
            _predictor = Predictor(_predictor_redis_client, PREDICTOR_MODELS_DIR)
            _feedback_collector = FeedbackCollector(_predictor, _predictor_redis_client)
            _feedback_sweeper_task = asyncio.create_task(_feedback_collector.sweep_loop())
            logger.info("Predictor initialized.")
        except Exception as error:  # noqa: BLE001
            logger.warning("Predictor startup failed: %s", error)
            _predictor_redis_client = None
            _predictor = None
            _feedback_collector = None
            _feedback_sweeper_task = None

    # ── Chat layer startup ────────────────────────────────────────────────
    if CHAT_ENABLED:
        try:
            _asyncpg_pool = await asyncpg.create_pool(
                dsn=DATABASE_URL,
                min_size=2,
                max_size=10,
                command_timeout=10,
            )
            await ensure_chat_schema(_asyncpg_pool)
            _chat_redis = aredis.Redis.from_url(REDIS_URL, decode_responses=True)
            _chat_ws = ChatConnectionManager(_chat_redis)
            await _chat_ws.start()
            _chat_store = ChatStore(_asyncpg_pool)
            _chat_notifier = ChatNotificationService(_chat_redis)
            _chat_engine = ChatEngine(_chat_store, _chat_ws, _chat_notifier, _chat_redis)
            _chat_bridge = PostChatBridge(_chat_engine, _chat_redis)
            _chat_state.update({
                "chat": _chat_engine,
                "bridge": _chat_bridge,
                "notifier": _chat_notifier,
                "ws": _chat_ws,
            })
            logger.info("Chat layer initialized.")
        except Exception as error:  # noqa: BLE001
            logger.warning("Chat startup failed (service will run without chat): %s", error)

    # ── Ravensight production session engine ──────────────────────────────
    if RAVENSIGHT_ENABLED:
        try:
            # Reuse the asyncpg pool (created by chat layer if chat enabled)
            if _asyncpg_pool is None:
                _asyncpg_pool = await asyncpg.create_pool(
                    dsn=DATABASE_URL, min_size=2, max_size=10, command_timeout=10,
                )
            await ensure_ravensight_schema(_asyncpg_pool)
            _rv_redis = aredis.Redis.from_url(REDIS_URL, decode_responses=True)
            # Reuse the chat WS manager when available; otherwise create one
            _rv_ws = _chat_ws if CHAT_ENABLED and _chat_ws else None
            if _rv_ws is None:
                from chat.ws import ConnectionManager as _CM
                _rv_ws = _CM(_rv_redis)
                await _rv_ws.start()
            _rv_store  = RavensightStore(_asyncpg_pool)
            _rv_engine = RavensightEngine(_rv_store, _rv_ws, _rv_redis)
            _rv_state.update({"engine": _rv_engine, "ws": _rv_ws})
            logger.info("Ravensight session engine initialized.")
        except Exception as error:  # noqa: BLE001
            logger.warning("Ravensight startup failed (running without it): %s", error)

    yield

    # ── shutdown ──────────────────────────────────────────────────────────
    if _feedback_collector is not None:
        _feedback_collector.stop()
    if _feedback_sweeper_task is not None:
        _feedback_sweeper_task.cancel()
        try:
            await _feedback_sweeper_task
        except asyncio.CancelledError:
            pass
    if _predictor is not None:
        _predictor.save_models()
    if _predictor_redis_client is not None:
        await _predictor_redis_client.close()
    _feedback_sweeper_task = None
    _feedback_collector = None
    _predictor = None
    _predictor_redis_client = None

    if _chat_ws is not None:
        await _chat_ws.stop()
    if _asyncpg_pool is not None:
        await _asyncpg_pool.close()
    _chat_state.clear()
    _rv_state.clear()


app = FastAPI(title="Python Matrix Service", lifespan=lifespan)

if CHAT_ENABLED:
    app.include_router(chat_router)

if RAVENSIGHT_ENABLED:
    app.include_router(ravensight_router)


def _get_predictor() -> Predictor | None:
    return _predictor if PREDICTOR_ENABLED else None


def _get_feedback_collector() -> FeedbackCollector | None:
    return _feedback_collector if PREDICTOR_ENABLED else None


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    messages = []
    for error in exc.errors():
        location = ".".join(str(part) for part in error.get("loc", []) if part != "body")
        message = error.get("msg", "Invalid request.")
        messages.append(f"{location}: {message}" if location else message)

    return JSONResponse(
        status_code=400,
        content={"message": "; ".join(messages) or "Invalid request."},
    )


@app.get("/")
@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "python-matrix",
        "framework": "fastapi",
    }


@app.get("/health/db")
def database_health():
    try:
        ensure_history_table()
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
    except psycopg.Error as error:
        return JSONResponse(
            status_code=503,
            content={
                "status": "error",
                "database": "postgres",
                "error": str(error),
            },
        )

    return {
        "status": "ok",
        "database": "postgres",
    }


@app.post("/queue/jobs/{topic}")
def queue_job(topic: str, payload: QueueJobRequest) -> JSONResponse:
    if not QUEUE_TOPICS_ENABLED:
        return JSONResponse(
            status_code=409,
            content={"message": "Queue topics are disabled on this instance."},
        )
    normalized_topic = (topic or "").strip()
    if not normalized_topic:
        return JSONResponse(status_code=400, content={"message": "topic is required."})
    try:
        return _dispatch_topic_job(normalized_topic, payload.payload)
    except TimeoutError as error:
        return JSONResponse(status_code=504, content={"message": str(error)})
    except Exception as error:  # noqa: BLE001
        return JSONResponse(status_code=503, content={"message": "Queue dispatch failed.", "error": str(error)})


@app.get("/media/render")
def render_media_backup(request: Request, source: str = Query(..., min_length=1)):
    forwarded_origin = (request.headers.get("x-forward-origin") or "").strip()
    try:
        source_url = _resolve_media_source_url(source, forwarded_origin)
    except ValueError as error:
        return JSONResponse(status_code=400, content={"message": str(error)})

    upstream_headers = {
        "Accept": "*/*",
        "User-Agent": "wiseravenshare-python-renderer/1.0",
    }
    if source_url.startswith(MEDIA_RENDERER_ORIGIN):
        forwarded_auth = (request.headers.get("x-forward-auth") or "").strip()
        if forwarded_auth:
            upstream_headers["Authorization"] = forwarded_auth
        forwarded_cookie = (request.headers.get("x-forward-cookie") or "").strip()
        if forwarded_cookie:
            upstream_headers["Cookie"] = forwarded_cookie

    req = urllib_request.Request(source_url, method="GET", headers=upstream_headers)

    try:
        with urllib_request.urlopen(req, timeout=MEDIA_RENDERER_TIMEOUT_SECONDS) as upstream:
            content_type = upstream.headers.get("Content-Type", "application/octet-stream")
            data = upstream.read(MEDIA_RENDERER_MAX_BYTES + 1)
            if len(data) > MEDIA_RENDERER_MAX_BYTES:
                return JSONResponse(
                    status_code=413,
                    content={"message": "Media source exceeds renderer size limit."},
                )
            return Response(content=data, media_type=content_type)
    except urllib_error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="ignore") if hasattr(error, "read") else str(error)
        return JSONResponse(
            status_code=502,
            content={
                "message": "Backup media renderer upstream request failed.",
                "status": getattr(error, "code", None),
                "detail": detail[:1000],
            },
        )
    except urllib_error.URLError as error:
        return JSONResponse(
            status_code=503,
            content={"message": "Backup media renderer cannot reach source.", "detail": str(error)},
        )


@app.get("/matrix/history")
def history(limit: int = Query(default=10, ge=1, le=MAX_HISTORY_LIMIT)) -> dict[str, list[dict[str, Any]]]:
    try:
        ensure_history_table()
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT id, operation, request_body, result_body, created_at
                    FROM matrix_history
                    ORDER BY id DESC
                    LIMIT %s
                    """,
                    (limit,),
                )
                rows = cursor.fetchall()
    except psycopg.Error as error:
        return JSONResponse(
            status_code=503,
            content={"message": "Matrix history database is unavailable.", "error": str(error)},
        )

    items = [
        {
            "id": row[0],
            "operation": row[1],
            "request": json.loads(row[2]),
            "result": json.loads(row[3]),
            "created_at": row[4].isoformat(),
        }
        for row in rows
    ]

    return {"items": items}


@app.post("/matrix/transpose")
def transpose(payload: TransposeRequest) -> dict[str, list[list[float]]]:
    matrix = payload.matrix
    transposed = [list(row) for row in zip(*matrix)]
    result = {"matrix": transposed}

    try:
        record_history("transpose", payload.model_dump(), result)
    except psycopg.Error as error:
        return JSONResponse(
            status_code=503,
            content={"message": "Matrix history database is unavailable.", "error": str(error)},
        )

    return result


@app.post("/matrix/multiply")
def multiply(payload: MultiplyRequest) -> dict[str, list[list[float]]]:
    if len(payload.left[0]) != len(payload.right):
        return JSONResponse(
            status_code=400,
            content={"message": "left column count must match right row count."},
        )

    result: list[list[float]] = []
    for left_row in payload.left:
        result_row: list[float] = []
        for column_index in range(len(payload.right[0])):
            total = 0.0
            for inner_index in range(len(payload.right)):
                total += left_row[inner_index] * payload.right[inner_index][column_index]
            result_row.append(total)
        result.append(result_row)

    response = {"matrix": result}

    try:
        record_history("multiply", payload.model_dump(), response)
    except psycopg.Error as error:
        return JSONResponse(
            status_code=503,
            content={"message": "Matrix history database is unavailable.", "error": str(error)},
        )

    return response


@app.post("/engagement/action")
async def engagement_action(payload: EngagementActionRequest) -> dict[str, Any]:
    if QUEUE_TOPICS_ENABLED:
        try:
            return _dispatch_topic_job(ENGAGEMENT_ACTION_TOPIC, payload.model_dump())
        except TimeoutError as error:
            return JSONResponse(status_code=504, content={"message": str(error)})
        except Exception as error:  # noqa: BLE001
            return JSONResponse(status_code=503, content={"message": "Queue dispatch failed.", "error": str(error)})

    user_id = payload.user_id.strip()
    if not user_id:
        return JSONResponse(status_code=400, content={"message": "user_id is required."})

    action = payload.action.strip().lower()
    if action not in ACTION_WEIGHTS:
        return JSONResponse(
            status_code=400,
            content={
                "message": f"Unsupported action '{payload.action}'.",
                "supported_actions": sorted(ACTION_WEIGHTS.keys()),
            },
        )

    try:
        record_user_action(
            user_id=user_id,
            action=action,
            target_id=(payload.target_id or "").strip() or None,
            timestamp=payload.timestamp,
        )
        hashtags = {_normalize_hashtag(tag) for tag in payload.hashtags if _normalize_hashtag(tag)}
        if payload.text:
            hashtags.update(_normalize_hashtag(tag) for tag in _extract_hashtags(payload.text))
        for hashtag in hashtags:
            if hashtag:
                record_hashtag_event(hashtag, user_id, payload.timestamp)

        predictor = _get_predictor()
        if predictor is not None:
            try:
                if action == "post":
                    await predictor.features.update_on_post(user_id)
                elif action in {"like", "comment", "repost", "affirm"}:
                    await predictor.features.update_on_interaction(
                        user_id=user_id,
                        interaction_type=action,
                        target_author=(payload.target_author_id or "").strip() or None,
                        target_tags=sorted(hashtags),
                    )
            except Exception as error:  # noqa: BLE001
                logger.warning("Predictor feature update skipped for user %s action %s: %s", user_id, action, error)
    except redis.RedisError as error:
        return JSONResponse(
            status_code=503,
            content={"message": "Engagement counters are unavailable.", "error": str(error)},
        )

    return {"status": "ok", "user_id": user_id, "action": action}


@app.get("/engagement/users/{user_id}/metrics")
def engagement_user_metrics(
    user_id: str,
    day: str | None = Query(default=None),
) -> dict[str, Any]:
    normalized_user_id = user_id.strip()
    if not normalized_user_id:
        return JSONResponse(status_code=400, content={"message": "user_id is required."})

    try:
        redis_client = get_redis_client()
        total = redis_client.hgetall(f"user:{normalized_user_id}:metrics")
        response: dict[str, Any] = {"user_id": normalized_user_id, "total": total}
        if day:
            response["daily"] = redis_client.hgetall(f"user:{normalized_user_id}:daily:{day}")
        return response
    except redis.RedisError as error:
        return JSONResponse(
            status_code=503,
            content={"message": "Engagement counters are unavailable.", "error": str(error)},
        )


@app.get("/engagement/rank/users")
def engagement_user_rank(limit: int = Query(default=20, ge=1, le=500)) -> dict[str, Any]:
    try:
        redis_client = get_redis_client()
        ranked = redis_client.zrevrange("user:engagement:ranked", 0, limit - 1, withscores=True)
    except redis.RedisError as error:
        return JSONResponse(
            status_code=503,
            content={"message": "User engagement ranking is unavailable.", "error": str(error)},
        )

    return {
        "items": [{"user_id": user_id, "score": score} for user_id, score in ranked],
        "count": len(ranked),
    }


@app.get("/engagement/rank/posts")
def engagement_post_rank(limit: int = Query(default=20, ge=1, le=500)) -> dict[str, Any]:
    try:
        redis_client = get_redis_client()
        ranked = redis_client.zrevrange("post:engagement:ranked", 0, limit - 1, withscores=True)
    except redis.RedisError as error:
        return JSONResponse(
            status_code=503,
            content={"message": "Post engagement ranking is unavailable.", "error": str(error)},
        )

    return {
        "items": [{"post_id": post_id, "score": score} for post_id, score in ranked],
        "count": len(ranked),
    }


@app.post("/engagement/hashtags/event")
def engagement_hashtag_event(payload: HashtagEventRequest) -> dict[str, Any]:
    normalized_user_id = payload.user_id.strip()
    if not normalized_user_id:
        return JSONResponse(status_code=400, content={"message": "user_id is required."})
    normalized_hashtag = _normalize_hashtag(payload.hashtag)
    if not normalized_hashtag:
        return JSONResponse(status_code=400, content={"message": "hashtag is required."})

    try:
        record_hashtag_event(normalized_hashtag, normalized_user_id, payload.timestamp)
        score = compute_trending_score(normalized_hashtag)
    except redis.RedisError as error:
        return JSONResponse(
            status_code=503,
            content={"message": "Hashtag trend counters are unavailable.", "error": str(error)},
        )

    return {"hashtag": f"#{normalized_hashtag}", "trending_score": score}


@app.get("/engagement/hashtags/{hashtag}/score")
def engagement_hashtag_score(hashtag: str) -> dict[str, Any]:
    normalized_hashtag = _normalize_hashtag(hashtag)
    if not normalized_hashtag:
        return JSONResponse(status_code=400, content={"message": "hashtag is required."})

    try:
        redis_client = get_redis_client()
        now_ts = datetime.now(timezone.utc).timestamp()
        cutoff = now_ts - HASHTAG_WINDOW_SECONDS
        events = redis_client.zrangebyscore(
            f"hashtag:{normalized_hashtag}:events",
            cutoff,
            "+inf",
        )
        unique_users = {
            part[1]
            for part in (str(member).split("|", 2) for member in events)
            if len(part) >= 2
        }
        score = compute_trending_score(normalized_hashtag, now_ts)
    except redis.RedisError as error:
        return JSONResponse(
            status_code=503,
            content={"message": "Hashtag trend counters are unavailable.", "error": str(error)},
        )

    return {
        "hashtag": f"#{normalized_hashtag}",
        "window_seconds": HASHTAG_WINDOW_SECONDS,
        "post_count": len(events),
        "unique_users": len(unique_users),
        "trending_score": score,
    }


@app.post("/engagement/partials/find")
def engagement_partials_find(payload: PartialSearchRequest) -> dict[str, Any]:
    matches = find_partial_hashtags(payload.text, payload.pattern)
    return {
        "pattern": payload.pattern,
        "matches": matches,
        "normalized_terms": [split_camel_hashtag(match) for match in matches],
    }


@app.post("/engagement/partials/track")
def engagement_partials_track(payload: PartialEngagementRequest) -> dict[str, Any]:
    user_id = payload.user_id.strip()
    target_id = payload.target_id.strip()
    if not user_id or not target_id:
        return JSONResponse(status_code=400, content={"message": "user_id and target_id are required."})

    try:
        record_partial_engagement(user_id, payload.partial, target_id)
    except ValueError as error:
        return JSONResponse(status_code=400, content={"message": str(error)})
    except redis.RedisError as error:
        return JSONResponse(
            status_code=503,
            content={"message": "Partial engagement counters are unavailable.", "error": str(error)},
        )

    return {"status": "ok", "user_id": user_id, "partial": payload.partial.lower(), "target_id": target_id}


@app.post("/engagement/posts/score")
def engagement_post_score(payload: PostScoreRequest) -> dict[str, Any]:
    score = score_post_for_user(payload.post_metrics, payload.user_affinity)
    return {"score": score, "user_affinity": payload.user_affinity}


@app.get("/predict/health")
def predict_health() -> dict[str, Any]:
    predictor = _get_predictor()
    if predictor is None:
        return {"enabled": False}
    return {"enabled": True, **predictor.model_status()}


@app.post("/predict/engagement/probability")
async def predict_engagement_probability(payload: PredictEngagementRequest) -> dict[str, Any]:
    predictor = _get_predictor()
    if predictor is None:
        return JSONResponse(status_code=409, content={"message": "Predictor is disabled."})
    probability = await predictor.engagement_probability(payload.user_id, payload.post_author_id, payload.post_tags)
    return {"probability": probability}


@app.post("/predict/engagement/learn")
async def predict_learn_engagement(payload: LearnEngagementRequest) -> dict[str, Any]:
    predictor = _get_predictor()
    if predictor is None:
        return JSONResponse(status_code=409, content={"message": "Predictor is disabled."})
    loss = await predictor.learn_engagement(
        user_id=payload.user_id,
        post_author=payload.post_author_id,
        post_tags=payload.post_tags,
        interacted=payload.interacted,
        sample_weight=payload.sample_weight,
    )
    return {"status": "ok", "loss": loss}


@app.get("/predict/churn/{user_id}")
async def predict_churn_probability(user_id: str) -> dict[str, Any]:
    predictor = _get_predictor()
    if predictor is None:
        return JSONResponse(status_code=409, content={"message": "Predictor is disabled."})
    return {"churn_probability": await predictor.churn_probability(user_id)}


@app.post("/predict/churn/learn")
async def predict_learn_churn(payload: LearnChurnRequest) -> dict[str, Any]:
    predictor = _get_predictor()
    if predictor is None:
        return JSONResponse(status_code=409, content={"message": "Predictor is disabled."})
    loss = await predictor.learn_churn(payload.user_id, payload.churned, sample_weight=payload.sample_weight)
    return {"status": "ok", "loss": loss}


@app.post("/predict/moderation/risk")
async def predict_moderation_risk(payload: PredictModerationRiskRequest) -> dict[str, Any]:
    predictor = _get_predictor()
    if predictor is None:
        return JSONResponse(status_code=409, content={"message": "Predictor is disabled."})
    risk = await predictor.moderation_risk(payload.user_id, payload.content)
    return {"moderation_risk": risk}


@app.post("/predict/moderation/learn")
async def predict_learn_moderation(payload: LearnModerationRequest) -> dict[str, Any]:
    predictor = _get_predictor()
    if predictor is None:
        return JSONResponse(status_code=409, content={"message": "Predictor is disabled."})
    loss = await predictor.learn_moderation(
        user_id=payload.user_id,
        content=payload.content,
        violated=payload.violated,
        sample_weight=payload.sample_weight,
    )
    return {"status": "ok", "loss": loss}


@app.post("/predict/impressions/record")
async def predict_record_impression(payload: RecordImpressionRequest) -> dict[str, Any]:
    collector = _get_feedback_collector()
    if collector is None:
        return JSONResponse(status_code=409, content={"message": "Predictor is disabled."})
    await collector.record_impression(
        user_id=payload.user_id,
        post_id=payload.post_id,
        post_author=payload.post_author_id,
        post_tags=payload.post_tags,
        predicted_probability=payload.predicted_probability,
    )
    return {"status": "ok"}


@app.post("/predict/impressions/engaged")
async def predict_mark_impression_engaged(payload: MarkEngagedRequest) -> dict[str, Any]:
    collector = _get_feedback_collector()
    if collector is None:
        return JSONResponse(status_code=409, content={"message": "Predictor is disabled."})
    await collector.mark_engaged(payload.user_id, payload.post_id)
    learned = await collector.flush_positive(payload.user_id, payload.post_id)
    return {"status": "ok", "learned": learned}


@app.post("/predict/impressions/{user_id}/flush-negatives")
async def predict_flush_negative_impressions(user_id: str) -> dict[str, Any]:
    collector = _get_feedback_collector()
    if collector is None:
        return JSONResponse(status_code=409, content={"message": "Predictor is disabled."})
    flushed = await collector.flush_negatives_for_user(user_id)
    return {"status": "ok", "flushed": flushed}


@app.post("/predict/explain/engagement")
async def predict_explain_engagement(payload: PredictEngagementRequest) -> dict[str, Any]:
    predictor = _get_predictor()
    if predictor is None:
        return JSONResponse(status_code=409, content={"message": "Predictor is disabled."})
    return await predictor.explain_engagement(
        user_id=payload.user_id,
        post_author=payload.post_author_id,
        post_tags=payload.post_tags,
    )


@app.get("/post/feed/ranked")
async def post_feed_ranked(
    viewer_id: str = Query(..., min_length=1),
    page_size: int = Query(40, ge=1, le=100),
    window_days: int = Query(30, ge=1, le=90),
) -> dict[str, Any]:
    """
    Ranked post feed using the 5-trigger, 4-prediction, debias+diversity pipeline.
    Intended to replace / augment PostRepository.GetFeedAsync for authenticated users.
    Returns post IDs and scores; the .NET layer fetches full Post DTOs by ID.
    """
    if QUEUE_TOPICS_ENABLED:
        try:
            return _dispatch_topic_job(
                POST_FEED_TOPIC,
                {
                    "viewer_id": viewer_id,
                    "page_size": page_size,
                    "window_days": window_days,
                },
            )
        except TimeoutError as error:
            return JSONResponse(status_code=504, content={"message": str(error)})
        except Exception as error:  # noqa: BLE001
            return JSONResponse(status_code=503, content={"message": "Queue dispatch failed.", "error": str(error)})

    try:
        with get_connection() as conn:
            posts = rank_post_feed(
                conn,
                viewer_id=viewer_id,
                page_size=page_size,
                candidate_window_days=window_days,
            )
    except psycopg.Error as error:
        logger.warning("Post feed ranking DB error: %s", error)
        return JSONResponse(
            status_code=503,
            content={"message": "Post feed ranking is unavailable.", "error": str(error)},
        )
    except Exception as error:  # noqa: BLE001
        logger.warning("Post feed ranking failed: %s", error)
        return JSONResponse(
            status_code=500,
            content={"message": "Post feed ranking failed.", "error": str(error)},
        )

    # Optional FTRL engagement blend — only when predictor is enabled AND has
    # seen enough examples to be meaningful (avoids flat 0.5 contamination).
    predictor = _get_predictor()
    ftrl_blended = False
    if predictor is not None and posts and predictor.example_counts.get("engagement", 0) >= predictor.MIN_EXAMPLES_FOR_CONFIDENCE:
        try:
            # Normalise resurfacing scores to [0, 1]
            max_score = max((p["resurfacing_score"] for p in posts), default=1.0) or 1.0
            blended: list[dict[str, Any]] = []
            for post in posts:
                p_engage = await predictor.engagement_probability(
                    user_id=viewer_id,
                    post_author=str(post.get("user_id", "")),
                    post_tags=list(post.get("features", {}).get("hashtags", [])),
                )
                norm_resurface = post["resurfacing_score"] / max_score
                final_score = round(0.7 * p_engage + 0.3 * norm_resurface, 6)
                blended.append({**post, "final_score": final_score, "ftrl_engagement": p_engage})
            blended.sort(key=lambda p: p["final_score"], reverse=True)
            posts = blended
            ftrl_blended = True
        except Exception as error:  # noqa: BLE001
            logger.warning("FTRL blend failed for viewer %s, using base ranking: %s", viewer_id, error)

    return {"posts": posts, "count": len(posts), "viewer_id": viewer_id, "ftrl_blended": ftrl_blended}


@app.get("/live/feed")
async def live_feed(
    viewer_id: str = Query(..., min_length=1),
    limit: int = Query(50, ge=1, le=MAX_LIVE_FEED_LIMIT),
) -> dict[str, Any]:
    if QUEUE_TOPICS_ENABLED:
        try:
            return _dispatch_topic_job(
                LIVE_FEED_TOPIC,
                {
                    "viewer_id": viewer_id,
                    "limit": limit,
                },
            )
        except TimeoutError as error:
            return JSONResponse(status_code=504, content={"message": str(error)})
        except Exception as error:  # noqa: BLE001
            return JSONResponse(status_code=503, content={"message": "Queue dispatch failed.", "error": str(error)})

    try:
        predictor = score_stream_with_nuraven_model if NURAVEN_CORP_LLM_SCORER_URL else None
        streams = await rank_live_feed(DATABASE_URL, viewer_id, limit, predictor)
        try:
            record_live_rank_impressions(viewer_id, streams)
        except psycopg.Error as error:
            logger.warning("Failed to persist live rank impressions: %s", error)
    except Exception as error:
        logger.warning("Live feed ranking request failed: %s", error)
        return JSONResponse(
            status_code=503,
            content={"message": "Live feed ranking is unavailable.", "error": str(error)},
        )

    return {"streams": streams, "count": len(streams)}


@app.get("/live/training-data")
def live_training_data(
    limit: int = Query(500, ge=1, le=MAX_TRAINING_SAMPLE_LIMIT),
) -> dict[str, Any]:
    if QUEUE_TOPICS_ENABLED:
        try:
            return _dispatch_topic_job(
                LIVE_TRAINING_TOPIC,
                {
                    "limit": limit,
                },
            )
        except TimeoutError as error:
            return JSONResponse(status_code=504, content={"message": str(error)})
        except Exception as error:  # noqa: BLE001
            return JSONResponse(status_code=503, content={"message": "Queue dispatch failed.", "error": str(error)})

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
    except psycopg.Error as error:
        return JSONResponse(
            status_code=503,
            content={"message": "Training data is unavailable.", "error": str(error)},
        )

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

    return {"samples": samples, "count": len(samples)}
