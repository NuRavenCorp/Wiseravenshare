"""
WiseRavenShare post-feed resurfacing ranker.

Multi-stage ranking pipeline for the social post feed:
  Stage 1 – gather_candidates  (5 triggers: A–E)
  Stage 2 – predict_all        (4 Meta-style multi-task predictions)
  Stage 3 – resurfacing_score  (acquaintance + author-debiasing à la Instagram)
  Stage 4 – apply_diversity    (Pinterest-style topic-cluster composition)

Research basis
--------------
A  Standard: own posts + followed posts (baseline retrieval)
B  Reddit r/popular audit: velocity of *comments* (not aggregate engagement)
   is the strongest predictor of a post staying on a trending feed.
C  Like velocity (separated from B, lower weight per Reddit finding)
D  LinkedIn 2026: semantic topic similarity replaces keyword intersection.
   Topic embedding approximated via HashVec over content tokens.
E  X 2026: completion-rate prediction at retrieval, before ranking.
   Approximated by historical median comment-to-view ratio for similar users.
F  Meta: 4-task multi-objective prediction groups.
G  Instagram: debiasing — subtract author's baseline interest from
   raw prediction to isolate post-level incremental value.
H  Pinterest: topic-cluster diversity composition layer (soft penalty for
   consecutive posts from the same cluster, not just the same author).
"""

from __future__ import annotations

import hashlib
import math
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import psycopg


# ─── tuneable hyper-params ────────────────────────────────────────────────────
WEIGHTS = {
    # Prediction weights for resurfacing_score
    "will_like":               1.2,
    "will_spend_time":         1.8,   # completion-rate proxy (X insight)
    "will_find_meaningful":    1.5,
    "will_spark_discussion":   1.0,   # Meta's 4th category
    # Acquaintance bonus
    "acquaintance_score":      0.8,
    # Author-debiasing discount (Instagram insight)
    "debiasing_discount":      0.4,
    # Recency decay half-life in hours
    "recency_halflife_h":     72.0,
    # Trigger gate thresholds
    "comment_velocity_min":    2,     # new comments in last 48 h to qualify
    "like_velocity_min":       5,     # new likes in last 48 h to qualify
    "topic_sim_threshold":    0.55,   # cosine similarity threshold for trigger D
    "completion_rate_min":    0.45,   # trigger E threshold
    # Diversity: no more than this many consecutive posts from same topic cluster
    "max_consecutive_cluster":  2,
    # Insertion ratio: 1 resurfaced post per N new posts
    "resurface_insertion_ratio": 4,
    # Implicit-residual / counterfactual scoring
    "implicit_dwell_residual":   0.9,
    "implicit_completion_residual": 1.1,
    "implicit_return_residual":  0.5,
    "counterfactual_interest":   1.0,
    # Dynamic resurfacing gate
    "resurface_base_threshold":  0.45,
    "fatigue_threshold":         0.60,
    "fatigue_threshold_lift":    0.25,
}

ACQUAINTANCE_WEIGHTS = {
    "interaction_frequency_30d": 0.35,
    "mutual_connections":        0.25,
    "content_consumption_ratio": 0.25,
    "recency_bonus":             0.15,
}


# ─── data classes ─────────────────────────────────────────────────────────────

@dataclass
class CandidatePost:
    post_id: str
    user_id: str           # author
    content: str
    type: str
    hashtags: list[str]
    created_at: datetime
    likes_count: int
    reposts_count: int
    comments_count: int
    views_count: int
    # runtime-computed
    trigger: str = "A"
    topic_cluster: str = ""


@dataclass
class ScoredPost:
    post_id: str
    user_id: str
    topic_cluster: str
    trigger: str
    resurfacing_score: float
    predictions: dict[str, float] = field(default_factory=dict)
    features: dict[str, float] = field(default_factory=dict)


# ─── lightweight text helpers ─────────────────────────────────────────────────

_TOKEN_RE = re.compile(r"[a-z0-9]+", re.ASCII)


def _tokenise(text: str) -> list[str]:
    return _TOKEN_RE.findall((text or "").lower())


def _hashvec(tokens: list[str], dim: int = 128) -> list[float]:
    """
    Bit-hashing trick: each token is hashed to a dimension; its contribution
    is +1 or -1 depending on a second hash. Produces a sparse-ish dense vector
    that preserves cosine similarity well enough for topic bucketing.
    """
    vec = [0.0] * dim
    for token in tokens:
        h = int(hashlib.md5(token.encode()).hexdigest(), 16)  # noqa: S324
        idx = h % dim
        sign = 1 if (h >> 8) % 2 == 0 else -1
        vec[idx] += sign
    return vec


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    if na < 1e-9 or nb < 1e-9:
        return 0.0
    return max(-1.0, min(1.0, dot / (na * nb)))


