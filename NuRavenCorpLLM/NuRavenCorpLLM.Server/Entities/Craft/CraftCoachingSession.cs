using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace NuRavenCorpLLM.Entities.Craft;

public class CraftCoachingSession : BaseEntity
{
    public Guid UserId { get; set; }
    public Guid? ContentId { get; set; }                        // if reviewing specific content

    [MaxLength(100)]
    public string DomainKey { get; set; } = string.Empty;

    public CoachingTrigger Trigger { get; set; }                 // DraftReview | PerformanceDrop | NewUser | ManualRequest | PostPublish

    public string Input { get; set; } = string.Empty;            // draft, description, transcript
    public string? Context { get; set; }

    public JsonDocument? Output { get; set; }                    // structured coaching response

    public decimal? OverallScore { get; set; }
    public string? Summary { get; set; }

    public DateTime? AppliedAt { get; set; }
    public decimal? AppliedImpact { get; set; }

    // Navigation
    public virtual User User { get; set; } = null!;
    public virtual ICollection<CraftCoachingSuggestion> Suggestions { get; set; } = new List<CraftCoachingSuggestion>();
}

public enum CoachingTrigger
{
    DraftReview,
    PostPublish,
    PerformanceDrop,
    NewUser,
    ManualRequest,
    WeeklyReview,
    PeerComparison,
    TrendAlert
}

public class CraftCoachingSuggestion : BaseEntity
{
    public Guid SessionId { get; set; }

    [MaxLength(100)]
    public string SkillKey { get; set; } = string.Empty;

    public SuggestionKind Kind { get; set; }                    // Strength | Improvement | Warning | Reference

    [MaxLength(300)]
    public string Title { get; set; } = string.Empty;

    public string Detail { get; set; } = string.Empty;
    public string? Example { get; set; }
    public int Priority { get; set; }                            // 0-100

    public string[]? MasterExamples { get; set; }
    public string[]? Citations { get; set; }

    public bool Accepted { get; set; }
    public bool Dismissed { get; set; }

    public virtual CraftCoachingSession Session { get; set; } = null!;
}

public enum SuggestionKind { Strength, Improvement, Warning, Reference, Alternative }