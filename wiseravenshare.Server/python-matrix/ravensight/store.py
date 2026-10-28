"""
ravensight/store.py — asyncpg persistence layer for Ravensight sessions.

All tables live in app_data schema alongside the rest of the application.
Tables are created idempotently via ensure_ravensight_schema() called at startup.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

import asyncpg

logger = logging.getLogger("ravensight.store")


# ── DDL ─────────────────────────────────────────────────────────────────────

DDL = """
CREATE TABLE IF NOT EXISTS app_data.ravensight_sessions (
    id              TEXT        PRIMARY KEY,
    join_code       TEXT        NOT NULL UNIQUE,
    title           TEXT        NOT NULL,
    created_by      TEXT        NOT NULL,
    state           TEXT        NOT NULL DEFAULT 'green_room',
    join_policy     TEXT        NOT NULL DEFAULT 'auto_if_invited',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    went_live_at    TIMESTAMPTZ,
    ended_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_rv_sessions_created_by ON app_data.ravensight_sessions (created_by);
CREATE INDEX IF NOT EXISTS ix_rv_sessions_state      ON app_data.ravensight_sessions (state);

CREATE TABLE IF NOT EXISTS app_data.ravensight_crew (
    id          BIGSERIAL   PRIMARY KEY,
    session_id  TEXT        NOT NULL REFERENCES app_data.ravensight_sessions(id) ON DELETE CASCADE,
    user_id     TEXT        NOT NULL,
    role        TEXT        NOT NULL,
    invited_by  TEXT,
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_rv_crew_session_user ON app_data.ravensight_crew (session_id, user_id);

CREATE TABLE IF NOT EXISTS app_data.ravensight_cues (
    id          TEXT        PRIMARY KEY,
    session_id  TEXT        NOT NULL,
    issued_by   TEXT        NOT NULL,
    target_role TEXT,
    target_user TEXT,
    message     TEXT        NOT NULL,
    severity    TEXT        NOT NULL DEFAULT 'info',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_rv_cues_session ON app_data.ravensight_cues (session_id, created_at);

CREATE TABLE IF NOT EXISTS app_data.ravensight_scene_events (
    id          BIGSERIAL   PRIMARY KEY,
    session_id  TEXT        NOT NULL,
    issued_by   TEXT        NOT NULL,
    changes     JSONB       NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_rv_scene_session ON app_data.ravensight_scene_events (session_id);

CREATE TABLE IF NOT EXISTS app_data.ravensight_recordings (
    id          BIGSERIAL   PRIMARY KEY,
    session_id  TEXT        NOT NULL,
    started_by  TEXT        NOT NULL,
    active      BOOLEAN     NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_rv_rec_session ON app_data.ravensight_recordings (session_id);
"""


async def ensure_ravensight_schema(pool: asyncpg.Pool) -> None:
    """Idempotently create ravensight tables at startup."""
    async with pool.acquire() as conn:
        await conn.execute(DDL)
    logger.info("Ravensight schema verified.")


# ── Store ───────────────────────────────────────────────────────────────────

class RavensightStore:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self.pool = pool

    # ── sessions ──────────────────────────────────────────────────────────

    async def create_session(
        self, sid: str, join_code: str, title: str,
        created_by: str, state: str, join_policy: str,
    ) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO app_data.ravensight_sessions
                    (id, join_code, title, created_by, state, join_policy)
                VALUES ($1,$2,$3,$4,$5,$6)
                ON CONFLICT DO NOTHING
                """,
                sid, join_code, title, created_by, state, join_policy,
            )

    async def update_state(
        self,
        sid: str,
        state: str,
        went_live_at: Optional[datetime] = None,
        ended_at: Optional[datetime] = None,
    ) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE app_data.ravensight_sessions
                SET state = $1, went_live_at = $2, ended_at = $3
                WHERE id = $4
                """,
                state, went_live_at, ended_at, sid,
            )

    async def get_open_sessions_for_user(self, user_id: str) -> list[dict]:
        """Sessions where the user is crew and not ended."""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT DISTINCT s.*
                FROM app_data.ravensight_sessions s
                JOIN app_data.ravensight_crew c ON c.session_id = s.id
                WHERE c.user_id = $1
                  AND s.state <> 'ended'
                  AND c.left_at IS NULL
                ORDER BY s.created_at DESC
                LIMIT 10
                """,
                user_id,
            )
        return [dict(r) for r in rows]

    # ── crew ──────────────────────────────────────────────────────────────

    async def record_join(
        self, session_id: str, user_id: str, role: str,
        invited_by: Optional[str], joined_at: datetime,
    ) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO app_data.ravensight_crew
                    (session_id, user_id, role, invited_by, joined_at)
                VALUES ($1,$2,$3,$4,$5)
                """,
                session_id, user_id, role, invited_by, joined_at,
            )

    async def record_leave(self, session_id: str, user_id: str) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE app_data.ravensight_crew
                SET left_at = NOW()
                WHERE session_id = $1 AND user_id = $2 AND left_at IS NULL
                """,
                session_id, user_id,
            )

    # ── cues ──────────────────────────────────────────────────────────────

    async def record_cue(
        self, cue_id: str, session_id: str, issued_by: str,
        target_role: Optional[str], target_user: Optional[str],
        message: str, severity: str,
    ) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO app_data.ravensight_cues
                    (id, session_id, issued_by, target_role, target_user, message, severity)
                VALUES ($1,$2,$3,$4,$5,$6,$7)
                """,
                cue_id, session_id, issued_by,
                target_role, target_user, message, severity,
            )

    async def get_cues(self, session_id: str, limit: int = 100) -> list[dict]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM app_data.ravensight_cues
                WHERE session_id = $1
                ORDER BY created_at DESC
                LIMIT $2
                """,
                session_id, limit,
            )
        return [dict(r) for r in rows]

    # ── scene events ──────────────────────────────────────────────────────

    async def record_scene_event(
        self, session_id: str, issued_by: str, changes: dict,
    ) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO app_data.ravensight_scene_events
                    (session_id, issued_by, changes)
                VALUES ($1,$2,$3)
                """,
                session_id, issued_by, json.dumps(changes),
            )

    # ── recordings ────────────────────────────────────────────────────────

    async def record_recording_event(
        self, session_id: str, started_by: str, active: bool,
    ) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO app_data.ravensight_recordings
                    (session_id, started_by, active)
                VALUES ($1,$2,$3)
                """,
                session_id, started_by, active,
            )

    # ── user display name ─────────────────────────────────────────────────

    async def get_display_name(self, user_id: str) -> str:
        """Fetches the user's display name from the Users table."""
        try:
            async with self.pool.acquire() as conn:
                row = await conn.fetchrow(
                    """
                    SELECT COALESCE("DisplayName", "Username", LEFT("Email",20)) AS dn
                    FROM app_data."Users"
                    WHERE "Id"::text = $1
                    LIMIT 1
                    """,
                    user_id,
                )
            return row["dn"] if row else f"user-{user_id[:6]}"
        except Exception:
            return f"user-{user_id[:6]}"
