using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wiseravenshare.Server.Infrastructure.Data.Migrations
{
    public partial class AddMediaFileHashAndPlaylistConstraints : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE app_data."MediaItems"
                    ADD COLUMN IF NOT EXISTS "FileHash" character varying(64) NULL;

                CREATE UNIQUE INDEX IF NOT EXISTS "IX_MediaItems_UserId_FileHash_Active"
                    ON app_data."MediaItems" ("UserId", "FileHash")
                    WHERE "FileHash" IS NOT NULL AND "IsDeleted" = false;

                CREATE UNIQUE INDEX IF NOT EXISTS "IX_MediaPlaylists_UserId_Name_Active"
                    ON app_data."MediaPlaylists" ("UserId", "Name")
                    WHERE "IsDeleted" = false;
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DROP INDEX IF EXISTS app_data."IX_MediaPlaylists_UserId_Name_Active";
                DROP INDEX IF EXISTS app_data."IX_MediaItems_UserId_FileHash_Active";
                ALTER TABLE app_data."MediaItems" DROP COLUMN IF EXISTS "FileHash";
                """);
        }
    }
}
