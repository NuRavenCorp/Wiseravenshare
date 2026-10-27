import os
import time
from collections import defaultdict
from datetime import datetime, timezone

import psycopg
import redis

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
PG_DSN = os.getenv("PG_DSN", "postgresql://postgres:postgres@localhost:5432/wiseravenshare_db")
BUCKET_SIZE = int(os.getenv("HASHTAG_BUCKET_SECONDS", "600"))
WINDOW_SECONDS = int(os.getenv("HASHTAG_WINDOW_SECONDS", "3600"))
LOOP_SECONDS = int(os.getenv("AGGREGATE_LOOP_SECONDS", "600"))

r = redis.from_url(REDIS_URL, decode_responses=True)


def get_connection() -> psycopg.Connection:
    return psycopg.connect(PG_DSN)


def ensure_schema() -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS user_metrics (
                    user_id BIGINT PRIMARY KEY,
                    total_posts INT DEFAULT 0,
                    total_reposts INT DEFAULT 0,
                    total_comments INT DEFAULT 0,
                    total_likes INT DEFAULT 0,
                    total_dislikes INT DEFAULT 0,
                    engagement_score FLOAT DEFAULT 0,
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS hashtag_trends (
                    hashtag VARCHAR(100),
                    window_start TIMESTAMPTZ,
                    post_count INT DEFAULT 0,
                    unique_users INT DEFAULT 0,
                    velocity FLOAT DEFAULT 0,
                    trending_score FLOAT DEFAULT 0,
                    PRIMARY KEY (hashtag, window_start)
                );
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS partial_engagement (
                    partial_pattern VARCHAR(100),
                    user_id BIGINT,
                    interaction_count INT DEFAULT 0,
                    last_used TIMESTAMPTZ DEFAULT NOW(),
                    PRIMARY KEY (partial_pattern, user_id)
                );
                """
            )
        conn.commit()


def aggregate_user_metrics() -> None:
    keys = r.keys("user:*:metrics")
    if not keys:
        print("[agg] no user metrics found")
        return

    rows = []
    for key in keys:
        parts = key.split(":")
        if len(parts) < 3:
            continue
        try:
            user_id = int(parts[1])
        except ValueError:
            continue
        metrics = r.hgetall(key)
        posts = int(metrics.get("post", 0))
        reposts = int(metrics.get("repost", 0))
        comments = int(metrics.get("comment", 0))
        likes = int(metrics.get("like", 0))
        dislikes = int(metrics.get("dislike", 0))
        engagement = (posts * 10) + (reposts * 8) + (comments * 5) + likes - (dislikes * 2)
        rows.append((user_id, posts, reposts, comments, likes, dislikes, float(engagement)))

    if not rows:
        return

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO user_metrics
                    (user_id, total_posts, total_reposts, total_comments, total_likes, total_dislikes, engagement_score, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (user_id) DO UPDATE SET
                    total_posts = EXCLUDED.total_posts,
                    total_reposts = EXCLUDED.total_reposts,
                    total_comments = EXCLUDED.total_comments,
                    total_likes = EXCLUDED.total_likes,
                    total_dislikes = EXCLUDED.total_dislikes,
                    engagement_score = EXCLUDED.engagement_score,
                    updated_at = NOW()
                """,
                rows,
            )
        conn.commit()

    print(f"[agg] upserted {len(rows)} user metrics")


def aggregate_hashtag_trends() -> None:
    now = int(time.time())
    current_bucket = (now // BUCKET_SIZE) * BUCKET_SIZE

    current_keys = []
    t = current_bucket
    while t >= now - WINDOW_SECONDS:
        current_keys.append(f"hashtags:{t}")
        t -= BUCKET_SIZE

    prev_end = current_bucket - WINDOW_SECONDS
    prev_keys = []
    t = prev_end
    while t >= prev_end - WINDOW_SECONDS:
        prev_keys.append(f"hashtags:{t}")
        t -= BUCKET_SIZE

    current_scores: dict[str, float] = {}
    if current_keys:
        merged = r.zunionstore("hashtags:agg:current", current_keys)
        if merged > 0:
            current_scores = dict(r.zrange("hashtags:agg:current", 0, -1, withscores=True))

    prev_scores: dict[str, float] = {}
    if prev_keys:
        merged = r.zunionstore("hashtags:agg:prev", prev_keys)
        if merged > 0:
            prev_scores = dict(r.zrange("hashtags:agg:prev", 0, -1, withscores=True))

    if not current_scores:
        print("[agg] no hashtag data in current window")
        r.delete("hashtags:agg:current", "hashtags:agg:prev")
        return

    rows = []
    for tag, count in current_scores.items():
        prev_count = prev_scores.get(tag, 0.0)
        velocity = float(count) - float(prev_count)
        user_set_key = f"hashtag:users:{tag}"
        unique_users = int(r.scard(user_set_key)) if r.exists(user_set_key) else int(count)
        diversity = unique_users / max(float(count), 1.0)
        trending_score = velocity * (1 + diversity) if velocity > 0 else 0.0
        rows.append(
            (
                tag,
                datetime.fromtimestamp(current_bucket, tz=timezone.utc),
                int(count),
                unique_users,
                float(velocity),
                round(float(trending_score), 4),
            )
        )

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO hashtag_trends
                    (hashtag, window_start, post_count, unique_users, velocity, trending_score)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (hashtag, window_start) DO UPDATE SET
                    post_count = EXCLUDED.post_count,
                    unique_users = EXCLUDED.unique_users,
                    velocity = EXCLUDED.velocity,
                    trending_score = EXCLUDED.trending_score
                """,
                rows,
            )
        conn.commit()

    print(f"[agg] upserted {len(rows)} hashtag trend rows")
    r.delete("hashtags:agg:current", "hashtags:agg:prev")


def aggregate_partial_engagement() -> None:
    keys = r.keys("partial:*:ranked")
    if not keys:
        return

    rows = []
    for key in keys:
        parts = key.split(":")
        if len(parts) < 3:
            continue
        pattern = parts[1]
        total = int(r.zcard(key))
        if total > 0:
            rows.append((pattern, None, total))

    if not rows:
        return

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO partial_engagement (partial_pattern, user_id, interaction_count, last_used)
                VALUES (%s, %s, %s, NOW())
                ON CONFLICT (partial_pattern, user_id) DO UPDATE SET
                    interaction_count = EXCLUDED.interaction_count,
                    last_used = NOW()
                """,
                rows,
            )
        conn.commit()

    print(f"[agg] upserted {len(rows)} partial engagement rows")


def run_once() -> None:
    ensure_schema()
    aggregate_user_metrics()
    aggregate_hashtag_trends()
    aggregate_partial_engagement()


if __name__ == "__main__":
    mode = os.getenv("AGGREGATE_MODE", "once").strip().lower()
    if mode == "loop":
        while True:
            run_once()
            time.sleep(max(30, LOOP_SECONDS))
    else:
        run_once()
