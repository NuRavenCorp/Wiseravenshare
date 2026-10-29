using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wiseravenshare.Server.Infrastructure.Data.Migrations
{
    /// <summary>
    /// Idempotent patch: adds share_count to content_crawler_catalog if absent.
    /// Fixes recurring "42703: column share_count does not exist" errors in
    /// ContentTrendingRecalculationJob.
    /// </summary>
    public partial class AddShareCountToContentCrawler : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                ALTER TABLE IF EXISTS app_data.content_crawler_catalog
                    ADD COLUMN IF NOT EXISTS share_count integer NOT NULL DEFAULT 0;
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                ALTER TABLE IF EXISTS app_data.content_crawler_catalog
                    DROP COLUMN IF EXISTS share_count;
                """);
        }
    }
}
