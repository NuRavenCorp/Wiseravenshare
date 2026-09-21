import logging
import time

from wiseravenshare.server.app import build_platform
from wiseravenshare.server.core.models import MediaUpload
from wiseravenshare.server.core.queue import queue

logger = logging.getLogger(__name__)


def run():
    while True:
        job = queue.dequeue()
        if not job:
            time.sleep(1)
            continue

        jid, job_type, payload = job
        platform_name, action = job_type.split(".", 1)
        try:
            svc = build_platform(platform_name)
            if action == "upload":
                result = svc.upload(MediaUpload(**payload))
            elif action == "post.video":
                result = svc.post(payload)
            else:
                result = getattr(svc, action)(payload)
            logger.info("job %s done: %s", jid, result)
        except Exception:
            logger.exception("job %s failed", jid)


if __name__ == "__main__":
    run()
