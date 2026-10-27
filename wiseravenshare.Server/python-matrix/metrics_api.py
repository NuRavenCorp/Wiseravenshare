import os
from typing import Optional

import psycopg
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="WiseRavenShare Metrics API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

PG_DSN = os.getenv("PG_DSN", "postgresql://postgres:postgres@localhost:5432/wiseravenshare_db")


def get_connection() -> psycopg.Connection:
    return psycopg.connect(PG_DSN)


def dict_rows(cursor) -> list[dict]:
    columns = [description[0] for description in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


@app.get("/metrics/user/{user_id}")
def get_user_metrics(user_id: int):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM user_metrics WHERE user_id = %s", (user_id,))
            rows = dict_rows(cur)
            if not rows:
                raise HTTPException(status_code=404, detail="User metrics not found")
            return rows[0]


@app.get("/trends/hashtags")
def get_trending_hashtags(
    limit: int = Query(20, ge=1, le=100),
    window: Optional[str] = Query("1h", description="Accepted: 1h, 6h, 24h"),
):
    interval = {"1h": "2 hours", "6h": "8 hours", "24h": "26 hours"}.get((window or "1h").lower(), "2 hours")
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT DISTINCT ON (hashtag)
                    hashtag, post_count, unique_users, velocity, trending_score, window_start
                FROM hashtag_trends
                WHERE window_start > NOW() - INTERVAL '{interval}'
                ORDER BY hashtag, window_start DESC
                """
            )
            rows = dict_rows(cur)
            rows.sort(key=lambda item: (float(item["trending_score"]), float(item["velocity"])), reverse=True)
            return rows[:limit]


@app.get("/trends/partials")
def get_partial_trends(limit: int = Query(20, ge=1, le=100)):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT partial_pattern, SUM(interaction_count) AS total
                FROM partial_engagement
                WHERE last_used > NOW() - INTERVAL '24 hours'
                GROUP BY partial_pattern
                ORDER BY total DESC
                LIMIT %s
                """,
                (limit,),
            )
            return dict_rows(cur)


@app.get("/metrics/leaderboard")
def get_engagement_leaderboard(limit: int = Query(50, ge=1, le=200)):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT user_id, total_posts, total_likes, total_comments,
                       total_reposts, engagement_score
                FROM user_metrics
                ORDER BY engagement_score DESC
                LIMIT %s
                """,
                (limit,),
            )
            return dict_rows(cur)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8010")))
