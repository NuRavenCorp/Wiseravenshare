import json
import logging
import os
import time
import traceback
from typing import Any

from job_handlers import HANDLERS
from job_queue import get_redis_client, result_key, stream_name

logger = logging.getLogger("python-job-worker")
logging.basicConfig(level=os.environ.get("WORKER_LOG_LEVEL", "INFO"))

JOB_TOPIC = os.environ.get("JOB_TOPIC", "").strip()
HANDLER_NAME = os.environ.get("HANDLER_NAME", "").strip()
CONSUMER_GROUP = os.environ.get("JOB_CONSUMER_GROUP", "python-workers").strip()
CONSUMER_NAME = os.environ.get("JOB_CONSUMER_NAME", f"worker-{os.getpid()}").strip()
RESULT_TTL_SECONDS = int(os.environ.get("JOB_RESULT_TTL_SECONDS", "300"))


def _ensure_group(redis_client, queue_stream: str) -> None:
    try:
        redis_client.xgroup_create(queue_stream, CONSUMER_GROUP, id="0", mkstream=True)
        logger.info("Created consumer group '%s' for %s", CONSUMER_GROUP, queue_stream)
    except Exception as error:  # noqa: BLE001
        if "BUSYGROUP" not in str(error):
            raise


def _store_result(redis_client, job_id: str, payload: dict[str, Any]) -> None:
    redis_client.setex(result_key(job_id), RESULT_TTL_SECONDS, json.dumps(payload, separators=(",", ":")))


def run() -> None:
    if not JOB_TOPIC:
        raise RuntimeError("JOB_TOPIC is required.")
    if not HANDLER_NAME:
        raise RuntimeError("HANDLER_NAME is required.")
    if HANDLER_NAME not in HANDLERS:
        raise RuntimeError(f"Unknown HANDLER_NAME '{HANDLER_NAME}'.")

    handler = HANDLERS[HANDLER_NAME]
    redis_client = get_redis_client()
    queue_stream = stream_name(JOB_TOPIC)
    _ensure_group(redis_client, queue_stream)

    logger.info(
        "Worker started. topic=%s stream=%s group=%s consumer=%s handler=%s",
        JOB_TOPIC,
        queue_stream,
        CONSUMER_GROUP,
        CONSUMER_NAME,
        HANDLER_NAME,
    )

    while True:
        messages = redis_client.xreadgroup(
            CONSUMER_GROUP,
            CONSUMER_NAME,
            {queue_stream: ">"},
            count=10,
            block=5000,
        )

        if not messages:
            continue

        for _, entries in messages:
            for message_id, fields in entries:
                job_id = str(fields.get("job_id", "")).strip()
                raw_payload = str(fields.get("payload", "{}"))
                if not job_id:
                    redis_client.xack(queue_stream, CONSUMER_GROUP, message_id)
                    continue

                try:
                    payload = json.loads(raw_payload)
                except json.JSONDecodeError:
                    payload = {}

                try:
                    response = handler(payload)
                    if not isinstance(response, dict):
                        response = {"status_code": 200, "body": response}
                    if "status_code" not in response:
                        response = {"status_code": 200, "body": response}
                    _store_result(redis_client, job_id, response)
                except Exception as error:  # noqa: BLE001
                    logger.error("Job handler failed: %s", error)
                    _store_result(
                        redis_client,
                        job_id,
                        {
                            "status_code": 500,
                            "body": {
                                "message": "Worker job failed.",
                                "error": str(error),
                                "trace": traceback.format_exc(limit=5),
                            },
                        },
                    )
                finally:
                    redis_client.xack(queue_stream, CONSUMER_GROUP, message_id)

        time.sleep(0.02)


if __name__ == "__main__":
    run()
