-- Migration: Add SavedMedia table for media library feature
-- Description: Creates table for storing user-saved media (photos, videos, music) with visibility control
-- Date: 2026-09-05

BEGIN;

-- Create SavedMedia table
CREATE TABLE IF NOT EXISTS app_data."SavedMedia" (
    "Id" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "SourcePostId" uuid,
    "Title" character varying(500) NOT NULL,
    "Description" text,
    "MediaType" integer NOT NULL,
    "MediaUrl" text NOT NULL,
    "MediaMetadata" jsonb,
    "ThumbnailUrl" text,
    "IsVisibleInFeed" boolean NOT NULL DEFAULT false,
    "IsPublished" boolean NOT NULL DEFAULT false,
    "PublishedPostId" uuid,
    "Tags" text[] DEFAULT ARRAY[]::text[],
    "ScheduledPublishAt" timestamp with time zone,
    "FileSizeBytes" bigint,
    "DurationSeconds" numeric,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL DEFAULT false,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_SavedMedia" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_SavedMedia_Users_UserId" FOREIGN KEY ("UserId") REFERENCES app_data."Users" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_SavedMedia_Posts_SourcePostId" FOREIGN KEY ("SourcePostId") REFERENCES app_data."Posts" ("Id") ON DELETE SET NULL,
    CONSTRAINT "FK_SavedMedia_Posts_PublishedPostId" FOREIGN KEY ("PublishedPostId") REFERENCES app_data."Posts" ("Id") ON DELETE SET NULL
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS "IX_SavedMedia_UserId" ON app_data."SavedMedia" ("UserId");
CREATE INDEX IF NOT EXISTS "IX_SavedMedia_UserId_IsDeleted" ON app_data."SavedMedia" ("UserId", "IsDeleted");
CREATE INDEX IF NOT EXISTS "IX_SavedMedia_UserId_IsVisibleInFeed" ON app_data."SavedMedia" ("UserId", "IsVisibleInFeed");
CREATE INDEX IF NOT EXISTS "IX_SavedMedia_UserId_MediaType" ON app_data."SavedMedia" ("UserId", "MediaType");
CREATE INDEX IF NOT EXISTS "IX_SavedMedia_UserId_CreatedAt" ON app_data."SavedMedia" ("UserId", "CreatedAt" DESC);
CREATE INDEX IF NOT EXISTS "IX_SavedMedia_ScheduledPublishAt" ON app_data."SavedMedia" ("ScheduledPublishAt") WHERE "ScheduledPublishAt" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "IX_SavedMedia_SourcePostId" ON app_data."SavedMedia" ("SourcePostId");
CREATE INDEX IF NOT EXISTS "IX_SavedMedia_PublishedPostId" ON app_data."SavedMedia" ("PublishedPostId");

-- Create index for tag searches
CREATE INDEX IF NOT EXISTS "IX_SavedMedia_UserId_Tags" ON app_data."SavedMedia" USING GIN ("Tags") WHERE "IsDeleted" = false;

COMMIT;
