// Wiseravenshare.Server/Entities/Currency/Badge.cs
using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace Wiseravenshare.Server.Entities.Currency;

public class Badge : BaseEntity
{
    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;
    [MaxLength(500)]
    public string Description { get; set; } = string.Empty;
    [MaxLength(200)]
    public string IconUrl { get; set; } = string.Empty;

    public BadgeType Type { get; set; }
    public BadgeRarity Rarity { get; set; }
    public BadgeCategory Category { get; set; }

    // Multipliers — badges come FIRST, then currency (Voter-Alliance pattern)
    public decimal ValueMultiplier { get; set; } = 1.0m;
    public decimal WorkMultiplier { get; set; } = 1.0m;
    public decimal TrustMultiplier { get; set; } = 1.0m;
    public decimal StakingMultiplier { get; set; } = 1.0m;

    public int MinimumWorkHours { get; set; }
    public decimal MintingCost { get; set; }
    public bool IsSoulbound { get; set; }
    public bool IsTradeable { get; set; }

    public int TotalSupply { get; set; } = 1000;
    public int CurrentSupply { get; set; }
    public decimal MarketValue { get; set; }

    public JsonDocument? Requirements { get; set; }
    public JsonDocument? SkillsRequired { get; set; }

    public virtual ICollection<UserBadge> UserBadges { get; set; } = new List<UserBadge>();
    public virtual ICollection<BadgeEvolution> Evolutions { get; set; } = new List<BadgeEvolution>();
}

public enum BadgeType
{
    Achievement, Skill, Reputation, Contributor, Rare, Event, Seasonal, Evolution
}

public enum BadgeRarity
{
    Common = 10000, Uncommon = 5000, Rare = 1000, Epic = 100, Legendary = 10, Mythic = 1
}

public enum BadgeCategory
{
    ContentCreation, TruthVerification, CommunityBuilding, TechnicalSkills,
    Leadership, Innovation, Sustainability, Education, Mentorship, Collaboration
}

public class UserBadge : BaseEntity
{
    public Guid UserId { get; set; }
    public Guid BadgeId { get; set; }
    public DateTime EarnedAt { get; set; }
    public bool IsActive { get; set; } = true;
    public decimal MultiplierBonus { get; set; } = 1.0m;
    public JsonDocument? Metadata { get; set; }
    public string? ProofUrl { get; set; }

    public virtual User User { get; set; } = null!;
    public virtual Badge Badge { get; set; } = null!;
}

public class BadgeEvolution : BaseEntity
{
    public Guid SourceBadgeId { get; set; }
    public Guid TargetBadgeId { get; set; }
    [MaxLength(300)]
    public string EvolutionPath { get; set; } = string.Empty;
    public decimal WorkHoursRequired { get; set; }
    public decimal WSCRequired { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public virtual Badge SourceBadge { get; set; } = null!;
    public virtual Badge TargetBadge { get; set; } = null!;
}

public class BadgeRequirements
{
    public List<Guid> PrerequisiteBadges { get; set; } = new();
    public List<string> RequiredSkills { get; set; } = new();
    public int? MinimumPosts { get; set; }
    public int? MinimumVerifications { get; set; }
    public int? MinimumFollowers { get; set; }
}
