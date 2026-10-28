from __future__ import annotations

import logging
import os
from typing import Any

import redis.asyncio as aredis

from .features import FeatureStore, UserFeatures, vectorize_churn, vectorize_engagement, vectorize_moderation_risk
from .ftrl import FTRLConfig, FTRLModel

logger = logging.getLogger("python-matrix.predictor")


class Predictor:
    MIN_EXAMPLES_FOR_CONFIDENCE = 1000

    def __init__(self, redis_client: aredis.Redis, models_dir: str):
        self.redis = redis_client
        self.features = FeatureStore(redis_client)
        self.models_dir = models_dir
        self.engagement = FTRLModel(FTRLConfig(alpha=0.15, beta=1.0, l1=0.1, l2=1.0))
        self.churn = FTRLModel(FTRLConfig(alpha=0.1, beta=1.0, l1=0.05, l2=1.0))
        self.mod_risk = FTRLModel(FTRLConfig(alpha=0.2, beta=1.0, l1=0.2, l2=2.0))
        self.example_counts: dict[str, int] = {"engagement": 0, "churn": 0, "mod_risk": 0}
        self._load_models()

    async def engagement_probability(self, user_id: str, post_author: str, post_tags: list[str]) -> float:
        features = await self.features.get(user_id)
        return self.engagement.predict_proba(vectorize_engagement(features, post_author, post_tags))

    async def churn_probability(self, user_id: str) -> float:
        features = await self.features.get(user_id)
        return self.churn.predict_proba(vectorize_churn(features))

    async def moderation_risk(self, user_id: str, content: str) -> float:
        features = await self.features.get(user_id)
        return self.mod_risk.predict_proba(vectorize_moderation_risk(features, content))

    async def learn_engagement(
        self,
        user_id: str,
        post_author: str,
        post_tags: list[str],
        interacted: bool,
        sample_weight: float = 1.0,
    ) -> float:
        features = await self.features.get(user_id)
        loss = self.engagement.update(
            vectorize_engagement(features, post_author, post_tags),
            1 if interacted else 0,
            sample_weight=sample_weight,
        )
        self.example_counts["engagement"] += 1
        return loss

    async def learn_churn(self, user_id: str, churned: bool, sample_weight: float = 1.0) -> float:
        features = await self.features.get(user_id)
        loss = self.churn.update(vectorize_churn(features), 1 if churned else 0, sample_weight=sample_weight)
        self.example_counts["churn"] += 1
        return loss

    async def learn_moderation(self, user_id: str, content: str, violated: bool, sample_weight: float = 1.0) -> float:
        features = await self.features.get(user_id)
        loss = self.mod_risk.update(
            vectorize_moderation_risk(features, content),
            1 if violated else 0,
            sample_weight=sample_weight,
        )
        self.example_counts["mod_risk"] += 1
        return loss

    async def explain_engagement(
        self,
        user_id: str,
        post_author: str,
        post_tags: list[str],
        top_k: int = 8,
    ) -> dict[str, Any]:
        features = await self.features.get(user_id)
        vector = vectorize_engagement(features, post_author, post_tags)
        probability = self.engagement.predict_proba(vector)
        explanation = self.engagement.explain(vector, top_k=top_k)
        return {
            "probability": probability,
            "explanation": [{"feature": key, "contribution": contribution} for key, contribution in explanation],
        }

    def model_status(self) -> dict[str, Any]:
        return {
            "examples": self.example_counts,
            "ready": {
                model_name: count >= self.MIN_EXAMPLES_FOR_CONFIDENCE
                for model_name, count in self.example_counts.items()
            },
        }

    def save_models(self) -> None:
        os.makedirs(self.models_dir, exist_ok=True)
        self.engagement.save(os.path.join(self.models_dir, "engagement.json"))
        self.churn.save(os.path.join(self.models_dir, "churn.json"))
        self.mod_risk.save(os.path.join(self.models_dir, "mod_risk.json"))

    def _load_models(self) -> None:
        self._load_model(self.engagement, "engagement.json", "engagement")
        self._load_model(self.churn, "churn.json", "churn")
        self._load_model(self.mod_risk, "mod_risk.json", "mod_risk")

    def _load_model(self, model: FTRLModel, filename: str, model_name: str) -> None:
        path = os.path.join(self.models_dir, filename)
        if not os.path.exists(path):
            return
        try:
            model.load(path)
            logger.info("Loaded predictor model %s from %s", model_name, path)
        except Exception:  # noqa: BLE001
            logger.exception("Failed to load predictor model %s from %s", model_name, path)
