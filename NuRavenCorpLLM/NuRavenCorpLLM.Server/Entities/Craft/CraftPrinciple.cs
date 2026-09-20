//Entities/Craft/CraftPrinciple.cs
using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace NuRavenCorpLLM.Entities.Craft;

public class CraftPrinciple : BaseEntity
{
    public Guid CraftDomainId { get; set; }
    public Guid? SkillId { get; set; }

    [MaxLength(300)]
    public string Title { get; set; } = string.Empty;

    public string Body { get; set; } = string.Empty;                // the actual wisdom
    public string? Example { get; set; }
    public string? CounterExample { get; set; }

    [MaxLength(100)]
    public string? Author { get; set; }                              // attribution

    [MaxLength(500)]
    public string? SourceUrl { get; set; }

    public PrincipleKind Kind { get; set; } = PrincipleKind.Rule;
    public int Importance { get; set; } = 50;                        // 0-100

    public JsonDocument? Tags { get; set; }
    public float[]? Embedding { get; set; }

    // Navigation
    public virtual CraftDomain Domain { get; set; } = null!;
}

public enum PrincipleKind { Rule, Heuristic, AntiPattern, BestPractice, Story, Quote }