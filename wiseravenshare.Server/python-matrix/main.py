import json
import logging
import math
import os
from contextlib import asynccontextmanager
from typing import Any

import psycopg
from fastapi import FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator


logger = logging.getLogger("python-matrix")

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "******postgres:5432/wiseravenshare_db",
)
MAX_MATRIX_ROWS = 50
MAX_MATRIX_COLUMNS = 50
MAX_HISTORY_LIMIT = 50


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
