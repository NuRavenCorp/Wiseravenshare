using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace WiseRavenShare.Server.Core.Entities.Craft;

public class CraftPerformanceMetric : BaseEntity
{
    public Guid UserId { get; set; }
    public Guid CraftDomainId { get; set; }

    [MaxLength(100)]
    public string DomainKey { get; set; } = string.Empty;

    public Guid? PublishedContentId { get; set; }

    [MaxLength(200)]
    public string? ContentTitle { get; set; }

    // Raw metrics
    public decimal? EngagementRate { get; set; }
    public decimal? ViewCount { get; set; }
    public decimal? ShareCount { get; set; }
    public decimal? CommentCount { get; set; }
    public decimal? TimeOnPageSeconds { get; set; }
    public decimal? CompletionRate { get; set; }

    // Derived features
    public JsonDocument? Features { get; set; }

    public DateTime MeasuredAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public virtual User User { get; set; } = null!;
    public virtual CraftDomain Domain { get; set; } = null!;
}

public class CraftPattern : BaseEntity
{
    public Guid CraftDomainId { get; set; }

    [MaxLength(300)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string Description { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Example { get; set; }

    // Quality metrics
    public decimal Confidence { get; set; } = 0.5m;
    public int SampleSize { get; set; }
    public decimal? AverageImpact { get; set; }

    public PatternStatus Status { get; set; } = PatternStatus.Pending;

    // Approval workflow
    public Guid? ApprovedById { get; set; }
    public DateTime? ApprovedAt { get; set; }

    public JsonDocument? RelatedPrinciples { get; set; }
    public JsonDocument? SupportingEvidence { get; set; }

    public float[]? Embedding { get; set; }

    // Navigation
    public virtual CraftDomain Domain { get; set; } = null!;
}

public enum PatternStatus { Pending, Approved, Rejected, Archived }

public class CraftPrincipleRefinement : BaseEntity
{
    public Guid PrincipleId { get; set; }

    [MaxLength(500)]
    public string ProposedTitle { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string? ProposedDescription { get; set; }

    [MaxLength(500)]
    public string? ProposedExample { get; set; }

    public RefinementType Type { get; set; } = RefinementType.Suggestion;

    // Voting
    public int UpvoteCount { get; set; }
    public int DownvoteCount { get; set; }

    public RefinementStatus Status { get; set; } = RefinementStatus.Pending;

    public Guid? ApprovedById { get; set; }
    public DateTime? ApprovedAt { get; set; }

    // Navigation
    public virtual CraftPrinciple Principle { get; set; } = null!;
}

public enum RefinementType { Suggestion, Clarification, Example, Correction }
public enum RefinementStatus { Pending, Approved, Rejected, Archived }
