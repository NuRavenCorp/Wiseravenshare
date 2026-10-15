// Wiseravenshare.Server/Infrastructure/Data/Migrations/AddWiseCoinRolloutTracking.cs
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wiseravenshare.Server.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddWiseCoinRolloutTracking : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "HasReceivedInitialAllocation",
                table: "WiseCoins",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "InitialAllocationDate",
                table: "WiseCoins",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "InitialAllocationAmount",
                table: "WiseCoins",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            // Create index for efficient lookup of users who need allocation
            migrationBuilder.CreateIndex(
                name: "IX_WiseCoins_HasReceivedInitialAllocation",
                table: "WiseCoins",
                column: "HasReceivedInitialAllocation");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_WiseCoins_HasReceivedInitialAllocation",
                table: "WiseCoins");

            migrationBuilder.DropColumn(
                name: "HasReceivedInitialAllocation",
                table: "WiseCoins");

            migrationBuilder.DropColumn(
                name: "InitialAllocationDate",
                table: "WiseCoins");

            migrationBuilder.DropColumn(
                name: "InitialAllocationAmount",
                table: "WiseCoins");
        }
    }
}
