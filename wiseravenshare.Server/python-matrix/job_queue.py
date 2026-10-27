import json
import os
import time
import uuid
from typing import Any

import redis

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0").strip()
JOB_RESULT_TTL_SECONDS = int(os.environ.get("JOB_RESULT_TTL_SECONDS", "300"))
JOB_TIMEOUT_SECONDS = float(os.environ.get("JOB_TIMEOUT_SECONDS", "25"))

_redis_client: redis.Redis | None = None


def get_redis_client() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
    return _redis_client


def stream_name(topic: str) -> str:
    return f"queue:{topic.strip()}"


def result_key(job_id: str) -> str:
    return f"queue:result:{job_id}"


def enqueue_job(topic: str, payload: dict[str, Any], timeout_seconds: float | None = None) -> dict[str, Any]:
    if not topic or not topic.strip():
        raise ValueError("Queue topic is required.")

    redis_client = get_redis_client()
    job_id = uuid.uuid4().hex
    redis_client.xadd(
        stream_name(topic),
        {
            "job_id": job_id,
            "payload": json.dumps(payload, separators=(",", ":")),
            "created_at": str(time.time()),
        },
    )

    deadline = time.time() + (timeout_seconds if timeout_seconds is not None else JOB_TIMEOUT_SECONDS)
    key = result_key(job_id)

    while time.time() < deadline:
        raw = redis_client.get(key)
        if raw:
            redis_client.delete(key)
            return json.loads(raw)
        time.sleep(0.05)

    raise TimeoutError(f"Timed out waiting for queue topic '{topic}' result.")
