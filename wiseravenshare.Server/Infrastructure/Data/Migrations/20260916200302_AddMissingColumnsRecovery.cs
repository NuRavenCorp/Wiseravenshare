using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wiseravenshare.Server.Infrastructure.Data.Migrations
{
    /// <summary>
    /// Adds missing columns that were in AddCraftIntelligence but whose
    /// transaction was partially rolled back due to pre-existing schema objects.
    /// </summary>
    public partial class AddMissingColumnsRecovery : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // PhoneNumber was added to Users in AddCraftIntelligence but never applied
            migrationBuilder.Sql("""
                ALTER TABLE app_data."Users"
                    ADD COLUMN IF NOT EXISTS "PhoneNumber" text;
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE app_data."Users"
                    DROP COLUMN IF EXISTS "PhoneNumber";
                """);
        }
    }
}
