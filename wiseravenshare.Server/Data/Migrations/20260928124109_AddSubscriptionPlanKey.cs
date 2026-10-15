using System;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace wiseravenshare.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSubscriptionPlanKey : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PlanKey",
                schema: "app_data",
                table: "UserSubscriptions",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "AssistantConversations",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Channel = table.Column<int>(type: "integer", nullable: false),
                    Persona = table.Column<int>(type: "integer", nullable: false),
                    IsVoiceEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    IsWebGroundingEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    IsLearningEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    VoiceId = table.Column<string>(type: "text", nullable: true),
                    SystemPromptOverride = table.Column<string>(type: "text", nullable: true),
                    MessageCount = table.Column<int>(type: "integer", nullable: false),
                    TokenUsage = table.Column<int>(type: "integer", nullable: false),
                    LastMessageAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AssistantConversations", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "AssistantKnowledge",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Content = table.Column<string>(type: "text", nullable: false),
                    ContentHash = table.Column<string>(type: "text", nullable: false),
                    Source = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    SourceUrl = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    SourceId = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Category = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Tags = table.Column<string[]>(type: "text[]", nullable: true),
                    IsPublic = table.Column<bool>(type: "boolean", nullable: false),
                    IsApproved = table.Column<bool>(type: "boolean", nullable: false),
                    ApprovedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    Metadata = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    Embedding = table.Column<float[]>(type: "real[]", nullable: true),
                    TokenCount = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AssistantKnowledge", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "AssistantLearningSamples",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Source = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    UserPrompt = table.Column<string>(type: "text", nullable: false),
                    AssistantResponse = table.Column<string>(type: "text", nullable: true),
                    IdealResponse = table.Column<string>(type: "text", nullable: true),
                    Context = table.Column<string>(type: "text", nullable: true),
                    Metadata = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    ContentHash = table.Column<string>(type: "text", nullable: true),
                    QualityScore = table.Column<float>(type: "real", nullable: true),
                    ConversationId = table.Column<Guid>(type: "uuid", nullable: true),
                    MessageId = table.Column<Guid>(type: "uuid", nullable: true),
                    SourceUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    UsedInTrainingAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    TrainingBatchId = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AssistantLearningSamples", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ContentTags",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Category = table.Column<int>(type: "integer", nullable: false),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    Weight = table.Column<int>(type: "integer", nullable: false),
                    UsageCount = table.Column<int>(type: "integer", nullable: false),
                    Synonyms = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    RelatedTags = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    Embedding = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ContentTags", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "LearningModels",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    Version = table.Column<string>(type: "text", nullable: false),
                    Configuration = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    Weights = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    Architecture = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    Metrics = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    TrainingIterations = table.Column<int>(type: "integer", nullable: false),
                    TrainingDataSize = table.Column<int>(type: "integer", nullable: false),
                    Accuracy = table.Column<decimal>(type: "numeric", nullable: false),
                    Precision = table.Column<decimal>(type: "numeric", nullable: false),
                    Recall = table.Column<decimal>(type: "numeric", nullable: false),
                    F1Score = table.Column<decimal>(type: "numeric", nullable: false),
                    TrainedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastUsedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UsageCount = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LearningModels", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "StreamTransfers",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceApp = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    SourceContentId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    SourceCreatorId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    VideoUrl = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                    Title = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Description = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    FileSizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    MimeType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    StreamVideoUid = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    PublishedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    RetryCount = table.Column<int>(type: "integer", nullable: false),
                    RubricResultJson = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StreamTransfers", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "UserProfiles",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    AgeRange = table.Column<string>(type: "text", nullable: true),
                    Gender = table.Column<string>(type: "text", nullable: true),
                    Location = table.Column<string>(type: "text", nullable: true),
                    Timezone = table.Column<string>(type: "text", nullable: true),
                    Occupation = table.Column<string>(type: "text", nullable: true),
                    Languages = table.Column<string[]>(type: "text[]", nullable: true),
                    LifeStage = table.Column<int>(type: "integer", nullable: false),
                    LifeInterests = table.Column<string[]>(type: "text[]", nullable: true),
                    CurrentGoals = table.Column<string[]>(type: "text[]", nullable: true),
                    LifeEvents = table.Column<string[]>(type: "text[]", nullable: true),
                    FavoriteGenres = table.Column<string[]>(type: "text[]", nullable: true),
                    FavoriteTopics = table.Column<string[]>(type: "text[]", nullable: true),
                    FavoriteCreators = table.Column<string[]>(type: "text[]", nullable: true),
                    PreferredContentTypes = table.Column<string[]>(type: "text[]", nullable: true),
                    ActiveHours = table.Column<string[]>(type: "text[]", nullable: true),
                    ActiveDays = table.Column<string[]>(type: "text[]", nullable: true),
                    AverageSessionDuration = table.Column<int>(type: "integer", nullable: false),
                    LastActiveAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    FeatureVector = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    EmbeddingVector = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    PreferenceModel = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    BehavioralPatterns = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserProfiles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserProfiles_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AssistantMessages",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ConversationId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: true),
                    Role = table.Column<int>(type: "integer", nullable: false),
                    Content = table.Column<string>(type: "text", nullable: false),
                    AudioUrl = table.Column<string>(type: "text", nullable: true),
                    AudioDurationMs = table.Column<int>(type: "integer", nullable: true),
                    Transcript = table.Column<string>(type: "text", nullable: true),
                    PromptTokens = table.Column<int>(type: "integer", nullable: false),
                    CompletionTokens = table.Column<int>(type: "integer", nullable: false),
                    LatencyMs = table.Column<int>(type: "integer", nullable: false),
                    Citations = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    ToolCalls = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    Metadata = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AssistantMessages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AssistantMessages_AssistantConversations_ConversationId",
                        column: x => x.ConversationId,
                        principalSchema: "app_data",
                        principalTable: "AssistantConversations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ContentTagMappings",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ContentTagId = table.Column<Guid>(type: "uuid", nullable: false),
                    TargetType = table.Column<string>(type: "text", nullable: false),
                    TargetId = table.Column<Guid>(type: "uuid", nullable: false),
                    Confidence = table.Column<int>(type: "integer", nullable: false),
                    IsAutoGenerated = table.Column<bool>(type: "boolean", nullable: false),
                    GeneratedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ContentTagMappings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ContentTagMappings_ContentTags_ContentTagId",
                        column: x => x.ContentTagId,
                        principalSchema: "app_data",
                        principalTable: "ContentTags",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ModelPredictions",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ModelId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    TargetType = table.Column<string>(type: "text", nullable: false),
                    TargetId = table.Column<Guid>(type: "uuid", nullable: false),
                    Score = table.Column<decimal>(type: "numeric", nullable: false),
                    Confidence = table.Column<decimal>(type: "numeric", nullable: false),
                    Reason = table.Column<string>(type: "text", nullable: true),
                    Features = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    IsAccepted = table.Column<bool>(type: "boolean", nullable: false),
                    PredictedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    AcceptedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ModelPredictions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ModelPredictions_LearningModels_ModelId",
                        column: x => x.ModelId,
                        principalSchema: "app_data",
                        principalTable: "LearningModels",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ModelPredictions_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "StreamGatekeeperDecisions",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TransferId = table.Column<Guid>(type: "uuid", nullable: false),
                    AdminId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Action = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Rationale = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    DecidedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StreamGatekeeperDecisions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StreamGatekeeperDecisions_StreamTransfers_TransferId",
                        column: x => x.TransferId,
                        principalSchema: "app_data",
                        principalTable: "StreamTransfers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "UserInteractions",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    TargetType = table.Column<string>(type: "text", nullable: false),
                    TargetId = table.Column<Guid>(type: "uuid", nullable: true),
                    TargetTitle = table.Column<string>(type: "text", nullable: true),
                    TargetCategory = table.Column<string>(type: "text", nullable: true),
                    TargetTags = table.Column<string>(type: "text", nullable: true),
                    EngagementScore = table.Column<int>(type: "integer", nullable: true),
                    Duration = table.Column<int>(type: "integer", nullable: true),
                    DeviceInfo = table.Column<string>(type: "text", nullable: true),
                    LocationInfo = table.Column<string>(type: "text", nullable: true),
                    ContextData = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    Metadata = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    UserProfileId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserInteractions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserInteractions_UserProfiles_UserProfileId",
                        column: x => x.UserProfileId,
                        principalSchema: "app_data",
                        principalTable: "UserProfiles",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_UserInteractions_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "UserLearningEvents",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    EventData = table.Column<string>(type: "text", nullable: false),
                    ModelInput = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    ModelOutput = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    ConfidenceScore = table.Column<decimal>(type: "numeric", nullable: false),
                    RelevanceScore = table.Column<decimal>(type: "numeric", nullable: false),
                    IsFeedback = table.Column<bool>(type: "boolean", nullable: false),
                    FeedbackAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    FeedbackData = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    UserProfileId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserLearningEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserLearningEvents_UserProfiles_UserProfileId",
                        column: x => x.UserProfileId,
                        principalSchema: "app_data",
                        principalTable: "UserProfiles",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_UserLearningEvents_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "app_data",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AssistantFeedbacks",
                schema: "app_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MessageId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Vote = table.Column<int>(type: "integer", nullable: false),
                    Rating = table.Column<int>(type: "integer", nullable: true),
                    Comment = table.Column<string>(type: "text", nullable: true),
                    CorrectedResponse = table.Column<string>(type: "text", nullable: true),
                    IsUsedInTraining = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AssistantFeedbacks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AssistantFeedbacks_AssistantMessages_MessageId",
                        column: x => x.MessageId,
                        principalSchema: "app_data",
                        principalTable: "AssistantMessages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AssistantFeedbacks_MessageId",
                schema: "app_data",
                table: "AssistantFeedbacks",
                column: "MessageId");

            migrationBuilder.CreateIndex(
                name: "IX_AssistantMessages_ConversationId",
                schema: "app_data",
                table: "AssistantMessages",
                column: "ConversationId");

            migrationBuilder.CreateIndex(
                name: "IX_ContentTagMappings_ContentTagId",
                schema: "app_data",
                table: "ContentTagMappings",
                column: "ContentTagId");

            migrationBuilder.CreateIndex(
                name: "IX_ModelPredictions_ModelId",
                schema: "app_data",
                table: "ModelPredictions",
                column: "ModelId");

            migrationBuilder.CreateIndex(
                name: "IX_ModelPredictions_UserId",
                schema: "app_data",
                table: "ModelPredictions",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_StreamGatekeeperDecisions_TransferId",
                schema: "app_data",
                table: "StreamGatekeeperDecisions",
                column: "TransferId");

            migrationBuilder.CreateIndex(
                name: "IX_UserInteractions_UserId",
                schema: "app_data",
                table: "UserInteractions",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_UserInteractions_UserProfileId",
                schema: "app_data",
                table: "UserInteractions",
                column: "UserProfileId");

            migrationBuilder.CreateIndex(
                name: "IX_UserLearningEvents_UserId",
                schema: "app_data",
                table: "UserLearningEvents",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_UserLearningEvents_UserProfileId",
                schema: "app_data",
                table: "UserLearningEvents",
                column: "UserProfileId");

            migrationBuilder.CreateIndex(
                name: "IX_UserProfiles_UserId",
                schema: "app_data",
                table: "UserProfiles",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AssistantFeedbacks",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "AssistantKnowledge",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "AssistantLearningSamples",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "ContentTagMappings",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "ModelPredictions",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "StreamGatekeeperDecisions",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "UserInteractions",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "UserLearningEvents",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "AssistantMessages",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "ContentTags",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "LearningModels",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "StreamTransfers",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "UserProfiles",
                schema: "app_data");

            migrationBuilder.DropTable(
                name: "AssistantConversations",
                schema: "app_data");

            migrationBuilder.DropColumn(
                name: "PlanKey",
                schema: "app_data",
                table: "UserSubscriptions");
        }
    }
}