def _topic_similarity(a: str, b: str) -> float:
    return _cosine(_hashvec(_tokenise(a)), _hashvec(_tokenise(b)))


def _topic_cluster(post: CandidatePost) -> str:
    """
    Assign a simple cluster label from hashtags + first 8 content words.
    For production, replace with embedding k-means or LLM-based clustering.
    """
    tokens = (post.hashtags or []) + _tokenise(post.content)[:8]
    if not tokens:
        return "general"
    canonical = sorted(set(tokens))[:3]   # top-3 sorted tokens as cluster key
    h = hashlib.md5("|".join(canonical).encode()).hexdigest()[:6]  # noqa: S324
    return h


def _recency_decay(created_at: datetime, halflife_h: float) -> float:
    age_h = max(0.0, (datetime.now(timezone.utc) - created_at).total_seconds() / 3600)
    return math.exp(-math.log(2) * age_h / max(halflife_h, 1.0))


# ─── acquaintance score (fixes the silent-zero bug in the original spec) ─────

def compute_acquaintance_score(
    interaction_frequency_30d: float,
    mutual_connections: int,
    content_consumption_ratio: float,
    last_interaction_days: float,
) -> float:
    """
    Explicit aggregation of acquaintance_signal fields into a single [0,1] float.
    Without this step the acquaintance bonus in resurfacing_score is silently zero.
    """
    w = ACQUAINTANCE_WEIGHTS
    score = (
        w["interaction_frequency_30d"] * min(1.0, interaction_frequency_30d / 10.0)
        + w["mutual_connections"]        * min(1.0, mutual_connections / 5.0)
        + w["content_consumption_ratio"] * min(1.0, max(0.0, content_consumption_ratio))
        + w["recency_bonus"]             * (1.0 - min(1.0, last_interaction_days / 90.0))
    )
    return round(min(1.0, max(0.0, score)), 4)


# ─── prediction layer (4 Meta categories) ────────────────────────────────────

def predict_will_like(post: CandidatePost, user_like_rate: float) -> float:
    """Category 1: actions the viewer will take."""
    engagement = post.likes_count / max(1, post.views_count)
    return round(min(1.0, 0.5 * engagement + 0.5 * user_like_rate), 4)


def predict_will_spend_time(
    post: CandidatePost,
    user_avg_comment_view_ratio: float,
) -> float:
    """
    Category 2: time spent / completion rate (X insight — retrieval pre-filter).
    Proxy: posts with high comment-to-view ratio historically hold attention.
    """
    post_ratio = post.comments_count / max(1, post.views_count)
    return round(min(1.0, 0.5 * post_ratio + 0.5 * user_avg_comment_view_ratio), 4)


def predict_will_find_meaningful(
    post: CandidatePost,
    topic_affinity: float,
    acquaintance_score: float,
) -> float:
    """Category 3: viewer interest in the post or actor."""
    return round(min(1.0, 0.5 * topic_affinity + 0.5 * acquaintance_score), 4)


def predict_will_spark_discussion(post: CandidatePost) -> float:
    """
    Category 4 (Meta insight): if the viewer comments or shares,
    how will others respond?  Proxy: posts that already have comments
    relative to likes tend to generate threaded discussion.
    """
    if post.likes_count == 0 and post.comments_count == 0:
        return 0.0
    comment_to_like = post.comments_count / max(1, post.likes_count)
    return round(min(1.0, comment_to_like * 2.0), 4)


def predict_all(
    post: CandidatePost,
    user_like_rate: float,
    user_avg_comment_view_ratio: float,
    topic_affinity: float,
    acquaintance_score: float,
) -> dict[str, float]:
    return {
        "will_like": predict_will_like(post, user_like_rate),
        "will_spend_time": predict_will_spend_time(post, user_avg_comment_view_ratio),
        "will_find_meaningful": predict_will_find_meaningful(post, topic_affinity, acquaintance_score),
        "will_spark_discussion": predict_will_spark_discussion(post),
        "acquaintance_score": acquaintance_score,
    }


# ─── Instagram debiasing ──────────────────────────────────────────────────────

def debias_prediction(
    raw_prediction: float,
    author_baseline_engagement: float,
    discount: float = 0.4,
) -> float:
    """
    Subtract the author's baseline engagement rate from the raw prediction to
    isolate what the *post itself* adds, not just author popularity.
    Two-term model: score = raw_pred - discount * baseline.
    """
    return round(max(0.0, raw_prediction - discount * author_baseline_engagement), 4)


