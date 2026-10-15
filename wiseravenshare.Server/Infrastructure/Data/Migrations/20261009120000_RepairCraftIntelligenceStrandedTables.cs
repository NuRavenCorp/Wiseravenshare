using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wiseravenshare.Server.Infrastructure.Data.Migrations
{
    /// <summary>
    /// Recreates tables that a previously half-applied migration left behind.
    ///
    /// Background: 20260916200201_AddCraftIntelligence aborts partway through
    /// on any database where CommunicationPreferences / NotificationCosts already
    /// exist (both created by earlier migrations), because it re-issues
    /// CreateTable for them and Postgres raises 42P07 duplicate_table. Every
    /// table declared later in that file is therefore never created, and the
    /// migration is still recorded in __EFMigrationsHistory — so it never reruns.
    ///
    /// Verified missing on the live database: UserBlocks, CachedYouTubeRecords.
    ///
    /// This migration is deliberately idempotent (IF NOT EXISTS throughout) so it
    /// is a no-op on a database where the tables already exist, and a repair on
    /// one where they do not.
    /// </summary>
    public partial class RepairCraftIntelligenceStrandedTables : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS app_data.""UserBlocks"" (
                    ""Id"" uuid NOT NULL DEFAULT gen_random_uuid(),
                    ""BlockerId"" uuid NOT NULL,
                    ""BlockedId"" uuid NOT NULL,
                    ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT now(),
                    ""UpdatedAt"" timestamp with time zone NOT NULL DEFAULT now(),
                    ""IsDeleted"" boolean NOT NULL DEFAULT false,
                    ""DeletedAt"" timestamp with time zone NULL,
                    CONSTRAINT ""PK_UserBlocks"" PRIMARY KEY (""Id""),
                    CONSTRAINT ""FK_UserBlocks_BlockerId"" FOREIGN KEY (""BlockerId"")
                        REFERENCES app_data.""Users""(""Id"") ON DELETE CASCADE,
                    CONSTRAINT ""FK_UserBlocks_BlockedId"" FOREIGN KEY (""BlockedId"")
                        REFERENCES app_data.""Users""(""Id"") ON DELETE CASCADE
                );
                CREATE UNIQUE INDEX IF NOT EXISTS ""IX_UserBlocks_BlockerId_BlockedId""
                    ON app_data.""UserBlocks""(""BlockerId"", ""BlockedId"");
                CREATE INDEX IF NOT EXISTS ""IX_UserBlocks_BlockerId""
                    ON app_data.""UserBlocks""(""BlockerId"");
            ");

            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS app_data.""CachedYouTubeRecords"" (
                    ""Id"" uuid NOT NULL DEFAULT gen_random_uuid(),
                    ""CacheKey"" character varying(512) NOT NULL DEFAULT '',
                    ""JsonData"" text NOT NULL DEFAULT '',
                    ""CachedAt"" timestamp with time zone NOT NULL DEFAULT now(),
                    ""AbsoluteExpiration"" timestamp with time zone NOT NULL DEFAULT now(),
                    ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT now(),
                    ""UpdatedAt"" timestamp with time zone NOT NULL DEFAULT now(),
                    ""IsDeleted"" boolean NOT NULL DEFAULT false,
                    ""DeletedAt"" timestamp with time zone NULL,
                    CONSTRAINT ""PK_CachedYouTubeRecords"" PRIMARY KEY (""Id"")
                );
                CREATE INDEX IF NOT EXISTS ""IX_CachedYouTubeRecords_CacheKey""
                    ON app_data.""CachedYouTubeRecords""(""CacheKey"");
                CREATE INDEX IF NOT EXISTS ""IX_CachedYouTubeRecords_AbsoluteExpiration""
                    ON app_data.""CachedYouTubeRecords""(""AbsoluteExpiration"");
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Intentionally non-destructive: dropping these tables on rollback
            // would discard user block records. The original migration that was
            // supposed to own them cannot recreate them anyway.
        }
    }
}
