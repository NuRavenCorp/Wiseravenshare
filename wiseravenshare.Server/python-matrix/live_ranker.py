"""
WiseRavenShare Live feed ranking.

Computes personalized live-stream scores per viewer.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Callable, Optional

import asyncpg


WEIGHTS = {
    "viewer_watch_ratio": 3.0,
    "viewer_liked": 2.0,
    "viewer_commented": 2.5,
    "viewer_shared": 3.5,
    "viewer_followed_after": 4.0,
    "stream_total_viewers": 1.5,
    "stream_avg_watch_ratio": 2.0,
    "stream_engagement_rate": 2.5,
    "stream_age_penalty": -1.0,
    "same_language": 0.5,
    "same_country": 0.3,
    "host_followed_by_viewer": 1.0,
    "category_affinity": 1.2,
}


@dataclass
class LiveStream:
    stream_id: str
    host_user_id: str
    title: str
    category: str
    hashtags: list[str]
    started_at: datetime
    language: str
    country: str
    viewer_count: int = 0
    total_watch_seconds: float = 0.0
    total_sessions: int = 0
    likes: int = 0
    comments: int = 0
    shares: int = 0


@dataclass
class ViewerProfile:
    user_id: str
    language: str
    country: str
    followed_hosts: set[str] = field(default_factory=set)
    category_affinity: dict[str, float] = field(default_factory=dict)
    stream_history: dict[str, dict] = field(default_factory=dict)


def _log_scale(value: float, base: float = 10.0) -> float:
    if value <= 0:
        return 0.0
    return math.log(value + 1, base)


def _normalize(value: float, max_value: float) -> float:
    if max_value <= 0:
        return 0.0
    return min(1.0, value / max_value)


def compute_stream_health(stream: LiveStream) -> dict:
    age_seconds = (datetime.now(timezone.utc) - stream.started_at).total_seconds()
    age_hours = max(0.01, age_seconds / 3600.0)

    avg_watch = (
        stream.total_watch_seconds / stream.total_sessions
        if stream.total_sessions > 0
        else 0.0
    )
    avg_watch_ratio = _normalize(avg_watch, 1800.0)

    engagement = stream.likes + stream.comments + stream.shares
    engagement_rate = engagement / max(1, stream.viewer_count * 10)
    engagement_rate = _normalize(engagement_rate, 1.0)

    freshness = max(0.0, 1.0 - (age_hours / 3.0))

    return {
        "viewer_count_scaled": _log_scale(stream.viewer_count),
        "avg_watch_ratio": avg_watch_ratio,
        "engagement_rate": engagement_rate,
        "freshness": freshness,
        "age_hours": age_hours,
    }


def compute_personal_signals(viewer: ViewerProfile, stream: LiveStream) -> dict:
    history = viewer.stream_history.get(stream.stream_id, {})
    watch_seconds = history.get("watch_seconds", 0.0)
    watch_ratio = _normalize(watch_seconds, 1800.0)

    return {
        "viewer_watch_ratio": watch_ratio,
        "viewer_liked": 1.0 if history.get("liked") else 0.0,
        "viewer_commented": 1.0 if history.get("commented") else 0.0,
        "viewer_shared": 1.0 if history.get("shared") else 0.0,
        "viewer_followed_after": 1.0 if history.get("followed_after") else 0.0,
        "host_followed_by_viewer": 1.0 if stream.host_user_id in viewer.followed_hosts else 0.0,
        "same_language": 1.0 if viewer.language == stream.language else 0.0,
        "same_country": 1.0 if viewer.country == stream.country else 0.0,
        "category_affinity": viewer.category_affinity.get(stream.category, 0.0),
    }


def build_stream_feature_vector(
    viewer: ViewerProfile,
    stream: LiveStream,
    stream_health: Optional[dict] = None,
) -> dict[str, float]:
    if stream_health is None:
        stream_health = compute_stream_health(stream)
    personal = compute_personal_signals(viewer, stream)

    return {
        "viewer_watch_ratio": personal["viewer_watch_ratio"],
        "viewer_liked": personal["viewer_liked"],
        "viewer_commented": personal["viewer_commented"],
        "viewer_shared": personal["viewer_shared"],
        "viewer_followed_after": personal["viewer_followed_after"],
        "stream_total_viewers": stream_health["viewer_count_scaled"],
        "stream_avg_watch_ratio": stream_health["avg_watch_ratio"],
        "stream_engagement_rate": stream_health["engagement_rate"],
        "stream_age_penalty": stream_health["age_hours"],
        "same_language": personal["same_language"],
        "same_country": personal["same_country"],
        "host_followed_by_viewer": personal["host_followed_by_viewer"],
        "category_affinity": personal["category_affinity"],
        "freshness": stream_health["freshness"],
    }


def score_stream_from_features(features: dict[str, float]) -> float:
    raw = (
        WEIGHTS["viewer_watch_ratio"] * features["viewer_watch_ratio"]
        + WEIGHTS["viewer_liked"] * features["viewer_liked"]
        + WEIGHTS["viewer_commented"] * features["viewer_commented"]
        + WEIGHTS["viewer_shared"] * features["viewer_shared"]
        + WEIGHTS["viewer_followed_after"] * features["viewer_followed_after"]
        + WEIGHTS["stream_total_viewers"] * features["stream_total_viewers"]
        + WEIGHTS["stream_avg_watch_ratio"] * features["stream_avg_watch_ratio"]
        + WEIGHTS["stream_engagement_rate"] * features["stream_engagement_rate"]
        + WEIGHTS["stream_age_penalty"] * features["stream_age_penalty"]
        + WEIGHTS["same_language"] * features["same_language"]
        + WEIGHTS["same_country"] * features["same_country"]
        + WEIGHTS["host_followed_by_viewer"] * features["host_followed_by_viewer"]
        + WEIGHTS["category_affinity"] * features["category_affinity"]
    )
    raw *= 0.5 + 0.5 * features["freshness"]
    return round(raw, 4)


def score_stream(
    viewer: ViewerProfile,
    stream: LiveStream,
    stream_health: Optional[dict] = None,
) -> float:
    features = build_stream_feature_vector(viewer, stream, stream_health)
    return score_stream_from_features(features)


def cold_start_score(stream: LiveStream, stream_health: dict) -> float:
    return round(
        2.0 * stream_health["viewer_count_scaled"]
        + 3.0 * stream_health["avg_watch_ratio"]
        + 4.0 * stream_health["engagement_rate"]
        + 5.0 * stream_health["freshness"],
        4,
    )


async def rank_live_feed(
    pg_dsn: str,
    viewer_id: str,
    limit: int = 50,
    score_predictor: Optional[Callable[[dict[str, float]], Optional[float]]] = None,
) -> list[dict]:
    conn = await asyncpg.connect(pg_dsn)
    try:
        stream_rows = await conn.fetch(
            """
            SELECT stream_id, host_user_id, title, category, hashtags,
                   started_at, language, country,
                   viewer_count, total_watch_seconds, total_sessions,
                   likes, comments, shares
            FROM live_streams
            WHERE ended_at IS NULL
              AND started_at > now() - interval '6 hours'
            ORDER BY viewer_count DESC
            LIMIT 500
            """
        )

        viewer_row = await conn.fetchrow(
            "SELECT language, country FROM users WHERE user_id = $1",
            viewer_id,
        )

        followed = await conn.fetch(
            "SELECT host_user_id FROM follows WHERE follower_id = $1",
            viewer_id,
        )

        affinity_rows = await conn.fetch(
            """
            SELECT category, COUNT(*)::float / SUM(COUNT(*)) OVER () AS affinity
            FROM live_interactions
            WHERE viewer_id = $1
              AND created_at > now() - interval '30 days'
            GROUP BY category
            """,
            viewer_id,
        )

        history_rows = await conn.fetch(
            """
            SELECT stream_id,
                   SUM(watch_seconds) AS watch_seconds,
                   BOOL_OR(liked) AS liked,
                   BOOL_OR(commented) AS commented,
                   BOOL_OR(shared) AS shared,
                   BOOL_OR(followed_after) AS followed_after
            FROM live_interactions
            WHERE viewer_id = $1
              AND created_at > now() - interval '7 days'
            GROUP BY stream_id
            """,
            viewer_id,
        )

        if not viewer_row:
            results = []
            for row in stream_rows:
                stream = _row_to_stream(row)
                health = compute_stream_health(stream)
                results.append(
                    {
                        "stream_id": stream.stream_id,
                        "score": cold_start_score(stream, health),
                        "score_source": "cold_start",
                        "title": stream.title,
                        "host_user_id": stream.host_user_id,
                        "category": stream.category,
                        "viewer_count": stream.viewer_count,
                        "started_at": stream.started_at.isoformat(),
                        "features": {
                            "stream_total_viewers": health["viewer_count_scaled"],
                            "stream_avg_watch_ratio": health["avg_watch_ratio"],
                            "stream_engagement_rate": health["engagement_rate"],
                            "stream_age_penalty": health["age_hours"],
                            "freshness": health["freshness"],
                        },
                    }
                )
            results.sort(key=lambda item: item["score"], reverse=True)
            return results[:limit]

        viewer = ViewerProfile(
            user_id=viewer_id,
            language=viewer_row["language"] or "en",
            country=viewer_row["country"] or "",
            followed_hosts={str(row["host_user_id"]) for row in followed},
            category_affinity={row["category"]: row["affinity"] for row in affinity_rows},
            stream_history={
                str(row["stream_id"]): {
                    "watch_seconds": float(row["watch_seconds"] or 0.0),
                    "liked": bool(row["liked"]),
                    "commented": bool(row["commented"]),
                    "shared": bool(row["shared"]),
                    "followed_after": bool(row["followed_after"]),
                }
                for row in history_rows
            },
        )

        scored = []
        for row in stream_rows:
            stream = _row_to_stream(row)
            health = compute_stream_health(stream)
            features = build_stream_feature_vector(viewer, stream, health)
            score = score_stream_from_features(features)
            score_source = "heuristic"

            if score_predictor is not None:
                predicted = score_predictor(features)
                if isinstance(predicted, (float, int)) and math.isfinite(float(predicted)):
                    score = round(float(predicted), 4)
                    score_source = "model"

            scored.append(
                {
                    "stream_id": stream.stream_id,
                    "score": score,
                    "score_source": score_source,
                    "title": stream.title,
                    "host_user_id": stream.host_user_id,
                    "category": stream.category,
                    "viewer_count": stream.viewer_count,
                    "started_at": stream.started_at.isoformat(),
                    "features": features,
                }
            )

        scored.sort(key=lambda item: item["score"], reverse=True)
        return scored[:limit]
    finally:
        await conn.close()


def _row_to_stream(row: asyncpg.Record) -> LiveStream:
    hashtags = row["hashtags"] or []
    return LiveStream(
        stream_id=str(row["stream_id"]),
        host_user_id=str(row["host_user_id"]),
        title=row["title"] or "",
        category=row["category"] or "general",
        hashtags=list(hashtags),
        started_at=row["started_at"],
        language=row["language"] or "en",
        country=row["country"] or "",
        viewer_count=row["viewer_count"] or 0,
        total_watch_seconds=float(row["total_watch_seconds"] or 0),
        total_sessions=row["total_sessions"] or 0,
        likes=row["likes"] or 0,
        comments=row["comments"] or 0,
        shares=row["shares"] or 0,
    )
