// Core/Entities/Craft/UserCraftProfile.cs
using Microsoft.Azure.Documents;
using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace NuRavenCorpLLM.Entities.Craft;

public class UserCraftProfile : BaseEntity
{
    public Guid UserId { get; set; }

    // Primary focus
    [MaxLength(100)]
    public string PrimaryDomain { get; set; } = "content_creation";

    public string[] ? FocusDomains { get; set; }

    // Aggregated scores per domain (0-100)
    public JsonDocument ? DomainScores { get; set; }

    // Derived metrics
    public int CraftLevel { get; set; }                         // 1-10
    public int TotalCraftPoints { get; set; }
    public int LearningStreakDays { get; set; }

    public DateTime ? LastAnalyzedAt { get; set; }
    public DateTime ? LastCoachedAt { get; set; }

    // Navigation
    public virtual User User { get; set; } = null!;
    public virtual ICollection < UserCraftSkillScore > SkillScores { get; set; } = new List < UserCraftSkillScore > ();
    public virtual ICollection < CraftCoachingSession > CoachingSessions { get; set; } = new List < CraftCoachingSession > ();
}

public class UserCraftSkillScore : BaseEntity
{
    public Guid UserId { get; set; }
    public Guid SkillId { get; set; }

    public decimal Score { get; set; }                          // 0-100
    public int SampleSize { get; set; }                          // how many observations
    public decimal Confidence { get; set; }                      // 0-1
    public DateTime LastUpdated { get; set; }

    public JsonDocument ? Evidence { get; set; }

    // Navigation
    public virtual CraftSkill Skill { get; set; } = null!;
    public virtual User User { get; set; } = null!;
}