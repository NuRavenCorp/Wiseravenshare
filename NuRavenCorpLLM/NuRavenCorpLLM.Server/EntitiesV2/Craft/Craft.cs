using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using NuRavenCorpLLM.Server.Entities;

namespace NuRavenCorpLLM.Server.Entities.Craft;

public class CraftDomain : BaseEntity
{
    [MaxLength(80)]
    public string Key { get; set; } = string.Empty;

    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string? Description { get; set; }

    [MaxLength(20)]
    public string? IconEmoji { get; set; }

    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public virtual ICollection<CraftSkill> Skills { get; set; } = new List<CraftSkill>();
    public virtual ICollection<CraftPrinciple> Principles { get; set; } = new List<CraftPrinciple>();
    public virtual ICollection<CraftSource> Sources { get; set; } = new List<CraftSource>();
    public virtual ICollection<CraftLesson> Lessons { get; set; } = new List<CraftLesson>();
}

public class CraftSkill : BaseEntity
{
    public Guid CraftDomainId { get; set; }

    [MaxLength(80)]
    public string Key { get; set; } = string.Empty;

    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string? Description { get; set; }

    public SkillLevel Difficulty { get; set; } = SkillLevel.Intermediate;
    public string? MeasurementSignal { get; set; }
    public int Weight { get; set; } = 1;
    public Guid? ParentSkillId { get; set; }
    public virtual CraftDomain Domain { get; set; } = null!;
    public virtual CraftSkill? ParentSkill { get; set; }
    public virtual ICollection<CraftSkill> Children { get; set; } = new List<CraftSkill>();
    public virtual ICollection<UserCraftSkillScore> UserScores { get; set; } = new List<UserCraftSkillScore>();
}

public enum SkillLevel { Beginner, Intermediate, Advanced, Expert, Master }

public class CraftPrinciple : BaseEntity
{
    public Guid CraftDomainId { get; set; }
    public Guid? SkillId { get; set; }

    [MaxLength(300)]
    public string Title { get; set; } = string.Empty;

    public string Body { get; set; } = string.Empty;
    public string? Example { get; set; }
    public string? CounterExample { get; set; }

    [MaxLength(100)]
    public string? Author { get; set; }

    [MaxLength(2000)]
    public string? SourceUrl { get; set; }

    public PrincipleKind Kind { get; set; } = PrincipleKind.Rule;
    public int Importance { get; set; } = 50;
    public JsonDocument? Tags { get; set; }
    public float[]? Embedding { get; set; }
    public virtual CraftDomain Domain { get; set; } = null!;
}

public enum PrincipleKind { Rule, Heuristic, AntiPattern, BestPractice, Story, Quote }

public class CraftSource : BaseEntity
{
    public Guid CraftDomainId { get; set; }

    [MaxLength(500)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(200)]
    public string? Author { get; set; }

    public SourceKind Kind { get; set; }
    public SourceStatus Status { get; set; } = SourceStatus.Queued;

    [MaxLength(2000)]
    public string? Url { get; set; }

    public string? RawContent { get; set; }
    public int ContentLength { get; set; }
    public DateTime? IngestedAt { get; set; }

    [MaxLength(2000)]
    public string? ErrorMessage { get; set; }

    public JsonDocument? Metadata { get; set; }
    public virtual CraftDomain Domain { get; set; } = null!;
    public virtual ICollection<CraftInsight> Insights { get; set; } = new List<CraftInsight>();
}

public enum SourceKind { Book, Article, Podcast, Video, Course, Interview, StyleGuide, Forum, Manual, Thesis }
public enum SourceStatus { Queued, Ingesting, Ingested, Failed, Rejected }

public class CraftInsight : BaseEntity
{
    public Guid SourceId { get; set; }

    [MaxLength(300)]
    public string Title { get; set; } = string.Empty;

    public string Content { get; set; } = string.Empty;
    public string? Quote { get; set; }
    public int? PageOrTimestamp { get; set; }
    public float[]? Embedding { get; set; }
    public int Quality { get; set; } = 50;
    public virtual CraftSource Source { get; set; } = null!;
}

public class CraftPattern : BaseEntity
{
    [MaxLength(80)]
    public string DomainKey { get; set; } = string.Empty;

    [MaxLength(300)]
    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;
    public string? Evidence { get; set; }
    public string? Example { get; set; }
    public string? CounterExample { get; set; }
    public decimal Confidence { get; set; } = 0.5m;
    public int SampleSize { get; set; }
}

