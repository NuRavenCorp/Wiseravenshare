using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wiseravenshare.Server.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSocialCrossPosts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SocialCrossPosts",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PostId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Platform = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    ExternalPostId = table.Column<string>(type: "text", nullable: true),
                    ExternalPostUrl = table.Column<string>(type: "text", nullable: true),
                    ErrorMessage = table.Column<string>(type: "text", nullable: true),
                    PublishedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SocialCrossPosts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SocialCrossPosts_Posts_PostId",
                        column: x => x.PostId,
                        principalSchema: "app_data",
                        principalTable: "Posts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SocialCrossPosts_PostId_Platform",
                schema: "app_data",
                table: "SocialCrossPosts",
                columns: new[] { "PostId", "Platform" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SocialCrossPosts_UserId",
                schema: "app_data",
                table: "SocialCrossPosts",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SocialCrossPosts",
                schema: "app_data");
        }
    }
}