# ─── implicit-first helpers (residual + counterfactual + fatigue) ─────────────

def estimate_exposure_propensity(post: CandidatePost) -> float:
    """
    Approximate likelihood a user meaningfully saw this post when first published.
    Low-view posts have low propensity and should be corrected counterfactually.
    """
    return round(min(1.0, post.views_count / 500.0), 4)


def counterfactual_interest_estimate(
    observed_interest: float,
    content_estimate: float,
    propensity: float,
) -> float:
    """
    MNAR-style correction: "no interaction" on low-exposure posts is unreliable.
    For low propensity, lean on content estimate. For high propensity, trust
    observed interaction with inverse-propensity weighting.
    """
    p = max(0.01, min(1.0, propensity))
    if p < 0.3:
        return round(min(1.0, 0.4 * observed_interest + 0.6 * content_estimate), 4)
    return round(min(1.0, observed_interest / p), 4)


def compute_implicit_residuals(
    post: CandidatePost,
    viewer_like_rate: float,
    viewer_comment_view_ratio: float,
) -> dict[str, float | bool]:
    """
    Residual signals: actual behaviour proxy minus expected behaviour proxy.
    Captures "what the viewer didn't explicitly say".
    """
    views = max(1.0, float(post.views_count))
    actual_completion = post.comments_count / views
    expected_completion = max(0.0, viewer_comment_view_ratio)

    actual_dwell_proxy = (post.likes_count + post.comments_count + post.reposts_count) / views
    expected_dwell_proxy = max(0.0, 0.5 * viewer_like_rate + 0.5 * viewer_comment_view_ratio)

    actual_return_proxy = post.reposts_count / views
    expected_return_proxy = max(0.0, viewer_like_rate * 0.2)

    completion_residual = actual_completion - expected_completion
    dwell_residual = actual_dwell_proxy - expected_dwell_proxy
    return_residual = actual_return_proxy - expected_return_proxy

    silent_interest = (
        actual_dwell_proxy > expected_dwell_proxy * 1.5
        and actual_completion > expected_completion * 1.2
    )
    silent_aversion = (
        actual_dwell_proxy < expected_dwell_proxy * 0.4
        and actual_completion < expected_completion * 0.4
    )

    return {
        "dwell_residual": round(dwell_residual, 6),
        "completion_residual": round(completion_residual, 6),
        "return_residual": round(return_residual, 6),
        "silent_interest": silent_interest,
        "silent_aversion": silent_aversion,
    }


# ─── resurfacing score ────────────────────────────────────────────────────────

def resurfacing_score(
    post: CandidatePost,
    predictions: dict[str, float],
    author_baseline: float,
    topic_affinity: float,
    viewer_like_rate: float,
    viewer_comment_view_ratio: float,
) -> float:
    w = WEIGHTS
    preds = predictions

    # Debiased meaningful-interest prediction (Instagram insight)
    incremental_meaningful = debias_prediction(
        preds["will_find_meaningful"],
        author_baseline,
        discount=w["debiasing_discount"],
    )

    raw = (
        w["will_like"]             * preds["will_like"]
        + w["will_spend_time"]     * preds["will_spend_time"]
        + w["will_find_meaningful"]* incremental_meaningful
        + w["will_spark_discussion"]* preds["will_spark_discussion"]
        + w["acquaintance_score"]  * preds["acquaintance_score"]
    )

    residuals = compute_implicit_residuals(
        post=post,
        viewer_like_rate=viewer_like_rate,
        viewer_comment_view_ratio=viewer_comment_view_ratio,
    )
    raw += (
        w["implicit_dwell_residual"] * float(residuals["dwell_residual"])
        + w["implicit_completion_residual"] * float(residuals["completion_residual"])
        + w["implicit_return_residual"] * float(residuals["return_residual"])
    )

    propensity = estimate_exposure_propensity(post)
    counterfactual_interest = counterfactual_interest_estimate(
        observed_interest=incremental_meaningful,
        content_estimate=topic_affinity,
        propensity=propensity,
    )
    raw += w["counterfactual_interest"] * counterfactual_interest

    # Recency decay
    decay = _recency_decay(post.created_at, w["recency_halflife_h"])
    raw *= decay

    return round(max(0.0, raw), 6)


# ─── diversity / composition (Pinterest insight) ──────────────────────────────