public class CraftMaster : BaseEntity
{
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;
    public string[]? Domains { get; set; }

    [MaxLength(500)]
    public string? Bio { get; set; }

    [MaxLength(2000)]
    public string? SignatureStyle { get; set; }

    public string[]? NotableWorks { get; set; }
    public string[]? Techniques { get; set; }
    public JsonDocument? Analysis { get; set; }
    public float[]? StyleEmbedding { get; set; }
}

public class CraftLesson : BaseEntity
{
    public Guid CraftDomainId { get; set; }
    public Guid? SkillId { get; set; }

    [MaxLength(300)]
    public string Title { get; set; } = string.Empty;

    public string Summary { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public LessonFormat Format { get; set; } = LessonFormat.Text;
    public SkillLevel Level { get; set; } = SkillLevel.Beginner;
    public int EstimatedMinutes { get; set; } = 5;
    public int OrderIndex { get; set; }
    public string[]? MasterExamples { get; set; }
    public string[]? MasterPractitioners { get; set; }
    public JsonDocument? Evidence { get; set; }
    public string? PersonalizedPrompt { get; set; }
    public string[]? Prerequisites { get; set; }
    public string[]? RelatedSkills { get; set; }
    public float[]? Embedding { get; set; }
    public virtual CraftDomain Domain { get; set; } = null!;
}

public enum LessonFormat { Text, Video, Audio, Interactive, Checklist, MasterClass, CaseStudy }

public class CraftObservation : BaseEntity
{
    public Guid UserId { get; set; }
    public Guid? ContentId { get; set; }

    [MaxLength(80)]
    public string DomainKey { get; set; } = string.Empty;

    public ObservationType Type { get; set; }
    public CraftAction Action { get; set; }
    public decimal? SuccessMetric { get; set; }

    [MaxLength(100)]
    public string? MetricName { get; set; }

    public JsonDocument? Signals { get; set; }
    public JsonDocument? Features { get; set; }
    public JsonDocument? Context { get; set; }
    public string? DetectedPattern { get; set; }
    public float[]? Embedding { get; set; }
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

public enum CraftAction { Created, Refined, Distributed, Promoted, Monitored, Iterated, Archived, Repurposed }

public class UserCraftProfile : BaseEntity
{
    public Guid UserId { get; set; }

    [MaxLength(80)]
    public string PrimaryDomain { get; set; } = "content_creation";

    public string[]? FocusDomains { get; set; }
    public JsonDocument? DomainScores { get; set; }
    public int CraftLevel { get; set; } = 1;
    public int TotalCraftPoints { get; set; }
    public int LearningStreakDays { get; set; }
    public DateTime? LastAnalyzedAt { get; set; }
    public DateTime? LastCoachedAt { get; set; }
    public virtual ICollection<UserCraftSkillScore> SkillScores { get; set; } = new List<UserCraftSkillScore>();
}

public class UserCraftSkillScore : BaseEntity
{
    public Guid UserId { get; set; }
    public Guid SkillId { get; set; }
    public decimal Score { get; set; } = 50m;
    public int SampleSize { get; set; }
    public decimal Confidence { get; set; }
    public DateTime LastUpdated { get; set; } = DateTime.UtcNow;
    public JsonDocument? Evidence { get; set; }
    public virtual CraftSkill Skill { get; set; } = null!;
}

public class CraftCoachingSession : BaseEntity
{
    public Guid UserId { get; set; }
    public Guid? ContentId { get; set; }

    [MaxLength(80)]
    public string DomainKey { get; set; } = string.Empty;

    public CoachingTrigger Trigger { get; set; }
    public string Input { get; set; } = string.Empty;
    public string? Context { get; set; }
    public JsonDocument? Output { get; set; }
    public decimal? OverallScore { get; set; }
    public string? Summary { get; set; }
    public DateTime? AppliedAt { get; set; }
    public decimal? AppliedImpact { get; set; }
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

    [MaxLength(80)]
    public string SkillKey { get; set; } = string.Empty;

    public SuggestionKind Kind { get; set; }

    [MaxLength(300)]
    public string Title { get; set; } = string.Empty;

    public string Detail { get; set; } = string.Empty;
    public string? Example { get; set; }
    public int Priority { get; set; } = 50;
    public string[]? MasterExamples { get; set; }
    public string[]? Citations { get; set; }
    public bool Accepted { get; set; }
    public bool Dismissed { get; set; }
    public virtual CraftCoachingSession Session { get; set; } = null!;
}

public enum SuggestionKind { Strength, Improvement, Warning, Reference, Alternative }
