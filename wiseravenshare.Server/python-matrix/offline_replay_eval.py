"""
Offline replay evaluator for ranked post feed.

Purpose:
  - Evaluate ranker quality on historical interactions.
  - Provide calibration-ready metrics (hit-rate@k, recall@k, MRR@k).

Usage:
  python offline_replay_eval.py --dsn "postgresql://..." --users 200 --k 40 --lookback-days 14
"""

from __future__ import annotations

import argparse
import statistics
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Iterable

import psycopg

from feed_ranker import rank_post_feed


@dataclass
class UserReplayResult:
    user_id: str
    positives: int
    hit_at_k: float
    recall_at_k: float
    mrr_at_k: float


def _fetch_candidate_users(conn: psycopg.Connection, since: datetime, limit: int) -> list[str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT user_id, SUM(c) AS c
            FROM (
                SELECT l."UserId"::text AS user_id, COUNT(*)::bigint AS c
                FROM app_data."PostLikes" l
                WHERE l."CreatedAt" >= %s
                GROUP BY l."UserId"
                UNION ALL
                SELECT r."UserId"::text AS user_id, COUNT(*)::bigint AS c
                FROM app_data."PostReposts" r
                WHERE r."CreatedAt" >= %s
                GROUP BY r."UserId"
                UNION ALL
                SELECT c."UserId"::text AS user_id, COUNT(*)::bigint AS c
                FROM app_data."Comments" c
                WHERE c."CreatedAt" >= %s
                  AND c."IsDeleted" = false
                GROUP BY c."UserId"
            ) engagement
            GROUP BY user_id
            ORDER BY c DESC
            LIMIT %s
            """,
            (since, since, since, limit),
        )
        return [str(row[0]) for row in cur.fetchall()]


def _fetch_positive_post_ids(conn: psycopg.Connection, user_id: str, since: datetime) -> set[str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT post_id
            FROM (
                SELECT l."PostId"::text AS post_id
                FROM app_data."PostLikes" l
                WHERE l."UserId" = %s::uuid
                  AND l."CreatedAt" >= %s
                UNION
                SELECT r."PostId"::text AS post_id
                FROM app_data."PostReposts" r
                WHERE r."UserId" = %s::uuid
                  AND r."CreatedAt" >= %s
                UNION
                SELECT c."PostId"::text AS post_id
                FROM app_data."Comments" c
                WHERE c."UserId" = %s::uuid
                  AND c."CreatedAt" >= %s
                  AND c."IsDeleted" = false
            ) positives
            """,
            (user_id, since, user_id, since, user_id, since),
        )
        return {str(row[0]) for row in cur.fetchall()}


def _compute_user_metrics(ranked_post_ids: list[str], positive_ids: set[str], k: int) -> UserReplayResult:
    topk = ranked_post_ids[:k]
    hits = [idx for idx, post_id in enumerate(topk, start=1) if post_id in positive_ids]

    if not positive_ids:
        return UserReplayResult("", 0, 0.0, 0.0, 0.0)

    hit_at_k = 1.0 if hits else 0.0
    recall_at_k = len(hits) / max(1, len(positive_ids))
    mrr_at_k = 1.0 / hits[0] if hits else 0.0
    return UserReplayResult("", len(positive_ids), hit_at_k, recall_at_k, mrr_at_k)


def evaluate(
    dsn: str,
    users: int,
    k: int,
    lookback_days: int,
    window_days: int,
) -> dict[str, float]:
    since = datetime.now(timezone.utc) - timedelta(days=lookback_days)
    results: list[UserReplayResult] = []

    with psycopg.connect(dsn) as conn:
        user_ids = _fetch_candidate_users(conn, since, users)
        for user_id in user_ids:
            positives = _fetch_positive_post_ids(conn, user_id, since)
            if not positives:
                continue
            ranked = rank_post_feed(conn, viewer_id=user_id, page_size=max(k, 40), candidate_window_days=window_days)
            ranked_post_ids = [str(item.get("post_id", "")) for item in ranked if item.get("post_id")]
            metrics = _compute_user_metrics(ranked_post_ids, positives, k)
            metrics.user_id = user_id
            results.append(metrics)

    if not results:
        return {
            "users_evaluated": 0.0,
            "mean_hit_at_k": 0.0,
            "mean_recall_at_k": 0.0,
            "mean_mrr_at_k": 0.0,
            "mean_positive_count": 0.0,
        }

    return {
        "users_evaluated": float(len(results)),
        "mean_hit_at_k": statistics.fmean(result.hit_at_k for result in results),
        "mean_recall_at_k": statistics.fmean(result.recall_at_k for result in results),
        "mean_mrr_at_k": statistics.fmean(result.mrr_at_k for result in results),
        "mean_positive_count": statistics.fmean(result.positives for result in results),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Offline replay evaluator for post feed ranker")
    parser.add_argument("--dsn", required=True, help="PostgreSQL DSN")
    parser.add_argument("--users", type=int, default=200, help="Max users to evaluate")
    parser.add_argument("--k", type=int, default=40, help="Top-K cutoff")
    parser.add_argument("--lookback-days", type=int, default=14, help="Historical window for positives")
    parser.add_argument("--window-days", type=int, default=30, help="Ranker candidate window")
    args = parser.parse_args()

    metrics = evaluate(
        dsn=args.dsn,
        users=max(1, args.users),
        k=max(1, args.k),
        lookback_days=max(1, args.lookback_days),
        window_days=max(1, args.window_days),
    )

    print("Offline Replay Evaluation")
    print(f"users_evaluated: {int(metrics['users_evaluated'])}")
    print(f"mean_hit@{args.k}: {metrics['mean_hit_at_k']:.4f}")
    print(f"mean_recall@{args.k}: {metrics['mean_recall_at_k']:.4f}")
    print(f"mean_mrr@{args.k}: {metrics['mean_mrr_at_k']:.4f}")
    print(f"mean_positive_count: {metrics['mean_positive_count']:.2f}")


if __name__ == "__main__":
    main()
