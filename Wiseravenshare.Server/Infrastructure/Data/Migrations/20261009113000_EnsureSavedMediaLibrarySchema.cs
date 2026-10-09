using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wiseravenshare.Server.Infrastructure.Data.Migrations
{
    /// <summary>
    /// Ensures SavedMedia schema/table shape exists for My Media Library across environments.
    /// Uses idempotent SQL so it can be safely applied to partially provisioned databases.
    /// </summary>
    public partial class EnsureSavedMediaLibrarySchema : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                CREATE SCHEMA IF NOT EXISTS app_data;
                CREATE EXTENSION IF NOT EXISTS pgcrypto;

                CREATE TABLE IF NOT EXISTS app_data."SavedMedia" (
                    "Id" uuid NOT NULL DEFAULT gen_random_uuid(),
                    "CreatedAt" timestamp with time zone NOT NULL DEFAULT now(),
                    "UpdatedAt" timestamp with time zone NOT NULL DEFAULT now(),
                    "IsDeleted" boolean NOT NULL DEFAULT false,
                    "DeletedAt" timestamp with time zone NULL,
                    "UserId" uuid NOT NULL,
                    "SourcePostId" uuid NULL,
                    "Title" character varying(500) NOT NULL,
                    "Description" text NULL,
                    "MediaType" integer NOT NULL,
                    "MediaUrl" character varying(2048) NOT NULL,
                    "MediaMetadata" jsonb NULL,
                    "ThumbnailUrl" character varying(2048) NULL,
                    "IsVisibleInFeed" boolean NOT NULL DEFAULT false,
                    "IsPublished" boolean NOT NULL DEFAULT false,
                    "PublishedPostId" uuid NULL,
                    "Tags" text[] NULL,
                    "ScheduledPublishAt" timestamp with time zone NULL,
                    "FileSizeBytes" bigint NULL,
                    "DurationSeconds" numeric NULL,
                    CONSTRAINT "PK_SavedMedia" PRIMARY KEY ("Id")
                );

                ALTER TABLE app_data."SavedMedia"
                    ADD COLUMN IF NOT EXISTS "CreatedAt" timestamp with time zone NOT NULL DEFAULT now(),
                    ADD COLUMN IF NOT EXISTS "UpdatedAt" timestamp with time zone NOT NULL DEFAULT now(),
                    ADD COLUMN IF NOT EXISTS "IsDeleted" boolean NOT NULL DEFAULT false,
                    ADD COLUMN IF NOT EXISTS "DeletedAt" timestamp with time zone NULL,
                    ADD COLUMN IF NOT EXISTS "UserId" uuid,
                    ADD COLUMN IF NOT EXISTS "SourcePostId" uuid NULL,
                    ADD COLUMN IF NOT EXISTS "Title" character varying(500) NOT NULL DEFAULT '',
                    ADD COLUMN IF NOT EXISTS "Description" text NULL,
                    ADD COLUMN IF NOT EXISTS "MediaType" integer NOT NULL DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS "MediaUrl" character varying(2048) NOT NULL DEFAULT '',
                    ADD COLUMN IF NOT EXISTS "MediaMetadata" jsonb NULL,
                    ADD COLUMN IF NOT EXISTS "ThumbnailUrl" character varying(2048) NULL,
                    ADD COLUMN IF NOT EXISTS "IsVisibleInFeed" boolean NOT NULL DEFAULT false,
                    ADD COLUMN IF NOT EXISTS "IsPublished" boolean NOT NULL DEFAULT false,
                    ADD COLUMN IF NOT EXISTS "PublishedPostId" uuid NULL,
                    ADD COLUMN IF NOT EXISTS "Tags" text[] NULL,
                    ADD COLUMN IF NOT EXISTS "ScheduledPublishAt" timestamp with time zone NULL,
                    ADD COLUMN IF NOT EXISTS "FileSizeBytes" bigint NULL,
                    ADD COLUMN IF NOT EXISTS "DurationSeconds" numeric NULL;

                CREATE INDEX IF NOT EXISTS "IX_SavedMedia_UserId"
                    ON app_data."SavedMedia" ("UserId");
                CREATE INDEX IF NOT EXISTS "IX_SavedMedia_UserId_IsDeleted"
                    ON app_data."SavedMedia" ("UserId", "IsDeleted");
                CREATE INDEX IF NOT EXISTS "IX_SavedMedia_UserId_IsVisibleInFeed"
                    ON app_data."SavedMedia" ("UserId", "IsVisibleInFeed");
                CREATE INDEX IF NOT EXISTS "IX_SavedMedia_UserId_MediaType"
                    ON app_data."SavedMedia" ("UserId", "MediaType");
                CREATE INDEX IF NOT EXISTS "IX_SavedMedia_ScheduledPublishAt_NotNull"
                    ON app_data."SavedMedia" ("ScheduledPublishAt")
                    WHERE "ScheduledPublishAt" IS NOT NULL;

                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname = 'FK_SavedMedia_Users_UserId'
                    ) THEN
                        ALTER TABLE app_data."SavedMedia"
                            ADD CONSTRAINT "FK_SavedMedia_Users_UserId"
                            FOREIGN KEY ("UserId") REFERENCES app_data."Users"("Id")
                            ON DELETE CASCADE;
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname = 'FK_SavedMedia_Posts_SourcePostId'
                    ) THEN
                        ALTER TABLE app_data."SavedMedia"
                            ADD CONSTRAINT "FK_SavedMedia_Posts_SourcePostId"
                            FOREIGN KEY ("SourcePostId") REFERENCES app_data."Posts"("Id")
                            ON DELETE SET NULL;
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname = 'FK_SavedMedia_Posts_PublishedPostId'
                    ) THEN
                        ALTER TABLE app_data."SavedMedia"
                            ADD CONSTRAINT "FK_SavedMedia_Posts_PublishedPostId"
                            FOREIGN KEY ("PublishedPostId") REFERENCES app_data."Posts"("Id")
                            ON DELETE SET NULL;
                    END IF;
                END $$;
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DROP INDEX IF EXISTS app_data."IX_SavedMedia_ScheduledPublishAt_NotNull";
                DROP INDEX IF EXISTS app_data."IX_SavedMedia_UserId_MediaType";
                DROP INDEX IF EXISTS app_data."IX_SavedMedia_UserId_IsVisibleInFeed";
                DROP INDEX IF EXISTS app_data."IX_SavedMedia_UserId_IsDeleted";
                DROP INDEX IF EXISTS app_data."IX_SavedMedia_UserId";
                DROP TABLE IF EXISTS app_data."SavedMedia";
                """);
        }
    }
}
