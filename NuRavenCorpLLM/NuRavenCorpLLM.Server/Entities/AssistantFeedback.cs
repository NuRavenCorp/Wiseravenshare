using System.ComponentModel.DataAnnotations;

namespace NuRavenCorpLLM.Entities;

public class AssistantFeedback : BaseEntity
{
    public Guid MessageId { get; set; }
    public Guid? UserId { get; set; }

    public FeedbackVote Vote { get; set; }

    [MaxLength(2000)]
    public string? Comment { get; set; }

    public string? CorrectedResponse { get; set; }
    public bool IsProcessed { get; set; }

    public virtual AssistantMessage Message { get; set; } = null!;
    public int? Rating { get; internal set; }
}

public enum FeedbackVote
{
    ThumbUp,
    ThumbDown,
    Flag,
    Neutral
}