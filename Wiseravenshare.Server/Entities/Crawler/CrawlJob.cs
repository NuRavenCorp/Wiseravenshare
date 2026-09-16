using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json;

namespace Wiseravenshare.Server.Entities.Crawler;

[Table("crawl_jobs")]
public class CrawlJob : BaseEntity
{
    [MaxLength(500)]
    public string StartUrl { get; set; } = string.Empty;

    [MaxLength(100)]
    public string JobName { get; set; } = string.Empty;

    public CrawlJobStatus Status { get; set; } = CrawlJobStatus.Pending;
    public CrawlScope Scope { get; set; } = CrawlScope.FullSite;

    public int MaxPages { get; set; } = 5000;
    public int MaxDepth { get; set; } = 10;
    public int RequestsPerSecond { get; set; } = 5;
    public bool RespectRobotsTxt { get; set; } = true;
    public bool RenderJavaScript { get; set; } = true;
    public bool CaptureScreenshots { get; set; }
    public bool FollowExternalLinks { get; set; }
    public string[]? IncludePatterns { get; set; }
    public string[]? ExcludePatterns { get; set; }
    public string[]? CustomUserAgents { get; set; }

    public int PagesDiscovered { get; set; }
    public int PagesCrawled { get; set; }
    public int PagesFailed { get; set; }
    public int PagesSkipped { get; set; }
    public int IssuesFound { get; set; }

    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public long ElapsedMilliseconds { get; set; }

    public decimal OverallHealthScore { get; set; }
    public decimal SeoScore { get; set; }
    public decimal PerformanceScore { get; set; }
    public decimal AccessibilityScore { get; set; }
    public decimal SecurityScore { get; set; }
    public decimal ContentScore { get; set; }

    [Column(TypeName = "jsonb")]
    public JsonDocument? Configuration { get; set; }

    [Column(TypeName = "jsonb")]
    public JsonDocument? Summary { get; set; }

    public Guid CreatedById { get; set; }

    public virtual ICollection<CrawledPage> Pages { get; set; } = new List<CrawledPage>();
    public virtual ICollection<CrawlIssue> Issues { get; set; } = new List<CrawlIssue>();
}
