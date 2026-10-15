using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace WiseRavenShare.Server.Core.Entities.Craft;

public class CraftPrinciple : BaseEntity
{
    public Guid CraftDomainId { get; set; }
    public Guid? SkillId { get; set; }

    [MaxLength(300)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string Description { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Example { get; set; }

    [MaxLength(500)]
    public string? CounterExample { get; set; }

    [MaxLength(100)]
    public string? Author { get; set; }

    public PrincipleKind Kind { get; set; } = PrincipleKind.Rule;
    public int Importance { get; set; } = 50;

    public float[]? Embedding { get; set; }

    // Navigation
    public virtual CraftDomain Domain { get; set; } = null!;
}

public enum PrincipleKind { Rule, Heuristic, AntiPattern, BestPractice, Story, Quote }
