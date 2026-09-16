using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wiseravenshare.Server.Infrastructure.Data.Migrations
{
    /// <summary>
    /// Applies columns/tables from migrations that had no Designer.cs and were therefore
    /// never discovered by EF, plus recovers anything rolled back in AddCraftIntelligence.
    /// All statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS for idempotency.
    /// </summary>
    public partial class AddWiseCoinRolloutTrackingColumns : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                -- WiseCoin rollout tracking (AddWiseCoinRolloutTracking had no Designer.cs)
                ALTER TABLE app_data."WiseCoins"
                    ADD COLUMN IF NOT EXISTS "HasReceivedInitialAllocation" boolean NOT NULL DEFAULT false,
                    ADD COLUMN IF NOT EXISTS "InitialAllocationDate" timestamp with time zone,
                    ADD COLUMN IF NOT EXISTS "InitialAllocationAmount" numeric NOT NULL DEFAULT 0;
                CREATE INDEX IF NOT EXISTS "IX_WiseCoins_HasReceivedInitialAllocation"
                    ON app_data."WiseCoins" ("HasReceivedInitialAllocation");

                -- CommunicationPreferences (20260906150000 had no Designer.cs)
                CREATE TABLE IF NOT EXISTS app_data."CommunicationPreferences" (
                    "Id" uuid NOT NULL,
                    "UserId" uuid NOT NULL,
                    "EnableSmsNotifications" boolean NOT NULL DEFAULT false,
                    "EnableWhatsAppNotifications" boolean NOT NULL DEFAULT false,
                    "EnableEngagementNotifications" boolean NOT NULL DEFAULT false,
                    "EnableAlerts" boolean NOT NULL DEFAULT false,
                    "PreferredChannel" character varying(20) NOT NULL DEFAULT 'email',
                    "IsVerified" boolean NOT NULL DEFAULT false,
                    "VerifiedPhoneNumber" character varying(20),
                    "UpdatedAt" timestamp with time zone,
                    "CreatedAt" timestamp with time zone NOT NULL,
                    "IsDeleted" boolean NOT NULL DEFAULT false,
                    "DeletedAt" timestamp with time zone,
                    CONSTRAINT "PK_CommunicationPreferences" PRIMARY KEY ("Id"),
                    CONSTRAINT "FK_CommunicationPreferences_Users_UserId"
                        FOREIGN KEY ("UserId") REFERENCES app_data."Users"("Id") ON DELETE CASCADE
                );
                CREATE UNIQUE INDEX IF NOT EXISTS "IX_CommunicationPreferences_UserId"
                    ON app_data."CommunicationPreferences" ("UserId");

                -- NotificationCosts (20260906150002 had no Designer.cs)
                CREATE TABLE IF NOT EXISTS app_data."NotificationCosts" (
                    "Id" uuid NOT NULL,
                    "UserId" uuid NOT NULL,
                    "NotificationType" character varying(20) NOT NULL,
                    "PhoneNumber" character varying(20) NOT NULL,
                    "MessageLength" integer NOT NULL DEFAULT 0,
                    "CostUsd" numeric(10,6) NOT NULL DEFAULT 0,
                    "TwilioSid" character varying(255),
                    "DeliveryStatus" character varying(20) NOT NULL DEFAULT 'pending',
                    "SentAt" timestamp with time zone NOT NULL,
                    "CreatedAt" timestamp with time zone NOT NULL,
                    "IsDeleted" boolean NOT NULL DEFAULT false,
                    "DeletedAt" timestamp with time zone,
                    CONSTRAINT "PK_NotificationCosts" PRIMARY KEY ("Id"),
                    CONSTRAINT "FK_NotificationCosts_Users_UserId"
                        FOREIGN KEY ("UserId") REFERENCES app_data."Users"("Id") ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS "IX_NotificationCosts_NotificationType"
                    ON app_data."NotificationCosts" ("NotificationType");
                CREATE INDEX IF NOT EXISTS "IX_NotificationCosts_SentAt"
                    ON app_data."NotificationCosts" ("SentAt");
                CREATE INDEX IF NOT EXISTS "IX_NotificationCosts_UserId"
                    ON app_data."NotificationCosts" ("UserId");
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DROP INDEX IF EXISTS app_data."IX_WiseCoins_HasReceivedInitialAllocation";
                ALTER TABLE app_data."WiseCoins"
                    DROP COLUMN IF EXISTS "HasReceivedInitialAllocation",
                    DROP COLUMN IF EXISTS "InitialAllocationDate",
                    DROP COLUMN IF EXISTS "InitialAllocationAmount";
                """);
        }
    }
}
