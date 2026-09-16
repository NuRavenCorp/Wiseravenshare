using System.Collections.Concurrent;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Wiseravenshare.Server.Entities.Crawler;
using Wiseravenshare.Server.Infrastructure.Data;

namespace Wiseravenshare.Server.Services.Crawler;

public sealed class CrawlerOrchestrator : ICrawlerOrchestrator
{
    private readonly AppDbContext _db;
    private readonly IPageFetcher _fetcher;
    private readonly IHtmlParser _htmlParser;
    private readonly IEnumerable<IPageAnalyzer> _analyzers;
    private readonly IHealthScoreCalculator _healthCalculator;
    private readonly IReportGenerator _reportGenerator;
    private readonly IJavaScriptRenderer _javascriptRenderer;
    private readonly ILogger<CrawlerOrchestrator> _logger;
    private readonly CrawlerOptions _options;
    private static readonly ConcurrentDictionary<Guid, CancellationTokenSource> RunningJobs = new();

    public CrawlerOrchestrator(
        AppDbContext db,
        IPageFetcher fetcher,
        IHtmlParser htmlParser,
        IEnumerable<IPageAnalyzer> analyzers,
        IHealthScoreCalculator healthCalculator,
        IReportGenerator reportGenerator,
        IJavaScriptRenderer javascriptRenderer,
        ILogger<CrawlerOrchestrator> logger,
        IOptions<CrawlerOptions> options)
    {
        _db = db;
        _fetcher = fetcher;
        _htmlParser = htmlParser;
        _analyzers = analyzers;
        _healthCalculator = healthCalculator;
        _reportGenerator = reportGenerator;
        _javascriptRenderer = javascriptRenderer;
        _logger = logger;
        _options = options.Value;
    }

    public async Task<CrawlJob> StartCrawlAsync(StartCrawlRequest request, Guid userId, CancellationToken ct = default)
    {
        await EnsureCrawlerTablesAsync(ct);

        var job = new CrawlJob
        {
            JobName = string.IsNullOrWhiteSpace(request.JobName) ? $"Crawl {DateTime.UtcNow:yyyy-MM-dd HH:mm}" : request.JobName.Trim(),
            StartUrl = request.StartUrl.Trim(),
            Scope = request.Scope,
            MaxPages = Math.Clamp(request.MaxPages, 1, 100_000),
            MaxDepth = Math.Clamp(request.MaxDepth, 0, 64),
            RequestsPerSecond = Math.Clamp(request.RequestsPerSecond, 1, 50),
            RespectRobotsTxt = request.RespectRobotsTxt,
            RenderJavaScript = request.RenderJavaScript,
            CaptureScreenshots = request.CaptureScreenshots,
            FollowExternalLinks = request.FollowExternalLinks,
            IncludePatterns = request.IncludePatterns,
            ExcludePatterns = request.ExcludePatterns,
            CustomUserAgents = request.CustomUserAgents,
            Status = CrawlJobStatus.Pending,
            CreatedById = userId,
            Configuration = JsonDocument.Parse(JsonSerializer.Serialize(request))
        };

        _db.Set<CrawlJob>().Add(job);
        await _db.SaveChangesAsync(ct);

        var cts = new CancellationTokenSource();
        RunningJobs[job.Id] = cts;

        _ = Task.Run(async () =>
        {
            try
            {
                await ExecuteCrawlAsync(job.Id, cts.Token);
            }
            catch (OperationCanceledException)
            {
                await MarkJobCancelledAsync(job.Id);
            }
            catch (InvalidOperationException ex)
            {
                _logger.LogError(ex, "Crawl {JobId} failed", job.Id);
                await MarkJobFailedAsync(job.Id, ex.Message);
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "Crawl {JobId} failed due to HTTP error", job.Id);
                await MarkJobFailedAsync(job.Id, ex.Message);
            }
            finally
            {
                RunningJobs.TryRemove(job.Id, out _);
                cts.Dispose();
            }
        }, CancellationToken.None);

