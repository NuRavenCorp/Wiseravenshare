using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wiseravenshare.Server.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddMissingUserRefreshTokenColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // RefreshToken and RefreshTokenExpiryTime were in the entity model but never
            // included in the initial migration DDL, causing runtime "column does not exist" errors.
            migrationBuilder.Sql("""
                ALTER TABLE app_data."Users"
                    ADD COLUMN IF NOT EXISTS "RefreshToken" character varying(512),
                    ADD COLUMN IF NOT EXISTS "RefreshTokenExpiryTime" timestamp with time zone;
                """);

            migrationBuilder.AddColumn<string>(
                name: "FileHash",
                schema: "app_data",
                table: "MediaItems",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_MediaPlaylists_UserId_Name",
                schema: "app_data",
                table: "MediaPlaylists",
                columns: new[] { "UserId", "Name" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_MediaItems_UserId_FileHash",
                schema: "app_data",
                table: "MediaItems",
                columns: new[] { "UserId", "FileHash" },
                unique: true,
                filter: "\"FileHash\" IS NOT NULL AND \"IsDeleted\" = false");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_MediaPlaylists_UserId_Name",
                schema: "app_data",
                table: "MediaPlaylists");

            migrationBuilder.DropIndex(
                name: "IX_MediaItems_UserId_FileHash",
                schema: "app_data",
                table: "MediaItems");

            migrationBuilder.DropColumn(
                name: "FileHash",
                schema: "app_data",
                table: "MediaItems");
        }
    }
}


#nullable disable

namespace Wiseravenshare.Server.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddMissingUserRefreshTokenColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "FileHash",
                schema: "app_data",
                table: "MediaItems",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_MediaPlaylists_UserId_Name",
                schema: "app_data",
                table: "MediaPlaylists",
                columns: new[] { "UserId", "Name" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_MediaItems_UserId_FileHash",
                schema: "app_data",
                table: "MediaItems",
                columns: new[] { "UserId", "FileHash" },
                unique: true,
                filter: "\"FileHash\" IS NOT NULL AND \"IsDeleted\" = false");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_MediaPlaylists_UserId_Name",
                schema: "app_data",
                table: "MediaPlaylists");

            migrationBuilder.DropIndex(
                name: "IX_MediaItems_UserId_FileHash",
                schema: "app_data",
                table: "MediaItems");

            migrationBuilder.DropColumn(
                name: "FileHash",
                schema: "app_data",
                table: "MediaItems");
        }
    }
}
