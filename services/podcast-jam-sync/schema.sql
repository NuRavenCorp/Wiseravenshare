-- =============================================================================
-- Podcast + Jam Sync Schema Migration
-- Run once against the WiseRavenShare PostgreSQL database.
-- All tables land in app_data schema (consistent with the rest of the app).
-- =============================================================================

SET search_path = app_data;

-- ── Podcast sessions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS podcast_sessions (
    session_id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    host_user_id        UUID        NOT NULL,
    title               TEXT        NOT NULL,
    recording_state     TEXT        NOT NULL DEFAULT 'idle',
    current_card_index  INTEGER     NOT NULL DEFAULT 0,
    total_cards         INTEGER     NOT NULL DEFAULT 0,
    card_state          TEXT        NOT NULL DEFAULT 'pending',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS podcast_device_sessions (
    id                  BIGSERIAL   PRIMARY KEY,
    session_id          UUID        NOT NULL REFERENCES podcast_sessions(session_id) ON DELETE CASCADE,
    device_id           TEXT        NOT NULL,
    device_type         TEXT        NOT NULL,       -- phone|tablet|laptop|desktop
    capabilities        JSONB       NOT NULL DEFAULT '{}',
    recording_state     TEXT        NOT NULL DEFAULT 'idle',
    current_card_index  INTEGER     NOT NULL DEFAULT 0,
    video_feed_active   BOOLEAN     NOT NULL DEFAULT FALSE,
    video_feed_type     TEXT                 DEFAULT 'camera',
    connected_at        TIMESTAMPTZ,
    last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (session_id, device_id)
);

-- Script cards: shown one at a time, text-message style
CREATE TABLE IF NOT EXISTS podcast_script_cards (
    id                  BIGSERIAL   PRIMARY KEY,
    session_id          UUID        NOT NULL REFERENCES podcast_sessions(session_id) ON DELETE CASCADE,
    card_index          INTEGER     NOT NULL,
    title               TEXT        NOT NULL DEFAULT '',
    body                TEXT        NOT NULL DEFAULT '',
    media_url           TEXT,
    media_type          TEXT,                       -- image|video|audio|none
    duration_seconds    INTEGER,
    speaker_hint        TEXT,                       -- host|co-host|guest
    UNIQUE (session_id, card_index)
);

-- Chunked recording uploads (resumable, SHA-256 dedup)
CREATE TABLE IF NOT EXISTS podcast_recording_chunks (
    id                  BIGSERIAL   PRIMARY KEY,
    session_id          UUID        NOT NULL,
    device_id           TEXT        NOT NULL,
    chunk_index         INTEGER     NOT NULL,
    storage_key         TEXT        NOT NULL,
    size_bytes          BIGINT      NOT NULL,
    sha256              TEXT        NOT NULL,
    uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (session_id, device_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_prc_session_device ON podcast_recording_chunks (session_id, device_id);

-- ── Jam sessions ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jam_sessions (
    jam_id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    host_user_id    UUID        NOT NULL,
    title           TEXT        NOT NULL,
    status          TEXT        NOT NULL DEFAULT 'waiting',   -- waiting|active|ended
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jam_musicians (
    id              BIGSERIAL   PRIMARY KEY,
    jam_id          UUID        NOT NULL REFERENCES jam_sessions(jam_id) ON DELETE CASCADE,
    musician_id     TEXT        NOT NULL,
    role            TEXT        NOT NULL DEFAULT 'other',     -- drummer|bassist|guitarist|keyboardist|vocalist|other
    display_name    TEXT,
    rtt_ms          FLOAT                DEFAULT 0,
    connected_at    TIMESTAMPTZ,
    last_seen_at    TIMESTAMPTZ          DEFAULT now(),
    UNIQUE (jam_id, musician_id)
);

-- Shared metronome state (one row per jam session)
CREATE TABLE IF NOT EXISTS jam_metronome_state (
    jam_id          UUID        PRIMARY KEY REFERENCES jam_sessions(jam_id) ON DELETE CASCADE,
    bpm             INTEGER     NOT NULL DEFAULT 120,
    start_ts        TIMESTAMPTZ,
    running         BOOLEAN     NOT NULL DEFAULT FALSE
);

-- Computed pairwise latency offset matrix (persisted for reconnects)
CREATE TABLE IF NOT EXISTS jam_offset_matrix (
    jam_id          UUID        PRIMARY KEY REFERENCES jam_sessions(jam_id) ON DELETE CASCADE,
    matrix          JSONB       NOT NULL DEFAULT '{}',
    computed_at     TIMESTAMPTZ
);
