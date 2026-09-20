using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using NuRavenCorpLLM.Server.Entities;

namespace NuRavenCorpLLM.Server.Entities.Ingestion;

public class IngestionJob : BaseEntity
{
    public Guid? ClientSystemId { get; set; }

    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    public IngestionKind Kind { get; set; }
    public IngestionStatus Status { get; set; } = IngestionStatus.Pending;
    public int TotalItems { get; set; }
    public int ProcessedItems { get; set; }
    public int SucceededItems { get; set; }
    public int FailedItems { get; set; }
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }

    [MaxLength(2000)]
    public string? ErrorMessage { get; set; }

    public JsonDocument? Configuration { get; set; }
    public virtual ICollection<IngestionItem> Items { get; set; } = new List<IngestionItem>();
    public virtual ICollection<IngestionError> Errors { get; set; } = new List<IngestionError>();
}

public enum IngestionKind { Web, Document, Feed, Sitemap, Api, Manual }
public enum IngestionStatus { Pending, Running, Completed, Failed, Cancelled, Paused }

public class IngestionSource : BaseEntity
{
    public Guid? ClientSystemId { get; set; }
    public Guid? JobId { get; set; }

    [MaxLength(2000)]
    public string Url { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Title { get; set; }

    public IngestionKind Kind { get; set; }
    public IngestionStatus Status { get; set; } = IngestionStatus.Pending;
    public int Depth { get; set; }
    public int Priority { get; set; } = 100;

    [MaxLength(128)]
    public string? ContentHash { get; set; }

    public DateTime? FetchedAt { get; set; }
    public DateTime? LastCheckedAt { get; set; }
    public DateTime? NextCheckAt { get; set; }
    public string? CronSchedule { get; set; }
    public JsonDocument? Metadata { get; set; }
}

public class IngestionItem : BaseEntity
{
    public Guid JobId { get; set; }
    public Guid? SourceId { get; set; }

    [MaxLength(2000)]
    public string? Url { get; set; }

    [MaxLength(500)]
    public string? Title { get; set; }

    public string? Content { get; set; }

    [MaxLength(128)]
    public string? ContentHash { get; set; }

    [MaxLength(100)]
    public string? MimeType { get; set; }

    public int? SizeBytes { get; set; }
    public int TokenCount { get; set; }
    public IngestionStatus Status { get; set; } = IngestionStatus.Pending;
    public Guid? DocumentId { get; set; }

    [MaxLength(2000)]
    public string? ErrorMessage { get; set; }

    public JsonDocument? Metadata { get; set; }
}

public class IngestionError : BaseEntity
{
    public Guid JobId { get; set; }
    public Guid? ItemId { get; set; }

    [MaxLength(100)]
    public string ErrorKind { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string Message { get; set; } = string.Empty;

    public string? StackTrace { get; set; }
    public JsonDocument? Context { get; set; }
}
