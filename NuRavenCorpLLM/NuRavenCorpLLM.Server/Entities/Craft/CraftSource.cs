//Entities/Craft/CraftSource.cs
using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace NuRavenCorpLLM.Entities.Craft;

public class CraftSource : BaseEntity
{
    public Guid CraftDomainId { get; set; }

    [MaxLength(500)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(200)]
    public string? Author { get; set; }

    public SourceKind Kind { get; set; }                 // book | podcast | video | article | course | interview
    public SourceStatus Status { get; set; } = SourceStatus.Queued;

    [MaxLength(2000)]
    public string? Url { get; set; }

    public string? RawContent { get; set; }              // transcript / full text
    public int ContentLength { get; set; }

    public DateTime? IngestedAt { get; set; }
    public string? ErrorMessage { get; set; }

    public JsonDocument? Metadata { get; set; }

    // Navigation
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

    // Navigation
    public virtual CraftSource Source { get; set; } = null!;
}