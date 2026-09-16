using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json;

namespace Wiseravenshare.Server.Entities.Crawler;

[Table("crawled_pages")]
public class CrawledPage : BaseEntity
{
    public Guid CrawlJobId { get; set; }

    [MaxLength(2000)]
    public string Url { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? CanonicalUrl { get; set; }

    [MaxLength(200)]
    public string? Title { get; set; }

    [MaxLength(500)]
    public string? MetaDescription { get; set; }

    public int StatusCode { get; set; }
    public int ResponseTimeMs { get; set; }
    public long ContentSizeBytes { get; set; }

    [MaxLength(50)]
    public string? ContentType { get; set; }

    public int Depth { get; set; }
    public int WordCount { get; set; }
    public int ImageCount { get; set; }
    public int InternalLinkCount { get; set; }
    public int ExternalLinkCount { get; set; }
    public int ScriptCount { get; set; }
    public int StyleSheetCount { get; set; }

    public bool HasH1 { get; set; }
    public int H1Count { get; set; }
    public int H2Count { get; set; }
    public int H3Count { get; set; }
    public bool HasMetaRobots { get; set; }
    public string? MetaRobots { get; set; }
    public bool HasCanonical { get; set; }
    public bool HasViewportMeta { get; set; }
    public bool HasOpenGraph { get; set; }
    public bool HasTwitterCard { get; set; }

    public int? FirstContentfulPaintMs { get; set; }
    public int? LargestContentfulPaintMs { get; set; }
    public int? TimeToInteractiveMs { get; set; }
    public int? TotalBlockingTimeMs { get; set; }
    public decimal? CumulativeLayoutShift { get; set; }
    public int? PageSpeedScore { get; set; }

    public int? AccessibilityScore { get; set; }
    public int AxeViolations { get; set; }

    public string? ContentHash { get; set; }
    public bool IsIndexable { get; set; } = true;
    public bool IsDuplicate { get; set; }
    public Guid? DuplicateOfPageId { get; set; }
    public string[]? SchemaTypes { get; set; }

    public string? ScreenshotUrl { get; set; }
    public string? MobileScreenshotUrl { get; set; }
    public string? HtmlSnapshot { get; set; }

    [Column(TypeName = "jsonb")]
    public JsonDocument? Headers { get; set; }

    [Column(TypeName = "jsonb")]
    public JsonDocument? SeoData { get; set; }

    [Column(TypeName = "jsonb")]
    public JsonDocument? PerformanceData { get; set; }

    [Column(TypeName = "jsonb")]
    public JsonDocument? AccessibilityData { get; set; }

    public virtual CrawlJob CrawlJob { get; set; } = null!;
    public virtual ICollection<CrawlIssue> Issues { get; set; } = new List<CrawlIssue>();
    public virtual ICollection<CrawlLink> OutgoingLinks { get; set; } = new List<CrawlLink>();
}
