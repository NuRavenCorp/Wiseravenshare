using System;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Wiseravenshare.Server.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddNotificationsTableAndLiveTypes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CraftDraftReviews_CraftDomains_CraftDomainId",
                schema: "app_data",
                table: "CraftDraftReviews");

            migrationBuilder.DropForeignKey(
                name: "FK_CraftDraftReviews_UserCraftProfiles_UserId",
                schema: "app_data",
                table: "CraftDraftReviews");

            migrationBuilder.DropForeignKey(
                name: "FK_CraftDraftReviews_Users_UserId1",
                schema: "app_data",
                table: "CraftDraftReviews");

            migrationBuilder.DropForeignKey(
                name: "FK_CraftPerformanceMetrics_CraftDomains_CraftDomainId",
                schema: "app_data",
                table: "CraftPerformanceMetrics");

            migrationBuilder.DropForeignKey(
                name: "FK_UserCraftProfiles_Users_UserId1",
                schema: "app_data",
                table: "UserCraftProfiles");

            migrationBuilder.DropForeignKey(
                name: "FK_UserCraftSkillScores_UserCraftProfiles_UserCraftProfileId",
                schema: "app_data",
                table: "UserCraftSkillScores");

            migrationBuilder.DropIndex(
                name: "IX_UserCraftProfiles_UserId1",
                schema: "app_data",
                table: "UserCraftProfiles");

            migrationBuilder.DropIndex(
                name: "IX_CraftDraftReviews_UserId1",
                schema: "app_data",
                table: "CraftDraftReviews");

            migrationBuilder.DropColumn(
                name: "UserId1",
                schema: "app_data",
                table: "UserCraftProfiles");

            migrationBuilder.DropColumn(
                name: "UserId1",
                schema: "app_data",
                table: "CraftDraftReviews");

            migrationBuilder.AddColumn<string>(
                name: "TruthStatus",
                schema: "app_data",
                table: "Posts",
                type: "text",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "compat_jam_sessions",
                schema: "app_data",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    created_by_id = table.Column<string>(type: "text", nullable: false),
                    description = table.Column<string>(type: "text", nullable: true),
                    title = table.Column<string>(type: "text", nullable: false),
                    participants = table.Column<string>(type: "jsonb", nullable: false),
                    signup_ids = table.Column<string>(type: "jsonb", nullable: false),
                    scheduled_date = table.Column<string>(type: "text", nullable: true),
                    started_at = table.Column<string>(type: "text", nullable: true),
                    bpm = table.Column<int>(type: "integer", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false),
                    max_participants = table.Column<int>(type: "integer", nullable: true),
                    track_uris = table.Column<string>(type: "jsonb", nullable: false),
                    created_date = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_date = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_compat_jam_sessions", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "compat_journalism_reports",
                schema: "app_data",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    created_by_id = table.Column<string>(type: "text", nullable: false),
                    post_id = table.Column<string>(type: "text", nullable: true),
                    headline = table.Column<string>(type: "text", nullable: false),
                    description = table.Column<string>(type: "text", nullable: true),
                    region = table.Column<string>(type: "text", nullable: true),
                    image_url = table.Column<string>(type: "text", nullable: true),
                    source_url = table.Column<string>(type: "text", nullable: true),
                    verification_status = table.Column<string>(type: "text", nullable: false),
                    created_date = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_date = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_compat_journalism_reports", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "compat_vibes",
                schema: "app_data",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    created_by_id = table.Column<string>(type: "text", nullable: false),
                    mood = table.Column<string>(type: "text", nullable: false),
                    note = table.Column<string>(type: "text", nullable: true),
                    created_date = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_date = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_compat_vibes", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "external_verifiers",
                schema: "app_data",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    endpoint_template = table.Column<string>(type: "text", nullable: false),
                    fetch_type = table.Column<string>(type: "text", nullable: false, defaultValue: "stub"),
                    api_key_env_var = table.Column<string>(type: "text", nullable: true),
                    weight = table.Column<decimal>(type: "numeric", nullable: false, defaultValue: 0.10m),
                    is_enabled = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    score_json_path = table.Column<string>(type: "text", nullable: true),
                    notes = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_external_verifiers", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "KaraokeTracks",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Artist = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Album = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    Genre = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Language = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    Year = table.Column<int>(type: "integer", nullable: true),
                    SourceType = table.Column<int>(type: "integer", nullable: false),
                    SourceId = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    SourceUrl = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    License = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    LicenseUrl = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    AttributionText = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    InstrumentalBlobKey = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    VocalsBlobKey = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    LrcBlobKey = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    CoverImageBlobKey = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    InstrumentalUrl = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    LrcUrl = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    CoverImageUrl = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    LrcContent = table.Column<string>(type: "text", nullable: true),
                    PlainLyrics = table.Column<string>(type: "text", nullable: true),
                    DurationSeconds = table.Column<int>(type: "integer", nullable: true),
                    Bpm = table.Column<int>(type: "integer", nullable: true),
                    MusicalKey = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: true),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    IsPublic = table.Column<bool>(type: "boolean", nullable: false),
                    HasInstrumental = table.Column<bool>(type: "boolean", nullable: false),
                    HasLrc = table.Column<bool>(type: "boolean", nullable: false),
                    PlayCount = table.Column<int>(type: "integer", nullable: false),
                    Rating = table.Column<float>(type: "real", nullable: true),
                    RatingCount = table.Column<int>(type: "integer", nullable: false),
                    UploadedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_KaraokeTracks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_KaraokeTracks_Users_UploadedByUserId",
                        column: x => x.UploadedByUserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "Notifications",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: true),
                    PostId = table.Column<Guid>(type: "uuid", nullable: true),
                    CommentId = table.Column<Guid>(type: "uuid", nullable: true),
                    VideoId = table.Column<Guid>(type: "uuid", nullable: true),
                    MessageId = table.Column<Guid>(type: "uuid", nullable: true),
                    StreamId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Content = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Metadata = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    IsRead = table.Column<bool>(type: "boolean", nullable: false),
                    ReadAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Notifications", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Notifications_Comment_CommentId",
                        column: x => x.CommentId,
                        principalSchema: "app_data",
                        principalTable: "Comment",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_Notifications_Messages_MessageId",
                        column: x => x.MessageId,
                        principalSchema: "app_data",
                        principalTable: "Messages",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_Notifications_Posts_PostId",
                        column: x => x.PostId,
                        principalSchema: "app_data",
                        principalTable: "Posts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_Notifications_Users_ActorId",
                        column: x => x.ActorId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_Notifications_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Notifications_Videos_VideoId",
                        column: x => x.VideoId,
                        principalSchema: "app_data",
                        principalTable: "Videos",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "performances",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    SongId = table.Column<Guid>(type: "uuid", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CompletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    LyricScore = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    Matches = table.Column<int>(type: "integer", nullable: true),
                    Substitutions = table.Column<int>(type: "integer", nullable: true),
                    Missing = table.Column<int>(type: "integer", nullable: true),
                    Extras = table.Column<int>(type: "integer", nullable: true),
                    AlignmentBlobName = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    RecordingBlobName = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    RecordingUploadExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    FailureReason = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_performances", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "KaraokeSongFiles",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Artist = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    Album = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    Genre = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Language = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    Year = table.Column<int>(type: "integer", nullable: true),
                    OriginalFileName = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    ContentType = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    FileSizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    DurationSeconds = table.Column<int>(type: "integer", nullable: true),
                    Bpm = table.Column<int>(type: "integer", nullable: true),
                    MusicalKey = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: true),
                    LocalBucketKey = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: true),
                    CloudBlobKey = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: true),
                    CloudPublicUrl = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    IsMigratedToCloud = table.Column<bool>(type: "boolean", nullable: false),
                    CloudMigratedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CoverImageLocalKey = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: true),
                    CoverImageUrl = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    LrcContent = table.Column<string>(type: "text", nullable: true),
                    PlainLyrics = table.Column<string>(type: "text", nullable: true),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    ProcessingError = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: true),
                    ProcessingStartedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ProcessingCompletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    KaraokeTrackId = table.Column<Guid>(type: "uuid", nullable: true),
                    IsPublic = table.Column<bool>(type: "boolean", nullable: false),
                    PlayCount = table.Column<int>(type: "integer", nullable: false),
                    UploadedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_KaraokeSongFiles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_KaraokeSongFiles_KaraokeTracks_KaraokeTrackId",
                        column: x => x.KaraokeTrackId,
                        principalSchema: "app_data",
                        principalTable: "KaraokeTracks",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_KaraokeSongFiles_Users_UploadedByUserId",
                        column: x => x.UploadedByUserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "KaraokeTrackPlays",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TrackId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    PlayedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DurationPlayedSeconds = table.Column<int>(type: "integer", nullable: true),
                    Stars = table.Column<int>(type: "integer", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_KaraokeTrackPlays", x => x.Id);
                    table.ForeignKey(
                        name: "FK_KaraokeTrackPlays_KaraokeTracks_TrackId",
                        column: x => x.TrackId,
                        principalSchema: "app_data",
                        principalTable: "KaraokeTracks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_KaraokeTrackPlays_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "performance_turns",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    PerformanceId = table.Column<Guid>(type: "uuid", nullable: false),
                    TurnOrder = table.Column<int>(type: "integer", nullable: false),
                    Transcript = table.Column<string>(type: "character varying(8000)", maxLength: 8000, nullable: false),
                    StartMilliseconds = table.Column<long>(type: "bigint", nullable: true),
                    EndMilliseconds = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_performance_turns", x => x.Id);
                    table.ForeignKey(
                        name: "FK_performance_turns_performances_PerformanceId",
                        column: x => x.PerformanceId,
                        principalSchema: "app_data",
                        principalTable: "performances",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_compat_jam_sessions_created_date",
                schema: "app_data",
                table: "compat_jam_sessions",
                column: "created_date");

            migrationBuilder.CreateIndex(
                name: "IX_compat_jam_sessions_status",
                schema: "app_data",
                table: "compat_jam_sessions",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "IX_compat_journalism_reports_created_date",
                schema: "app_data",
                table: "compat_journalism_reports",
                column: "created_date");

            migrationBuilder.CreateIndex(
                name: "IX_compat_journalism_reports_verification_status",
                schema: "app_data",
                table: "compat_journalism_reports",
                column: "verification_status");

            migrationBuilder.CreateIndex(
                name: "IX_compat_vibes_created_by_id",
                schema: "app_data",
                table: "compat_vibes",
                column: "created_by_id");

            migrationBuilder.CreateIndex(
                name: "IX_compat_vibes_created_date",
                schema: "app_data",
                table: "compat_vibes",
                column: "created_date");

            migrationBuilder.CreateIndex(
                name: "IX_compat_vibes_mood",
                schema: "app_data",
                table: "compat_vibes",
                column: "mood");

            migrationBuilder.CreateIndex(
                name: "IX_external_verifiers_is_enabled",
                schema: "app_data",
                table: "external_verifiers",
                column: "is_enabled");

            migrationBuilder.CreateIndex(
                name: "IX_KaraokeSongFiles_KaraokeTrackId",
                schema: "app_data",
                table: "KaraokeSongFiles",
                column: "KaraokeTrackId");

            migrationBuilder.CreateIndex(
                name: "IX_KaraokeSongFiles_UploadedByUserId",
                schema: "app_data",
                table: "KaraokeSongFiles",
                column: "UploadedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_KaraokeTrackPlays_TrackId",
                schema: "app_data",
                table: "KaraokeTrackPlays",
                column: "TrackId");

            migrationBuilder.CreateIndex(
                name: "IX_KaraokeTrackPlays_UserId",
                schema: "app_data",
                table: "KaraokeTrackPlays",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_KaraokeTracks_UploadedByUserId",
                schema: "app_data",
                table: "KaraokeTracks",
                column: "UploadedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_Notifications_ActorId",
                schema: "app_data",
                table: "Notifications",
                column: "ActorId");

            migrationBuilder.CreateIndex(
                name: "IX_Notifications_CommentId",
                schema: "app_data",
                table: "Notifications",
                column: "CommentId");

            migrationBuilder.CreateIndex(
                name: "IX_Notifications_MessageId",
                schema: "app_data",
                table: "Notifications",
                column: "MessageId");

            migrationBuilder.CreateIndex(
                name: "IX_Notifications_PostId",
                schema: "app_data",
                table: "Notifications",
                column: "PostId");

            migrationBuilder.CreateIndex(
                name: "IX_Notifications_UserId",
                schema: "app_data",
                table: "Notifications",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_Notifications_VideoId",
                schema: "app_data",
                table: "Notifications",
                column: "VideoId");

            migrationBuilder.CreateIndex(
                name: "IX_performance_turns_PerformanceId_TurnOrder",
                schema: "app_data",
                table: "performance_turns",
                columns: new[] { "PerformanceId", "TurnOrder" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_performances_SongId_LyricScore",
                schema: "app_data",
                table: "performances",
                columns: new[] { "SongId", "LyricScore" });

            migrationBuilder.CreateIndex(
                name: "IX_performances_UserId_StartedAt",
                schema: "app_data",
                table: "performances",
                columns: new[] { "UserId", "StartedAt" });

            migrationBuilder.AddForeignKey(
                name: "FK_CraftDraftReviews_CraftDomains_CraftDomainId",
                schema: "app_data",
                table: "CraftDraftReviews",
                column: "CraftDomainId",
                principalSchema: "app_data",
                principalTable: "CraftDomains",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_CraftDraftReviews_Users_UserId",
                schema: "app_data",
                table: "CraftDraftReviews",
                column: "UserId",
                principalSchema: "app_data",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_CraftLessonCompletions_Users_UserId",
                schema: "app_data",
                table: "CraftLessonCompletions",
                column: "UserId",
                principalSchema: "app_data",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_CraftPerformanceMetrics_CraftDomains_CraftDomainId",
                schema: "app_data",
                table: "CraftPerformanceMetrics",
                column: "CraftDomainId",
                principalSchema: "app_data",
                principalTable: "CraftDomains",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_UserCraftSkillScores_UserCraftProfiles_UserCraftProfileId",
                schema: "app_data",
                table: "UserCraftSkillScores",
                column: "UserCraftProfileId",
                principalSchema: "app_data",
                principalTable: "UserCraftProfiles",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CraftDraftReviews_CraftDomains_CraftDomainId",
                schema: "app_data",
                table: "CraftDraftReviews");

            migrationBuilder.DropForeignKey(
                name: "FK_CraftDraftReviews_Users_UserId",
                schema: "app_data",
                table: "CraftDraftReviews");

            migrationBuilder.DropForeignKey(
                name: "FK_CraftLessonCompletions_Users_UserId",
                schema: "app_data",
                table: "CraftLessonCompletions");

            migrationBuilder.DropForeignKey(
                name: "FK_CraftPerformanceMetrics_CraftDomains_CraftDomainId",
                schema: "app_data",
                table: "CraftPerformanceMetrics");

            migrationBuilder.DropForeignKey(
                name: "FK_UserCraftSkillScores_UserCraftProfiles_UserCraftProfileId",
                schema: "app_data",
                table: "UserCraftSkillScores");

            migrationBuilder.DropTable(
                name: "compat_jam_sessions",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "compat_journalism_reports",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "compat_vibes",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "external_verifiers",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "KaraokeSongFiles",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "KaraokeTrackPlays",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "Notifications",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "performance_turns",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "KaraokeTracks",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "performances",
                schema: "app_data");

            migrationBuilder.DropColumn(
                name: "TruthStatus",
                schema: "app_data",
                table: "Posts");

            migrationBuilder.AddColumn<Guid>(
                name: "UserId1",
                schema: "app_data",
                table: "UserCraftProfiles",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<Guid>(
                name: "UserId1",
                schema: "app_data",
                table: "CraftDraftReviews",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.CreateIndex(
                name: "IX_UserCraftProfiles_UserId1",
                schema: "app_data",
                table: "UserCraftProfiles",
                column: "UserId1");

            migrationBuilder.CreateIndex(
                name: "IX_CraftDraftReviews_UserId1",
                schema: "app_data",
                table: "CraftDraftReviews",
                column: "UserId1");

            migrationBuilder.AddForeignKey(
                name: "FK_CraftDraftReviews_CraftDomains_CraftDomainId",
                schema: "app_data",
                table: "CraftDraftReviews",
                column: "CraftDomainId",
                principalSchema: "app_data",
                principalTable: "CraftDomains",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_CraftDraftReviews_UserCraftProfiles_UserId",
                schema: "app_data",
                table: "CraftDraftReviews",
                column: "UserId",
                principalSchema: "app_data",
                principalTable: "UserCraftProfiles",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_CraftDraftReviews_Users_UserId1",
                schema: "app_data",
                table: "CraftDraftReviews",
                column: "UserId1",
                principalSchema: "app_data",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_CraftPerformanceMetrics_CraftDomains_CraftDomainId",
                schema: "app_data",
                table: "CraftPerformanceMetrics",
                column: "CraftDomainId",
                principalSchema: "app_data",
                principalTable: "CraftDomains",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_UserCraftProfiles_Users_UserId1",
                schema: "app_data",
                table: "UserCraftProfiles",
                column: "UserId1",
                principalSchema: "app_data",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_UserCraftSkillScores_UserCraftProfiles_UserCraftProfileId",
                schema: "app_data",
                table: "UserCraftSkillScores",
                column: "UserCraftProfileId",
                principalSchema: "app_data",
                principalTable: "UserCraftProfiles",
                principalColumn: "Id");
        }
    }
}
