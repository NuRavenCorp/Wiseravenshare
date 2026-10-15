using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace WiseRavenShare.Server.Core.Entities.Craft;

public class UserCraftProfile : BaseEntity
{
    public Guid UserId { get; set; }

    [MaxLength(100)]
    public string PrimaryDomain { get; set; } = "content_creation";

    public string[]? FocusDomains { get; set; }
    public JsonDocument? DomainScores { get; set; }

    public int CraftLevel { get; set; } = 1;
    public int TotalCraftPoints { get; set; }
    public int LearningStreakDays { get; set; }

    public DateTime? LastAnalyzedAt { get; set; }
    public DateTime? LastCoachedAt { get; set; }

    // Navigation
    public virtual User User { get; set; } = null!;
    public virtual ICollection<UserCraftSkillScore> SkillScores { get; set; } = new List<UserCraftSkillScore>();
    public virtual ICollection<CraftDraftReview> DraftReviews { get; set; } = new List<CraftDraftReview>();
}

public class UserCraftSkillScore : BaseEntity
{
    public Guid UserId { get; set; }
    public Guid SkillId { get; set; }

    public decimal Score { get; set; }
    public int SampleSize { get; set; }
    public decimal Confidence { get; set; }
    public DateTime LastUpdated { get; set; }

    public JsonDocument? Evidence { get; set; }

    // Navigation
    public virtual CraftSkill Skill { get; set; } = null!;
    public virtual User User { get; set; } = null!;
}

public class CraftObservation : BaseEntity
{
    public Guid UserId { get; set; }
    public Guid? ContentId { get; set; }

    [MaxLength(100)]
    public string DomainKey { get; set; } = string.Empty;

    public ObservationType Type { get; set; }
    public CraftAction Action { get; set; }

    public decimal? SuccessMetric { get; set; }

    [MaxLength(100)]
    public string? MetricName { get; set; }

    public JsonDocument? Signals { get; set; }
    public JsonDocument? Features { get; set; }
    public JsonDocument? Context { get; set; }

    [MaxLength(500)]
    public string? DetectedPattern { get; set; }

    public float[]? Embedding { get; set; }

    // Navigation
    public virtual User User { get; set; } = null!;
}

public enum ObservationType
{
    ContentPublished,
    ContentEdited,
    AudienceReaction,
    PeerComparison,
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
    Iterated
}
