using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wiseravenshare.Server.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPostInteractionUniqueIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP INDEX IF EXISTS app_data.\"IX_PostLikes_PostId\";");
            migrationBuilder.Sql("DROP INDEX IF EXISTS app_data.\"IX_PostReposts_PostId\";");
            migrationBuilder.Sql("DROP INDEX IF EXISTS app_data.\"IX_PostBookmarks_PostId\";");

            migrationBuilder.CreateIndex(
                name: "IX_PostReposts_PostId_UserId",
                schema: "app_data",
                table: "PostReposts",
                columns: new[] { "PostId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PostLikes_PostId_UserId",
                schema: "app_data",
                table: "PostLikes",
                columns: new[] { "PostId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PostBookmarks_PostId_UserId",
                schema: "app_data",
                table: "PostBookmarks",
                columns: new[] { "PostId", "UserId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_PostReposts_PostId_UserId",
                schema: "app_data",
                table: "PostReposts");

            migrationBuilder.DropIndex(
                name: "IX_PostLikes_PostId_UserId",
                schema: "app_data",
                table: "PostLikes");

            migrationBuilder.DropIndex(
                name: "IX_PostBookmarks_PostId_UserId",
                schema: "app_data",
                table: "PostBookmarks");

            migrationBuilder.CreateIndex(
                name: "IX_PostReposts_PostId",
                schema: "app_data",
                table: "PostReposts",
                column: "PostId");

            migrationBuilder.CreateIndex(
                name: "IX_PostLikes_PostId",
                schema: "app_data",
                table: "PostLikes",
                column: "PostId");

            migrationBuilder.CreateIndex(
                name: "IX_PostBookmarks_PostId",
                schema: "app_data",
                table: "PostBookmarks",
                column: "PostId");
        }
    }
}
