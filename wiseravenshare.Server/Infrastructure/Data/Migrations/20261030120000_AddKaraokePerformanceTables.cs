using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wiseravenshare.Server.Infrastructure.Data.Migrations;

/// <summary>
/// Creates the karaoke performance and performance_turns tables for
/// storing per-user karaoke session results, finalized transcript turns,
/// lyric alignment scores, and private blob references.
/// Idempotent: every statement guards with IF NOT EXISTS / DO NOTHING.
/// </summary>
public partial class AddKaraokePerformanceTables : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE TABLE IF NOT EXISTS performances (
                "Id"                    uuid            NOT NULL DEFAULT gen_random_uuid(),
                "UserId"                uuid            NOT NULL REFERENCES "AspNetUsers"("Id") ON DELETE CASCADE,
                "SongId"                uuid            NOT NULL,
                "Status"                integer         NOT NULL DEFAULT 0,
                "StartedAt"             timestamptz     NOT NULL DEFAULT now(),
                "CompletedAt"           timestamptz,
                "LyricScore"            numeric(5, 2),
                "Matches"               integer,
                "Substitutions"         integer,
                "Missing"               integer,
                "Extras"                integer,
                "AlignmentBlobName"     varchar(512),
                "RecordingBlobName"     varchar(512),
                "RecordingUploadExpiresAt" timestamptz,
                "FailureReason"         varchar(2000),
                CONSTRAINT "PK_performances" PRIMARY KEY ("Id")
            );
            """);

        migrationBuilder.Sql("""
            CREATE INDEX IF NOT EXISTS "IX_performances_UserId_StartedAt"
                ON performances ("UserId", "StartedAt" DESC);

            CREATE INDEX IF NOT EXISTS "IX_performances_SongId_LyricScore"
                ON performances ("SongId", "LyricScore" DESC);

            CREATE INDEX IF NOT EXISTS "IX_performances_Status"
                ON performances ("Status");
            """);

        migrationBuilder.Sql("""
            CREATE TABLE IF NOT EXISTS performance_turns (
                "Id"                    bigserial       NOT NULL,
                "PerformanceId"         uuid            NOT NULL REFERENCES performances("Id") ON DELETE CASCADE,
                "TurnOrder"             integer         NOT NULL,
                "Transcript"            varchar(8000)   NOT NULL DEFAULT '',
                "StartMilliseconds"     bigint,
                "EndMilliseconds"       bigint,
                CONSTRAINT "PK_performance_turns" PRIMARY KEY ("Id")
            );
            """);

        migrationBuilder.Sql("""
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_performance_turns_PerformanceId_TurnOrder"
                ON performance_turns ("PerformanceId", "TurnOrder");

            CREATE INDEX IF NOT EXISTS "IX_performance_turns_PerformanceId"
                ON performance_turns ("PerformanceId");
            """);

        // Retention: auto-clean performances stuck in Processing state older than 7 days.
        // This is a safety net for sessions that terminated without calling /complete.
        migrationBuilder.Sql("""
            -- No-op if the cron extension is not available; retention is also
            -- enforced in application code via the retention policy check.
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
                ) THEN
                    PERFORM cron.schedule(
                        'karaoke-performance-stale-cleanup',
                        '0 3 * * *',
                        $$
                            UPDATE performances
                            SET "Status" = 3, "FailureReason" = 'Stale: no completion signal received within 7 days.'
                            WHERE "Status" = 1
                              AND "StartedAt" < now() - INTERVAL '7 days'
                        $$
                    );
                END IF;
            END $$;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DROP TABLE IF EXISTS performance_turns CASCADE;
            DROP TABLE IF EXISTS performances CASCADE;
            """);

        migrationBuilder.Sql("""
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
                    PERFORM cron.unschedule('karaoke-performance-stale-cleanup');
                END IF;
            END $$;
            """);
    }
}
