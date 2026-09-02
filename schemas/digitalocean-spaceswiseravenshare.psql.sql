-- Wiseravenshare DigitalOcean Spaces / Storage Registry Setup
-- Copy into Postgres SQL editor or run via psql.
-- This keeps the media bucket dedicated to Wiseravenshare and records metadata in app_data.bucket_objects.

CREATE SCHEMA IF NOT EXISTS app_data;

CREATE TABLE IF NOT EXISTS app_data.bucket_objects (
    id TEXT PRIMARY KEY,
    owner_user_id UUID NULL,
    provider TEXT NOT NULL DEFAULT 'digitalocean_spaces',
    bucket_name TEXT NOT NULL DEFAULT 'bucket-wrs-01010',
    region TEXT NOT NULL DEFAULT 'nyc3',
    endpoint TEXT NOT NULL DEFAULT 'https://nyc3.digitaloceanspaces.com',
    folder_path TEXT NOT NULL DEFAULT 'wiseravenshare/',
    object_key TEXT NOT NULL,
    original_file_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
    etag TEXT NULL,
    acl TEXT NOT NULL DEFAULT 'private',
    cdn_base_url TEXT NULL,
    public_url TEXT NULL,
    upload_status TEXT NOT NULL DEFAULT 'uploaded',
    redundancy TEXT NOT NULL DEFAULT 'regional',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL,
    CONSTRAINT fk_bucket_objects_owner
        FOREIGN KEY (owner_user_id) REFERENCES app_data."Users" ("Id") ON DELETE SET NULL,
    CONSTRAINT uq_bucket_objects_bucket_key UNIQUE (bucket_name, object_key)
);

CREATE INDEX IF NOT EXISTS idx_bucket_objects_owner_created
    ON app_data.bucket_objects (owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bucket_objects_bucket_created
    ON app_data.bucket_objects (bucket_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bucket_objects_folder_created
    ON app_data.bucket_objects (folder_path, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bucket_objects_status_created
    ON app_data.bucket_objects (upload_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bucket_objects_metadata_gin
    ON app_data.bucket_objects USING GIN (metadata);

CREATE OR REPLACE FUNCTION app_data.set_updated_at_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bucket_objects_updated_at ON app_data.bucket_objects;
CREATE TRIGGER trg_bucket_objects_updated_at
BEFORE UPDATE ON app_data.bucket_objects
FOR EACH ROW EXECUTE FUNCTION app_data.set_updated_at_timestamp();

-- Optional: verify the table exists
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'app_data'
  AND table_name = 'bucket_objects';