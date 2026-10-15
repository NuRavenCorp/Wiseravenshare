using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wiseravenshare.Server.Infrastructure.Data.Migrations
{
    /// <summary>
    /// Idempotent production repair migration for schema drift between older live databases
    /// and the current application model.
    /// </summary>
    public partial class BackfillProductionSchemaCompatibility : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                CREATE SCHEMA IF NOT EXISTS app_data;

                -- Users.PhoneNumber (42703: column u.PhoneNumber does not exist)
                ALTER TABLE IF EXISTS app_data."Users"
                    ADD COLUMN IF NOT EXISTS "PhoneNumber" text;

                -- UserBlocks table (42P01: relation app_data.UserBlocks does not exist)
                CREATE TABLE IF NOT EXISTS app_data."UserBlocks" (
                    "Id" uuid NOT NULL,
                    "BlockerId" uuid NOT NULL,
                    "BlockedId" uuid NOT NULL,
                    "CreatedAt" timestamp with time zone NOT NULL DEFAULT now(),
                    "UpdatedAt" timestamp with time zone NOT NULL DEFAULT now(),
                    "IsDeleted" boolean NOT NULL DEFAULT false,
                    "DeletedAt" timestamp with time zone NULL,
                    CONSTRAINT "PK_UserBlocks" PRIMARY KEY ("Id"),
                    CONSTRAINT "FK_UserBlocks_BlockerId" FOREIGN KEY ("BlockerId")
                        REFERENCES app_data."Users"("Id") ON DELETE CASCADE,
                    CONSTRAINT "FK_UserBlocks_BlockedId" FOREIGN KEY ("BlockedId")
                        REFERENCES app_data."Users"("Id") ON DELETE CASCADE
                );
                CREATE UNIQUE INDEX IF NOT EXISTS "IX_UserBlocks_BlockerId_BlockedId"
                    ON app_data."UserBlocks"("BlockerId", "BlockedId");
                CREATE INDEX IF NOT EXISTS "IX_UserBlocks_BlockerId"
                    ON app_data."UserBlocks"("BlockerId");
                CREATE INDEX IF NOT EXISTS "IX_UserBlocks_BlockedId"
                    ON app_data."UserBlocks"("BlockedId");

                -- FM activation-gating fields (42703: column c.ActivationGatedAt does not exist)
                ALTER TABLE IF EXISTS app_data."CreatorRadioStations"
                    ADD COLUMN IF NOT EXISTS "WiseCoinDeposited" numeric(18,2) NOT NULL DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS "StripeSetupComplete" boolean NOT NULL DEFAULT false,
                    ADD COLUMN IF NOT EXISTS "StripeProductId" character varying(255),
                    ADD COLUMN IF NOT EXISTS "ActivationGatedAt" timestamp with time zone;

                -- Content crawler engagement aggregate (column engagement_count does not exist)
                ALTER TABLE IF EXISTS app_data.content_crawler_catalog
                    ADD COLUMN IF NOT EXISTS engagement_count integer NOT NULL DEFAULT 0;

                UPDATE app_data.content_crawler_catalog
                SET engagement_count = COALESCE(view_count, 0) + COALESCE(like_count, 0) + COALESCE(share_count, 0)
                WHERE engagement_count IS DISTINCT FROM (COALESCE(view_count, 0) + COALESCE(like_count, 0) + COALESCE(share_count, 0));
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Intentionally non-destructive: this migration repairs live environments and should
            // not drop compatibility columns/tables on rollback.
        }
    }
}
