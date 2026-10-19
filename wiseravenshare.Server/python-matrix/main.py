import json
import logging
import math
import os
from contextlib import asynccontextmanager
from typing import Any
from urllib import error as urllib_error
from urllib import request as urllib_request

import psycopg
from fastapi import FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator
from live_ranker import rank_live_feed


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


def get_connection() -> psycopg.Connection:
    return psycopg.connect(DATABASE_URL)


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


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        ensure_history_table()
        ensure_live_rank_impressions_table()
        logger.info("matrix_history table is ready.")
    except psycopg.Error as error:
        logger.warning("Database not ready during startup: %s", error)
    yield


app = FastAPI(title="Python Matrix Service", lifespan=lifespan)


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


@app.get("/live/feed")
async def live_feed(
    viewer_id: str = Query(..., min_length=1),
    limit: int = Query(50, ge=1, le=MAX_LIVE_FEED_LIMIT),
) -> dict[str, Any]:
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