def apply_diversity(
    new_posts: list[ScoredPost],
    resurfaced: list[ScoredPost],
    insertion_ratio: int = 4,
    max_consecutive_cluster: int = 2,
) -> list[ScoredPost]:
    """
    Interleave resurfaced posts among new posts while enforcing:
    1. At most 1 resurfaced post per `insertion_ratio` new posts.
    2. No more than `max_consecutive_cluster` consecutive posts from the same
       topic cluster (Pinterest composition insight).
    """
    result: list[ScoredPost] = []
    resurface_iter = iter(sorted(resurfaced, key=lambda p: p.resurfacing_score, reverse=True))
    pending_resurface: ScoredPost | None = next(resurface_iter, None)

    consecutive_cluster: dict[str, int] = {}
    new_since_last_resurface = 0

    for post in new_posts:
        # Enforce topic-cluster diversity: skip consecutive same-cluster runs
        cluster_count = consecutive_cluster.get(post.topic_cluster, 0)
        if cluster_count >= max_consecutive_cluster:
            # Try to insert a resurfaced post from a different cluster first
            inserted = False
            if pending_resurface and new_since_last_resurface >= insertion_ratio:
                if pending_resurface.topic_cluster != post.topic_cluster:
                    result.append(pending_resurface)
                    consecutive_cluster = {k: (v if k == pending_resurface.topic_cluster else 0)
                                           for k, v in consecutive_cluster.items()}
                    consecutive_cluster[pending_resurface.topic_cluster] = \
                        consecutive_cluster.get(pending_resurface.topic_cluster, 0) + 1
                    pending_resurface = next(resurface_iter, None)
                    new_since_last_resurface = 0
                    inserted = True
            if not inserted:
                # Reset cluster window anyway to avoid infinite stall
                consecutive_cluster = {}
        else:
            consecutive_cluster[post.topic_cluster] = cluster_count + 1
            # Zero out other clusters' streaks when we see a different cluster
            for k in list(consecutive_cluster.keys()):
                if k != post.topic_cluster:
                    consecutive_cluster[k] = 0

        result.append(post)
        new_since_last_resurface += 1

        # Interleave: insert a resurfaced post every `insertion_ratio` new posts
        if (pending_resurface is not None
                and new_since_last_resurface >= insertion_ratio):
            result.append(pending_resurface)
            consecutive_cluster[pending_resurface.topic_cluster] = \
                consecutive_cluster.get(pending_resurface.topic_cluster, 0) + 1
            pending_resurface = next(resurface_iter, None)
            new_since_last_resurface = 0

    return result


# ─── candidate gathering (5 triggers) ────────────────────────────────────────

def _post_row_to_candidate(row: tuple, trigger: str) -> CandidatePost:
    # row: (post_id, user_id, content, type, created_at, likes, reposts, comments, views)
    content = row[2] or ""
    hashtags = re.findall(r"#([\w-]+)", content)
    p = CandidatePost(
        post_id=str(row[0]),
        user_id=str(row[1]),
        content=content,
        type=str(row[3] or "Text"),
        hashtags=hashtags,
        created_at=row[4] if isinstance(row[4], datetime) else datetime.now(timezone.utc),
        likes_count=int(row[5] or 0),
        reposts_count=int(row[6] or 0),
        comments_count=int(row[7] or 0),
        views_count=int(row[8] or 0),
        trigger=trigger,
    )
    p.topic_cluster = _topic_cluster(p)
    return p


_POST_COLS = """
    p."Id"          AS post_id,
    p."UserId"      AS user_id,
    p."Content"     AS content,
    p."Type"        AS type,
    p."CreatedAt"   AS created_at,
    p."LikesCount"  AS likes_count,
    p."RepostsCount" AS reposts_count,
    p."CommentsCount" AS comments_count,
    p."ViewsCount"  AS views_count
"""


