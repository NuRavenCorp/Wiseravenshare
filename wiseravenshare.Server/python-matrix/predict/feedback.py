from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone

import redis.asyncio as aredis

from .predictor import Predictor

logger = logging.getLogger("python-matrix.feedback")


class FeedbackCollector:
    IMPRESSION_TTL_SECONDS = 60 * 60 * 24
    NEGATIVE_AGE_SECONDS = 60 * 30

    def __init__(self, predictor: Predictor, redis_client: aredis.Redis):
        self.predictor = predictor
        self.redis = redis_client
        self._running = False

    async def record_impression(
        self,
        user_id: str,
        post_id: str,
        post_author: str,
        post_tags: list[str],
        predicted_probability: float,
    ) -> None:
        key = f"impr:{user_id}:{post_id}"
        payload = {
            "author": post_author,
            "tags": post_tags,
            "probability": predicted_probability,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "engaged": False,
        }
        await self.redis.set(key, json.dumps(payload), ex=self.IMPRESSION_TTL_SECONDS)
        await self.redis.sadd("impr:active-users", user_id)
        await self.redis.expire("impr:active-users", self.IMPRESSION_TTL_SECONDS)

    async def mark_engaged(self, user_id: str, post_id: str) -> None:
        key = f"impr:{user_id}:{post_id}"
        raw = await self.redis.get(key)
        if not raw:
            return
        try:
            payload = json.loads(raw)
        except ValueError:
            await self.redis.delete(key)
            return
        payload["engaged"] = True
        await self.redis.set(key, json.dumps(payload), ex=self.IMPRESSION_TTL_SECONDS)

    async def flush_positive(self, user_id: str, post_id: str) -> bool:
        key = f"impr:{user_id}:{post_id}"
        raw = await self.redis.get(key)
        if not raw:
            return False
        try:
            payload = json.loads(raw)
        except ValueError:
            await self.redis.delete(key)
            return False

        await self.predictor.learn_engagement(
            user_id=user_id,
            post_author=str(payload.get("author", "")),
            post_tags=[str(tag) for tag in payload.get("tags", [])],
            interacted=True,
        )
        await self.redis.delete(key)
        return True

    async def flush_negatives_for_user(self, user_id: str) -> int:
        flushed = 0
        now = datetime.now(timezone.utc)
        async for key in self.redis.scan_iter(match=f"impr:{user_id}:*", count=100):
            raw = await self.redis.get(key)
            if not raw:
                continue
            try:
                payload = json.loads(raw)
            except ValueError:
                await self.redis.delete(key)
                continue
            if bool(payload.get("engaged")):
                continue
            timestamp_raw = str(payload.get("timestamp", ""))
            try:
                timestamp = datetime.fromisoformat(timestamp_raw)
            except ValueError:
                await self.redis.delete(key)
                continue

            age_seconds = (now - timestamp).total_seconds()
            if age_seconds < self.NEGATIVE_AGE_SECONDS:
                continue

            await self.predictor.learn_engagement(
                user_id=user_id,
                post_author=str(payload.get("author", "")),
                post_tags=[str(tag) for tag in payload.get("tags", [])],
                interacted=False,
                sample_weight=0.5,
            )
            await self.redis.delete(key)
            flushed += 1

        return flushed

    async def sweep_negatives_once(self, user_limit: int = 500) -> int:
        users = await self.redis.smembers("impr:active-users")
        if not users:
            return 0

        total_flushed = 0
        for index, user_id in enumerate(users):
            if index >= user_limit:
                break
            total_flushed += await self.flush_negatives_for_user(str(user_id))
        return total_flushed

    async def sweep_loop(self, interval_seconds: int = 600) -> None:
        self._running = True
        while self._running:
            try:
                await asyncio.sleep(interval_seconds)
                flushed = await self.sweep_negatives_once()
                if flushed > 0:
                    logger.info("Flushed %s negative impression samples.", flushed)
            except asyncio.CancelledError:
                return
            except Exception:  # noqa: BLE001
                logger.exception("Feedback sweep failed.")

    def stop(self) -> None:
        self._running = False
