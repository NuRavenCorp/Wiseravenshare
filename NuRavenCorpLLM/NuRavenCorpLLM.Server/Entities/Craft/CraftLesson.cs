using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace NuRavenCorpLLM.Entities.Craft;

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

    // Master works
    public string[]? MasterExamples { get; set; }               // urls / ids
    public string[]? MasterPractitioners { get; set; }

    // Evidence base — insights that shaped this lesson
    public JsonDocument? Evidence { get; set; }

    // Personalized payload
    public string? PersonalizedPrompt { get; set; }

    public string[]? Prerequisites { get; set; }                 // skill keys
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
    public bool Applied { get; set; }                            // did user apply it?
    public decimal? AppliedImpact { get; set; }                  // measured impact
    public DateTime CompletedAt { get; set; }

    public virtual CraftLesson Lesson { get; set; } = null!;
}