        return job;
    }

    public async Task<CrawlJob> GetJobAsync(Guid jobId, CancellationToken ct = default)
    {
        var job = await _db.Set<CrawlJob>().AsNoTracking().FirstOrDefaultAsync(j => j.Id == jobId, ct);
        return job ?? throw new InvalidOperationException("Crawl job not found.");
    }

    public async Task<IReadOnlyList<CrawlJob>> GetJobsAsync(Guid? userId = null, CancellationToken ct = default)
    {
        var query = _db.Set<CrawlJob>().AsNoTracking().AsQueryable();
        if (userId.HasValue && userId.Value != Guid.Empty)
        {
            query = query.Where(j => j.CreatedById == userId.Value);
        }

        return await query.OrderByDescending(j => j.CreatedAt).ToListAsync(ct);
    }

    public async Task<IReadOnlyList<CrawledPage>> GetPagesAsync(Guid jobId, int page, int pageSize, CancellationToken ct = default)
    {
        var safePage = Math.Max(1, page);
        var safePageSize = Math.Clamp(pageSize, 1, 500);
        return await _db.Set<CrawledPage>()
            .AsNoTracking()
            .Where(p => p.CrawlJobId == jobId)
            .OrderBy(p => p.Depth)
            .ThenBy(p => p.Url)
            .Skip((safePage - 1) * safePageSize)
            .Take(safePageSize)
            .ToListAsync(ct);
    }

    public async Task<CrawledPage?> GetPageAsync(Guid pageId, CancellationToken ct = default)
    {
        return await _db.Set<CrawledPage>()
            .AsNoTracking()
            .Include(page => page.Issues)
            .FirstOrDefaultAsync(page => page.Id == pageId, ct);
    }

    public async Task<IReadOnlyList<CrawlIssue>> GetIssuesAsync(Guid jobId, string? category, string? severity, string? code, int page, int pageSize, CancellationToken ct = default)
    {
        var query = _db.Set<CrawlIssue>().AsNoTracking().Where(i => i.CrawlJobId == jobId);

        if (Enum.TryParse<IssueCategory>(category, true, out var categoryValue))
        {
            query = query.Where(i => i.Category == categoryValue);
        }

        if (Enum.TryParse<IssueSeverity>(severity, true, out var severityValue))
        {
            query = query.Where(i => i.Severity == severityValue);
        }

        if (!string.IsNullOrWhiteSpace(code))
        {
            query = query.Where(i => i.Code == code);
        }

        var safePage = Math.Max(1, page);
        var safePageSize = Math.Clamp(pageSize, 1, 500);
        return await query.OrderByDescending(i => i.Priority)
            .Skip((safePage - 1) * safePageSize)
            .Take(safePageSize)
            .ToListAsync(ct);
    }

    public async Task<IReadOnlyList<CrawlMetric>> GetMetricsAsync(Guid jobId, CancellationToken ct = default)
    {
        return await _db.Set<CrawlMetric>()
            .AsNoTracking()
            .Where(metric => metric.CrawlJobId == jobId)
            .OrderBy(metric => metric.RecordedAt)
            .ToListAsync(ct);
    }

    public Task<CrawlReportDto> GenerateReportAsync(Guid jobId, ReportFormat format, CancellationToken ct = default)
        => _reportGenerator.GenerateAsync(jobId, format, ct);

    public async Task<bool> CancelJobAsync(Guid jobId, CancellationToken ct = default)
    {
        if (RunningJobs.TryGetValue(jobId, out var cts))
        {
            cts.Cancel();
            var job = await _db.Set<CrawlJob>().FirstOrDefaultAsync(j => j.Id == jobId, ct);
            if (job is not null)
            {
                job.Status = CrawlJobStatus.Cancelled;
                job.CompletedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync(ct);
            }

            return true;
        }

        return false;
    }

    public async Task<bool> DeleteJobAsync(Guid jobId, CancellationToken ct = default)
    {
        await CancelJobAsync(jobId, ct);

        var pages = _db.Set<CrawledPage>().Where(p => p.CrawlJobId == jobId);
        var issues = _db.Set<CrawlIssue>().Where(i => i.CrawlJobId == jobId);
        var links = _db.Set<CrawlLink>().Where(l => l.CrawlJobId == jobId);
        var metrics = _db.Set<CrawlMetric>().Where(m => m.CrawlJobId == jobId);
        var reports = _db.Set<CrawlReportRecord>().Where(r => r.CrawlJobId == jobId);
        var jobs = _db.Set<CrawlJob>().Where(j => j.Id == jobId);

        _db.RemoveRange(issues);
        _db.RemoveRange(links);
        _db.RemoveRange(metrics);
        _db.RemoveRange(reports);
        _db.RemoveRange(pages);
        _db.RemoveRange(jobs);
        await _db.SaveChangesAsync(ct);
        return true;
    }

    private async Task ExecuteCrawlAsync(Guid jobId, CancellationToken ct)
    {
        var job = await _db.Set<CrawlJob>().FirstOrDefaultAsync(j => j.Id == jobId, ct)
            ?? throw new InvalidOperationException("Crawl job not found.");

        var sw = Stopwatch.StartNew();
        job.Status = CrawlJobStatus.Running;
        job.StartedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        var visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var discoveredUrls = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var queue = new Queue<(string Url, int Depth)>();
        var robotsRules = await LoadRobotsTxtAsync(job, ct);

        var startUrl = NormalizeUrl(job.StartUrl);
        queue.Enqueue((startUrl, 0));
        discoveredUrls.Add(startUrl);

        while (queue.Count > 0 && !ct.IsCancellationRequested)
        {
            var (url, depth) = queue.Dequeue();

            if (job.PagesCrawled >= job.MaxPages)
            {
                break;
            }

            if (depth > job.MaxDepth || visited.Contains(url))
            {
                continue;
            }

            visited.Add(url);

            if (job.RespectRobotsTxt && !IsAllowedByRobots(url, robotsRules))
            {
                job.PagesSkipped++;
                continue;
            }

            if (!ShouldCrawlUrl(url, job))
            {
                job.PagesSkipped++;
                continue;
            }

            await ProcessPageAsync(job, url, depth, queue, discoveredUrls, ct);
            await _db.SaveChangesAsync(ct);
        }

        await PostProcessAsync(job, ct);
        await ComputeScoresAsync(job, ct);

        sw.Stop();
        if (job.Status == CrawlJobStatus.Running)
        {
            job.Status = CrawlJobStatus.Completed;
            job.CompletedAt = DateTime.UtcNow;
            job.ElapsedMilliseconds = sw.ElapsedMilliseconds;
            job.PagesDiscovered = discoveredUrls.Count;
        }

        await _db.SaveChangesAsync(ct);
    }

    private async Task ProcessPageAsync(
        CrawlJob job,
        string url,
        int depth,
        Queue<(string Url, int Depth)> queue,
        HashSet<string> discoveredUrls,
        CancellationToken ct)
    {
        var fetchResult = await _fetcher.FetchAsync(url, new FetchOptions
        {
            UserAgent = GetNextUserAgent(job),
            Timeout = TimeSpan.FromSeconds(_options.RequestTimeoutSeconds),
            FollowRedirects = true
        }, ct);

        var page = new CrawledPage
        {
            CrawlJobId = job.Id,
            Url = url,
            StatusCode = fetchResult.StatusCode,
            ResponseTimeMs = (int)fetchResult.ElapsedMs,
            ContentSizeBytes = fetchResult.Content?.Length ?? 0,
            ContentType = fetchResult.ContentType,
            Depth = depth,
            Headers = JsonDocument.Parse(JsonSerializer.Serialize(fetchResult.Headers)),
            HtmlSnapshot = _options.StoreHtmlSnapshots ? fetchResult.Content : null
        };

        _db.Set<CrawledPage>().Add(page);
        await _db.SaveChangesAsync(ct);

        if (string.IsNullOrWhiteSpace(fetchResult.Content) || !IsHtmlResponse(fetchResult))
        {
            job.PagesCrawled++;
            if (fetchResult.StatusCode is 0 or >= 400)
            {
                job.PagesFailed++;
            }

            return;
        }

        var parsed = _htmlParser.Parse(fetchResult.Content, url);

        page.Title = parsed.Title;
        page.MetaDescription = parsed.MetaDescription;
        page.CanonicalUrl = parsed.CanonicalUrl;
        page.WordCount = parsed.WordCount;
        page.ImageCount = parsed.Images.Count;
        page.ScriptCount = parsed.Scripts.Count;
        page.StyleSheetCount = parsed.Stylesheets.Count;
        page.H1Count = parsed.Headings.Count(h => h.Level == 1);
        page.H2Count = parsed.Headings.Count(h => h.Level == 2);
        page.H3Count = parsed.Headings.Count(h => h.Level == 3);
        page.HasH1 = page.H1Count > 0;
        page.HasCanonical = !string.IsNullOrWhiteSpace(parsed.CanonicalUrl);
        page.HasViewportMeta = parsed.HasViewportMeta;
        page.HasMetaRobots = !string.IsNullOrWhiteSpace(parsed.MetaRobots);
        page.MetaRobots = parsed.MetaRobots;
        page.HasOpenGraph = parsed.OpenGraphTags.Count > 0;
        page.HasTwitterCard = parsed.TwitterCardTags.Count > 0;
        page.ContentHash = ComputeContentHash(parsed.MainText);
        page.SchemaTypes = parsed.SchemaTypes.ToArray();
        page.IsIndexable = parsed.MetaRobots?.Contains("noindex", StringComparison.OrdinalIgnoreCase) != true;

        if (job.RenderJavaScript && parsed.RequiresJavaScript)
        {
            var rendered = await _javascriptRenderer.RenderAsync(url, ct);
            if (rendered is not null)
            {
                page.WordCount = Math.Max(page.WordCount, rendered.WordCount);
                if (job.CaptureScreenshots)
                {
                    page.ScreenshotUrl = rendered.ScreenshotUrl;
                    page.MobileScreenshotUrl = rendered.MobileScreenshotUrl;
                }
            }
        }

        var analysisContext = new PageAnalysisContext
        {
            Job = job,
            Page = page,
            ParsedHtml = parsed,
            Response = fetchResult
        };

        foreach (var analyzer in _analyzers)
        {
            var analyzerIssues = await analyzer.AnalyzeAsync(analysisContext, ct);
            foreach (var issue in analyzerIssues)
            {
                issue.CrawlJobId = job.Id;
                issue.PageId = page.Id;
                _db.Set<CrawlIssue>().Add(issue);
                job.IssuesFound++;
            }
        }

        foreach (var link in parsed.Links)
        {
            var absoluteUrl = ResolveUrl(url, link.Href);
            if (string.IsNullOrWhiteSpace(absoluteUrl))
            {
                continue;
            }

            var internalLink = IsInternalUrl(absoluteUrl, job.StartUrl);
            _db.Set<CrawlLink>().Add(new CrawlLink
            {
                CrawlJobId = job.Id,
                SourcePageId = page.Id,
                SourceUrl = url,
                TargetUrl = absoluteUrl,
                AnchorText = link.Text,
                IsInternal = internalLink,
                IsNofollow = link.Rel.Contains("nofollow", StringComparison.OrdinalIgnoreCase),
                IsSponsored = link.Rel.Contains("sponsored", StringComparison.OrdinalIgnoreCase),
                IsUgc = link.Rel.Contains("ugc", StringComparison.OrdinalIgnoreCase)
            });

            if (internalLink)
            {
                page.InternalLinkCount++;
                if (discoveredUrls.Add(absoluteUrl))
                {
                    queue.Enqueue((absoluteUrl, depth + 1));
                }
            }
            else
            {
                page.ExternalLinkCount++;
                if (job.FollowExternalLinks && depth < job.MaxDepth && discoveredUrls.Add(absoluteUrl))
                {
                    queue.Enqueue((absoluteUrl, depth + 1));
                }
            }
        }

        job.PagesCrawled++;
        if (fetchResult.StatusCode is 0 or >= 400)
        {
            job.PagesFailed++;
        }
    }

    private async Task PostProcessAsync(CrawlJob job, CancellationToken ct)
    {
        var pages = await _db.Set<CrawledPage>().Where(p => p.CrawlJobId == job.Id).ToListAsync(ct);
        var links = await _db.Set<CrawlLink>().Where(l => l.CrawlJobId == job.Id).ToListAsync(ct);

        var duplicateGroups = pages
            .Where(p => !string.IsNullOrWhiteSpace(p.ContentHash))
            .GroupBy(p => p.ContentHash!, StringComparer.OrdinalIgnoreCase)
            .Where(group => group.Count() > 1)
            .ToList();

        foreach (var duplicateGroup in duplicateGroups)
        {
            var original = duplicateGroup.OrderBy(p => p.Depth).First();
            foreach (var duplicatePage in duplicateGroup.Where(p => p.Id != original.Id))
            {
                duplicatePage.IsDuplicate = true;
                duplicatePage.DuplicateOfPageId = original.Id;
                _db.Set<CrawlIssue>().Add(new CrawlIssue
                {
                    Category = IssueCategory.Content,
                    Type = IssueType.DuplicateContent,
                    Severity = IssueSeverity.Medium,
                    Code = "DUPLICATE_CONTENT",
                    Title = "Duplicate content detected",
                    Description = $"This page has identical content to {original.Url}.",
                    Recommendation = "Canonicalize duplicate pages or differentiate content.",
                    Priority = 60,
                    Evidence = duplicatePage.Url,
                    CrawlJobId = job.Id,
                    PageId = duplicatePage.Id
                });
                job.IssuesFound++;
            }
        }

        var linkTargets = links
            .Where(link => link.IsInternal && !link.IsBroken)
            .Select(link => NormalizeUrl(link.TargetUrl))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        foreach (var page in pages.Where(p => p.StatusCode == 200 && p.Depth > 0))
        {
            if (!linkTargets.Contains(NormalizeUrl(page.Url)))
            {
                _db.Set<CrawlIssue>().Add(new CrawlIssue
                {
                    CrawlJobId = job.Id,
                    PageId = page.Id,
                    Category = IssueCategory.Links,
                    Severity = IssueSeverity.Medium,
                    Type = IssueType.OrphanPage,
                    Code = "ORPHAN_PAGE",
                    Title = "Orphan page detected",
                    Description = "No internal links point to this page.",
                    Recommendation = "Add internal links from relevant pages or remove the orphan page.",
                    Priority = 50
                });
                job.IssuesFound++;
            }
        }
    }

    private async Task ComputeScoresAsync(CrawlJob job, CancellationToken ct)
    {
        var scores = await _healthCalculator.CalculateAsync(job.Id, ct);
        job.OverallHealthScore = scores.Overall;
        job.SeoScore = scores.Seo;
        job.PerformanceScore = scores.Performance;
        job.AccessibilityScore = scores.Accessibility;
        job.SecurityScore = scores.Security;
        job.ContentScore = scores.Content;

        var metrics = new[]
        {
            ("overall_health", scores.Overall, "score"),
            ("seo_score", scores.Seo, "score"),
            ("performance_score", scores.Performance, "score"),
            ("accessibility_score", scores.Accessibility, "score"),
            ("security_score", scores.Security, "score"),
            ("content_score", scores.Content, "score"),
            ("pages_crawled", (decimal)job.PagesCrawled, "count"),
            ("issues_found", (decimal)job.IssuesFound, "count"),
            ("avg_response_time", scores.AvgResponseTimeMs, "ms")
        };

        foreach (var (key, value, unit) in metrics)
        {
            _db.Set<CrawlMetric>().Add(new CrawlMetric
            {
                CrawlJobId = job.Id,
                MetricKey = key,
                Value = value,
                Unit = unit,
                Category = "summary",
                RecordedAt = DateTime.UtcNow
            });
        }
    }

    private async Task<RobotsRules> LoadRobotsTxtAsync(CrawlJob job, CancellationToken ct)
    {
        if (!job.RespectRobotsTxt)
        {
            return RobotsRules.Parse(string.Empty);
        }

        if (!Uri.TryCreate(job.StartUrl, UriKind.Absolute, out var uri))
        {
            return RobotsRules.Parse(string.Empty);
        }

        var robotsUrl = $"{uri.Scheme}://{uri.Authority}/robots.txt";
        var response = await _fetcher.FetchAsync(robotsUrl, new FetchOptions
        {
            Timeout = TimeSpan.FromSeconds(5),
            UserAgent = _options.DefaultUserAgent
        }, ct);

        return RobotsRules.Parse(response.Content ?? string.Empty);
    }

    private bool IsAllowedByRobots(string url, RobotsRules rules)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
        {
            return true;
        }

        return rules.IsAllowed(uri.AbsolutePath, _options.DefaultUserAgent);
    }

    private static bool ShouldCrawlUrl(string url, CrawlJob job)
    {
        if (job.IncludePatterns?.Length > 0 &&
            !job.IncludePatterns.Any(pattern => url.Contains(pattern, StringComparison.OrdinalIgnoreCase)))
        {
            return false;
        }

        if (job.ExcludePatterns?.Any(pattern => url.Contains(pattern, StringComparison.OrdinalIgnoreCase)) == true)
        {
            return false;
        }

        var extension = Path.GetExtension(url).ToLowerInvariant();
        var skippedExtensions = new[]
        {
            ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".css", ".js", ".woff", ".woff2", ".ttf",
            ".mp4", ".mp3", ".wav", ".zip", ".rar", ".7z", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"
        };
        return !skippedExtensions.Contains(extension);
    }

    private string GetNextUserAgent(CrawlJob job)
    {
        if (job.CustomUserAgents?.Length > 0)
        {
            return job.CustomUserAgents[Random.Shared.Next(job.CustomUserAgents.Length)];
        }

        return _options.DefaultUserAgent;
    }

    private static bool IsInternalUrl(string url, string rootUrl)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var linkUri))
        {
            return false;
        }

        if (!Uri.TryCreate(rootUrl, UriKind.Absolute, out var rootUri))
        {
            return false;
        }

        return string.Equals(linkUri.Host, rootUri.Host, StringComparison.OrdinalIgnoreCase);
    }

    private static string NormalizeUrl(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
        {
            return url.ToLowerInvariant();
        }

        var path = uri.AbsolutePath.TrimEnd('/');
        if (string.IsNullOrWhiteSpace(path))
        {
            path = "/";
        }

        return $"{uri.Scheme}://{uri.Host}{(uri.IsDefaultPort ? "" : ":" + uri.Port)}{path}{uri.Query}".ToLowerInvariant();
    }

    private static string? ResolveUrl(string baseUrl, string href)
    {
        if (string.IsNullOrWhiteSpace(href))
        {
            return null;
        }

        if (href.StartsWith('#') || href.StartsWith("mailto:", StringComparison.OrdinalIgnoreCase) ||
            href.StartsWith("tel:", StringComparison.OrdinalIgnoreCase) ||
            href.StartsWith("javascript:", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        if (!Uri.TryCreate(new Uri(baseUrl), href, out var uri))
        {
            return null;
        }

        return uri.ToString();
    }

    private static bool IsHtmlResponse(FetchResult response)
        => response.ContentType?.Contains("html", StringComparison.OrdinalIgnoreCase) == true;

    private static string ComputeContentHash(string content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return string.Empty;
        }

        var normalized = System.Text.RegularExpressions.Regex.Replace(content.ToLowerInvariant(), @"\s+", " ").Trim();
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(normalized));
        return Convert.ToHexString(hash);
    }

    private async Task MarkJobFailedAsync(Guid jobId, string error)
    {
        var job = await _db.Set<CrawlJob>().FirstOrDefaultAsync(j => j.Id == jobId);
        if (job is null)
        {
            return;
        }

        job.Status = CrawlJobStatus.Failed;
        job.CompletedAt = DateTime.UtcNow;
        job.Summary = JsonDocument.Parse(JsonSerializer.Serialize(new { error }));
        await _db.SaveChangesAsync();
    }

    private async Task MarkJobCancelledAsync(Guid jobId)
    {
        var job = await _db.Set<CrawlJob>().FirstOrDefaultAsync(j => j.Id == jobId);
        if (job is null)
        {
            return;
        }

        job.Status = CrawlJobStatus.Cancelled;
        job.CompletedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
    }

    private Task EnsureCrawlerTablesAsync(CancellationToken ct)
    {
        // Crawler tables are now managed by EF migrations (FixCrawlerTableSchema).
        // This method is retained for backwards compatibility but is a no-op.
        return Task.CompletedTask;
    }
}
