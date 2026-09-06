using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wiseravenshare.Server.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCommunicationPreferences : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CommunicationPreferences",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<string>(type: "text", nullable: false),
                    UserId = table.Column<string>(type: "text", nullable: false),
                    EnableSmsNotifications = table.Column<bool>(type: "boolean", nullable: false),
                    EnableWhatsAppNotifications = table.Column<bool>(type: "boolean", nullable: false),
                    EnableEngagementNotifications = table.Column<bool>(type: "boolean", nullable: false),
                    EnableAlerts = table.Column<bool>(type: "boolean", nullable: false),
                    PreferredChannel = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    IsVerified = table.Column<bool>(type: "boolean", nullable: false),
                    VerifiedPhoneNumber = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CommunicationPreferences", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CommunicationPreferences_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CommunicationPreferences_UserId",
                schema: "app_data",
                table: "CommunicationPreferences",
                column: "UserId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CommunicationPreferences",
                schema: "app_data");
        }
    }
}
