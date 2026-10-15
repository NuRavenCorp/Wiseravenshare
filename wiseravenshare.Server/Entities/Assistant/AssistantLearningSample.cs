using System.Text.Json;

namespace WiseRavenShare.Server.Entities.Assistant;

public class AssistantLearningSample : BaseEntity
{
    public LearningSampleSource Source { get; set; }
    public LearningSampleStatus Status { get; set; } = LearningSampleStatus.Pending;

    public string UserPrompt { get; set; } = string.Empty;
    public string? AssistantResponse { get; set; }
    public string? IdealResponse { get; set; }
    public string? Context { get; set; }

    public JsonDocument? Metadata { get; set; }

    public string? ContentHash { get; set; }
    public float? QualityScore { get; set; }

    public Guid? ConversationId { get; set; }
    public Guid? MessageId { get; set; }
    public Guid? SourceUserId { get; set; }

    public DateTime? UsedInTrainingAt { get; set; }
    public string? TrainingBatchId { get; set; }
}
