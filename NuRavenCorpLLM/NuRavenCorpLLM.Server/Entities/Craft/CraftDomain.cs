// Core/Entities/Craft/CraftDomain.cs
using System.ComponentModel.DataAnnotations;

namespace NuRavenCorpLLM.Entities.Craft;

public class CraftDomain : BaseEntity
{
    [MaxLength(100)]
    public string Key { get; set; } = string.Empty;      // content_creation | journalism | radio | podcast | videography | writing | photography | music_production | community

    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string? Description { get; set; }

    [MaxLength(100)]
    public string? IconEmoji { get; set; }

    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;

    // Navigation
    public virtual ICollection<CraftSkill> Skills { get; set; } = new List<CraftSkill>();
    public virtual ICollection<CraftPrinciple> Principles { get; set; } = new List<CraftPrinciple>();
    public virtual ICollection<CraftSource> Sources { get; set; } = new List<CraftSource>();
    public virtual ICollection<CraftLesson> Lessons { get; set; } = new List<CraftLesson>();
}

public class CraftSkill : BaseEntity
{
    public Guid CraftDomainId { get; set; }

    [MaxLength(100)]
    public string Key { get; set; } = string.Empty;      // hook_writing | sound_design | interview_technique

    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string? Description { get; set; }

    public SkillLevel Difficulty { get; set; } = SkillLevel.Intermediate;

    // How skill is measured from real data
    public string? MeasurementSignal { get; set; }       // e.g. "avg_watch_time_percent > 60"
    public int Weight { get; set; } = 1;

    public Guid? ParentSkillId { get; set; }

    // Navigation
    public virtual CraftDomain Domain { get; set; } = null!;
    public virtual CraftSkill? ParentSkill { get; set; }
    public virtual ICollection<CraftSkill> Children { get; set; } = new List<CraftSkill>();
    public virtual ICollection<UserCraftSkillScore> UserScores { get; set; } = new List<UserCraftSkillScore>();
}

public enum SkillLevel { Beginner, Intermediate, Advanced, Expert, Master }