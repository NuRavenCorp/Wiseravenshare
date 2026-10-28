from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any

import redis.asyncio as aredis


@dataclass
class UserFeatures:
    user_id: str
    likes_7d: int = 0
    affirms_7d: int = 0
    comments_7d: int = 0
    reposts_7d: int = 0
    posts_7d: int = 0
    hours_since_active: float = 999.0
    hours_since_posted: float = 999.0
    active_hours_histogram: list[int] = field(default_factory=lambda: [0] * 24)
    affinity_hashtags: dict[str, float] = field(default_factory=dict)
    affinity_authors: dict[str, float] = field(default_factory=dict)
    strikes: int = 0
    flags_received: int = 0
    credibility_score: float = 0.5
    engagement_ratio: float = 0.0
    reciprocity: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "UserFeatures":
        data = dict(payload)
        data["active_hours_histogram"] = _coerce_histogram(data.get("active_hours_histogram"))
        data["affinity_hashtags"] = _coerce_string_float_map(data.get("affinity_hashtags"))
        data["affinity_authors"] = _coerce_string_float_map(data.get("affinity_authors"))
        return cls(**data)


class FeatureStore:
    KEY_PREFIX = "feat:user:"
    ACTIVE_USERS_KEY = "feat:active-users"
    TTL_SECONDS = 60 * 60 * 24 * 14

    def __init__(self, redis_client: aredis.Redis):
        self.redis = redis_client

    async def get(self, user_id: str) -> UserFeatures:
        key = f"{self.KEY_PREFIX}{user_id}"
        raw = await self.redis.get(key)
        if raw:
            try:
                return UserFeatures.from_dict(json.loads(raw))
            except (TypeError, ValueError):
                pass
        features = UserFeatures(user_id=user_id)
        await self.put(features)
        return features

    async def put(self, features: UserFeatures) -> None:
        key = f"{self.KEY_PREFIX}{features.user_id}"
        await self.redis.set(key, json.dumps(features.to_dict()), ex=self.TTL_SECONDS)
        await self.redis.sadd(self.ACTIVE_USERS_KEY, features.user_id)
        await self.redis.expire(self.ACTIVE_USERS_KEY, self.TTL_SECONDS)

    async def update_on_interaction(
        self,
        user_id: str,
        interaction_type: str,
        target_author: str | None = None,
        target_tags: list[str] | None = None,
    ) -> None:
        features = await self.get(user_id)
        now = datetime.now(timezone.utc)

        if interaction_type == "like":
            features.likes_7d += 1
        elif interaction_type == "affirm":
            features.affirms_7d += 1
        elif interaction_type == "comment":
            features.comments_7d += 1
        elif interaction_type == "repost":
            features.reposts_7d += 1

        alpha = 0.15
        if target_author:
            previous = features.affinity_authors.get(target_author, 0.0)
            features.affinity_authors[target_author] = (1 - alpha) * previous + alpha

        for tag in target_tags or []:
            normalized = (tag or "").strip().lstrip("#").lower()
            if not normalized:
                continue
            previous = features.affinity_hashtags.get(normalized, 0.0)
            features.affinity_hashtags[normalized] = (1 - alpha) * previous + alpha

        features.hours_since_active = 0.0
        features.active_hours_histogram[now.hour] += 1
        total_interactions = features.likes_7d + features.affirms_7d + features.comments_7d
        features.engagement_ratio = total_interactions / max(features.posts_7d, 1)
        await self.put(features)

    async def update_on_post(self, user_id: str) -> None:
        features = await self.get(user_id)
        now = datetime.now(timezone.utc)
        features.posts_7d += 1
        features.hours_since_posted = 0.0
        features.hours_since_active = 0.0
        features.active_hours_histogram[now.hour] += 1
        await self.put(features)


def vectorize_engagement(user: UserFeatures, post_author: str, post_tags: list[str]) -> dict[str, float]:
    vector: dict[str, float] = {
        "bias": 1.0,
        "u:likes_7d": _log1p(user.likes_7d),
        "u:affirms_7d": _log1p(user.affirms_7d),
        "u:comments_7d": _log1p(user.comments_7d),
        "u:posts_7d": _log1p(user.posts_7d),
        "u:engagement_ratio": min(user.engagement_ratio, 20.0) / 20.0,
        "u:hours_since_active": min(user.hours_since_active, 168.0) / 168.0,
        "u:credibility": user.credibility_score,
        "x:author_affinity": user.affinity_authors.get(post_author, 0.0),
    }

    tag_scores = [user.affinity_hashtags.get((tag or "").lower(), 0.0) for tag in post_tags]
    vector["x:tag_affinity_max"] = max(tag_scores, default=0.0)
    vector["x:tag_affinity_mean"] = sum(tag_scores) / max(len(tag_scores), 1)
    return vector


def vectorize_churn(user: UserFeatures) -> dict[str, float]:
    recent_activity = user.likes_7d + user.comments_7d + user.posts_7d
    return {
        "bias": 1.0,
        "u:recent_activity": _log1p(recent_activity),
        "u:hours_since_active": min(user.hours_since_active, 720.0) / 720.0,
        "u:posts_7d": _log1p(user.posts_7d),
        "u:engagement_ratio": min(user.engagement_ratio, 20.0) / 20.0,
        "u:strikes": float(user.strikes),
        "u:credibility": user.credibility_score,
    }


def vectorize_moderation_risk(user: UserFeatures, content: str) -> dict[str, float]:
    content_text = content or ""
    letters = [char for char in content_text if char.isalpha()]
    uppercase_ratio = (sum(1 for char in letters if char.isupper()) / len(letters)) if letters else 0.0
    links = content_text.count("http")
    tags = content_text.count("#")
    return {
        "bias": 1.0,
        "u:strikes": float(user.strikes),
        "u:flags_received": _log1p(user.flags_received),
        "u:credibility": user.credibility_score,
        "c:caps_ratio": uppercase_ratio,
        "c:link_count": min(links, 5) / 5.0,
        "c:hashtag_density": min(tags / max(len(content_text) / 30, 1), 3.0) / 3.0,
    }


def _log1p(value: float) -> float:
    return math.log1p(max(value, 0.0))


def _coerce_histogram(value: Any) -> list[int]:
    if isinstance(value, list):
        padded = [int(v) if isinstance(v, (int, float)) else 0 for v in value[:24]]
        if len(padded) < 24:
            padded.extend([0] * (24 - len(padded)))
        return padded
    return [0] * 24


def _coerce_string_float_map(value: Any) -> dict[str, float]:
    if not isinstance(value, dict):
        return {}
    result: dict[str, float] = {}
    for key, map_value in value.items():
        name = str(key).strip()
        if not name:
            continue
        try:
            result[name] = float(map_value)
        except (TypeError, ValueError):
            continue
    return result
