using System.ComponentModel.DataAnnotations;
using Wiseravenshare.Server.Entities.Crawler;

namespace Wiseravenshare.Server.Services.Crawler;

public class StartCrawlRequest
{
    [Required]
    [Url]
    public string StartUrl { get; set; } = string.Empty;

    public string? JobName { get; set; }
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
}

public class CrawlJobQuery
{
    public Guid JobId { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 100;
}

public class CrawlerOptions
{
    public string DefaultUserAgent { get; set; } = "WiseRavenShare-Crawler/1.0 (+https://wiseravenshare.com/bot)";
    public int RequestTimeoutSeconds { get; set; } = 30;
    public bool StoreHtmlSnapshots { get; set; }
    public int MaxConcurrentRequests { get; set; } = 10;
}

public class PerformanceAnalyzerOptions
{
    public int SlowResponseThresholdMs { get; set; } = 1000;
    public long LargePageSizeBytes { get; set; } = 200_000;
    public int LargeDomThreshold { get; set; } = 3000;
}

public class CrawlReportDto
{
    public Guid JobId { get; set; }
    public string JobName { get; set; } = string.Empty;
    public DateTime GeneratedAt { get; set; }
    public HealthScores Scores { get; set; } = new();
    public int TotalPages { get; set; }
    public int TotalIssues { get; set; }
    public Dictionary<IssueSeverity, int> IssuesBySeverity { get; set; } = new();
    public Dictionary<IssueCategory, int> IssuesByCategory { get; set; } = new();
    public List<TopIssue> TopIssues { get; set; } = [];
    public List<TopPage> TopPagesWithIssues { get; set; } = [];
    public string? ContentType { get; set; }
    public byte[]? RawData { get; set; }
}

public record TopIssue(string Code, string Title, IssueSeverity Severity, IssueCategory Category, int Count);
public record TopPage(string Url, int IssueCount, IssueSeverity MaxSeverity);
