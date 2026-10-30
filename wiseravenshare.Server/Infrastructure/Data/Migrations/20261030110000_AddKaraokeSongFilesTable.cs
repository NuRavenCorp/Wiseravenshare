using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wiseravenshare.Server.Infrastructure.Data.Migrations;

/// <summary>
/// Adds KaraokeSongFiles table for storing full song audio files locally
/// with a clear migration path to cloud blob storage.
/// Idempotent: every statement guards with IF NOT EXISTS / DO NOTHING.
/// </summary>
public partial class AddKaraokeSongFilesTable : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE TABLE IF NOT EXISTS "KaraokeSongFiles" (
                "Id"                    uuid            NOT NULL DEFAULT gen_random_uuid(),
                "Title"                 varchar(255)    NOT NULL DEFAULT '',
                "Artist"                varchar(255),
                "Album"                 varchar(255),
                "Genre"                 varchar(100),
                "Language"              varchar(10)     DEFAULT 'en',
                "Year"                  integer,

                -- Uploaded file info
                "OriginalFileName"      varchar(512)    NOT NULL DEFAULT '',
                "ContentType"           varchar(128)    NOT NULL DEFAULT 'audio/mpeg',
                "FileSizeBytes"         bigint          NOT NULL DEFAULT 0,
                "DurationSeconds"       integer,
                "Bpm"                   integer,
                "MusicalKey"            varchar(16),

                -- Local bucket (current tier)
                "LocalBucketKey"        varchar(1024),

                -- Cloud / blob storage (future tier)
                "CloudBlobKey"          varchar(1024),
                "CloudPublicUrl"        varchar(2048),
                "IsMigratedToCloud"     boolean         NOT NULL DEFAULT false,
                "CloudMigratedAt"       timestamptz,

                -- Cover image
                "CoverImageLocalKey"    varchar(1024),
                "CoverImageUrl"         varchar(2048),

                -- Lyrics (inline cache)
                "LrcContent"            text,
                "PlainLyrics"           text,

                -- Status & processing
                "Status"                integer         NOT NULL DEFAULT 1,
                "ProcessingError"       varchar(1024),
                "ProcessingStartedAt"   timestamptz,
                "ProcessingCompletedAt" timestamptz,

                -- Link to processed KaraokeTrack
                "KaraokeTrackId"        uuid            REFERENCES "KaraokeTracks"("Id") ON DELETE SET NULL,

                -- Visibility & stats
                "IsPublic"              boolean         NOT NULL DEFAULT false,
                "PlayCount"             integer         NOT NULL DEFAULT 0,

                -- Owner
                "UploadedByUserId"      uuid            NOT NULL REFERENCES "AspNetUsers"("Id") ON DELETE CASCADE,

                -- BaseEntity
                "CreatedAt"             timestamptz     NOT NULL DEFAULT now(),
                "UpdatedAt"             timestamptz     NOT NULL DEFAULT now(),
                "IsDeleted"             boolean         NOT NULL DEFAULT false,
                "DeletedAt"             timestamptz,

                CONSTRAINT "PK_KaraokeSongFiles" PRIMARY KEY ("Id")
            );
            """);

        // Indexes for common access patterns
        migrationBuilder.Sql("""
            CREATE INDEX IF NOT EXISTS "IX_KaraokeSongFiles_UploadedByUserId"
                ON "KaraokeSongFiles" ("UploadedByUserId");

            CREATE INDEX IF NOT EXISTS "IX_KaraokeSongFiles_Status"
                ON "KaraokeSongFiles" ("Status");

            CREATE INDEX IF NOT EXISTS "IX_KaraokeSongFiles_KaraokeTrackId"
                ON "KaraokeSongFiles" ("KaraokeTrackId");

            CREATE INDEX IF NOT EXISTS "IX_KaraokeSongFiles_IsPublic_IsDeleted_CreatedAt"
                ON "KaraokeSongFiles" ("IsPublic", "IsDeleted", "CreatedAt" DESC);

            CREATE INDEX IF NOT EXISTS "IX_KaraokeSongFiles_IsMigratedToCloud"
                ON "KaraokeSongFiles" ("IsMigratedToCloud")
                WHERE "IsMigratedToCloud" = false;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""DROP TABLE IF EXISTS "KaraokeSongFiles" CASCADE;""");
    }
}
