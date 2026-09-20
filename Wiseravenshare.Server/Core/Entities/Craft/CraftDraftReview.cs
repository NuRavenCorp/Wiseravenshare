using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace WiseRavenShare.Server.Core.Entities.Craft;

public class CraftDraftReview : BaseEntity
{
    public Guid UserId { get; set; }
    public Guid CraftDomainId { get; set; }

    [MaxLength(100)]
    public string DomainKey { get; set; } = string.Empty;

    [MaxLength(50)]
    public string ContentType { get; set; } = "article";

    public string DraftContent { get; set; } = string.Empty;
    public string? Context { get; set; }

    public decimal? OverallScore { get; set; }

    public JsonDocument? CoachingOutput { get; set; }

    public int? WordCount { get; set; }
    public DateTime ReviewedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public virtual User User { get; set; } = null!;
    public virtual CraftDomain Domain { get; set; } = null!;
    public virtual ICollection<CraftFeedback> Feedback { get; set; } = new List<CraftFeedback>();
}

public class CraftFeedback : BaseEntity
{
    public Guid ReviewId { get; set; }

    [MaxLength(100)]
    public string PrincipleKey { get; set; } = string.Empty;

    [MaxLength(200)]
    public string PrincipleTitle { get; set; } = string.Empty;

    [MaxLength(500)]
    public string Feedback { get; set; } = string.Empty;

    [MaxLength(300)]
    public string? Example { get; set; }

    public FeedbackSeverity Severity { get; set; } = FeedbackSeverity.Medium;

    // Navigation
    public virtual CraftDraftReview Review { get; set; } = null!;
}

public enum FeedbackSeverity { Low, Medium, High, Critical }

public class CraftLesson : BaseEntity
{
    public Guid CraftDomainId { get; set; }
    public Guid? SkillId { get; set; }

    [MaxLength(300)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(500)]
    public string Summary { get; set; } = string.Empty;

    public string Content { get; set; } = string.Empty;

    public LessonFormat Format { get; set; } = LessonFormat.Text;
    public SkillLevel Level { get; set; } = SkillLevel.Beginner;

    public int EstimatedMinutes { get; set; } = 5;
    public int OrderIndex { get; set; }

    public string[]? MasterExamples { get; set; }
    public string[]? MasterPractitioners { get; set; }

    public JsonDocument? Evidence { get; set; }

    public string[]? Prerequisites { get; set; }
    public string[]? RelatedSkills { get; set; }

    public float[]? Embedding { get; set; }

    // Navigation
    public virtual CraftDomain Domain { get; set; } = null!;
    public virtual CraftSkill? Skill { get; set; }
    public virtual ICollection<CraftLessonCompletion> Completions { get; set; } = new List<CraftLessonCompletion>();
}

public enum LessonFormat { Text, Video, Audio, Interactive, Checklist, MasterClass, CaseStudy }

public class CraftLessonCompletion : BaseEntity
{
    public Guid LessonId { get; set; }
    public Guid UserId { get; set; }

    public decimal? Score { get; set; }
    public bool Applied { get; set; }
    public decimal? AppliedImpact { get; set; }
    public DateTime CompletedAt { get; set; }

    // Navigation
    public virtual CraftLesson Lesson { get; set; } = null!;
}
