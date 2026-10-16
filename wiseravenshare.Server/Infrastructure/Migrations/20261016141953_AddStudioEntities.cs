using System;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wiseravenshare.Server.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddStudioEntities : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "ActivationGatedAt",
                schema: "app_data",
                table: "CreatorRadioStations",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StripeProductId",
                schema: "app_data",
                table: "CreatorRadioStations",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "StripeSetupComplete",
                schema: "app_data",
                table: "CreatorRadioStations",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "WiseCoinDeposited",
                schema: "app_data",
                table: "CreatorRadioStations",
                type: "numeric(18,4)",
                precision: 18,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.CreateTable(
                name: "CachedYouTubeRecords",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CacheKey = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    JsonData = table.Column<string>(type: "text", nullable: false),
                    CachedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    AbsoluteExpiration = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CachedYouTubeRecords", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "MediaPlaybackStates",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MediaId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    PositionSeconds = table.Column<int>(type: "integer", nullable: false),
                    IsPlaying = table.Column<bool>(type: "boolean", nullable: false),
                    Completed = table.Column<bool>(type: "boolean", nullable: false),
                    LastPlayedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MediaPlaybackStates", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MediaPlaybackStates_MediaItems_MediaId",
                        column: x => x.MediaId,
                        principalSchema: "app_data",
                        principalTable: "MediaItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_MediaPlaybackStates_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "podcast_sessions",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    TeamId = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    InitiatedByUserId = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    AccessScope = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ClosedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    StateJson = table.Column<string>(type: "jsonb", nullable: true),
                    StateVersion = table.Column<int>(type: "integer", nullable: false),
                    AllowedUserIds = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_podcast_sessions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SavedMedia",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourcePostId = table.Column<Guid>(type: "uuid", nullable: true),
                    Title = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Description = table.Column<string>(type: "text", nullable: true),
                    MediaType = table.Column<int>(type: "integer", nullable: false),
                    MediaUrl = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                    MediaMetadata = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    ThumbnailUrl = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    IsVisibleInFeed = table.Column<bool>(type: "boolean", nullable: false),
                    IsPublished = table.Column<bool>(type: "boolean", nullable: false),
                    PublishedPostId = table.Column<Guid>(type: "uuid", nullable: true),
                    Tags = table.Column<string[]>(type: "text[]", nullable: true),
                    ScheduledPublishAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    FileSizeBytes = table.Column<long>(type: "bigint", nullable: true),
                    DurationSeconds = table.Column<decimal>(type: "numeric", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SavedMedia", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SavedMedia_Posts_PublishedPostId",
                        column: x => x.PublishedPostId,
                        principalSchema: "app_data",
                        principalTable: "Posts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_SavedMedia_Posts_SourcePostId",
                        column: x => x.SourcePostId,
                        principalSchema: "app_data",
                        principalTable: "Posts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_SavedMedia_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "StudioProjects",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "text", nullable: false),
                    Type = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StudioProjects", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "UserActivities",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActivityType = table.Column<int>(type: "integer", nullable: false),
                    TargetId = table.Column<Guid>(type: "uuid", nullable: true),
                    TargetType = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    Summary = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserActivities", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserActivities_Users_ActorUserId",
                        column: x => x.ActorUserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "UserBlocks",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BlockerId = table.Column<Guid>(type: "uuid", nullable: false),
                    BlockedId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserBlocks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserBlocks_Users_BlockedId",
                        column: x => x.BlockedId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_UserBlocks_Users_BlockerId",
                        column: x => x.BlockerId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "podcast_session_devices",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    SessionId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    UserId = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    DeviceName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    DeviceType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    UserAgent = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    JoinedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LastHeartbeatAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    TokenExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    LocalStateJson = table.Column<string>(type: "jsonb", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_podcast_session_devices", x => x.Id);
                    table.ForeignKey(
                        name: "FK_podcast_session_devices_podcast_sessions_SessionId",
                        column: x => x.SessionId,
                        principalSchema: "app_data",
                        principalTable: "podcast_sessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "workspace_pages",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    SessionId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    TeamId = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    CreatedByUserId = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    PageType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Title = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    Content = table.Column<string>(type: "text", nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    Tags = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LastEditedByUserId = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    IsArchived = table.Column<bool>(type: "boolean", nullable: false),
                    ArchivedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    MetadataJson = table.Column<string>(type: "jsonb", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_workspace_pages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_workspace_pages_podcast_sessions_SessionId",
                        column: x => x.SessionId,
                        principalSchema: "app_data",
                        principalTable: "podcast_sessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "StudioEditEvents",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActionType = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: false),
                    BeforeJson = table.Column<string>(type: "text", nullable: true),
                    AfterJson = table.Column<string>(type: "text", nullable: true),
                    IsUndone = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StudioEditEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StudioEditEvents_StudioProjects_ProjectId",
                        column: x => x.ProjectId,
                        principalSchema: "app_data",
                        principalTable: "StudioProjects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "StudioTracks",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Type = table.Column<string>(type: "text", nullable: false),
                    BlobUrl = table.Column<string>(type: "text", nullable: true),
                    OrderIndex = table.Column<int>(type: "integer", nullable: false),
                    Volume = table.Column<float>(type: "real", nullable: false),
                    Pan = table.Column<float>(type: "real", nullable: false),
                    Muted = table.Column<bool>(type: "boolean", nullable: false),
                    Soloed = table.Column<bool>(type: "boolean", nullable: false),
                    FxChainJson = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StudioTracks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StudioTracks_StudioProjects_ProjectId",
                        column: x => x.ProjectId,
                        principalSchema: "app_data",
                        principalTable: "StudioProjects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CreatorRadioStations_Status_StripeSetupComplete",
                schema: "app_data",
                table: "CreatorRadioStations",
                columns: new[] { "Status", "StripeSetupComplete" },
                filter: "\"Status\" = 1");

            migrationBuilder.CreateIndex(
                name: "IX_CachedYouTubeRecords_AbsoluteExpiration",
                schema: "app_data",
                table: "CachedYouTubeRecords",
                column: "AbsoluteExpiration");

            migrationBuilder.CreateIndex(
                name: "IX_CachedYouTubeRecords_CacheKey",
                schema: "app_data",
                table: "CachedYouTubeRecords",
                column: "CacheKey");

            migrationBuilder.CreateIndex(
                name: "IX_MediaPlaybackStates_Completed_LastPlayedAt",
                schema: "app_data",
                table: "MediaPlaybackStates",
                columns: new[] { "Completed", "LastPlayedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_MediaPlaybackStates_MediaId",
                schema: "app_data",
                table: "MediaPlaybackStates",
                column: "MediaId");

            migrationBuilder.CreateIndex(
                name: "IX_MediaPlaybackStates_UserId_MediaId",
                schema: "app_data",
                table: "MediaPlaybackStates",
                columns: new[] { "UserId", "MediaId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_podcast_session_devices_LastHeartbeatAt",
                schema: "app_data",
                table: "podcast_session_devices",
                column: "LastHeartbeatAt");

            migrationBuilder.CreateIndex(
                name: "IX_podcast_session_devices_SessionId_IsActive",
                schema: "app_data",
                table: "podcast_session_devices",
                columns: new[] { "SessionId", "IsActive" });

            migrationBuilder.CreateIndex(
                name: "IX_podcast_session_devices_UserId",
                schema: "app_data",
                table: "podcast_session_devices",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_podcast_sessions_CreatedAt",
                schema: "app_data",
                table: "podcast_sessions",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_podcast_sessions_TeamId_Status",
                schema: "app_data",
                table: "podcast_sessions",
                columns: new[] { "TeamId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_SavedMedia_PublishedPostId",
                schema: "app_data",
                table: "SavedMedia",
                column: "PublishedPostId");

            migrationBuilder.CreateIndex(
                name: "IX_SavedMedia_ScheduledPublishAt",
                schema: "app_data",
                table: "SavedMedia",
                column: "ScheduledPublishAt",
                filter: "\"ScheduledPublishAt\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_SavedMedia_SourcePostId",
                schema: "app_data",
                table: "SavedMedia",
                column: "SourcePostId");

            migrationBuilder.CreateIndex(
                name: "IX_SavedMedia_UserId",
                schema: "app_data",
                table: "SavedMedia",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_SavedMedia_UserId_IsDeleted",
                schema: "app_data",
                table: "SavedMedia",
                columns: new[] { "UserId", "IsDeleted" });

            migrationBuilder.CreateIndex(
                name: "IX_SavedMedia_UserId_IsVisibleInFeed",
                schema: "app_data",
                table: "SavedMedia",
                columns: new[] { "UserId", "IsVisibleInFeed" });

            migrationBuilder.CreateIndex(
                name: "IX_SavedMedia_UserId_MediaType",
                schema: "app_data",
                table: "SavedMedia",
                columns: new[] { "UserId", "MediaType" });

            migrationBuilder.CreateIndex(
                name: "IX_StudioEditEvents_ProjectId",
                schema: "app_data",
                table: "StudioEditEvents",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_StudioTracks_ProjectId",
                schema: "app_data",
                table: "StudioTracks",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_UserActivities_ActorUserId",
                schema: "app_data",
                table: "UserActivities",
                column: "ActorUserId");

            migrationBuilder.CreateIndex(
                name: "IX_UserActivities_CreatedAt",
                schema: "app_data",
                table: "UserActivities",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_UserBlocks_BlockedId",
                schema: "app_data",
                table: "UserBlocks",
                column: "BlockedId");

            migrationBuilder.CreateIndex(
                name: "IX_UserBlocks_BlockerId",
                schema: "app_data",
                table: "UserBlocks",
                column: "BlockerId");

            migrationBuilder.CreateIndex(
                name: "IX_UserBlocks_BlockerId_BlockedId",
                schema: "app_data",
                table: "UserBlocks",
                columns: new[] { "BlockerId", "BlockedId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_workspace_pages_CreatedAt",
                schema: "app_data",
                table: "workspace_pages",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_workspace_pages_SessionId_IsArchived",
                schema: "app_data",
                table: "workspace_pages",
                columns: new[] { "SessionId", "IsArchived" });

            migrationBuilder.CreateIndex(
                name: "IX_workspace_pages_SessionId_PageType",
                schema: "app_data",
                table: "workspace_pages",
                columns: new[] { "SessionId", "PageType" });

            migrationBuilder.CreateIndex(
                name: "IX_workspace_pages_UpdatedAt",
                schema: "app_data",
                table: "workspace_pages",
                column: "UpdatedAt");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CachedYouTubeRecords",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "MediaPlaybackStates",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "podcast_session_devices",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "SavedMedia",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "StudioEditEvents",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "StudioTracks",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "UserActivities",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "UserBlocks",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "workspace_pages",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "StudioProjects",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "podcast_sessions",
                schema: "app_data");

            migrationBuilder.DropIndex(
                name: "IX_CreatorRadioStations_Status_StripeSetupComplete",
                schema: "app_data",
                table: "CreatorRadioStations");

            migrationBuilder.DropColumn(
                name: "ActivationGatedAt",
                schema: "app_data",
                table: "CreatorRadioStations");

            migrationBuilder.DropColumn(
                name: "StripeProductId",
                schema: "app_data",
                table: "CreatorRadioStations");

            migrationBuilder.DropColumn(
                name: "StripeSetupComplete",
                schema: "app_data",
                table: "CreatorRadioStations");

            migrationBuilder.DropColumn(
                name: "WiseCoinDeposited",
                schema: "app_data",
                table: "CreatorRadioStations");
        }
    }
}
