"""
chat/models.py — SQLAlchemy table definitions for the WiseRavenShare chat layer.

Tables
──────
conversations        — DM or group conversation header
conversation_members — membership, role, mute, and read-marker per user
messages             — all message content (threading + post-cross-link)
message_reactions    — per-user emoji reactions on a message
message_reads        — per-message read receipt (batch-inserted)

Design invariants
─────────────────
• messages.shared_post_id → posts is a soft reference (no FK constraint)
  so the chat service never breaks if the post service is down.
• messages.parent_message_id → messages enables unlimited thread depth.
• thread_root_id is denormalised for fast thread-range queries.
• All IDs are UUID strings (String(36)) to match the rest of the app.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class ChatBase(DeclarativeBase):
    """Separate base so chat tables can be created independently if needed."""
    pass


class ConversationRow(ChatBase):
    __tablename__ = "conversations"
    __table_args__ = {"schema": "app_data"}

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    kind: Mapped[str] = mapped_column(String(16), index=True)          # "dm" | "group"
    title: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_by: Mapped[str] = mapped_column(String(36), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    last_message_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )


class ConversationMemberRow(ChatBase):
    __tablename__ = "conversation_members"
    __table_args__ = (
        Index("ix_conv_member_user", "user_id", "conversation_id"),
        {"schema": "app_data"},
    )

    conversation_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("app_data.conversations.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[str] = mapped_column(String(36), primary_key=True, index=True)
    role: Mapped[str] = mapped_column(String(16), default="member")    # "owner"|"admin"|"member"
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    muted_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    last_read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    last_read_message_id: Mapped[str | None] = mapped_column(String(36), nullable=True)


class MessageRow(ChatBase):
    __tablename__ = "messages"
    __table_args__ = (
        Index("ix_msg_conv_created", "conversation_id", "created_at"),
        Index("ix_msg_thread", "thread_root_id", "created_at"),
        {"schema": "app_data"},
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    conversation_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("app_data.conversations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    author_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    content: Mapped[str] = mapped_column(Text, default="", nullable=False)
    # Threading
    parent_message_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("app_data.messages.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    thread_root_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True, index=True,
    )
    # Cross-link to posts — intentionally no FK so chat survives independent of post service
    shared_post_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True, index=True,
    )
    shared_kind: Mapped[str | None] = mapped_column(
        String(16), nullable=True,              # "share" | "quote" | "reply_post" | "repost"
    )
    attachments: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    edited_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
        nullable=False,
    )


class MessageReactionRow(ChatBase):
    __tablename__ = "message_reactions"
    __table_args__ = {"schema": "app_data"}

    message_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("app_data.messages.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    emoji: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class MessageReadRow(ChatBase):
    __tablename__ = "message_reads"
    __table_args__ = {"schema": "app_data"}

    message_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("app_data.messages.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[str] = mapped_column(String(36), primary_key=True, index=True)
    read_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
