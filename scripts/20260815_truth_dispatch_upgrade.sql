-- Wiseravenshare truth dispatch upgrade for DigitalOcean Managed PostgreSQL
-- Run this before deploying the journalism/dispatch upgrade to production.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app_data') THEN
        CREATE SCHEMA app_data;
    END IF;
END $$;

ALTER TABLE IF EXISTS app_data."Posts"
    ADD COLUMN IF NOT EXISTS "IsTruthDispatch" boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "TruthDeclarationAccepted" boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_posts_is_truth_dispatch_created_at
    ON app_data."Posts" ("IsTruthDispatch", "CreatedAt" DESC);

CREATE INDEX IF NOT EXISTS idx_posts_location_name_created_at
    ON app_data."Posts" ("LocationName", "CreatedAt" DESC);

-- Required DigitalOcean Spaces prefixes for this upgrade:
--   wiseravenshare/ravensight/video/
--   wiseravenshare/ravensight/photo/
--   wiseravenshare/ravensight/music/
--   wiseravenshare/journalist_dispatches/
-- These are object-key prefixes; Spaces does not require physical folder creation.
