// Infrastructure/Data/Migrations/AddAssistantAndVector.cs
using Microsoft.EntityFrameworkCore.Migrations;

public partial class AddAssistantAndVector : Migration
{
    protected override void Up(MigrationBuilder mb)
    {
        mb.Sql("CREATE EXTENSION IF NOT EXISTS vector;");

        mb.CreateTable(
            name: "assistant_conversations",
            columns: t => new
            {
                Id = t.Column<Guid>(nullable: false),
                UserId = t.Column<Guid>(nullable: false),
                Title = t.Column<string>(maxLength: 255),
                Channel = t.Column<int>(),
                Persona = t.Column<int>(),
                IsVoiceEnabled = t.Column<bool>(defaultValue: true),
                IsWebGroundingEnabled = t.Column<bool>(defaultValue: true),
                IsLearningEnabled = t.Column<bool>(defaultValue: true),
                VoiceId = t.Column<string>(nullable: true),
                SystemPromptOverride = t.Column<string>(nullable: true),
                MessageCount = t.Column<int>(defaultValue: 0),
                TokenUsage = t.Column<int>(defaultValue: 0),
                LastMessageAt = t.Column<DateTime>(),
                CreatedAt = t.Column<DateTime>(),
                UpdatedAt = t.Column<DateTime>(),
                IsDeleted = t.Column<bool>(),
                DeletedAt = t.Column<DateTime>(nullable: true)
            },
            constraints: t => t.PrimaryKey("PK_assistant_conversations", x => x.Id));

        mb.CreateTable(
            name: "assistant_messages",
            columns: t => new
            {
                Id = t.Column<Guid>(nullable: false),
                ConversationId = t.Column<Guid>(nullable: false),
                UserId = t.Column<Guid>(nullable: true),
                Role = t.Column<int>(),
                Content = t.Column<string>(nullable: false),
                AudioUrl = t.Column<string>(nullable: true),
                AudioDurationMs = t.Column<int>(nullable: true),
                Transcript = t.Column<string>(nullable: true),
                PromptTokens = t.Column<int>(),
                CompletionTokens = t.Column<int>(),
                LatencyMs = t.Column<int>(),
                Citations = t.Column<System.Text.Json.JsonDocument>(nullable: true),
                ToolCalls = t.Column<System.Text.Json.JsonDocument>(nullable: true),
                Metadata = t.Column<System.Text.Json.JsonDocument>(nullable: true),
                Status = t.Column<int>(),
                CreatedAt = t.Column<DateTime>(),
                UpdatedAt = t.Column<DateTime>(),
                IsDeleted = t.Column<bool>(),
                DeletedAt = t.Column<DateTime>(nullable: true)
            },
            constraints: t =>
            {
                t.PrimaryKey("PK_assistant_messages", x => x.Id);
                t.ForeignKey("FK_assistant_messages_conv", x => x.ConversationId,
                    "assistant_conversations", "Id", onDelete: ReferentialAction.Cascade);
            });

        mb.CreateTable(
            name: "assistant_knowledge",
            columns: t => new
            {
                Id = t.Column<Guid>(nullable: false),
                Title = t.Column<string>(maxLength: 500),
                Content = t.Column<string>(nullable: false),
                ContentHash = t.Column<string>(nullable: false),
                Source = t.Column<string>(maxLength: 100),
                SourceUrl = t.Column<string>(maxLength: 2000, nullable: true),
                SourceId = t.Column<string>(maxLength: 500, nullable: true),
                Category = t.Column<string>(maxLength: 100, nullable: true),
                Tags = t.Column<string[]>(nullable: true),
                IsPublic = t.Column<bool>(defaultValue: true),
                IsApproved = t.Column<bool>(defaultValue: false),
                ApprovedBy = t.Column<Guid>(nullable: true),
                Metadata = t.Column<System.Text.Json.JsonDocument>(nullable: true),
                TokenCount = t.Column<int>(),
                CreatedAt = t.Column<DateTime>(),
                UpdatedAt = t.Column<DateTime>(),
                IsDeleted = t.Column<bool>(),
                DeletedAt = t.Column<DateTime>(nullable: true)
            },
            constraints: t => t.PrimaryKey("PK_assistant_knowledge", x => x.Id));

        // Vector column (1536 dims for text-embedding-3-small)
        mb.Sql("ALTER TABLE assistant_knowledge ADD COLUMN embedding vector(1536);");

        // IVFFlat index for fast cosine search
        mb.Sql(@"CREATE INDEX idx_assistant_knowledge_embedding 
                 ON assistant_knowledge USING ivfflat (embedding vector_cosine_ops)
                 WITH (lists = 100);");

        mb.CreateTable(
            name: "assistant_learning_samples",
            columns: t => new
            {
                Id = t.Column<Guid>(nullable: false),
                Source = t.Column<int>(),
                Status = t.Column<int>(),
                UserPrompt = t.Column<string>(nullable: false),
                AssistantResponse = t.Column<string>(nullable: true),
                IdealResponse = t.Column<string>(nullable: true),
                Context = t.Column<string>(nullable: true),
                Metadata = t.Column<System.Text.Json.JsonDocument>(nullable: true),
                ContentHash = t.Column<string>(nullable: true),
                QualityScore = t.Column<float>(nullable: true),
                ConversationId = t.Column<Guid>(nullable: true),
                MessageId = t.Column<Guid>(nullable: true),
                SourceUserId = t.Column<Guid>(nullable: true),
                UsedInTrainingAt = t.Column<DateTime>(nullable: true),
                TrainingBatchId = t.Column<string>(nullable: true),
                CreatedAt = t.Column<DateTime>(),
                UpdatedAt = t.Column<DateTime>(),
                IsDeleted = t.Column<bool>(),
                DeletedAt = t.Column<DateTime>(nullable: true)
            },
            constraints: t => t.PrimaryKey("PK_assistant_learning_samples", x => x.Id));

        mb.CreateTable(
            name: "assistant_feedback",
            columns: t => new
            {
                Id = t.Column<Guid>(nullable: false),
                MessageId = t.Column<Guid>(nullable: false),
                UserId = t.Column<Guid>(nullable: false),
                Vote = t.Column<int>(),
                Rating = t.Column<int>(nullable: true),
                Comment = t.Column<string>(nullable: true),
                CorrectedResponse = t.Column<string>(nullable: true),
                IsUsedInTraining = t.Column<bool>(defaultValue: false),
                CreatedAt = t.Column<DateTime>(),
                UpdatedAt = t.Column<DateTime>(),
                IsDeleted = t.Column<bool>(),
                DeletedAt = t.Column<DateTime>(nullable: true)
            },
            constraints: t => t.PrimaryKey("PK_assistant_feedback", x => x.Id));
    }

    protected override void Down(MigrationBuilder mb)
    {
        mb.DropTable("assistant_feedback");
        mb.DropTable("assistant_learning_samples");
        mb.DropTable("assistant_knowledge");
        mb.DropTable("assistant_messages");
        mb.DropTable("assistant_conversations");
    }
}