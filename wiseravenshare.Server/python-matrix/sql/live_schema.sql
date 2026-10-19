CREATE TABLE IF NOT EXISTS live_streams (
    stream_id            UUID PRIMARY KEY,
    host_user_id         UUID NOT NULL,
    title                TEXT NOT NULL,
    category             TEXT NOT NULL DEFAULT 'general',
    hashtags             TEXT[] DEFAULT '{}',
    language             TEXT DEFAULT 'en',
    country              TEXT DEFAULT '',
    started_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at             TIMESTAMPTZ,
    viewer_count         INTEGER NOT NULL DEFAULT 0,
    total_watch_seconds  DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_sessions       INTEGER NOT NULL DEFAULT 0,
    likes                INTEGER NOT NULL DEFAULT 0,
    comments             INTEGER NOT NULL DEFAULT 0,
    shares               INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ix_live_streams_active
    ON live_streams (ended_at, started_at DESC)
    WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS live_interactions (
    id              BIGSERIAL PRIMARY KEY,
    viewer_id       UUID NOT NULL,
    stream_id       UUID NOT NULL REFERENCES live_streams(stream_id),
    watch_seconds   DOUBLE PRECISION NOT NULL DEFAULT 0,
    liked           BOOLEAN NOT NULL DEFAULT FALSE,
    commented       BOOLEAN NOT NULL DEFAULT FALSE,
    shared          BOOLEAN NOT NULL DEFAULT FALSE,
    followed_after  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_live_interactions_viewer
    ON live_interactions (viewer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_live_interactions_stream
    ON live_interactions (stream_id);

CREATE TABLE IF NOT EXISTS follows (
    follower_id  UUID NOT NULL,
    host_user_id UUID NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (follower_id, host_user_id)
);
