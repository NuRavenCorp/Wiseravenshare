"""
chat/store.py — lightweight asyncpg-backed persistence for the chat layer.

All queries use raw SQL via asyncpg (same pattern as the rest of python-matrix)
so there is no ORM overhead in the hot path.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import asyncpg

logger = logging.getLogger("chat.store")


# ---------------------------------------------------------------------------
# DDL helpers — idempotent table creation
# ---------------------------------------------------------------------------

DDL = """
CREATE TABLE IF NOT EXISTS app_data.conversations (
    id               TEXT        PRIMARY KEY,
    kind             TEXT        NOT NULL,
    title            TEXT,
    created_by       TEXT        NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_message_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_conversations_last_message ON app_data.conversations (last_message_at DESC);

CREATE TABLE IF NOT EXISTS app_data.conversation_members (
    conversation_id  TEXT        NOT NULL REFERENCES app_data.conversations(id) ON DELETE CASCADE,
    user_id          TEXT        NOT NULL,
    role             TEXT        NOT NULL DEFAULT 'member',
    joined_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    muted_until      TIMESTAMPTZ,
    last_read_at     TIMESTAMPTZ,
    last_read_message_id TEXT,
    PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS ix_conv_member_user ON app_data.conversation_members (user_id, conversation_id);

CREATE TABLE IF NOT EXISTS app_data.messages (
    id                TEXT        PRIMARY KEY,
    conversation_id   TEXT        NOT NULL REFERENCES app_data.conversations(id) ON DELETE CASCADE,
    author_id         TEXT        NOT NULL,
    content           TEXT        NOT NULL DEFAULT '',
    parent_message_id TEXT        REFERENCES app_data.messages(id) ON DELETE SET NULL,
    thread_root_id    TEXT,
    shared_post_id    TEXT,
    shared_kind       TEXT,
    attachments       JSONB       NOT NULL DEFAULT '[]',
    edited_at         TIMESTAMPTZ,
    deleted_at        TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_msg_conv_created  ON app_data.messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS ix_msg_thread        ON app_data.messages (thread_root_id,  created_at);
CREATE INDEX IF NOT EXISTS ix_msg_author        ON app_data.messages (author_id);
CREATE INDEX IF NOT EXISTS ix_msg_shared_post   ON app_data.messages (shared_post_id) WHERE shared_post_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS app_data.message_reactions (
    message_id   TEXT        NOT NULL REFERENCES app_data.messages(id) ON DELETE CASCADE,
    user_id      TEXT        NOT NULL,
    emoji        TEXT        NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS app_data.message_reads (
    message_id  TEXT        NOT NULL REFERENCES app_data.messages(id) ON DELETE CASCADE,
    user_id     TEXT        NOT NULL,
    read_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (message_id, user_id)
);
CREATE INDEX IF NOT EXISTS ix_msg_reads_user ON app_data.message_reads (user_id);
"""


async def ensure_chat_schema(pool: asyncpg.Pool) -> None:
    """Idempotently create chat tables. Called once at startup."""
    async with pool.acquire() as conn:
        await conn.execute(DDL)
    logger.info("Chat schema verified.")


# ---------------------------------------------------------------------------
# Chat Store
# ---------------------------------------------------------------------------

class ChatStore:
    """
    Thin asyncpg wrapper. All methods are self-contained SQL statements;
    no transaction is held open between methods — callers compose transactions
    by passing an already-acquired connection when needed.
    """

    def __init__(self, pool: asyncpg.Pool) -> None:
        self.pool = pool

    # ── conversations ──────────────────────────────────────────────────────

    async def create_conversation(
        self,
        conv_id: str,
        kind: str,
        created_by: str,
        title: str | None = None,
    ) -> dict:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO app_data.conversations (id, kind, title, created_by)
                VALUES ($1, $2, $3, $4)
                RETURNING *
                """,
                conv_id, kind, title, created_by,
            )
        return dict(row)

    async def get_conversation(self, conv_id: str) -> dict | None:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM app_data.conversations WHERE id = $1", conv_id,
            )
        return dict(row) if row else None

    async def update_last_message_at(self, conv_id: str, ts: datetime) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                "UPDATE app_data.conversations SET last_message_at = $1 WHERE id = $2",
                ts, conv_id,
            )

    async def find_dm(self, user_a: str, user_b: str) -> dict | None:
        """Return the existing DM between two users, or None."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT c.*
                FROM app_data.conversations c
                WHERE c.kind = 'dm'
                  AND (
                    SELECT COUNT(*)
                    FROM app_data.conversation_members cm
                    WHERE cm.conversation_id = c.id
                      AND cm.user_id = ANY($1::text[])
                  ) = 2
                  AND (
                    SELECT COUNT(*)
                    FROM app_data.conversation_members cm2
                    WHERE cm2.conversation_id = c.id
                  ) = 2
                LIMIT 1
                """,
                [user_a, user_b],
            )
        return dict(row) if row else None

    async def list_conversations_for_user(self, user_id: str) -> list[dict]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT c.*, cm.last_read_at, cm.muted_until, cm.role
                FROM app_data.conversations c
                JOIN app_data.conversation_members cm
                  ON cm.conversation_id = c.id
                WHERE cm.user_id = $1
                ORDER BY c.last_message_at DESC
                LIMIT 100
                """,
                user_id,
            )
        return [dict(r) for r in rows]

    # ── members ────────────────────────────────────────────────────────────

    async def add_member(
        self, conv_id: str, user_id: str, role: str = "member",
    ) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO app_data.conversation_members (conversation_id, user_id, role)
                VALUES ($1, $2, $3)
                ON CONFLICT DO NOTHING
                """,
                conv_id, user_id, role,
            )

    async def get_member(self, conv_id: str, user_id: str) -> dict | None:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM app_data.conversation_members
                WHERE conversation_id = $1 AND user_id = $2
                """,
                conv_id, user_id,
            )
        return dict(row) if row else None

    async def get_member_ids(self, conv_id: str) -> list[str]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT user_id FROM app_data.conversation_members WHERE conversation_id = $1",
                conv_id,
            )
        return [r["user_id"] for r in rows]

    async def get_other_member_ids(self, conv_id: str, exclude_user: str) -> list[str]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT user_id FROM app_data.conversation_members
                WHERE conversation_id = $1 AND user_id <> $2
                """,
                conv_id, exclude_user,
            )
        return [r["user_id"] for r in rows]

    async def update_read_marker(
        self, conv_id: str, user_id: str, message_id: str,
    ) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE app_data.conversation_members
                SET last_read_at = NOW(), last_read_message_id = $3
                WHERE conversation_id = $1 AND user_id = $2
                """,
                conv_id, user_id, message_id,
            )

    # ── messages ───────────────────────────────────────────────────────────

    async def insert_message(self, row: dict) -> dict:
        async with self.pool.acquire() as conn:
            result = await conn.fetchrow(
                """
                INSERT INTO app_data.messages
                  (id, conversation_id, author_id, content,
                   parent_message_id, thread_root_id,
                   shared_post_id, shared_kind, attachments)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                RETURNING *
                """,
                row["id"], row["conversation_id"], row["author_id"],
                row.get("content", ""),
                row.get("parent_message_id"),
                row.get("thread_root_id"),
                row.get("shared_post_id"),
                row.get("shared_kind"),
                json.dumps(row.get("attachments") or []),
            )
        return dict(result)

    async def get_message(self, msg_id: str) -> dict | None:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM app_data.messages WHERE id = $1", msg_id,
            )
        return dict(row) if row else None

    async def list_messages(
        self,
        conv_id: str,
        before: datetime | None = None,
        limit: int = 50,
    ) -> list[dict]:
        async with self.pool.acquire() as conn:
            if before:
                rows = await conn.fetch(
                    """
                    SELECT * FROM app_data.messages
                    WHERE conversation_id = $1 AND created_at < $2
                    ORDER BY created_at DESC
                    LIMIT $3
                    """,
                    conv_id, before, limit,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT * FROM app_data.messages
                    WHERE conversation_id = $1
                    ORDER BY created_at DESC
                    LIMIT $2
                    """,
                    conv_id, limit,
                )
        return [dict(r) for r in rows]

    async def edit_message(self, msg_id: str, new_content: str) -> dict | None:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE app_data.messages
                SET content = $1, edited_at = NOW()
                WHERE id = $2 AND deleted_at IS NULL
                RETURNING *
                """,
                new_content, msg_id,
            )
        return dict(row) if row else None

    async def soft_delete_message(self, msg_id: str) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE app_data.messages
                SET content = '', deleted_at = NOW()
                WHERE id = $1
                """,
                msg_id,
            )

    async def count_unread(
        self, conv_id: str, user_id: str, since: datetime,
    ) -> int:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT COUNT(*) AS n
                FROM app_data.messages
                WHERE conversation_id = $1
                  AND author_id <> $2
                  AND created_at > $3
                  AND deleted_at IS NULL
                """,
                conv_id, user_id, since,
            )
        return int(row["n"])

    async def get_unread_message_ids(
        self, conv_id: str, user_id: str, up_to_created_at: datetime,
    ) -> list[str]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id FROM app_data.messages
                WHERE conversation_id = $1
                  AND author_id <> $2
                  AND created_at <= $3
                  AND deleted_at IS NULL
                  AND id NOT IN (
                    SELECT message_id FROM app_data.message_reads
                    WHERE user_id = $2
                  )
                """,
                conv_id, user_id, up_to_created_at,
            )
        return [r["id"] for r in rows]

    # ── read receipts ──────────────────────────────────────────────────────

    async def batch_insert_reads(
        self, records: list[tuple[str, str]],
    ) -> int:
        """records = [(message_id, user_id), ...]"""
        if not records:
            return 0
        async with self.pool.acquire() as conn:
            await conn.executemany(
                """
                INSERT INTO app_data.message_reads (message_id, user_id)
                VALUES ($1, $2)
                ON CONFLICT DO NOTHING
                """,
                records,
            )
        return len(records)

    async def get_read_authors(
        self, message_ids: list[str],
    ) -> list[str]:
        """Return distinct author_ids of the given messages (for read-receipt delivery)."""
        if not message_ids:
            return []
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT DISTINCT author_id
                FROM app_data.messages
                WHERE id = ANY($1::text[])
                """,
                message_ids,
            )
        return [r["author_id"] for r in rows]

    # ── reactions ──────────────────────────────────────────────────────────

    async def upsert_reaction(
        self, msg_id: str, user_id: str, emoji: str,
    ) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO app_data.message_reactions (message_id, user_id, emoji)
                VALUES ($1, $2, $3)
                ON CONFLICT (message_id, user_id)
                DO UPDATE SET emoji = EXCLUDED.emoji
                """,
                msg_id, user_id, emoji,
            )

    async def delete_reaction(self, msg_id: str, user_id: str) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM app_data.message_reactions WHERE message_id=$1 AND user_id=$2",
                msg_id, user_id,
            )

    async def get_reactions(self, msg_id: str) -> list[dict]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT * FROM app_data.message_reactions WHERE message_id=$1",
                msg_id,
            )
        return [dict(r) for r in rows]
