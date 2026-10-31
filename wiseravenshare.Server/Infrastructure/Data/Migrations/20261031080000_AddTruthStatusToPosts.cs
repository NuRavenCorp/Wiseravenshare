using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wiseravenshare.Server.Infrastructure.Data.Migrations;

/// <inheritdoc />
public partial class AddTruthStatusToPosts : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "TruthStatus",
            schema: "app_data",
            table: "Posts",
            type: "text",
            nullable: true);

        migrationBuilder.CreateIndex(
            name: "IX_Posts_TruthStatus",
            schema: "app_data",
            table: "Posts",
            column: "TruthStatus");
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(
            name: "IX_Posts_TruthStatus",
            schema: "app_data",
            table: "Posts");

        migrationBuilder.DropColumn(
            name: "TruthStatus",
            schema: "app_data",
            table: "Posts");
    }
}