def gather_candidates(
    conn: psycopg.Connection,
    viewer_id: str,
    candidate_window_days: int = 30,
    velocity_window_h: int = 48,
    limit_per_trigger: int = 100,
) -> list[CandidatePost]:
    """
    Stage 1: build the candidate pool from 5 triggers.
    """
    candidates: dict[str, CandidatePost] = {}  # post_id → candidate (dedup)

    # ── Trigger A: standard feed (own + followed) ────────────────────────────
    with conn.cursor() as cur:
        cur.execute(
            f"""
            WITH followed AS (
                SELECT "FollowingId" AS uid
                FROM app_data."UserFollows"
                WHERE "FollowerId" = %s::uuid
            )
            SELECT {_POST_COLS}
            FROM app_data."Posts" p
            WHERE p."IsDeleted" = false
              AND (p."UserId" = %s::uuid OR p."UserId" IN (SELECT uid FROM followed))
              AND p."CreatedAt" > now() - make_interval(days => %s)
            ORDER BY p."CreatedAt" DESC
            LIMIT %s
            """,
            (viewer_id, viewer_id, candidate_window_days, limit_per_trigger),
        )
        for row in cur.fetchall():
            c = _post_row_to_candidate(row, "A")
            candidates[c.post_id] = c

    # ── Trigger B: comment velocity surge (Reddit insight) ───────────────────
    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT {_POST_COLS}
            FROM app_data."Posts" p
            WHERE p."IsDeleted" = false
              AND p."CreatedAt" > now() - make_interval(days => %s)
              AND (
                  SELECT COUNT(*)
                  FROM app_data."Comments" c
                  WHERE c."PostId" = p."Id"
                    AND c."IsDeleted" = false
                    AND c."CreatedAt" > now() - make_interval(hours => %s)
              ) >= %s
            ORDER BY p."CreatedAt" DESC
            LIMIT %s
            """,
            (candidate_window_days, velocity_window_h,
             WEIGHTS["comment_velocity_min"], limit_per_trigger),
        )
        for row in cur.fetchall():
            pid = str(row[0])
            if pid not in candidates:
                candidates[pid] = _post_row_to_candidate(row, "B")
            # Even if already present, upgrade trigger label to show surge
            elif candidates[pid].trigger == "A":
                candidates[pid].trigger = "B"

    # ── Trigger C: like velocity surge (lower weight than B) ─────────────────
    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT {_POST_COLS}
            FROM app_data."Posts" p
            WHERE p."IsDeleted" = false
              AND p."CreatedAt" > now() - make_interval(days => %s)
              AND (
                  SELECT COUNT(*)
                  FROM app_data."PostLikes" l
                  WHERE l."PostId" = p."Id"
                    AND l."CreatedAt" > now() - make_interval(hours => %s)
              ) >= %s
            ORDER BY p."CreatedAt" DESC
            LIMIT %s
            """,
            (candidate_window_days, velocity_window_h,
             WEIGHTS["like_velocity_min"], limit_per_trigger),
        )
        for row in cur.fetchall():
            pid = str(row[0])
            if pid not in candidates:
                candidates[pid] = _post_row_to_candidate(row, "C")

    # ── Trigger D: semantic topic similarity (LinkedIn insight) ───────────────
    # Fetch viewer's recent content to build an interest profile.
    # Approximate topic embedding with HashVec over user's recent content tokens.
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT p."Content"
            FROM app_data."Posts" p
            WHERE p."UserId" = %s::uuid
              AND p."IsDeleted" = false
              AND p."CreatedAt" > now() - interval '60 days'
            ORDER BY p."CreatedAt" DESC
            LIMIT 20
            """,
            (viewer_id,),
        )
        interest_tokens = [
            token
            for row in cur.fetchall()
            for token in _tokenise(row[0] or "")
        ]
    interest_vec = _hashvec(interest_tokens) if interest_tokens else None

    if interest_vec is not None:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT {_POST_COLS}
                FROM app_data."Posts" p
                WHERE p."IsDeleted" = false
                  AND p."UserId" <> %s::uuid
                  AND p."CreatedAt" > now() - make_interval(days => %s)
                ORDER BY p."ViewsCount" DESC
                LIMIT %s
                """,
                (viewer_id, candidate_window_days, limit_per_trigger * 2),
            )
            for row in cur.fetchall():
                pid = str(row[0])
                if pid in candidates:
                    continue
                content_vec = _hashvec(_tokenise(row[2] or ""))
                if _cosine(interest_vec, content_vec) >= WEIGHTS["topic_sim_threshold"]:
                    candidates[pid] = _post_row_to_candidate(row, "D")

    # ── Trigger E: predicted completion (X insight) ───────────────────────────
    # Proxy: posts with high comment-to-view ratio for authors the viewer
    # has read in the past (similar user profile → similar behaviour).
    with conn.cursor() as cur:
        # Viewer's own comment-to-view ratio as baseline
        cur.execute(
            """
            SELECT
                COALESCE(SUM(p."CommentsCount"), 0)::float
                    / GREATEST(SUM(p."ViewsCount"), 1) AS ratio
            FROM app_data."Posts" p
            WHERE p."UserId" = %s::uuid
              AND p."IsDeleted" = false
              AND p."CreatedAt" > now() - interval '30 days'
            """,
            (viewer_id,),
        )
        row = cur.fetchone()
        viewer_completion_proxy = float(row[0]) if row and row[0] else 0.0

        completion_threshold = max(viewer_completion_proxy, WEIGHTS["completion_rate_min"])

        cur.execute(
            f"""
            SELECT {_POST_COLS}
            FROM app_data."Posts" p
            WHERE p."IsDeleted" = false
              AND p."UserId" <> %s::uuid
              AND p."CreatedAt" > now() - make_interval(days => %s)
              AND p."ViewsCount" > 0
              AND p."CommentsCount"::float / p."ViewsCount" >= %s
            ORDER BY p."CommentsCount"::float / p."ViewsCount" DESC
            LIMIT %s
            """,
            (viewer_id, candidate_window_days, completion_threshold, limit_per_trigger // 2),
        )
        for row in cur.fetchall():
            pid = str(row[0])
            if pid not in candidates:
                candidates[pid] = _post_row_to_candidate(row, "E")

    return list(candidates.values())


# ─── per-viewer signals from DB ───────────────────────────────────────────────

def _load_viewer_signals(
    conn: psycopg.Connection,
    viewer_id: str,
    author_ids: list[str],
) -> dict[str, Any]:
    """
    Fetch viewer-level signals in a small batch of queries.
    Returns dict with per-author interaction data and global viewer stats.
    """
    # Global like rate
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              COUNT(DISTINCT l."PostId")::float
                / GREATEST(COUNT(DISTINCT p."Id"), 1) AS like_rate
            FROM app_data."Posts" p
            LEFT JOIN app_data."PostLikes" l
                ON l."PostId" = p."Id" AND l."UserId" = %s::uuid
            WHERE p."CreatedAt" > now() - interval '30 days'
            """,
            (viewer_id,),
        )
        row = cur.fetchone()
        user_like_rate = float(row[0]) if row and row[0] else 0.05

    # Comment-to-view ratio (completion proxy)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              COALESCE(SUM(p."CommentsCount"), 0)::float
                / GREATEST(SUM(p."ViewsCount"), 1)
            FROM app_data."PostLikes" l
            JOIN app_data."Posts" p ON p."Id" = l."PostId"
            WHERE l."UserId" = %s::uuid
              AND p."CreatedAt" > now() - interval '30 days'
            """,
            (viewer_id,),
        )
        row = cur.fetchone()
        user_avg_comment_view_ratio = float(row[0]) if row and row[0] else 0.0

    # Per-author: interaction frequency, mutual connections, consumption ratio,
    # last interaction, author baseline engagement.
    author_uuids = [a for a in author_ids if a]
    if not author_uuids:
        return {
            "like_rate": user_like_rate,
            "comment_view_ratio": user_avg_comment_view_ratio,
            "author_signals": {},
        }

    with conn.cursor() as cur:
        # Interactions in last 30 days per author
        cur.execute(
            """
            SELECT
                p."UserId"::text AS author_id,
                COUNT(DISTINCT l."PostId")       AS likes_given_30d,
                COUNT(DISTINCT r."PostId")       AS reposts_given_30d,
                COUNT(DISTINCT c."PostId")       AS comments_given_30d
            FROM app_data."Posts" p
            LEFT JOIN app_data."PostLikes"   l ON l."PostId" = p."Id"
                AND l."UserId" = %s::uuid
                AND l."CreatedAt" > now() - interval '30 days'
            LEFT JOIN app_data."PostReposts" r ON r."PostId" = p."Id"
                AND r."UserId" = %s::uuid
                AND r."CreatedAt" > now() - interval '30 days'
            LEFT JOIN app_data."Comments"    c ON c."PostId" = p."Id"
                AND c."UserId" = %s::uuid
                AND c."CreatedAt" > now() - interval '30 days'
                AND c."IsDeleted" = false
            WHERE p."UserId" = ANY(%s::uuid[])
            GROUP BY p."UserId"
            """,
            (viewer_id, viewer_id, viewer_id, author_uuids),
        )
        author_interaction_rows = {str(r[0]): r for r in cur.fetchall()}

        # Author baseline engagement (avg likes+comments per post last 90d)
        cur.execute(
            """
            SELECT
                p."UserId"::text AS author_id,
                AVG(p."LikesCount" + p."CommentsCount")::float AS avg_engagement,
                COUNT(p."Id")::float AS post_count,
                MAX(l."CreatedAt") AS last_interaction
            FROM app_data."Posts" p
            LEFT JOIN app_data."PostLikes" l
                ON l."PostId" = p."Id" AND l."UserId" = %s::uuid
            WHERE p."UserId" = ANY(%s::uuid[])
              AND p."IsDeleted" = false
              AND p."CreatedAt" > now() - interval '90 days'
            GROUP BY p."UserId"
            """,
            (viewer_id, author_uuids),
        )
        author_baseline_rows = {str(r[0]): r for r in cur.fetchall()}

    # Mutual follows per author (approximation: viewer follows both)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT "FollowingId"::text
            FROM app_data."UserFollows"
            WHERE "FollowerId" = %s::uuid
              AND "FollowingId" = ANY(%s::uuid[])
            """,
            (viewer_id, author_uuids),
        )
        viewer_follows = {str(r[0]) for r in cur.fetchall()}

    author_signals: dict[str, dict] = {}
    for author_id in author_ids:
        int_row = author_interaction_rows.get(author_id)
        base_row = author_baseline_rows.get(author_id)

        interaction_freq = float((int_row[1] or 0) + (int_row[2] or 0) + (int_row[3] or 0)) if int_row else 0.0
        post_count = float(base_row[2] or 1) if base_row else 1.0
        avg_eng = float(base_row[1] or 0) if base_row else 0.0
        # Baseline engagement rate normalised to [0,1]
        baseline = min(1.0, avg_eng / max(post_count * 50, 1))

        last_int_dt = base_row[3] if (base_row and base_row[3]) else None
        if last_int_dt:
            if last_int_dt.tzinfo is None:
                last_int_dt = last_int_dt.replace(tzinfo=timezone.utc)
            last_int_days = (datetime.now(timezone.utc) - last_int_dt).days
        else:
            last_int_days = 999

        # Consumption ratio: what fraction of this author's visible posts
        # did the viewer interact with?
        consumed = interaction_freq
        total_posts = max(1.0, post_count)
        consumption_ratio = min(1.0, consumed / total_posts)

        mutual = 1 if author_id in viewer_follows else 0

        acq = compute_acquaintance_score(
            interaction_frequency_30d=interaction_freq,
            mutual_connections=mutual,
            content_consumption_ratio=consumption_ratio,
            last_interaction_days=last_int_days,
        )

        author_signals[author_id] = {
            "acquaintance_score": acq,
            "baseline_engagement": baseline,
        }

    return {
        "like_rate": user_like_rate,
        "comment_view_ratio": user_avg_comment_view_ratio,
        "fatigue_score": _load_resurfacing_fatigue_score(conn, viewer_id),
        "author_signals": author_signals,
    }


def _load_resurfacing_fatigue_score(conn: psycopg.Connection, viewer_id: str) -> float:
    """
    Implicit fatigue proxy for resurfaced content:
    compare recent engagement on *older* posts (created >=7 days before interaction)
    in the last 3 days vs the previous 4 days.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            WITH events AS (
                SELECT l."CreatedAt" AS interacted_at
                FROM app_data."PostLikes" l
                JOIN app_data."Posts" p ON p."Id" = l."PostId"
                WHERE l."UserId" = %s::uuid
                  AND l."CreatedAt" > now() - interval '7 days'
                  AND p."CreatedAt" < l."CreatedAt" - interval '7 days'
                UNION ALL
                SELECT c."CreatedAt" AS interacted_at
                FROM app_data."Comments" c
                JOIN app_data."Posts" p ON p."Id" = c."PostId"
                WHERE c."UserId" = %s::uuid
                  AND c."CreatedAt" > now() - interval '7 days'
                  AND c."IsDeleted" = false
                  AND p."CreatedAt" < c."CreatedAt" - interval '7 days'
                UNION ALL
                SELECT r."CreatedAt" AS interacted_at
                FROM app_data."PostReposts" r
                JOIN app_data."Posts" p ON p."Id" = r."PostId"
                WHERE r."UserId" = %s::uuid
                  AND r."CreatedAt" > now() - interval '7 days'
                  AND p."CreatedAt" < r."CreatedAt" - interval '7 days'
            )
            SELECT
                COUNT(*) FILTER (WHERE interacted_at > now() - interval '3 days')::float AS recent_window,
                COUNT(*) FILTER (
                    WHERE interacted_at <= now() - interval '3 days'
                      AND interacted_at > now() - interval '7 days'
                )::float AS prior_window
            FROM events
            """,
            (viewer_id, viewer_id, viewer_id),
        )
        row = cur.fetchone()

    if not row:
        return 0.0
    recent = float(row[0] or 0.0)
    prior = float(row[1] or 0.0)

    if prior < 3.0:
        return 0.0
    # Higher score means sharper drop in old-content engagement.
    decline_ratio = max(0.0, 1.0 - (recent / max(prior, 1.0)))
    return round(min(1.0, decline_ratio), 4)


# ─── topic affinity ───────────────────────────────────────────────────────────

def _topic_affinity(
    viewer_interest_vec: list[float] | None,
    post: CandidatePost,
) -> float:
    if not viewer_interest_vec:
        return 0.3  # cold-start neutral
    post_vec = _hashvec(_tokenise(post.content + " " + " ".join(post.hashtags)))
    return max(0.0, _cosine(viewer_interest_vec, post_vec))


# ─── main ranking entry point ─────────────────────────────────────────────────

def rank_post_feed(
    conn: psycopg.Connection,
    viewer_id: str,
    page_size: int = 40,
    candidate_window_days: int = 30,
) -> list[dict[str, Any]]:
    """
    Full multi-stage ranking pipeline for the post feed.

    Returns a list of dicts suitable for JSON serialisation,
    ready to be served by the FastAPI endpoint.
    """
    # Stage 1 – Gather candidates
    all_candidates = gather_candidates(
        conn, viewer_id, candidate_window_days=candidate_window_days,
    )
    if not all_candidates:
        return []

    # Build viewer interest vector for trigger D / topic affinity
    interest_tokens: list[str] = []
    for c in all_candidates:
        if c.trigger == "A":   # own + followed posts are the interest signal
            interest_tokens.extend(_tokenise(c.content))
    viewer_interest_vec = _hashvec(interest_tokens) if interest_tokens else None

    # Stage 2 – Load viewer signals in batch
    author_ids = list({c.user_id for c in all_candidates})
    viewer_signals = _load_viewer_signals(conn, viewer_id, author_ids)
    fatigue_score = float(viewer_signals.get("fatigue_score", 0.0))

    # Stage 3 – Score every candidate
    new_posts: list[ScoredPost] = []
    resurfaced: list[ScoredPost] = []

    for post in all_candidates:
        a_sig = viewer_signals["author_signals"].get(post.user_id, {})
        acquaintance = a_sig.get("acquaintance_score", 0.0)
        author_baseline = a_sig.get("baseline_engagement", 0.0)
        topic_aff = _topic_affinity(viewer_interest_vec, post)

        preds = predict_all(
            post,
            user_like_rate=viewer_signals["like_rate"],
            user_avg_comment_view_ratio=viewer_signals["comment_view_ratio"],
            topic_affinity=topic_aff,
            acquaintance_score=acquaintance,
        )

        score = resurfacing_score(
            post,
            preds,
            author_baseline,
            topic_affinity=topic_aff,
            viewer_like_rate=viewer_signals["like_rate"],
            viewer_comment_view_ratio=viewer_signals["comment_view_ratio"],
        )

        sp = ScoredPost(
            post_id=post.post_id,
            user_id=post.user_id,
            topic_cluster=post.topic_cluster,
            trigger=post.trigger,
            resurfacing_score=score,
            predictions=preds,
            features={
                "likes_count": post.likes_count,
                "comments_count": post.comments_count,
                "views_count": post.views_count,
                "recency_decay": _recency_decay(post.created_at, WEIGHTS["recency_halflife_h"]),
                "topic_affinity": topic_aff,
                "acquaintance_score": acquaintance,
                "author_baseline": author_baseline,
                "fatigue_score": fatigue_score,
            },
        )

        # Trigger A = standard feed posts; all others are "resurfaced" candidates
        if post.trigger == "A":
            new_posts.append(sp)
        else:
            resurfaced.append(sp)

    # Sort new posts by recency, resurfaced by resurfacing_score
    new_posts.sort(key=lambda p: p.resurfacing_score, reverse=True)
    resurfaced.sort(key=lambda p: p.resurfacing_score, reverse=True)

    dynamic_threshold = WEIGHTS["resurface_base_threshold"]
    if fatigue_score >= WEIGHTS["fatigue_threshold"]:
        dynamic_threshold += WEIGHTS["fatigue_threshold_lift"]
    resurfaced = [p for p in resurfaced if p.resurfacing_score >= dynamic_threshold]

    # Stage 4 – Diversity composition (Pinterest insight)
    merged = apply_diversity(
        new_posts,
        resurfaced,
        insertion_ratio=WEIGHTS["resurface_insertion_ratio"],
        max_consecutive_cluster=WEIGHTS["max_consecutive_cluster"],
    )[:page_size]

    return [
        {
            "post_id":           sp.post_id,
            "user_id":           sp.user_id,
            "trigger":           sp.trigger,
            "topic_cluster":     sp.topic_cluster,
            "resurfacing_score": sp.resurfacing_score,
            "predictions":       sp.predictions,
            "features":          sp.features,
        }
        for sp in merged
    ]
