namespace WiseRavenShare.Server.Entities.Assistant;

public class AssistantFeedback : BaseEntity
{
    public Guid MessageId { get; set; }
    public Guid UserId { get; set; }

    public FeedbackVote Vote { get; set; }
    public int? Rating { get; set; }
    public string? Comment { get; set; }
    public string? CorrectedResponse { get; set; }

    public bool IsUsedInTraining { get; set; }

    public virtual AssistantMessage Message { get; set; } = null!;
}
