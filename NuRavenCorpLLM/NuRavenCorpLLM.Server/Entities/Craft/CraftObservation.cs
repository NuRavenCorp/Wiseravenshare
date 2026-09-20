using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace NuRavenCorpLLM.Entities.Craft;

public class CraftObservation : BaseEntity
{
    public Guid UserId { get; set; }
    public Guid? ContentId { get; set; }

    [MaxLength(100)]
    public string DomainKey { get; set; } = string.Empty;

    public ObservationType Type { get; set; }
    public CraftAction Action { get; set; }               // published | edited | deleted | promoted | etc.

    // Signal quality of this observation
    public decimal? SuccessMetric { get; set; }            // e.g. engagement %
    public string? MetricName { get; set; }                // "engagement_rate" | "watch_through" | "share_rate"

    // What was good or bad about the content
    public JsonDocument? Signals { get; set; }
    public JsonDocument? Features { get; set; }
    public JsonDocument? Context { get; set; }

    // Extracted patterns
    public string? DetectedPattern { get; set; }
    public float[]? Embedding { get; set; }

    // Navigation
    public virtual User User { get; set; } = null!;
}

public enum ObservationType
{
    ContentPublished,
    ContentEdited,
    ContentDeleted,
    AudienceReaction,
    PeerComparison,
    ExpertCritique,
    SelfReflection,
    CoachingReceived,
    CraftLessonCompleted
}

public enum CraftAction
{
    Created,
    Refined,
    Distributed,
    Promoted,
    Monitored,
    Iterated,
    Archived,
    Repurposed
}