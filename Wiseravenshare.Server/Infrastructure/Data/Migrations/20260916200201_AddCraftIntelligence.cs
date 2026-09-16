using System;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wiseravenshare.Server.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCraftIntelligence : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Conversation_Users_CreatorId",
                schema: "app_data",
                table: "Conversation");

            migrationBuilder.DropForeignKey(
                name: "FK_ConversationParticipant_Conversation_ConversationId",
                schema: "app_data",
                table: "ConversationParticipant");

            migrationBuilder.DropForeignKey(
                name: "FK_ConversationParticipant_Users_UserId",
                schema: "app_data",
                table: "ConversationParticipant");

            migrationBuilder.DropForeignKey(
                name: "FK_Message_Conversation_ConversationId",
                schema: "app_data",
                table: "Message");

            migrationBuilder.DropForeignKey(
                name: "FK_Message_Message_ReplyToId",
                schema: "app_data",
                table: "Message");

            migrationBuilder.DropForeignKey(
                name: "FK_Message_Users_SenderId",
                schema: "app_data",
                table: "Message");

            migrationBuilder.DropPrimaryKey(
                name: "PK_Message",
                schema: "app_data",
                table: "Message");

            migrationBuilder.DropPrimaryKey(
                name: "PK_ConversationParticipant",
                schema: "app_data",
                table: "ConversationParticipant");

            migrationBuilder.DropPrimaryKey(
                name: "PK_Conversation",
                schema: "app_data",
                table: "Conversation");

            migrationBuilder.RenameTable(
                name: "Message",
                schema: "app_data",
                newName: "Messages",
                newSchema: "app_data");

            migrationBuilder.RenameTable(
                name: "ConversationParticipant",
                schema: "app_data",
                newName: "ConversationParticipants",
                newSchema: "app_data");

            migrationBuilder.RenameTable(
                name: "Conversation",
                schema: "app_data",
                newName: "Conversations",
                newSchema: "app_data");

            migrationBuilder.RenameIndex(
                name: "IX_Message_SenderId",
                schema: "app_data",
                table: "Messages",
                newName: "IX_Messages_SenderId");

            migrationBuilder.RenameIndex(
                name: "IX_Message_ReplyToId",
                schema: "app_data",
                table: "Messages",
                newName: "IX_Messages_ReplyToId");

            migrationBuilder.RenameIndex(
                name: "IX_Message_ConversationId",
                schema: "app_data",
                table: "Messages",
                newName: "IX_Messages_ConversationId");

            migrationBuilder.RenameIndex(
                name: "IX_ConversationParticipant_UserId",
                schema: "app_data",
                table: "ConversationParticipants",
                newName: "IX_ConversationParticipants_UserId");

            migrationBuilder.RenameIndex(
                name: "IX_ConversationParticipant_ConversationId",
                schema: "app_data",
                table: "ConversationParticipants",
                newName: "IX_ConversationParticipants_ConversationId");

            migrationBuilder.RenameIndex(
                name: "IX_Conversation_CreatorId",
                schema: "app_data",
                table: "Conversations",
                newName: "IX_Conversations_CreatorId");

            migrationBuilder.AddColumn<string>(
                name: "PhoneNumber",
                schema: "app_data",
                table: "Users",
                type: "text",
                nullable: true);

            migrationBuilder.AddPrimaryKey(
                name: "PK_Messages",
                schema: "app_data",
                table: "Messages",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_ConversationParticipants",
                schema: "app_data",
                table: "ConversationParticipants",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_Conversations",
                schema: "app_data",
                table: "Conversations",
                column: "Id");

            migrationBuilder.CreateTable(
                name: "Badges",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    IconUrl = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    Rarity = table.Column<int>(type: "integer", nullable: false),
                    Category = table.Column<int>(type: "integer", nullable: false),
                    ValueMultiplier = table.Column<decimal>(type: "numeric", nullable: false),
                    WorkMultiplier = table.Column<decimal>(type: "numeric", nullable: false),
                    TrustMultiplier = table.Column<decimal>(type: "numeric", nullable: false),
                    StakingMultiplier = table.Column<decimal>(type: "numeric", nullable: false),
                    MinimumWorkHours = table.Column<int>(type: "integer", nullable: false),
                    MintingCost = table.Column<decimal>(type: "numeric", nullable: false),
                    IsSoulbound = table.Column<bool>(type: "boolean", nullable: false),
                    IsTradeable = table.Column<bool>(type: "boolean", nullable: false),
                    TotalSupply = table.Column<int>(type: "integer", nullable: false),
                    CurrentSupply = table.Column<int>(type: "integer", nullable: false),
                    MarketValue = table.Column<decimal>(type: "numeric", nullable: false),
                    Requirements = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    SkillsRequired = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Badges", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "bridge_messages",
                schema: "app_data",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    session_id = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    source = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    target = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    message_type = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    content = table.Column<string>(type: "text", nullable: true),
                    metadata = table.Column<string>(type: "jsonb", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    processed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    is_processed = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_bridge_messages", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "bridge_sessions",
                schema: "app_data",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    session_id = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    platform = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    external_user_id = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    session_data = table.Column<string>(type: "jsonb", nullable: true),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    last_activity = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    metadata = table.Column<string>(type: "jsonb", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_bridge_sessions", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "CallLogs",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CallId = table.Column<string>(type: "text", nullable: false),
                    UserId = table.Column<string>(type: "text", nullable: false),
                    ContactId = table.Column<string>(type: "text", nullable: false),
                    ContactName = table.Column<string>(type: "text", nullable: true),
                    ContactNumber = table.Column<string>(type: "text", nullable: true),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    Direction = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    Timestamp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DurationSeconds = table.Column<int>(type: "integer", nullable: false),
                    ScreeningResult = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CallLogs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "collaboration_rooms",
                schema: "app_data",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    room_id = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    room_name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    owner_id = table.Column<Guid>(type: "uuid", nullable: true),
                    platform = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    metadata = table.Column<string>(type: "jsonb", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_collaboration_rooms", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "CommunicationPreferences",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
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

            migrationBuilder.CreateTable(
                name: "CraftDomains",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Key = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    IconEmoji = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CraftDomains", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "CraftObservations",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ContentId = table.Column<Guid>(type: "uuid", nullable: true),
                    DomainKey = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    Action = table.Column<int>(type: "integer", nullable: false),
                    SuccessMetric = table.Column<decimal>(type: "numeric", nullable: true),
                    MetricName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Signals = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    Features = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    Context = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    DetectedPattern = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CraftObservations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CraftObservations_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "crawl_jobs",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StartUrl = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    JobName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    Scope = table.Column<int>(type: "integer", nullable: false),
                    MaxPages = table.Column<int>(type: "integer", nullable: false),
                    MaxDepth = table.Column<int>(type: "integer", nullable: false),
                    RequestsPerSecond = table.Column<int>(type: "integer", nullable: false),
                    RespectRobotsTxt = table.Column<bool>(type: "boolean", nullable: false),
                    RenderJavaScript = table.Column<bool>(type: "boolean", nullable: false),
                    CaptureScreenshots = table.Column<bool>(type: "boolean", nullable: false),
                    FollowExternalLinks = table.Column<bool>(type: "boolean", nullable: false),
                    IncludePatterns = table.Column<string[]>(type: "text[]", nullable: true),
                    ExcludePatterns = table.Column<string[]>(type: "text[]", nullable: true),
                    CustomUserAgents = table.Column<string[]>(type: "text[]", nullable: true),
                    PagesDiscovered = table.Column<int>(type: "integer", nullable: false),
                    PagesCrawled = table.Column<int>(type: "integer", nullable: false),
                    PagesFailed = table.Column<int>(type: "integer", nullable: false),
                    PagesSkipped = table.Column<int>(type: "integer", nullable: false),
                    IssuesFound = table.Column<int>(type: "integer", nullable: false),
                    StartedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CompletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ElapsedMilliseconds = table.Column<long>(type: "bigint", nullable: false),
                    OverallHealthScore = table.Column<decimal>(type: "numeric", nullable: false),
                    SeoScore = table.Column<decimal>(type: "numeric", nullable: false),
                    PerformanceScore = table.Column<decimal>(type: "numeric", nullable: false),
                    AccessibilityScore = table.Column<decimal>(type: "numeric", nullable: false),
                    SecurityScore = table.Column<decimal>(type: "numeric", nullable: false),
                    ContentScore = table.Column<decimal>(type: "numeric", nullable: false),
                    Configuration = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    Summary = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    CreatedById = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_crawl_jobs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "CreatorRadioStations",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Frequency = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    FrequencyKey = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Band = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Genre = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    SubGenre = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    LogoUrl = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CoverImageUrl = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    StreamUrl = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    StreamKey = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Website = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    SocialLinks = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatorId = table.Column<Guid>(type: "uuid", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    Visibility = table.Column<int>(type: "integer", nullable: false),
                    IsLive = table.Column<bool>(type: "boolean", nullable: false),
                    LastLiveAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ScheduledLiveAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ScheduledEndAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Listeners = table.Column<int>(type: "integer", nullable: false),
                    TotalListeners = table.Column<int>(type: "integer", nullable: false),
                    PeakListeners = table.Column<int>(type: "integer", nullable: false),
                    FollowerCount = table.Column<int>(type: "integer", nullable: false),
                    AllowChat = table.Column<bool>(type: "boolean", nullable: false),
                    AllowRequests = table.Column<bool>(type: "boolean", nullable: false),
                    AllowShoutouts = table.Column<bool>(type: "boolean", nullable: false),
                    RequireApproval = table.Column<bool>(type: "boolean", nullable: false),
                    Schedule = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    Playlist = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    Settings = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    IsMonetized = table.Column<bool>(type: "boolean", nullable: false),
                    SubscriptionPrice = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    AllowDonations = table.Column<bool>(type: "boolean", nullable: false),
                    DonationLink = table.Column<string>(type: "text", nullable: true),
                    IsProprietaryFrequency = table.Column<bool>(type: "boolean", nullable: false),
                    FrequencyLockedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CreatorRadioStations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CreatorRadioStations_Users_CreatorId",
                        column: x => x.CreatorId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "FeatureAuditLogs",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    FeatureKey = table.Column<string>(type: "text", nullable: false),
                    Scope = table.Column<int>(type: "integer", nullable: false),
                    ScopeValue = table.Column<string>(type: "text", nullable: true),
                    OldState = table.Column<int>(type: "integer", nullable: true),
                    NewState = table.Column<int>(type: "integer", nullable: false),
                    Reason = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FeatureAuditLogs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "FeatureFlags",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    FeatureKey = table.Column<string>(type: "text", nullable: false),
                    Scope = table.Column<int>(type: "integer", nullable: false),
                    ScopeValue = table.Column<string>(type: "text", nullable: true),
                    State = table.Column<int>(type: "integer", nullable: false),
                    Notes = table.Column<string>(type: "text", nullable: true),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FeatureFlags", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "file_transfers",
                schema: "app_data",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    transfer_id = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    room_id = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    file_name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    file_size = table.Column<long>(type: "bigint", nullable: false),
                    file_type = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    file_url = table.Column<string>(type: "text", nullable: true),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    chunk_count = table.Column<int>(type: "integer", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    completed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    metadata = table.Column<string>(type: "jsonb", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_file_transfers", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "FMStations",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Frequency = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    FrequencyKey = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    Band = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    City = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    Country = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    State = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Latitude = table.Column<double>(type: "double precision", nullable: true),
                    Longitude = table.Column<double>(type: "double precision", nullable: true),
                    StreamUrl = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Website = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    LogoUrl = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CoverImageUrl = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Genre = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Language = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Listeners = table.Column<int>(type: "integer", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    IsFeatured = table.Column<bool>(type: "boolean", nullable: false),
                    Bitrate = table.Column<int>(type: "integer", nullable: false),
                    Codec = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    IsVerified = table.Column<bool>(type: "boolean", nullable: false),
                    VerifiedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FMStations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FMStations_Users_CreatedBy",
                        column: x => x.CreatedBy,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "FMUserPreferences",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    FavoriteGenres = table.Column<string[]>(type: "text[]", nullable: true),
                    FavoriteLanguages = table.Column<string[]>(type: "text[]", nullable: true),
                    RecentStations = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    Volume = table.Column<int>(type: "integer", nullable: false),
                    AutoPlay = table.Column<bool>(type: "boolean", nullable: false),
                    ShowLyrics = table.Column<bool>(type: "boolean", nullable: false),
                    ShowAlbumArt = table.Column<bool>(type: "boolean", nullable: false),
                    LowQualityMode = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FMUserPreferences", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FMUserPreferences_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "InstrumentConnections",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    DeviceIdentifier = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    DeviceName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Transport = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    HardwareAddress = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    IsPaired = table.Column<bool>(type: "boolean", nullable: false),
                    IsTrusted = table.Column<bool>(type: "boolean", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    LastSeenAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    MetadataJson = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InstrumentConnections", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InstrumentConnections_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "LedgerAnchors",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ChainHeadHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    AnchoredUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Note = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LedgerAnchors", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "MediaItems",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    MediaType = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    FileName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    FilePath = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                    FileUrl = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                    MimeType = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    FileSize = table.Column<long>(type: "bigint", nullable: false),
                    Width = table.Column<int>(type: "integer", nullable: true),
                    Height = table.Column<int>(type: "integer", nullable: true),
                    Duration = table.Column<int>(type: "integer", nullable: true),
                    ThumbnailPath = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    ThumbnailUrl = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    PreviewPath = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    PreviewUrl = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    Metadata = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Visibility = table.Column<int>(type: "integer", nullable: false),
                    Views = table.Column<int>(type: "integer", nullable: false),
                    Downloads = table.Column<int>(type: "integer", nullable: false),
                    Plays = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MediaItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MediaItems_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MediaPlaylists",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    Visibility = table.Column<int>(type: "integer", nullable: false),
                    CoverImageUrl = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    ItemCount = table.Column<int>(type: "integer", nullable: false),
                    Plays = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MediaPlaylists", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MediaPlaylists_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MediaTags",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    UsageCount = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MediaTags", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "NotificationCosts",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    NotificationType = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    PhoneNumber = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    MessageLength = table.Column<int>(type: "integer", nullable: false),
                    CostUsd = table.Column<decimal>(type: "numeric(10,6)", precision: 10, scale: 6, nullable: false),
                    TwilioSid = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    DeliveryStatus = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    SentAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_NotificationCosts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_NotificationCosts_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PersonalizationTags",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Category = table.Column<int>(type: "integer", nullable: false),
                    Weight = table.Column<int>(type: "integer", nullable: false),
                    UsageCount = table.Column<int>(type: "integer", nullable: false),
                    Synonyms = table.Column<string>(type: "text", nullable: true),
                    RelatedTags = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PersonalizationTags", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Projects",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    Visibility = table.Column<int>(type: "integer", nullable: false),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    CoverImageUrl = table.Column<string>(type: "text", nullable: true),
                    BannerImageUrl = table.Column<string>(type: "text", nullable: true),
                    StartDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    EndDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    PublishedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    AllowComments = table.Column<bool>(type: "boolean", nullable: false),
                    AllowSharing = table.Column<bool>(type: "boolean", nullable: false),
                    RequireApproval = table.Column<bool>(type: "boolean", nullable: false),
                    MaxCollaborators = table.Column<int>(type: "integer", nullable: false),
                    RevenueShareModel = table.Column<int>(type: "integer", nullable: false),
                    RevenueShareConfig = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    PublishSettings = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    PlatformSchedule = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Projects", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Projects_Users_OwnerId",
                        column: x => x.OwnerId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "RegionalTrendSnapshots",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CountryCode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    Category = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    TopicsJson = table.Column<string>(type: "text", nullable: false),
                    SnapshotAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RegionalTrendSnapshots", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "room_participants",
                schema: "app_data",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    room_id = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    external_user_id = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    platform = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    joined_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    left_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    metadata = table.Column<string>(type: "jsonb", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_room_participants", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "StudioCaptureRigProfiles",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    RigName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    AnalogInputChannels = table.Column<int>(type: "integer", nullable: false),
                    HasAnalogPreamps = table.Column<bool>(type: "boolean", nullable: false),
                    HasUsbCConnectivity = table.Column<bool>(type: "boolean", nullable: false),
                    HasBluetoothPairing = table.Column<bool>(type: "boolean", nullable: false),
                    HasMidiInOut = table.Column<bool>(type: "boolean", nullable: false),
                    HasWifi6Streaming = table.Column<bool>(type: "boolean", nullable: false),
                    EnableIpProtection = table.Column<bool>(type: "boolean", nullable: false),
                    Notes = table.Column<string>(type: "character varying(1200)", maxLength: 1200, nullable: true),
                    LastConfiguredAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StudioCaptureRigProfiles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StudioCaptureRigProfiles_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "UserCompartmentAssignments",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Compartment = table.Column<int>(type: "integer", nullable: false),
                    IsOverride = table.Column<bool>(type: "boolean", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserCompartmentAssignments", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "UserCraftProfiles",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    PrimaryDomain = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    FocusDomains = table.Column<string[]>(type: "text[]", nullable: true),
                    DomainScores = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    CraftLevel = table.Column<int>(type: "integer", nullable: false),
                    TotalCraftPoints = table.Column<int>(type: "integer", nullable: false),
                    LearningStreakDays = table.Column<int>(type: "integer", nullable: false),
                    LastAnalyzedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastCoachedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UserId1 = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserCraftProfiles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserCraftProfiles_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_UserCraftProfiles_Users_UserId1",
                        column: x => x.UserId1,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "UserInteractionEvents",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    TargetType = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    TargetId = table.Column<Guid>(type: "uuid", nullable: true),
                    TargetTitle = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    TargetCategory = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    TargetTags = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    EngagementScore = table.Column<int>(type: "integer", nullable: true),
                    DurationSeconds = table.Column<int>(type: "integer", nullable: true),
                    DeviceType = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    CountryCode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    RegionCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserInteractionEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserInteractionEvents_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "UserPersonalizationProfiles",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    AgeRange = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    Gender = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    Location = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    CountryCode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    RegionCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    Timezone = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Occupation = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    Languages = table.Column<string>(type: "text", nullable: true),
                    LifeStage = table.Column<int>(type: "integer", nullable: false),
                    LifeInterests = table.Column<string>(type: "text", nullable: true),
                    CurrentGoals = table.Column<string>(type: "text", nullable: true),
                    LifeEvents = table.Column<string>(type: "text", nullable: true),
                    FavoriteGenres = table.Column<string>(type: "text", nullable: true),
                    FavoriteTopics = table.Column<string>(type: "text", nullable: true),
                    FavoriteCreators = table.Column<string>(type: "text", nullable: true),
                    PreferredContentTypes = table.Column<string>(type: "text", nullable: true),
                    ActiveHours = table.Column<string>(type: "text", nullable: true),
                    ActiveDays = table.Column<string>(type: "text", nullable: true),
                    AverageSessionDurationSeconds = table.Column<int>(type: "integer", nullable: false),
                    LastActiveAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    EmbeddingVector = table.Column<string>(type: "text", nullable: true),
                    BehavioralPatterns = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserPersonalizationProfiles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserPersonalizationProfiles_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "UserPresence",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    State = table.Column<int>(type: "integer", nullable: false),
                    LastSeenUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LastHeartbeatUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeviceName = table.Column<string>(type: "text", nullable: true),
                    IpAddress = table.Column<string>(type: "text", nullable: true),
                    IsAdminVisible = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserPresence", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "UserRoles",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    Level = table.Column<int>(type: "integer", nullable: false),
                    IsSystemRole = table.Column<bool>(type: "boolean", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    Permissions = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    PlatformPermissions = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    PublishingPermissions = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    ParentRoleId = table.Column<Guid>(type: "uuid", nullable: true),
                    HierarchyLevel = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserRoles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserRoles_UserRoles_ParentRoleId",
                        column: x => x.ParentRoleId,
                        principalSchema: "app_data",
                        principalTable: "UserRoles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "WiseCoins",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Balance = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    LockedBalance = table.Column<decimal>(type: "numeric", nullable: false),
                    EscrowedBalance = table.Column<decimal>(type: "numeric", nullable: false),
                    TotalEarned = table.Column<decimal>(type: "numeric", nullable: false),
                    TotalSpent = table.Column<decimal>(type: "numeric", nullable: false),
                    WorkHoursContributed = table.Column<decimal>(type: "numeric", nullable: false),
                    CurrentValuePerHour = table.Column<decimal>(type: "numeric", nullable: false),
                    HasReceivedInitialAllocation = table.Column<bool>(type: "boolean", nullable: false),
                    InitialAllocationDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    InitialAllocationAmount = table.Column<decimal>(type: "numeric", nullable: false),
                    BadgeMultiplier = table.Column<decimal>(type: "numeric", nullable: false),
                    SkillMultiplier = table.Column<decimal>(type: "numeric", nullable: false),
                    ReputationMultiplier = table.Column<decimal>(type: "numeric", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WiseCoins", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WiseCoins_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WorkHourContributions",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Date = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Hours = table.Column<decimal>(type: "numeric", nullable: false),
                    Category = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    WSCGenerated = table.Column<decimal>(type: "numeric", nullable: false),
                    WSCRate = table.Column<decimal>(type: "numeric", nullable: false),
                    IsVerified = table.Column<bool>(type: "boolean", nullable: false),
                    IsApproved = table.Column<bool>(type: "boolean", nullable: false),
                    VerifiedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    ProofReference = table.Column<string>(type: "text", nullable: true),
                    Metadata = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkHourContributions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WorkHourContributions_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_WorkHourContributions_Users_VerifiedBy",
                        column: x => x.VerifiedBy,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "WorkHourValuations",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Date = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    WSCPerHour = table.Column<decimal>(type: "numeric", nullable: false),
                    TotalWorkHours = table.Column<decimal>(type: "numeric", nullable: false),
                    TotalWSCInCirculation = table.Column<decimal>(type: "numeric", nullable: false),
                    MarketCapUSD = table.Column<decimal>(type: "numeric", nullable: false),
                    AverageWSCPerUser = table.Column<decimal>(type: "numeric", nullable: false),
                    ActiveUsers = table.Column<int>(type: "integer", nullable: false),
                    InflationRate = table.Column<decimal>(type: "numeric", nullable: false),
                    BurnRate = table.Column<decimal>(type: "numeric", nullable: false),
                    Metrics = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    MinimumWageReference = table.Column<decimal>(type: "numeric", nullable: false),
                    FreelancerRateReference = table.Column<decimal>(type: "numeric", nullable: false),
                    ExpertRateReference = table.Column<decimal>(type: "numeric", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkHourValuations", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "BadgeEvolutions",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceBadgeId = table.Column<Guid>(type: "uuid", nullable: false),
                    TargetBadgeId = table.Column<Guid>(type: "uuid", nullable: false),
                    EvolutionPath = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    WorkHoursRequired = table.Column<decimal>(type: "numeric", nullable: false),
                    WSCRequired = table.Column<decimal>(type: "numeric", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BadgeEvolutions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BadgeEvolutions_Badges_SourceBadgeId",
                        column: x => x.SourceBadgeId,
                        principalSchema: "app_data",
                        principalTable: "Badges",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_BadgeEvolutions_Badges_TargetBadgeId",
                        column: x => x.TargetBadgeId,
                        principalSchema: "app_data",
                        principalTable: "Badges",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CraftPatterns",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CraftDomainId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    Description = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    Example = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Confidence = table.Column<decimal>(type: "numeric(3,2)", precision: 3, scale: 2, nullable: false),
                    SampleSize = table.Column<int>(type: "integer", nullable: false),
                    AverageImpact = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    ApprovedById = table.Column<Guid>(type: "uuid", nullable: true),
                    ApprovedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    RelatedPrinciples = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    SupportingEvidence = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CraftPatterns", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CraftPatterns_CraftDomains_CraftDomainId",
                        column: x => x.CraftDomainId,
                        principalSchema: "app_data",
                        principalTable: "CraftDomains",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CraftPerformanceMetrics",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CraftDomainId = table.Column<Guid>(type: "uuid", nullable: false),
                    DomainKey = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    PublishedContentId = table.Column<Guid>(type: "uuid", nullable: true),
                    ContentTitle = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    EngagementRate = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    ViewCount = table.Column<decimal>(type: "numeric", nullable: true),
                    ShareCount = table.Column<decimal>(type: "numeric", nullable: true),
                    CommentCount = table.Column<decimal>(type: "numeric", nullable: true),
                    TimeOnPageSeconds = table.Column<decimal>(type: "numeric", nullable: true),
                    CompletionRate = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    Features = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    MeasuredAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CraftPerformanceMetrics", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CraftPerformanceMetrics_CraftDomains_CraftDomainId",
                        column: x => x.CraftDomainId,
                        principalSchema: "app_data",
                        principalTable: "CraftDomains",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CraftPerformanceMetrics_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CraftPrinciples",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CraftDomainId = table.Column<Guid>(type: "uuid", nullable: false),
                    SkillId = table.Column<Guid>(type: "uuid", nullable: true),
                    Title = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    Description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    Example = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CounterExample = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Author = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Kind = table.Column<int>(type: "integer", nullable: false),
                    Importance = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CraftPrinciples", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CraftPrinciples_CraftDomains_CraftDomainId",
                        column: x => x.CraftDomainId,
                        principalSchema: "app_data",
                        principalTable: "CraftDomains",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CraftSkills",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CraftDomainId = table.Column<Guid>(type: "uuid", nullable: false),
                    Key = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    Difficulty = table.Column<int>(type: "integer", nullable: false),
                    MeasurementSignal = table.Column<string>(type: "text", nullable: true),
                    Weight = table.Column<int>(type: "integer", nullable: false),
                    ParentSkillId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CraftSkills", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CraftSkills_CraftDomains_CraftDomainId",
                        column: x => x.CraftDomainId,
                        principalSchema: "app_data",
                        principalTable: "CraftDomains",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CraftSkills_CraftSkills_ParentSkillId",
                        column: x => x.ParentSkillId,
                        principalSchema: "app_data",
                        principalTable: "CraftSkills",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "crawl_metrics",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CrawlJobId = table.Column<Guid>(type: "uuid", nullable: false),
                    MetricKey = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Value = table.Column<decimal>(type: "numeric", nullable: false),
                    Unit = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Category = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    RecordedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_crawl_metrics", x => x.Id);
                    table.ForeignKey(
                        name: "FK_crawl_metrics_crawl_jobs_CrawlJobId",
                        column: x => x.CrawlJobId,
                        principalSchema: "app_data",
                        principalTable: "crawl_jobs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "crawl_reports",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CrawlJobId = table.Column<Guid>(type: "uuid", nullable: false),
                    Format = table.Column<int>(type: "integer", nullable: false),
                    ContentType = table.Column<string>(type: "text", nullable: false),
                    RawData = table.Column<byte[]>(type: "bytea", nullable: false),
                    GeneratedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_crawl_reports", x => x.Id);
                    table.ForeignKey(
                        name: "FK_crawl_reports_crawl_jobs_CrawlJobId",
                        column: x => x.CrawlJobId,
                        principalSchema: "app_data",
                        principalTable: "crawl_jobs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "crawled_pages",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CrawlJobId = table.Column<Guid>(type: "uuid", nullable: false),
                    Url = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    CanonicalUrl = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    MetaDescription = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    StatusCode = table.Column<int>(type: "integer", nullable: false),
                    ResponseTimeMs = table.Column<int>(type: "integer", nullable: false),
                    ContentSizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    ContentType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Depth = table.Column<int>(type: "integer", nullable: false),
                    WordCount = table.Column<int>(type: "integer", nullable: false),
                    ImageCount = table.Column<int>(type: "integer", nullable: false),
                    InternalLinkCount = table.Column<int>(type: "integer", nullable: false),
                    ExternalLinkCount = table.Column<int>(type: "integer", nullable: false),
                    ScriptCount = table.Column<int>(type: "integer", nullable: false),
                    StyleSheetCount = table.Column<int>(type: "integer", nullable: false),
                    HasH1 = table.Column<bool>(type: "boolean", nullable: false),
                    H1Count = table.Column<int>(type: "integer", nullable: false),
                    H2Count = table.Column<int>(type: "integer", nullable: false),
                    H3Count = table.Column<int>(type: "integer", nullable: false),
                    HasMetaRobots = table.Column<bool>(type: "boolean", nullable: false),
                    MetaRobots = table.Column<string>(type: "text", nullable: true),
                    HasCanonical = table.Column<bool>(type: "boolean", nullable: false),
                    HasViewportMeta = table.Column<bool>(type: "boolean", nullable: false),
                    HasOpenGraph = table.Column<bool>(type: "boolean", nullable: false),
                    HasTwitterCard = table.Column<bool>(type: "boolean", nullable: false),
                    FirstContentfulPaintMs = table.Column<int>(type: "integer", nullable: true),
                    LargestContentfulPaintMs = table.Column<int>(type: "integer", nullable: true),
                    TimeToInteractiveMs = table.Column<int>(type: "integer", nullable: true),
                    TotalBlockingTimeMs = table.Column<int>(type: "integer", nullable: true),
                    CumulativeLayoutShift = table.Column<decimal>(type: "numeric", nullable: true),
                    PageSpeedScore = table.Column<int>(type: "integer", nullable: true),
                    AccessibilityScore = table.Column<int>(type: "integer", nullable: true),
                    AxeViolations = table.Column<int>(type: "integer", nullable: false),
                    ContentHash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    IsIndexable = table.Column<bool>(type: "boolean", nullable: false),
                    IsDuplicate = table.Column<bool>(type: "boolean", nullable: false),
                    DuplicateOfPageId = table.Column<Guid>(type: "uuid", nullable: true),
                    SchemaTypes = table.Column<string[]>(type: "text[]", nullable: true),
                    ScreenshotUrl = table.Column<string>(type: "text", nullable: true),
                    MobileScreenshotUrl = table.Column<string>(type: "text", nullable: true),
                    HtmlSnapshot = table.Column<string>(type: "text", nullable: true),
                    Headers = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    SeoData = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    PerformanceData = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    AccessibilityData = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_crawled_pages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_crawled_pages_crawl_jobs_CrawlJobId",
                        column: x => x.CrawlJobId,
                        principalSchema: "app_data",
                        principalTable: "crawl_jobs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "RadioStationFollows",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StationId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    FollowedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsNotified = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RadioStationFollows", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RadioStationFollows_CreatorRadioStations_StationId",
                        column: x => x.StationId,
                        principalSchema: "app_data",
                        principalTable: "CreatorRadioStations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_RadioStationFollows_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "RadioStationFrequencyClaims",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StationId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatorId = table.Column<Guid>(type: "uuid", nullable: false),
                    Frequency = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Band = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    FrequencyKey = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    IsLocked = table.Column<bool>(type: "boolean", nullable: false),
                    LockedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RadioStationFrequencyClaims", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RadioStationFrequencyClaims_CreatorRadioStations_StationId",
                        column: x => x.StationId,
                        principalSchema: "app_data",
                        principalTable: "CreatorRadioStations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_RadioStationFrequencyClaims_Users_CreatorId",
                        column: x => x.CreatorId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "RadioStationListens",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StationId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    StartedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    EndedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Duration = table.Column<int>(type: "integer", nullable: false),
                    DeviceInfo = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    IPAddress = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RadioStationListens", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RadioStationListens_CreatorRadioStations_StationId",
                        column: x => x.StationId,
                        principalSchema: "app_data",
                        principalTable: "CreatorRadioStations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_RadioStationListens_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "RadioStationRequests",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StationId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    SongTitle = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    ArtistName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    Message = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    RequestedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    PlayedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    PlayedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RadioStationRequests", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RadioStationRequests_CreatorRadioStations_StationId",
                        column: x => x.StationId,
                        principalSchema: "app_data",
                        principalTable: "CreatorRadioStations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_RadioStationRequests_Users_PlayedBy",
                        column: x => x.PlayedBy,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_RadioStationRequests_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "RadioStationSchedules",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    DayOfWeek = table.Column<int>(type: "integer", nullable: false),
                    StartTime = table.Column<TimeSpan>(type: "interval", nullable: false),
                    EndTime = table.Column<TimeSpan>(type: "interval", nullable: false),
                    Timezone = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    IsRecurring = table.Column<bool>(type: "boolean", nullable: false),
                    SpecificDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    HostName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    Genre = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RadioStationSchedules", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RadioStationSchedules_CreatorRadioStations_StationId",
                        column: x => x.StationId,
                        principalSchema: "app_data",
                        principalTable: "CreatorRadioStations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "RadioStationShoutouts",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StationId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Message = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    RequestedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ReadAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    AcknowledgedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RadioStationShoutouts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RadioStationShoutouts_CreatorRadioStations_StationId",
                        column: x => x.StationId,
                        principalSchema: "app_data",
                        principalTable: "CreatorRadioStations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_RadioStationShoutouts_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "FMStationBookmarks",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StationId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FMStationBookmarks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FMStationBookmarks_FMStations_StationId",
                        column: x => x.StationId,
                        principalSchema: "app_data",
                        principalTable: "FMStations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_FMStationBookmarks_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "FMStationHistory",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StationId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ListenedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Duration = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FMStationHistory", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FMStationHistory_FMStations_StationId",
                        column: x => x.StationId,
                        principalSchema: "app_data",
                        principalTable: "FMStations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_FMStationHistory_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "FMStationLikes",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StationId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FMStationLikes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FMStationLikes_FMStations_StationId",
                        column: x => x.StationId,
                        principalSchema: "app_data",
                        principalTable: "FMStations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_FMStationLikes_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MediaBookmarks",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MediaId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MediaBookmarks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MediaBookmarks_MediaItems_MediaId",
                        column: x => x.MediaId,
                        principalSchema: "app_data",
                        principalTable: "MediaItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_MediaBookmarks_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MediaComments",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MediaId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ParentCommentId = table.Column<Guid>(type: "uuid", nullable: true),
                    Content = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    LikesCount = table.Column<int>(type: "integer", nullable: false),
                    RepliesCount = table.Column<int>(type: "integer", nullable: false),
                    IsSoftDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    TimestampSeconds = table.Column<int>(type: "integer", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MediaComments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MediaComments_MediaComments_ParentCommentId",
                        column: x => x.ParentCommentId,
                        principalSchema: "app_data",
                        principalTable: "MediaComments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MediaComments_MediaItems_MediaId",
                        column: x => x.MediaId,
                        principalSchema: "app_data",
                        principalTable: "MediaItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_MediaComments_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MediaLikes",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MediaId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MediaLikes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MediaLikes_MediaItems_MediaId",
                        column: x => x.MediaId,
                        principalSchema: "app_data",
                        principalTable: "MediaItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_MediaLikes_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MediaViewHistories",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MediaId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ViewedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    PositionSeconds = table.Column<int>(type: "integer", nullable: true),
                    ViewDuration = table.Column<int>(type: "integer", nullable: true),
                    DeviceInfo = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    IPAddress = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MediaViewHistories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MediaViewHistories_MediaItems_MediaId",
                        column: x => x.MediaId,
                        principalSchema: "app_data",
                        principalTable: "MediaItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_MediaViewHistories_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MediaPlaylistItems",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PlaylistId = table.Column<Guid>(type: "uuid", nullable: false),
                    MediaId = table.Column<Guid>(type: "uuid", nullable: false),
                    OrderIndex = table.Column<int>(type: "integer", nullable: false),
                    AddedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MediaPlaylistItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MediaPlaylistItems_MediaItems_MediaId",
                        column: x => x.MediaId,
                        principalSchema: "app_data",
                        principalTable: "MediaItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_MediaPlaylistItems_MediaPlaylists_PlaylistId",
                        column: x => x.PlaylistId,
                        principalSchema: "app_data",
                        principalTable: "MediaPlaylists",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MediaItemTags",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MediaId = table.Column<Guid>(type: "uuid", nullable: false),
                    TagId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MediaItemTags", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MediaItemTags_MediaItems_MediaId",
                        column: x => x.MediaId,
                        principalSchema: "app_data",
                        principalTable: "MediaItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_MediaItemTags_MediaTags_TagId",
                        column: x => x.TagId,
                        principalSchema: "app_data",
                        principalTable: "MediaTags",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PersonalizationTagMappings",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TagId = table.Column<Guid>(type: "uuid", nullable: false),
                    TargetType = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    TargetId = table.Column<Guid>(type: "uuid", nullable: false),
                    Confidence = table.Column<int>(type: "integer", nullable: false),
                    IsAutoGenerated = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PersonalizationTagMappings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PersonalizationTagMappings_PersonalizationTags_TagId",
                        column: x => x.TagId,
                        principalSchema: "app_data",
                        principalTable: "PersonalizationTags",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CollaborationInvites",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    InviterId = table.Column<Guid>(type: "uuid", nullable: false),
                    InviteeEmail = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Role = table.Column<int>(type: "integer", nullable: false),
                    Level = table.Column<int>(type: "integer", nullable: false),
                    Message = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    RespondedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CollaborationInvites", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CollaborationInvites_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalSchema: "app_data",
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CollaborationInvites_Users_InviterId",
                        column: x => x.InviterId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ProjectActivities",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    Summary = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    Data = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectActivities", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProjectActivities_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalSchema: "app_data",
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ProjectActivities_Users_ActorUserId",
                        column: x => x.ActorUserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "ProjectContents",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedById = table.Column<Guid>(type: "uuid", nullable: true),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    Title = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Content = table.Column<string>(type: "text", nullable: true),
                    MediaUrl = table.Column<string>(type: "text", nullable: true),
                    MediaUrls = table.Column<string[]>(type: "text[]", nullable: true),
                    Metadata = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    PublishedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ReviewedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ReviewedById = table.Column<Guid>(type: "uuid", nullable: true),
                    ReviewNotes = table.Column<string>(type: "text", nullable: true),
                    IsPublished = table.Column<bool>(type: "boolean", nullable: false),
                    PublishMetadata = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    Views = table.Column<int>(type: "integer", nullable: false),
                    Likes = table.Column<int>(type: "integer", nullable: false),
                    Shares = table.Column<int>(type: "integer", nullable: false),
                    CommentsCount = table.Column<int>(type: "integer", nullable: false),
                    PlatformAnalytics = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectContents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProjectContents_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalSchema: "app_data",
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ProjectContents_Users_CreatedById",
                        column: x => x.CreatedById,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ProjectContents_Users_ReviewedById",
                        column: x => x.ReviewedById,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "ProjectMembers",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Role = table.Column<int>(type: "integer", nullable: false),
                    Level = table.Column<int>(type: "integer", nullable: false),
                    JoinedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LeftAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    RevenueSharePercentage = table.Column<decimal>(type: "numeric(5,2)", nullable: false),
                    Permissions = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    Metadata = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectMembers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProjectMembers_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalSchema: "app_data",
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ProjectMembers_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "StudioCaptureSourceCaptures",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    RigProfileId = table.Column<Guid>(type: "uuid", nullable: true),
                    SourceType = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    SourceName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    DeviceIdentifier = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    FileName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    DurationSeconds = table.Column<decimal>(type: "numeric", nullable: true),
                    ChannelCount = table.Column<int>(type: "integer", nullable: true),
                    CapturedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    FingerprintHash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    FingerprintedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    MetadataJson = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StudioCaptureSourceCaptures", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StudioCaptureSourceCaptures_StudioCaptureRigProfiles_RigPro~",
                        column: x => x.RigProfileId,
                        principalSchema: "app_data",
                        principalTable: "StudioCaptureRigProfiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_StudioCaptureSourceCaptures_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CraftDraftReviews",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CraftDomainId = table.Column<Guid>(type: "uuid", nullable: false),
                    DomainKey = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ContentType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    DraftContent = table.Column<string>(type: "text", nullable: false),
                    Context = table.Column<string>(type: "text", nullable: true),
                    OverallScore = table.Column<decimal>(type: "numeric", nullable: true),
                    CoachingOutput = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    WordCount = table.Column<int>(type: "integer", nullable: true),
                    ReviewedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UserId1 = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CraftDraftReviews", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CraftDraftReviews_CraftDomains_CraftDomainId",
                        column: x => x.CraftDomainId,
                        principalSchema: "app_data",
                        principalTable: "CraftDomains",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CraftDraftReviews_UserCraftProfiles_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "UserCraftProfiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CraftDraftReviews_Users_UserId1",
                        column: x => x.UserId1,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "RolePermissions",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RoleId = table.Column<Guid>(type: "uuid", nullable: false),
                    PermissionKey = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ResourceType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Action = table.Column<int>(type: "integer", nullable: false),
                    IsAllowed = table.Column<bool>(type: "boolean", nullable: false),
                    Conditions = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RolePermissions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RolePermissions_UserRoles_RoleId",
                        column: x => x.RoleId,
                        principalSchema: "app_data",
                        principalTable: "UserRoles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "UserRoleAssignments",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    RoleId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: true),
                    AssignedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    AssignedById = table.Column<Guid>(type: "uuid", nullable: true),
                    Metadata = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserRoleAssignments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserRoleAssignments_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalSchema: "app_data",
                        principalTable: "Projects",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_UserRoleAssignments_UserRoles_RoleId",
                        column: x => x.RoleId,
                        principalSchema: "app_data",
                        principalTable: "UserRoles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_UserRoleAssignments_Users_AssignedById",
                        column: x => x.AssignedById,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_UserRoleAssignments_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CoinStakes",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric", nullable: false),
                    WorkHourValue = table.Column<decimal>(type: "numeric", nullable: false),
                    DurationDays = table.Column<int>(type: "integer", nullable: false),
                    StartDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    EndDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    StakingRewardRate = table.Column<decimal>(type: "numeric", nullable: false),
                    CurrentReward = table.Column<decimal>(type: "numeric", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    WiseCoinId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CoinStakes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CoinStakes_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CoinStakes_WiseCoins_WiseCoinId",
                        column: x => x.WiseCoinId,
                        principalSchema: "app_data",
                        principalTable: "WiseCoins",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "CoinTransactions",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    TargetUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Fee = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    NetAmount = table.Column<decimal>(type: "numeric", nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    ReferenceId = table.Column<Guid>(type: "uuid", nullable: true),
                    ReferenceType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Metadata = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    CompletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    WorkHoursValue = table.Column<decimal>(type: "numeric", nullable: false),
                    WorkHourRate = table.Column<decimal>(type: "numeric", nullable: false),
                    Hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    PreviousHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    WiseCoinId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CoinTransactions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CoinTransactions_Users_TargetUserId",
                        column: x => x.TargetUserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CoinTransactions_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CoinTransactions_WiseCoins_WiseCoinId",
                        column: x => x.WiseCoinId,
                        principalSchema: "app_data",
                        principalTable: "WiseCoins",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "UserBadges",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    BadgeId = table.Column<Guid>(type: "uuid", nullable: false),
                    EarnedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    MultiplierBonus = table.Column<decimal>(type: "numeric", nullable: false),
                    Metadata = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    ProofUrl = table.Column<string>(type: "text", nullable: true),
                    WiseCoinId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserBadges", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserBadges_Badges_BadgeId",
                        column: x => x.BadgeId,
                        principalSchema: "app_data",
                        principalTable: "Badges",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_UserBadges_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_UserBadges_WiseCoins_WiseCoinId",
                        column: x => x.WiseCoinId,
                        principalSchema: "app_data",
                        principalTable: "WiseCoins",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "CraftPrincipleRefinements",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PrincipleId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProposedTitle = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    ProposedDescription = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    ProposedExample = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    UpvoteCount = table.Column<int>(type: "integer", nullable: false),
                    DownvoteCount = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    ApprovedById = table.Column<Guid>(type: "uuid", nullable: true),
                    ApprovedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CraftPrincipleRefinements", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CraftPrincipleRefinements_CraftPrinciples_PrincipleId",
                        column: x => x.PrincipleId,
                        principalSchema: "app_data",
                        principalTable: "CraftPrinciples",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CraftLessons",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CraftDomainId = table.Column<Guid>(type: "uuid", nullable: false),
                    SkillId = table.Column<Guid>(type: "uuid", nullable: true),
                    Title = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    Summary = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Content = table.Column<string>(type: "text", nullable: false),
                    Format = table.Column<int>(type: "integer", nullable: false),
                    Level = table.Column<int>(type: "integer", nullable: false),
                    EstimatedMinutes = table.Column<int>(type: "integer", nullable: false),
                    OrderIndex = table.Column<int>(type: "integer", nullable: false),
                    MasterExamples = table.Column<string[]>(type: "text[]", nullable: true),
                    MasterPractitioners = table.Column<string[]>(type: "text[]", nullable: true),
                    Evidence = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    Prerequisites = table.Column<string[]>(type: "text[]", nullable: true),
                    RelatedSkills = table.Column<string[]>(type: "text[]", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CraftLessons", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CraftLessons_CraftDomains_CraftDomainId",
                        column: x => x.CraftDomainId,
                        principalSchema: "app_data",
                        principalTable: "CraftDomains",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CraftLessons_CraftSkills_SkillId",
                        column: x => x.SkillId,
                        principalSchema: "app_data",
                        principalTable: "CraftSkills",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "UserCraftSkillScores",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    SkillId = table.Column<Guid>(type: "uuid", nullable: false),
                    Score = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: false),
                    SampleSize = table.Column<int>(type: "integer", nullable: false),
                    Confidence = table.Column<decimal>(type: "numeric(3,2)", precision: 3, scale: 2, nullable: false),
                    LastUpdated = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Evidence = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    UserCraftProfileId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserCraftSkillScores", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserCraftSkillScores_CraftSkills_SkillId",
                        column: x => x.SkillId,
                        principalSchema: "app_data",
                        principalTable: "CraftSkills",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_UserCraftSkillScores_UserCraftProfiles_UserCraftProfileId",
                        column: x => x.UserCraftProfileId,
                        principalSchema: "app_data",
                        principalTable: "UserCraftProfiles",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_UserCraftSkillScores_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "crawl_issues",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CrawlJobId = table.Column<Guid>(type: "uuid", nullable: false),
                    PageId = table.Column<Guid>(type: "uuid", nullable: true),
                    Category = table.Column<int>(type: "integer", nullable: false),
                    Severity = table.Column<int>(type: "integer", nullable: false),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    Code = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Title = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    Recommendation = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    Evidence = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    Tags = table.Column<string[]>(type: "text[]", nullable: true),
                    Context = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    IsFixed = table.Column<bool>(type: "boolean", nullable: false),
                    FixedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    FixedById = table.Column<Guid>(type: "uuid", nullable: true),
                    Priority = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_crawl_issues", x => x.Id);
                    table.ForeignKey(
                        name: "FK_crawl_issues_crawl_jobs_CrawlJobId",
                        column: x => x.CrawlJobId,
                        principalSchema: "app_data",
                        principalTable: "crawl_jobs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_crawl_issues_crawled_pages_PageId",
                        column: x => x.PageId,
                        principalSchema: "app_data",
                        principalTable: "crawled_pages",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "crawl_links",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CrawlJobId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourcePageId = table.Column<Guid>(type: "uuid", nullable: true),
                    TargetPageId = table.Column<Guid>(type: "uuid", nullable: true),
                    SourceUrl = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    TargetUrl = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    AnchorText = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    IsInternal = table.Column<bool>(type: "boolean", nullable: false),
                    IsNofollow = table.Column<bool>(type: "boolean", nullable: false),
                    IsSponsored = table.Column<bool>(type: "boolean", nullable: false),
                    IsUgc = table.Column<bool>(type: "boolean", nullable: false),
                    HttpStatus = table.Column<int>(type: "integer", nullable: true),
                    IsBroken = table.Column<bool>(type: "boolean", nullable: false),
                    RedirectCount = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_crawl_links", x => x.Id);
                    table.ForeignKey(
                        name: "FK_crawl_links_crawl_jobs_CrawlJobId",
                        column: x => x.CrawlJobId,
                        principalSchema: "app_data",
                        principalTable: "crawl_jobs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_crawl_links_crawled_pages_TargetPageId",
                        column: x => x.TargetPageId,
                        principalSchema: "app_data",
                        principalTable: "crawled_pages",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "RadioStationEpisodes",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StationId = table.Column<Guid>(type: "uuid", nullable: false),
                    ScheduleId = table.Column<Guid>(type: "uuid", nullable: true),
                    Title = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    AudioUrl = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Duration = table.Column<int>(type: "integer", nullable: false),
                    BroadcastDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ListenCount = table.Column<int>(type: "integer", nullable: false),
                    LikeCount = table.Column<int>(type: "integer", nullable: false),
                    CommentCount = table.Column<int>(type: "integer", nullable: false),
                    ShareCount = table.Column<int>(type: "integer", nullable: false),
                    IsLiveRecording = table.Column<bool>(type: "boolean", nullable: false),
                    IsPublished = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RadioStationEpisodes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RadioStationEpisodes_CreatorRadioStations_StationId",
                        column: x => x.StationId,
                        principalSchema: "app_data",
                        principalTable: "CreatorRadioStations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_RadioStationEpisodes_RadioStationSchedules_ScheduleId",
                        column: x => x.ScheduleId,
                        principalSchema: "app_data",
                        principalTable: "RadioStationSchedules",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "PlatformPublishes",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    ContentId = table.Column<Guid>(type: "uuid", nullable: false),
                    Platform = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    ScheduledAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    PublishedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    PlatformPostId = table.Column<string>(type: "text", nullable: true),
                    PlatformUrl = table.Column<string>(type: "text", nullable: true),
                    PlatformMetadata = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    PlatformResponse = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    RetryCount = table.Column<int>(type: "integer", nullable: false),
                    ErrorMessage = table.Column<string>(type: "text", nullable: true),
                    Analytics = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    PlatformTitle = table.Column<string>(type: "text", nullable: true),
                    PlatformDescription = table.Column<string>(type: "text", nullable: true),
                    PlatformTags = table.Column<string[]>(type: "text[]", nullable: true),
                    ThumbnailUrl = table.Column<string>(type: "text", nullable: true),
                    PlatformSettings = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    Views = table.Column<int>(type: "integer", nullable: false),
                    Likes = table.Column<int>(type: "integer", nullable: false),
                    Comments = table.Column<int>(type: "integer", nullable: false),
                    Shares = table.Column<int>(type: "integer", nullable: false),
                    Engagement = table.Column<int>(type: "integer", nullable: false),
                    PerformanceMetrics = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    ProjectContentId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlatformPublishes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PlatformPublishes_ProjectContents_ContentId",
                        column: x => x.ContentId,
                        principalSchema: "app_data",
                        principalTable: "ProjectContents",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PlatformPublishes_ProjectContents_ProjectContentId",
                        column: x => x.ProjectContentId,
                        principalSchema: "app_data",
                        principalTable: "ProjectContents",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PlatformPublishes_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalSchema: "app_data",
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ProjectComments",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    ContentId = table.Column<Guid>(type: "uuid", nullable: true),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ParentCommentId = table.Column<Guid>(type: "uuid", nullable: true),
                    Text = table.Column<string>(type: "character varying(5000)", maxLength: 5000, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectComments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProjectComments_ProjectComments_ParentCommentId",
                        column: x => x.ParentCommentId,
                        principalSchema: "app_data",
                        principalTable: "ProjectComments",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ProjectComments_ProjectContents_ContentId",
                        column: x => x.ContentId,
                        principalSchema: "app_data",
                        principalTable: "ProjectContents",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ProjectComments_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalSchema: "app_data",
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ProjectComments_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ProjectContentVersions",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ContentId = table.Column<Guid>(type: "uuid", nullable: false),
                    VersionNumber = table.Column<int>(type: "integer", nullable: false),
                    Title = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Content = table.Column<string>(type: "text", nullable: true),
                    MediaUrls = table.Column<string[]>(type: "text[]", nullable: true),
                    EditedById = table.Column<Guid>(type: "uuid", nullable: true),
                    ChangeNotes = table.Column<string>(type: "text", nullable: true),
                    ContentEntityId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectContentVersions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProjectContentVersions_ProjectContents_ContentEntityId",
                        column: x => x.ContentEntityId,
                        principalSchema: "app_data",
                        principalTable: "ProjectContents",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ProjectContentVersions_Users_EditedById",
                        column: x => x.EditedById,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "CraftFeedbacks",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ReviewId = table.Column<Guid>(type: "uuid", nullable: false),
                    PrincipleKey = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    PrincipleTitle = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Feedback = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Example = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    Severity = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CraftFeedbacks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CraftFeedbacks_CraftDraftReviews_ReviewId",
                        column: x => x.ReviewId,
                        principalSchema: "app_data",
                        principalTable: "CraftDraftReviews",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CraftLessonCompletions",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    LessonId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Score = table.Column<decimal>(type: "numeric", nullable: true),
                    Applied = table.Column<bool>(type: "boolean", nullable: false),
                    AppliedImpact = table.Column<decimal>(type: "numeric", nullable: true),
                    CompletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CraftLessonCompletions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CraftLessonCompletions_CraftLessons_LessonId",
                        column: x => x.LessonId,
                        principalSchema: "app_data",
                        principalTable: "CraftLessons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BadgeEvolutions_SourceBadgeId",
                schema: "app_data",
                table: "BadgeEvolutions",
                column: "SourceBadgeId");

            migrationBuilder.CreateIndex(
                name: "IX_BadgeEvolutions_TargetBadgeId",
                schema: "app_data",
                table: "BadgeEvolutions",
                column: "TargetBadgeId");

            migrationBuilder.CreateIndex(
                name: "IX_Badges_Name",
                schema: "app_data",
                table: "Badges",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_bridge_sessions_session_id",
                schema: "app_data",
                table: "bridge_sessions",
                column: "session_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CallLogs_Timestamp",
                schema: "app_data",
                table: "CallLogs",
                column: "Timestamp");

            migrationBuilder.CreateIndex(
                name: "IX_CallLogs_UserId",
                schema: "app_data",
                table: "CallLogs",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_CoinStakes_UserId_IsActive",
                schema: "app_data",
                table: "CoinStakes",
                columns: new[] { "UserId", "IsActive" });

            migrationBuilder.CreateIndex(
                name: "IX_CoinStakes_WiseCoinId",
                schema: "app_data",
                table: "CoinStakes",
                column: "WiseCoinId");

            migrationBuilder.CreateIndex(
                name: "IX_CoinTransactions_CreatedAt",
                schema: "app_data",
                table: "CoinTransactions",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_CoinTransactions_TargetUserId",
                schema: "app_data",
                table: "CoinTransactions",
                column: "TargetUserId");

            migrationBuilder.CreateIndex(
                name: "IX_CoinTransactions_UserId",
                schema: "app_data",
                table: "CoinTransactions",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_CoinTransactions_WiseCoinId",
                schema: "app_data",
                table: "CoinTransactions",
                column: "WiseCoinId");

            migrationBuilder.CreateIndex(
                name: "IX_collaboration_rooms_room_id",
                schema: "app_data",
                table: "collaboration_rooms",
                column: "room_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CollaborationInvites_InviterId",
                schema: "app_data",
                table: "CollaborationInvites",
                column: "InviterId");

            migrationBuilder.CreateIndex(
                name: "IX_CollaborationInvites_ProjectId_InviteeEmail",
                schema: "app_data",
                table: "CollaborationInvites",
                columns: new[] { "ProjectId", "InviteeEmail" });

            migrationBuilder.CreateIndex(
                name: "IX_CommunicationPreferences_UserId",
                schema: "app_data",
                table: "CommunicationPreferences",
                column: "UserId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CraftDomains_Key",
                schema: "app_data",
                table: "CraftDomains",
                column: "Key",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CraftDraftReviews_CraftDomainId",
                schema: "app_data",
                table: "CraftDraftReviews",
                column: "CraftDomainId");

            migrationBuilder.CreateIndex(
                name: "IX_CraftDraftReviews_UserId_CraftDomainId_ReviewedAt",
                schema: "app_data",
                table: "CraftDraftReviews",
                columns: new[] { "UserId", "CraftDomainId", "ReviewedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_CraftDraftReviews_UserId1",
                schema: "app_data",
                table: "CraftDraftReviews",
                column: "UserId1");

            migrationBuilder.CreateIndex(
                name: "IX_CraftFeedbacks_ReviewId",
                schema: "app_data",
                table: "CraftFeedbacks",
                column: "ReviewId");

            migrationBuilder.CreateIndex(
                name: "IX_CraftLessonCompletions_LessonId",
                schema: "app_data",
                table: "CraftLessonCompletions",
                column: "LessonId");

            migrationBuilder.CreateIndex(
                name: "IX_CraftLessonCompletions_UserId_LessonId",
                schema: "app_data",
                table: "CraftLessonCompletions",
                columns: new[] { "UserId", "LessonId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CraftLessons_CraftDomainId_Level_OrderIndex",
                schema: "app_data",
                table: "CraftLessons",
                columns: new[] { "CraftDomainId", "Level", "OrderIndex" });

            migrationBuilder.CreateIndex(
                name: "IX_CraftLessons_SkillId",
                schema: "app_data",
                table: "CraftLessons",
                column: "SkillId");

            migrationBuilder.CreateIndex(
                name: "IX_CraftObservations_UserId_DomainKey_CreatedAt",
                schema: "app_data",
                table: "CraftObservations",
                columns: new[] { "UserId", "DomainKey", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_CraftPatterns_CraftDomainId_Status_Confidence",
                schema: "app_data",
                table: "CraftPatterns",
                columns: new[] { "CraftDomainId", "Status", "Confidence" });

            migrationBuilder.CreateIndex(
                name: "IX_CraftPerformanceMetrics_CraftDomainId",
                schema: "app_data",
                table: "CraftPerformanceMetrics",
                column: "CraftDomainId");

            migrationBuilder.CreateIndex(
                name: "IX_CraftPerformanceMetrics_UserId_DomainKey_MeasuredAt",
                schema: "app_data",
                table: "CraftPerformanceMetrics",
                columns: new[] { "UserId", "DomainKey", "MeasuredAt" });

            migrationBuilder.CreateIndex(
                name: "IX_CraftPrincipleRefinements_PrincipleId_Status",
                schema: "app_data",
                table: "CraftPrincipleRefinements",
                columns: new[] { "PrincipleId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_CraftPrinciples_CraftDomainId_Kind",
                schema: "app_data",
                table: "CraftPrinciples",
                columns: new[] { "CraftDomainId", "Kind" });

            migrationBuilder.CreateIndex(
                name: "IX_CraftSkills_CraftDomainId_Key",
                schema: "app_data",
                table: "CraftSkills",
                columns: new[] { "CraftDomainId", "Key" });

            migrationBuilder.CreateIndex(
                name: "IX_CraftSkills_ParentSkillId",
                schema: "app_data",
                table: "CraftSkills",
                column: "ParentSkillId");

            migrationBuilder.CreateIndex(
                name: "IX_crawl_issues_CrawlJobId_Category_Severity",
                schema: "app_data",
                table: "crawl_issues",
                columns: new[] { "CrawlJobId", "Category", "Severity" });

            migrationBuilder.CreateIndex(
                name: "IX_crawl_issues_PageId",
                schema: "app_data",
                table: "crawl_issues",
                column: "PageId");

            migrationBuilder.CreateIndex(
                name: "IX_crawl_jobs_CreatedById_CreatedAt",
                schema: "app_data",
                table: "crawl_jobs",
                columns: new[] { "CreatedById", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_crawl_links_CrawlJobId_SourceUrl",
                schema: "app_data",
                table: "crawl_links",
                columns: new[] { "CrawlJobId", "SourceUrl" });

            migrationBuilder.CreateIndex(
                name: "IX_crawl_links_CrawlJobId_TargetUrl",
                schema: "app_data",
                table: "crawl_links",
                columns: new[] { "CrawlJobId", "TargetUrl" });

            migrationBuilder.CreateIndex(
                name: "IX_crawl_links_TargetPageId",
                schema: "app_data",
                table: "crawl_links",
                column: "TargetPageId");

            migrationBuilder.CreateIndex(
                name: "IX_crawl_metrics_CrawlJobId_MetricKey_RecordedAt",
                schema: "app_data",
                table: "crawl_metrics",
                columns: new[] { "CrawlJobId", "MetricKey", "RecordedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_crawl_reports_CrawlJobId_GeneratedAt",
                schema: "app_data",
                table: "crawl_reports",
                columns: new[] { "CrawlJobId", "GeneratedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_crawled_pages_CrawlJobId_Url",
                schema: "app_data",
                table: "crawled_pages",
                columns: new[] { "CrawlJobId", "Url" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CreatorRadioStations_CreatorId",
                schema: "app_data",
                table: "CreatorRadioStations",
                column: "CreatorId");

            migrationBuilder.CreateIndex(
                name: "IX_CreatorRadioStations_FrequencyKey_Band",
                schema: "app_data",
                table: "CreatorRadioStations",
                columns: new[] { "FrequencyKey", "Band" });

            migrationBuilder.CreateIndex(
                name: "IX_CreatorRadioStations_IsLive_Status_Visibility",
                schema: "app_data",
                table: "CreatorRadioStations",
                columns: new[] { "IsLive", "Status", "Visibility" });

            migrationBuilder.CreateIndex(
                name: "IX_FeatureAuditLogs_FeatureKey",
                schema: "app_data",
                table: "FeatureAuditLogs",
                column: "FeatureKey");

            migrationBuilder.CreateIndex(
                name: "IX_FeatureFlags_FeatureKey_Scope_ScopeValue",
                schema: "app_data",
                table: "FeatureFlags",
                columns: new[] { "FeatureKey", "Scope", "ScopeValue" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_file_transfers_transfer_id",
                schema: "app_data",
                table: "file_transfers",
                column: "transfer_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FMStationBookmarks_StationId_UserId",
                schema: "app_data",
                table: "FMStationBookmarks",
                columns: new[] { "StationId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FMStationBookmarks_UserId",
                schema: "app_data",
                table: "FMStationBookmarks",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_FMStationHistory_StationId",
                schema: "app_data",
                table: "FMStationHistory",
                column: "StationId");

            migrationBuilder.CreateIndex(
                name: "IX_FMStationHistory_UserId_ListenedAt",
                schema: "app_data",
                table: "FMStationHistory",
                columns: new[] { "UserId", "ListenedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_FMStationLikes_StationId_UserId",
                schema: "app_data",
                table: "FMStationLikes",
                columns: new[] { "StationId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FMStationLikes_UserId",
                schema: "app_data",
                table: "FMStationLikes",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_FMStations_CreatedBy",
                schema: "app_data",
                table: "FMStations",
                column: "CreatedBy");

            migrationBuilder.CreateIndex(
                name: "IX_FMStations_Frequency_Band",
                schema: "app_data",
                table: "FMStations",
                columns: new[] { "Frequency", "Band" });

            migrationBuilder.CreateIndex(
                name: "IX_FMStations_FrequencyKey_Band",
                schema: "app_data",
                table: "FMStations",
                columns: new[] { "FrequencyKey", "Band" });

            migrationBuilder.CreateIndex(
                name: "IX_FMStations_IsFeatured",
                schema: "app_data",
                table: "FMStations",
                column: "IsFeatured");

            migrationBuilder.CreateIndex(
                name: "IX_FMStations_Listeners",
                schema: "app_data",
                table: "FMStations",
                column: "Listeners");

            migrationBuilder.CreateIndex(
                name: "IX_FMUserPreferences_UserId",
                schema: "app_data",
                table: "FMUserPreferences",
                column: "UserId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_InstrumentConnections_UserId",
                schema: "app_data",
                table: "InstrumentConnections",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_InstrumentConnections_UserId_DeviceIdentifier",
                schema: "app_data",
                table: "InstrumentConnections",
                columns: new[] { "UserId", "DeviceIdentifier" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MediaBookmarks_MediaId_UserId",
                schema: "app_data",
                table: "MediaBookmarks",
                columns: new[] { "MediaId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MediaBookmarks_UserId",
                schema: "app_data",
                table: "MediaBookmarks",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_MediaComments_MediaId",
                schema: "app_data",
                table: "MediaComments",
                column: "MediaId");

            migrationBuilder.CreateIndex(
                name: "IX_MediaComments_ParentCommentId",
                schema: "app_data",
                table: "MediaComments",
                column: "ParentCommentId");

            migrationBuilder.CreateIndex(
                name: "IX_MediaComments_UserId",
                schema: "app_data",
                table: "MediaComments",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_MediaItems_CreatedAt",
                schema: "app_data",
                table: "MediaItems",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_MediaItems_MediaType_Status",
                schema: "app_data",
                table: "MediaItems",
                columns: new[] { "MediaType", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_MediaItems_UserId",
                schema: "app_data",
                table: "MediaItems",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_MediaItemTags_MediaId_TagId",
                schema: "app_data",
                table: "MediaItemTags",
                columns: new[] { "MediaId", "TagId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MediaItemTags_TagId",
                schema: "app_data",
                table: "MediaItemTags",
                column: "TagId");

            migrationBuilder.CreateIndex(
                name: "IX_MediaLikes_MediaId_UserId",
                schema: "app_data",
                table: "MediaLikes",
                columns: new[] { "MediaId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MediaLikes_UserId",
                schema: "app_data",
                table: "MediaLikes",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_MediaPlaylistItems_MediaId",
                schema: "app_data",
                table: "MediaPlaylistItems",
                column: "MediaId");

            migrationBuilder.CreateIndex(
                name: "IX_MediaPlaylistItems_PlaylistId_MediaId",
                schema: "app_data",
                table: "MediaPlaylistItems",
                columns: new[] { "PlaylistId", "MediaId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MediaPlaylistItems_PlaylistId_OrderIndex",
                schema: "app_data",
                table: "MediaPlaylistItems",
                columns: new[] { "PlaylistId", "OrderIndex" });

            migrationBuilder.CreateIndex(
                name: "IX_MediaPlaylists_UserId",
                schema: "app_data",
                table: "MediaPlaylists",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_MediaTags_Name",
                schema: "app_data",
                table: "MediaTags",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MediaViewHistories_MediaId_UserId_ViewedAt",
                schema: "app_data",
                table: "MediaViewHistories",
                columns: new[] { "MediaId", "UserId", "ViewedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_MediaViewHistories_UserId",
                schema: "app_data",
                table: "MediaViewHistories",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_NotificationCosts_NotificationType",
                schema: "app_data",
                table: "NotificationCosts",
                column: "NotificationType");

            migrationBuilder.CreateIndex(
                name: "IX_NotificationCosts_SentAt",
                schema: "app_data",
                table: "NotificationCosts",
                column: "SentAt");

            migrationBuilder.CreateIndex(
                name: "IX_NotificationCosts_UserId",
                schema: "app_data",
                table: "NotificationCosts",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_PersonalizationTagMappings_TagId",
                schema: "app_data",
                table: "PersonalizationTagMappings",
                column: "TagId");

            migrationBuilder.CreateIndex(
                name: "IX_PlatformPublishes_ContentId",
                schema: "app_data",
                table: "PlatformPublishes",
                column: "ContentId");

            migrationBuilder.CreateIndex(
                name: "IX_PlatformPublishes_ProjectContentId",
                schema: "app_data",
                table: "PlatformPublishes",
                column: "ProjectContentId");

            migrationBuilder.CreateIndex(
                name: "IX_PlatformPublishes_ProjectId",
                schema: "app_data",
                table: "PlatformPublishes",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectActivities_ActorUserId",
                schema: "app_data",
                table: "ProjectActivities",
                column: "ActorUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectActivities_ProjectId",
                schema: "app_data",
                table: "ProjectActivities",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectComments_ContentId",
                schema: "app_data",
                table: "ProjectComments",
                column: "ContentId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectComments_ParentCommentId",
                schema: "app_data",
                table: "ProjectComments",
                column: "ParentCommentId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectComments_ProjectId",
                schema: "app_data",
                table: "ProjectComments",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectComments_UserId",
                schema: "app_data",
                table: "ProjectComments",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectContents_CreatedById",
                schema: "app_data",
                table: "ProjectContents",
                column: "CreatedById");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectContents_ProjectId",
                schema: "app_data",
                table: "ProjectContents",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectContents_ReviewedById",
                schema: "app_data",
                table: "ProjectContents",
                column: "ReviewedById");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectContentVersions_ContentEntityId",
                schema: "app_data",
                table: "ProjectContentVersions",
                column: "ContentEntityId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectContentVersions_ContentId",
                schema: "app_data",
                table: "ProjectContentVersions",
                column: "ContentId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectContentVersions_EditedById",
                schema: "app_data",
                table: "ProjectContentVersions",
                column: "EditedById");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectMembers_ProjectId_UserId",
                schema: "app_data",
                table: "ProjectMembers",
                columns: new[] { "ProjectId", "UserId" });

            migrationBuilder.CreateIndex(
                name: "IX_ProjectMembers_UserId",
                schema: "app_data",
                table: "ProjectMembers",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_Projects_OwnerId",
                schema: "app_data",
                table: "Projects",
                column: "OwnerId");

            migrationBuilder.CreateIndex(
                name: "IX_RadioStationEpisodes_ScheduleId",
                schema: "app_data",
                table: "RadioStationEpisodes",
                column: "ScheduleId");

            migrationBuilder.CreateIndex(
                name: "IX_RadioStationEpisodes_StationId_BroadcastDate",
                schema: "app_data",
                table: "RadioStationEpisodes",
                columns: new[] { "StationId", "BroadcastDate" });

            migrationBuilder.CreateIndex(
                name: "IX_RadioStationFollows_StationId_UserId",
                schema: "app_data",
                table: "RadioStationFollows",
                columns: new[] { "StationId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RadioStationFollows_UserId",
                schema: "app_data",
                table: "RadioStationFollows",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_RadioStationFrequencyClaims_CreatorId",
                schema: "app_data",
                table: "RadioStationFrequencyClaims",
                column: "CreatorId");

            migrationBuilder.CreateIndex(
                name: "IX_RadioStationFrequencyClaims_FrequencyKey_Band",
                schema: "app_data",
                table: "RadioStationFrequencyClaims",
                columns: new[] { "FrequencyKey", "Band" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RadioStationFrequencyClaims_StationId",
                schema: "app_data",
                table: "RadioStationFrequencyClaims",
                column: "StationId");

            migrationBuilder.CreateIndex(
                name: "IX_RadioStationListens_StationId_StartedAt",
                schema: "app_data",
                table: "RadioStationListens",
                columns: new[] { "StationId", "StartedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_RadioStationListens_UserId",
                schema: "app_data",
                table: "RadioStationListens",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_RadioStationRequests_PlayedBy",
                schema: "app_data",
                table: "RadioStationRequests",
                column: "PlayedBy");

            migrationBuilder.CreateIndex(
                name: "IX_RadioStationRequests_StationId_Status_RequestedAt",
                schema: "app_data",
                table: "RadioStationRequests",
                columns: new[] { "StationId", "Status", "RequestedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_RadioStationRequests_UserId",
                schema: "app_data",
                table: "RadioStationRequests",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_RadioStationSchedules_StationId_DayOfWeek_StartTime",
                schema: "app_data",
                table: "RadioStationSchedules",
                columns: new[] { "StationId", "DayOfWeek", "StartTime" });

            migrationBuilder.CreateIndex(
                name: "IX_RadioStationShoutouts_StationId_Status_RequestedAt",
                schema: "app_data",
                table: "RadioStationShoutouts",
                columns: new[] { "StationId", "Status", "RequestedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_RadioStationShoutouts_UserId",
                schema: "app_data",
                table: "RadioStationShoutouts",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_RolePermissions_RoleId",
                schema: "app_data",
                table: "RolePermissions",
                column: "RoleId");

            migrationBuilder.CreateIndex(
                name: "IX_RolePermissions_RoleId_ResourceType_Action",
                schema: "app_data",
                table: "RolePermissions",
                columns: new[] { "RoleId", "ResourceType", "Action" });

            migrationBuilder.CreateIndex(
                name: "IX_room_participants_room_id_is_active",
                schema: "app_data",
                table: "room_participants",
                columns: new[] { "room_id", "is_active" });

            migrationBuilder.CreateIndex(
                name: "IX_StudioCaptureRigProfiles_UserId",
                schema: "app_data",
                table: "StudioCaptureRigProfiles",
                column: "UserId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StudioCaptureSourceCaptures_CapturedAtUtc",
                schema: "app_data",
                table: "StudioCaptureSourceCaptures",
                column: "CapturedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_StudioCaptureSourceCaptures_RigProfileId",
                schema: "app_data",
                table: "StudioCaptureSourceCaptures",
                column: "RigProfileId");

            migrationBuilder.CreateIndex(
                name: "IX_StudioCaptureSourceCaptures_UserId",
                schema: "app_data",
                table: "StudioCaptureSourceCaptures",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_UserBadges_BadgeId",
                schema: "app_data",
                table: "UserBadges",
                column: "BadgeId");

            migrationBuilder.CreateIndex(
                name: "IX_UserBadges_UserId_BadgeId",
                schema: "app_data",
                table: "UserBadges",
                columns: new[] { "UserId", "BadgeId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserBadges_WiseCoinId",
                schema: "app_data",
                table: "UserBadges",
                column: "WiseCoinId");

            migrationBuilder.CreateIndex(
                name: "IX_UserCompartmentAssignments_UserId_Compartment",
                schema: "app_data",
                table: "UserCompartmentAssignments",
                columns: new[] { "UserId", "Compartment" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserCraftProfiles_UserId",
                schema: "app_data",
                table: "UserCraftProfiles",
                column: "UserId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserCraftProfiles_UserId1",
                schema: "app_data",
                table: "UserCraftProfiles",
                column: "UserId1");

            migrationBuilder.CreateIndex(
                name: "IX_UserCraftSkillScores_SkillId",
                schema: "app_data",
                table: "UserCraftSkillScores",
                column: "SkillId");

            migrationBuilder.CreateIndex(
                name: "IX_UserCraftSkillScores_UserCraftProfileId",
                schema: "app_data",
                table: "UserCraftSkillScores",
                column: "UserCraftProfileId");

            migrationBuilder.CreateIndex(
                name: "IX_UserCraftSkillScores_UserId_SkillId",
                schema: "app_data",
                table: "UserCraftSkillScores",
                columns: new[] { "UserId", "SkillId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserInteractionEvents_UserId",
                schema: "app_data",
                table: "UserInteractionEvents",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_UserPersonalizationProfiles_UserId",
                schema: "app_data",
                table: "UserPersonalizationProfiles",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_UserPresence_UserId",
                schema: "app_data",
                table: "UserPresence",
                column: "UserId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserRoleAssignments_AssignedById",
                schema: "app_data",
                table: "UserRoleAssignments",
                column: "AssignedById");

            migrationBuilder.CreateIndex(
                name: "IX_UserRoleAssignments_ProjectId",
                schema: "app_data",
                table: "UserRoleAssignments",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_UserRoleAssignments_RoleId",
                schema: "app_data",
                table: "UserRoleAssignments",
                column: "RoleId");

            migrationBuilder.CreateIndex(
                name: "IX_UserRoleAssignments_UserId",
                schema: "app_data",
                table: "UserRoleAssignments",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_UserRoleAssignments_UserId_RoleId_ProjectId",
                schema: "app_data",
                table: "UserRoleAssignments",
                columns: new[] { "UserId", "RoleId", "ProjectId" });

            migrationBuilder.CreateIndex(
                name: "IX_UserRoles_Name",
                schema: "app_data",
                table: "UserRoles",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserRoles_ParentRoleId",
                schema: "app_data",
                table: "UserRoles",
                column: "ParentRoleId");

            migrationBuilder.CreateIndex(
                name: "IX_WiseCoins_UserId",
                schema: "app_data",
                table: "WiseCoins",
                column: "UserId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WorkHourContributions_UserId_IsVerified",
                schema: "app_data",
                table: "WorkHourContributions",
                columns: new[] { "UserId", "IsVerified" });

            migrationBuilder.CreateIndex(
                name: "IX_WorkHourContributions_VerifiedBy",
                schema: "app_data",
                table: "WorkHourContributions",
                column: "VerifiedBy");

            migrationBuilder.CreateIndex(
                name: "IX_WorkHourValuations_Date",
                schema: "app_data",
                table: "WorkHourValuations",
                column: "Date");

            migrationBuilder.AddForeignKey(
                name: "FK_ConversationParticipants_Conversations_ConversationId",
                schema: "app_data",
                table: "ConversationParticipants",
                column: "ConversationId",
                principalSchema: "app_data",
                principalTable: "Conversations",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_ConversationParticipants_Users_UserId",
                schema: "app_data",
                table: "ConversationParticipants",
                column: "UserId",
                principalSchema: "app_data",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Conversations_Users_CreatorId",
                schema: "app_data",
                table: "Conversations",
                column: "CreatorId",
                principalSchema: "app_data",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Messages_Conversations_ConversationId",
                schema: "app_data",
                table: "Messages",
                column: "ConversationId",
                principalSchema: "app_data",
                principalTable: "Conversations",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Messages_Messages_ReplyToId",
                schema: "app_data",
                table: "Messages",
                column: "ReplyToId",
                principalSchema: "app_data",
                principalTable: "Messages",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Messages_Users_SenderId",
                schema: "app_data",
                table: "Messages",
                column: "SenderId",
                principalSchema: "app_data",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            // Add pgvector embedding columns (managed outside EF; requires pgvector extension)
            migrationBuilder.Sql("""
                DO $$
                BEGIN
                    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
                        ALTER TABLE app_data."CraftPrinciples"  ADD COLUMN IF NOT EXISTS "Embedding" vector(1536);
                        ALTER TABLE app_data."CraftObservations" ADD COLUMN IF NOT EXISTS "Embedding" vector(1536);
                        ALTER TABLE app_data."CraftLessons"      ADD COLUMN IF NOT EXISTS "Embedding" vector(1536);
                        ALTER TABLE app_data."CraftPatterns"     ADD COLUMN IF NOT EXISTS "Embedding" vector(1536);
                        CREATE INDEX IF NOT EXISTS "IX_CraftPrinciples_Embedding"  ON app_data."CraftPrinciples"  USING ivfflat ("Embedding" vector_cosine_ops) WITH (lists = 100);
                        CREATE INDEX IF NOT EXISTS "IX_CraftObservations_Embedding" ON app_data."CraftObservations" USING ivfflat ("Embedding" vector_cosine_ops) WITH (lists = 100);
                        CREATE INDEX IF NOT EXISTS "IX_CraftLessons_Embedding"     ON app_data."CraftLessons"      USING ivfflat ("Embedding" vector_cosine_ops) WITH (lists = 100);
                        CREATE INDEX IF NOT EXISTS "IX_CraftPatterns_Embedding"    ON app_data."CraftPatterns"     USING ivfflat ("Embedding" vector_cosine_ops) WITH (lists = 100);
                    END IF;
                END
                $$;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ConversationParticipants_Conversations_ConversationId",
                schema: "app_data",
                table: "ConversationParticipants");

            migrationBuilder.DropForeignKey(
                name: "FK_ConversationParticipants_Users_UserId",
                schema: "app_data",
                table: "ConversationParticipants");

            migrationBuilder.DropForeignKey(
                name: "FK_Conversations_Users_CreatorId",
                schema: "app_data",
                table: "Conversations");

            migrationBuilder.DropForeignKey(
                name: "FK_Messages_Conversations_ConversationId",
                schema: "app_data",
                table: "Messages");

            migrationBuilder.DropForeignKey(
                name: "FK_Messages_Messages_ReplyToId",
                schema: "app_data",
                table: "Messages");

            migrationBuilder.DropForeignKey(
                name: "FK_Messages_Users_SenderId",
                schema: "app_data",
                table: "Messages");

            migrationBuilder.DropTable(
                name: "BadgeEvolutions",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "bridge_messages",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "bridge_sessions",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "CallLogs",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "CoinStakes",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "CoinTransactions",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "collaboration_rooms",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "CollaborationInvites",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "CommunicationPreferences",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "CraftFeedbacks",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "CraftLessonCompletions",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "CraftObservations",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "CraftPatterns",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "CraftPerformanceMetrics",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "CraftPrincipleRefinements",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "crawl_issues",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "crawl_links",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "crawl_metrics",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "crawl_reports",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "FeatureAuditLogs",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "FeatureFlags",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "file_transfers",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "FMStationBookmarks",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "FMStationHistory",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "FMStationLikes",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "FMUserPreferences",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "InstrumentConnections",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "LedgerAnchors",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "MediaBookmarks",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "MediaComments",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "MediaItemTags",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "MediaLikes",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "MediaPlaylistItems",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "MediaViewHistories",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "NotificationCosts",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "PersonalizationTagMappings",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "PlatformPublishes",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "ProjectActivities",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "ProjectComments",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "ProjectContentVersions",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "ProjectMembers",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "RadioStationEpisodes",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "RadioStationFollows",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "RadioStationFrequencyClaims",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "RadioStationListens",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "RadioStationRequests",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "RadioStationShoutouts",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "RegionalTrendSnapshots",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "RolePermissions",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "room_participants",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "StudioCaptureSourceCaptures",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "UserBadges",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "UserCompartmentAssignments",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "UserCraftSkillScores",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "UserInteractionEvents",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "UserPersonalizationProfiles",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "UserPresence",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "UserRoleAssignments",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "WorkHourContributions",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "WorkHourValuations",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "CraftDraftReviews",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "CraftLessons",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "CraftPrinciples",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "crawled_pages",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "FMStations",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "MediaTags",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "MediaPlaylists",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "MediaItems",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "PersonalizationTags",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "ProjectContents",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "RadioStationSchedules",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "StudioCaptureRigProfiles",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "Badges",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "WiseCoins",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "UserRoles",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "UserCraftProfiles",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "CraftSkills",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "crawl_jobs",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "Projects",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "CreatorRadioStations",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "CraftDomains",
                schema: "app_data");

            migrationBuilder.DropPrimaryKey(
                name: "PK_Messages",
                schema: "app_data",
                table: "Messages");

            migrationBuilder.DropPrimaryKey(
                name: "PK_Conversations",
                schema: "app_data",
                table: "Conversations");

            migrationBuilder.DropPrimaryKey(
                name: "PK_ConversationParticipants",
                schema: "app_data",
                table: "ConversationParticipants");

            migrationBuilder.DropColumn(
                name: "PhoneNumber",
                schema: "app_data",
                table: "Users");

            migrationBuilder.RenameTable(
                name: "Messages",
                schema: "app_data",
                newName: "Message",
                newSchema: "app_data");

            migrationBuilder.RenameTable(
                name: "Conversations",
                schema: "app_data",
                newName: "Conversation",
                newSchema: "app_data");

            migrationBuilder.RenameTable(
                name: "ConversationParticipants",
                schema: "app_data",
                newName: "ConversationParticipant",
                newSchema: "app_data");

            migrationBuilder.RenameIndex(
                name: "IX_Messages_SenderId",
                schema: "app_data",
                table: "Message",
                newName: "IX_Message_SenderId");

            migrationBuilder.RenameIndex(
                name: "IX_Messages_ReplyToId",
                schema: "app_data",
                table: "Message",
                newName: "IX_Message_ReplyToId");

            migrationBuilder.RenameIndex(
                name: "IX_Messages_ConversationId",
                schema: "app_data",
                table: "Message",
                newName: "IX_Message_ConversationId");

            migrationBuilder.RenameIndex(
                name: "IX_Conversations_CreatorId",
                schema: "app_data",
                table: "Conversation",
                newName: "IX_Conversation_CreatorId");

            migrationBuilder.RenameIndex(
                name: "IX_ConversationParticipants_UserId",
                schema: "app_data",
                table: "ConversationParticipant",
                newName: "IX_ConversationParticipant_UserId");

            migrationBuilder.RenameIndex(
                name: "IX_ConversationParticipants_ConversationId",
                schema: "app_data",
                table: "ConversationParticipant",
                newName: "IX_ConversationParticipant_ConversationId");

            migrationBuilder.AddPrimaryKey(
                name: "PK_Message",
                schema: "app_data",
                table: "Message",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_Conversation",
                schema: "app_data",
                table: "Conversation",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_ConversationParticipant",
                schema: "app_data",
                table: "ConversationParticipant",
                column: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_Conversation_Users_CreatorId",
                schema: "app_data",
                table: "Conversation",
                column: "CreatorId",
                principalSchema: "app_data",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_ConversationParticipant_Conversation_ConversationId",
                schema: "app_data",
                table: "ConversationParticipant",
                column: "ConversationId",
                principalSchema: "app_data",
                principalTable: "Conversation",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_ConversationParticipant_Users_UserId",
                schema: "app_data",
                table: "ConversationParticipant",
                column: "UserId",
                principalSchema: "app_data",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Message_Conversation_ConversationId",
                schema: "app_data",
                table: "Message",
                column: "ConversationId",
                principalSchema: "app_data",
                principalTable: "Conversation",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Message_Message_ReplyToId",
                schema: "app_data",
                table: "Message",
                column: "ReplyToId",
                principalSchema: "app_data",
                principalTable: "Message",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Message_Users_SenderId",
                schema: "app_data",
                table: "Message",
                column: "SenderId",
                principalSchema: "app_data",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
