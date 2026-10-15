using System;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wiseravenshare.Server.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialFullSchemaAppData : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "app_data");

            migrationBuilder.CreateTable(
                name: "Agents",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    SystemPrompt = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    CoreDirectives = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    KnowledgeGraph = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    SocialPreferences = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    State = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    PerformanceScore = table.Column<decimal>(type: "numeric", nullable: false),
                    PostCount = table.Column<int>(type: "integer", nullable: false),
                    InteractionCount = table.Column<int>(type: "integer", nullable: false),
                    EvolutionCount = table.Column<int>(type: "integer", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    LastActiveAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    EvolvedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Agents", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PostBookmarks",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PostId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PostBookmarks", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Users",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Email = table.Column<string>(type: "text", nullable: false),
                    Username = table.Column<string>(type: "text", nullable: false),
                    DisplayName = table.Column<string>(type: "text", nullable: false),
                    PasswordHash = table.Column<string>(type: "text", nullable: false),
                    Bio = table.Column<string>(type: "text", nullable: true),
                    AvatarUrl = table.Column<string>(type: "text", nullable: true),
                    CoverPhotoUrl = table.Column<string>(type: "text", nullable: true),
                    Location = table.Column<string>(type: "text", nullable: true),
                    Website = table.Column<string>(type: "text", nullable: true),
                    IsVerified = table.Column<bool>(type: "boolean", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    IsPrivate = table.Column<bool>(type: "boolean", nullable: false),
                    Role = table.Column<int>(type: "integer", nullable: false),
                    TruthScore = table.Column<decimal>(type: "numeric", nullable: false),
                    ReputationPoints = table.Column<int>(type: "integer", nullable: false),
                    LastLoginAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastActiveAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Users", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "AgentEvolutions",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AgentId = table.Column<Guid>(type: "uuid", nullable: false),
                    EvolutionType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    PreviousState = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    NewState = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    MutationDescription = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    FitnessBefore = table.Column<decimal>(type: "numeric", nullable: false),
                    FitnessAfter = table.Column<decimal>(type: "numeric", nullable: false),
                    IsSuccessful = table.Column<bool>(type: "boolean", nullable: false),
                    AppliedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AgentEvolutions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AgentEvolutions_Agents_AgentId",
                        column: x => x.AgentId,
                        principalSchema: "app_data",
                        principalTable: "Agents",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AgentInteractions",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AgentId = table.Column<Guid>(type: "uuid", nullable: false),
                    TargetAgentId = table.Column<Guid>(type: "uuid", nullable: true),
                    TargetUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    Content = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    Response = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    Confidence = table.Column<decimal>(type: "numeric", nullable: true),
                    IsSuccessful = table.Column<bool>(type: "boolean", nullable: false),
                    CompletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AgentInteractions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AgentInteractions_Agents_AgentId",
                        column: x => x.AgentId,
                        principalSchema: "app_data",
                        principalTable: "Agents",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_AgentInteractions_Agents_TargetAgentId",
                        column: x => x.TargetAgentId,
                        principalSchema: "app_data",
                        principalTable: "Agents",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_AgentInteractions_Users_TargetUserId",
                        column: x => x.TargetUserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Conversation",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    IsGroup = table.Column<bool>(type: "boolean", nullable: false),
                    GroupName = table.Column<string>(type: "text", nullable: true),
                    GroupAvatar = table.Column<string>(type: "text", nullable: true),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    LastMessageAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatorId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Conversation", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Conversation_Users_CreatorId",
                        column: x => x.CreatorId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Posts",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Content = table.Column<string>(type: "text", nullable: false),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    MediaUrls = table.Column<string[]>(type: "text[]", nullable: true),
                    MediaMetadata = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    TruthScore = table.Column<decimal>(type: "numeric", nullable: true),
                    TruthCorrection = table.Column<string>(type: "text", nullable: true),
                    TruthSources = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    LocationName = table.Column<string>(type: "text", nullable: true),
                    Latitude = table.Column<decimal>(type: "numeric", nullable: true),
                    Longitude = table.Column<decimal>(type: "numeric", nullable: true),
                    IsSensitive = table.Column<bool>(type: "boolean", nullable: false),
                    IsPinned = table.Column<bool>(type: "boolean", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    ReplyToId = table.Column<Guid>(type: "uuid", nullable: true),
                    RepostOfId = table.Column<Guid>(type: "uuid", nullable: true),
                    QuoteOfId = table.Column<Guid>(type: "uuid", nullable: true),
                    LikesCount = table.Column<int>(type: "integer", nullable: false),
                    RepostsCount = table.Column<int>(type: "integer", nullable: false),
                    CommentsCount = table.Column<int>(type: "integer", nullable: false),
                    SharesCount = table.Column<int>(type: "integer", nullable: false),
                    BookmarksCount = table.Column<int>(type: "integer", nullable: false),
                    ViewsCount = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Posts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Posts_Posts_QuoteOfId",
                        column: x => x.QuoteOfId,
                        principalSchema: "app_data",
                        principalTable: "Posts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Posts_Posts_ReplyToId",
                        column: x => x.ReplyToId,
                        principalSchema: "app_data",
                        principalTable: "Posts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Posts_Posts_RepostOfId",
                        column: x => x.RepostOfId,
                        principalSchema: "app_data",
                        principalTable: "Posts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Posts_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "TruthClaims",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ClaimText = table.Column<string>(type: "text", nullable: false),
                    NormalizedClaim = table.Column<string>(type: "text", nullable: false),
                    IsTrue = table.Column<bool>(type: "boolean", nullable: false),
                    Correction = table.Column<string>(type: "text", nullable: true),
                    Explanation = table.Column<string>(type: "text", nullable: true),
                    Sources = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    Confidence = table.Column<decimal>(type: "numeric", nullable: false),
                    Category = table.Column<string>(type: "text", nullable: false),
                    VerificationCount = table.Column<int>(type: "integer", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatorId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TruthClaims", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TruthClaims_Users_CreatorId",
                        column: x => x.CreatorId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "UserFollows",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    FollowerId = table.Column<Guid>(type: "uuid", nullable: false),
                    FollowingId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserFollows", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserFollows_Users_FollowerId",
                        column: x => x.FollowerId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_UserFollows_Users_FollowingId",
                        column: x => x.FollowingId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "UserSettings",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Theme = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserSettings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserSettings_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "UserSubscriptions",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    StripeCustomerId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    StripeSubscriptionId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    StripePriceId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    CurrentPeriodEnd = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CancelAtPeriodEnd = table.Column<bool>(type: "boolean", nullable: false),
                    LastWebhookEventId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserSubscriptions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserSubscriptions_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Videos",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    VideoUrl = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    ThumbnailUrl = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Duration = table.Column<int>(type: "integer", nullable: true),
                    YoutubeVideoId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    YoutubeUrl = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    YoutubePublishStatus = table.Column<int>(type: "integer", nullable: false),
                    YoutubePublishError = table.Column<string>(type: "text", nullable: true),
                    YoutubeMetadata = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    ViewsCount = table.Column<int>(type: "integer", nullable: false),
                    LikesCount = table.Column<int>(type: "integer", nullable: false),
                    CommentsCount = table.Column<int>(type: "integer", nullable: false),
                    SharesCount = table.Column<int>(type: "integer", nullable: false),
                    Tags = table.Column<string[]>(type: "text[]", nullable: true),
                    Privacy = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    PublishedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Videos", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Videos_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ConversationParticipant",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ConversationId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    JoinedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LastReadAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    IsMuted = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConversationParticipant", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ConversationParticipant_Conversation_ConversationId",
                        column: x => x.ConversationId,
                        principalSchema: "app_data",
                        principalTable: "Conversation",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ConversationParticipant_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Message",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ConversationId = table.Column<Guid>(type: "uuid", nullable: false),
                    SenderId = table.Column<Guid>(type: "uuid", nullable: false),
                    Content = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    MediaUrls = table.Column<string[]>(type: "text[]", nullable: true),
                    IsRead = table.Column<bool>(type: "boolean", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    ReplyToId = table.Column<Guid>(type: "uuid", nullable: true),
                    ReadAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Message", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Message_Conversation_ConversationId",
                        column: x => x.ConversationId,
                        principalSchema: "app_data",
                        principalTable: "Conversation",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Message_Message_ReplyToId",
                        column: x => x.ReplyToId,
                        principalSchema: "app_data",
                        principalTable: "Message",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Message_Users_SenderId",
                        column: x => x.SenderId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Comment",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PostId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ParentCommentId = table.Column<Guid>(type: "uuid", nullable: true),
                    Content = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    LikesCount = table.Column<int>(type: "integer", nullable: false),
                    RepliesCount = table.Column<int>(type: "integer", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Comment", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Comment_Comment_ParentCommentId",
                        column: x => x.ParentCommentId,
                        principalSchema: "app_data",
                        principalTable: "Comment",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Comment_Posts_PostId",
                        column: x => x.PostId,
                        principalSchema: "app_data",
                        principalTable: "Posts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Comment_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PostLikes",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PostId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PostLikes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PostLikes_Posts_PostId",
                        column: x => x.PostId,
                        principalSchema: "app_data",
                        principalTable: "Posts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PostReposts",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PostId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PostReposts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PostReposts_Posts_PostId",
                        column: x => x.PostId,
                        principalSchema: "app_data",
                        principalTable: "Posts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "TruthDisputes",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PostId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Reason = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    Evidence = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    ResolutionNotes = table.Column<string>(type: "text", nullable: true),
                    ResolvedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    ResolvedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    TruthClaimId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TruthDisputes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TruthDisputes_Posts_PostId",
                        column: x => x.PostId,
                        principalSchema: "app_data",
                        principalTable: "Posts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_TruthDisputes_TruthClaims_TruthClaimId",
                        column: x => x.TruthClaimId,
                        principalSchema: "app_data",
                        principalTable: "TruthClaims",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_TruthDisputes_Users_ResolvedBy",
                        column: x => x.ResolvedBy,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TruthDisputes_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "TruthVerificationVotes",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ClaimId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    VoteType = table.Column<bool>(type: "boolean", nullable: true),
                    ConfidenceScore = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TruthVerificationVotes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TruthVerificationVotes_TruthClaims_ClaimId",
                        column: x => x.ClaimId,
                        principalSchema: "app_data",
                        principalTable: "TruthClaims",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_TruthVerificationVotes_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "VideoComment",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    VideoId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ParentCommentId = table.Column<Guid>(type: "uuid", nullable: true),
                    Content = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    LikesCount = table.Column<int>(type: "integer", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VideoComment", x => x.Id);
                    table.ForeignKey(
                        name: "FK_VideoComment_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_VideoComment_VideoComment_ParentCommentId",
                        column: x => x.ParentCommentId,
                        principalSchema: "app_data",
                        principalTable: "VideoComment",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_VideoComment_Videos_VideoId",
                        column: x => x.VideoId,
                        principalSchema: "app_data",
                        principalTable: "Videos",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "VideoLike",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    VideoId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VideoLike", x => x.Id);
                    table.ForeignKey(
                        name: "FK_VideoLike_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_VideoLike_Videos_VideoId",
                        column: x => x.VideoId,
                        principalSchema: "app_data",
                        principalTable: "Videos",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CommentLike",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CommentId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CommentLike", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CommentLike_Comment_CommentId",
                        column: x => x.CommentId,
                        principalSchema: "app_data",
                        principalTable: "Comment",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AgentEvolutions_AgentId",
                schema: "app_data",
                table: "AgentEvolutions",
                column: "AgentId");

            migrationBuilder.CreateIndex(
                name: "IX_AgentInteractions_AgentId",
                schema: "app_data",
                table: "AgentInteractions",
                column: "AgentId");

            migrationBuilder.CreateIndex(
                name: "IX_AgentInteractions_TargetAgentId",
                schema: "app_data",
                table: "AgentInteractions",
                column: "TargetAgentId");

            migrationBuilder.CreateIndex(
                name: "IX_AgentInteractions_TargetUserId",
                schema: "app_data",
                table: "AgentInteractions",
                column: "TargetUserId");

            migrationBuilder.CreateIndex(
                name: "IX_Comment_ParentCommentId",
                schema: "app_data",
                table: "Comment",
                column: "ParentCommentId");

            migrationBuilder.CreateIndex(
                name: "IX_Comment_PostId",
                schema: "app_data",
                table: "Comment",
                column: "PostId");

            migrationBuilder.CreateIndex(
                name: "IX_Comment_UserId",
                schema: "app_data",
                table: "Comment",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_CommentLike_CommentId",
                schema: "app_data",
                table: "CommentLike",
                column: "CommentId");

            migrationBuilder.CreateIndex(
                name: "IX_Conversation_CreatorId",
                schema: "app_data",
                table: "Conversation",
                column: "CreatorId");

            migrationBuilder.CreateIndex(
                name: "IX_ConversationParticipant_ConversationId",
                schema: "app_data",
                table: "ConversationParticipant",
                column: "ConversationId");

            migrationBuilder.CreateIndex(
                name: "IX_ConversationParticipant_UserId",
                schema: "app_data",
                table: "ConversationParticipant",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_Message_ConversationId",
                schema: "app_data",
                table: "Message",
                column: "ConversationId");

            migrationBuilder.CreateIndex(
                name: "IX_Message_ReplyToId",
                schema: "app_data",
                table: "Message",
                column: "ReplyToId");

            migrationBuilder.CreateIndex(
                name: "IX_Message_SenderId",
                schema: "app_data",
                table: "Message",
                column: "SenderId");

            migrationBuilder.CreateIndex(
                name: "IX_PostLikes_PostId",
                schema: "app_data",
                table: "PostLikes",
                column: "PostId");

            migrationBuilder.CreateIndex(
                name: "IX_PostReposts_PostId",
                schema: "app_data",
                table: "PostReposts",
                column: "PostId");

            migrationBuilder.CreateIndex(
                name: "IX_Posts_QuoteOfId",
                schema: "app_data",
                table: "Posts",
                column: "QuoteOfId");

            migrationBuilder.CreateIndex(
                name: "IX_Posts_ReplyToId",
                schema: "app_data",
                table: "Posts",
                column: "ReplyToId");

            migrationBuilder.CreateIndex(
                name: "IX_Posts_RepostOfId",
                schema: "app_data",
                table: "Posts",
                column: "RepostOfId");

            migrationBuilder.CreateIndex(
                name: "IX_Posts_UserId",
                schema: "app_data",
                table: "Posts",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_TruthClaims_CreatorId",
                schema: "app_data",
                table: "TruthClaims",
                column: "CreatorId");

            migrationBuilder.CreateIndex(
                name: "IX_TruthDisputes_PostId",
                schema: "app_data",
                table: "TruthDisputes",
                column: "PostId");

            migrationBuilder.CreateIndex(
                name: "IX_TruthDisputes_ResolvedBy",
                schema: "app_data",
                table: "TruthDisputes",
                column: "ResolvedBy");

            migrationBuilder.CreateIndex(
                name: "IX_TruthDisputes_TruthClaimId",
                schema: "app_data",
                table: "TruthDisputes",
                column: "TruthClaimId");

            migrationBuilder.CreateIndex(
                name: "IX_TruthDisputes_UserId",
                schema: "app_data",
                table: "TruthDisputes",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_TruthVerificationVotes_ClaimId",
                schema: "app_data",
                table: "TruthVerificationVotes",
                column: "ClaimId");

            migrationBuilder.CreateIndex(
                name: "IX_TruthVerificationVotes_UserId",
                schema: "app_data",
                table: "TruthVerificationVotes",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_UserFollows_FollowerId_FollowingId",
                schema: "app_data",
                table: "UserFollows",
                columns: new[] { "FollowerId", "FollowingId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserFollows_FollowingId",
                schema: "app_data",
                table: "UserFollows",
                column: "FollowingId");

            migrationBuilder.CreateIndex(
                name: "IX_UserSettings_UserId",
                schema: "app_data",
                table: "UserSettings",
                column: "UserId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserSubscriptions_StripeCustomerId",
                schema: "app_data",
                table: "UserSubscriptions",
                column: "StripeCustomerId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserSubscriptions_StripeSubscriptionId",
                schema: "app_data",
                table: "UserSubscriptions",
                column: "StripeSubscriptionId",
                unique: true,
                filter: "\"StripeSubscriptionId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_UserSubscriptions_UserId",
                schema: "app_data",
                table: "UserSubscriptions",
                column: "UserId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_VideoComment_ParentCommentId",
                schema: "app_data",
                table: "VideoComment",
                column: "ParentCommentId");

            migrationBuilder.CreateIndex(
                name: "IX_VideoComment_UserId",
                schema: "app_data",
                table: "VideoComment",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_VideoComment_VideoId",
                schema: "app_data",
                table: "VideoComment",
                column: "VideoId");

            migrationBuilder.CreateIndex(
                name: "IX_VideoLike_UserId",
                schema: "app_data",
                table: "VideoLike",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_VideoLike_VideoId",
                schema: "app_data",
                table: "VideoLike",
                column: "VideoId");

            migrationBuilder.CreateIndex(
                name: "IX_Videos_UserId",
                schema: "app_data",
                table: "Videos",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AgentEvolutions",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "AgentInteractions",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "CommentLike",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "ConversationParticipant",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "Message",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "PostBookmarks",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "PostLikes",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "PostReposts",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "TruthDisputes",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "TruthVerificationVotes",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "UserFollows",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "UserSettings",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "UserSubscriptions",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "VideoComment",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "VideoLike",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "Agents",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "Comment",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "Conversation",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "TruthClaims",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "Videos",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "Posts",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "Users",
                schema: "app_data");
        }
    }
}
