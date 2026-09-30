using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wiseravenshare.Server.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddUserBlocks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS app_data.""UserBlocks"" (
                    ""Id"" uuid NOT NULL DEFAULT gen_random_uuid(),
                    ""BlockerId"" uuid NOT NULL,
                    ""BlockedId"" uuid NOT NULL,
                    ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT now(),
                    ""UpdatedAt"" timestamp with time zone NOT NULL DEFAULT now(),
                    ""IsDeleted"" boolean NOT NULL DEFAULT false,
                    ""DeletedAt"" timestamp with time zone NULL,
                    CONSTRAINT ""PK_UserBlocks"" PRIMARY KEY (""Id""),
                    CONSTRAINT ""FK_UserBlocks_BlockerId"" FOREIGN KEY (""BlockerId"")
                        REFERENCES app_data.""Users""(""Id"") ON DELETE CASCADE,
                    CONSTRAINT ""FK_UserBlocks_BlockedId"" FOREIGN KEY (""BlockedId"")
                        REFERENCES app_data.""Users""(""Id"") ON DELETE CASCADE
                );
                CREATE UNIQUE INDEX IF NOT EXISTS ""IX_UserBlocks_BlockerId_BlockedId""
                    ON app_data.""UserBlocks""(""BlockerId"", ""BlockedId"");
                CREATE INDEX IF NOT EXISTS ""IX_UserBlocks_BlockerId""
                    ON app_data.""UserBlocks""(""BlockerId"");
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"DROP TABLE IF EXISTS app_data.""UserBlocks"";");
        }
    }
}
