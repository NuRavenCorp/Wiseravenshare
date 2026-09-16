using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json;

namespace Wiseravenshare.Server.Entities.Crawler;

[Table("crawl_issues")]
public class CrawlIssue : BaseEntity
{
    public Guid CrawlJobId { get; set; }
    public Guid? PageId { get; set; }

    public IssueCategory Category { get; set; }
    public IssueSeverity Severity { get; set; }
    public IssueType Type { get; set; }

    [MaxLength(200)]
    public string Code { get; set; } = string.Empty;

    [MaxLength(500)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string Description { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string? Recommendation { get; set; }

    [MaxLength(2000)]
    public string? Evidence { get; set; }

    public string[]? Tags { get; set; }

    [Column(TypeName = "jsonb")]
    public JsonDocument? Context { get; set; }

    public bool IsFixed { get; set; }
    public DateTime? FixedAt { get; set; }
    public Guid? FixedById { get; set; }
    public int Priority { get; set; }

    public virtual CrawlJob CrawlJob { get; set; } = null!;
    public virtual CrawledPage? Page { get; set; }
}
