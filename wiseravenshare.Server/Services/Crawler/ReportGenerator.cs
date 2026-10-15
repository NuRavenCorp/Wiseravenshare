using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities.Crawler;
using Wiseravenshare.Server.Infrastructure.Data;

namespace Wiseravenshare.Server.Services.Crawler;

public interface IReportGenerator
{
    Task<CrawlReportDto> GenerateAsync(Guid jobId, ReportFormat format, CancellationToken ct = default);
}

public sealed class ReportGenerator : IReportGenerator
{
    private readonly AppDbContext _db;
    private readonly IHealthScoreCalculator _healthScoreCalculator;

    public ReportGenerator(AppDbContext db, IHealthScoreCalculator healthScoreCalculator)
    {
        _db = db;
        _healthScoreCalculator = healthScoreCalculator;
    }

    public async Task<CrawlReportDto> GenerateAsync(Guid jobId, ReportFormat format, CancellationToken ct = default)
    {
        var job = await _db.Set<CrawlJob>().AsNoTracking().FirstOrDefaultAsync(j => j.Id == jobId, ct);
        if (job is null)
        {
            throw new InvalidOperationException("Crawl job not found.");
        }

        var pages = await _db.Set<CrawledPage>().AsNoTracking().Where(p => p.CrawlJobId == jobId).ToListAsync(ct);
        var issues = await _db.Set<CrawlIssue>().AsNoTracking().Where(i => i.CrawlJobId == jobId).ToListAsync(ct);
        var scores = await _healthScoreCalculator.CalculateAsync(jobId, ct);

        var report = new CrawlReportDto
        {
            JobId = jobId,
            JobName = job.JobName,
            GeneratedAt = DateTime.UtcNow,
            Scores = scores,
            TotalPages = pages.Count,
            TotalIssues = issues.Count,
            IssuesBySeverity = issues.GroupBy(i => i.Severity).ToDictionary(g => g.Key, g => g.Count()),
            IssuesByCategory = issues.GroupBy(i => i.Category).ToDictionary(g => g.Key, g => g.Count()),
            TopIssues = issues.GroupBy(i => i.Code)
                .Select(g => new TopIssue(g.Key, g.First().Title, g.First().Severity, g.First().Category, g.Count()))
                .OrderByDescending(i => i.Count)
                .Take(20)
                .ToList(),
            TopPagesWithIssues = pages
                .Select(p => new TopPage(
                    p.Url,
                    issues.Count(i => i.PageId == p.Id),
                    issues.Where(i => i.PageId == p.Id).OrderByDescending(i => i.Severity).Select(i => i.Severity).FirstOrDefault()))
                .OrderByDescending(p => p.IssueCount)
                .Take(20)
                .ToList()
        };

        if (format == ReportFormat.Json)
        {
            report.ContentType = "application/json";
            report.RawData = JsonSerializer.SerializeToUtf8Bytes(report);
            return report;
        }

        if (format == ReportFormat.Csv)
        {
            report.ContentType = "text/csv";
            report.RawData = BuildCsv(pages, issues);
            return report;
        }

        report.ContentType = "application/json";
        report.RawData = JsonSerializer.SerializeToUtf8Bytes(report);
        return report;
    }

    private static byte[] BuildCsv(IEnumerable<CrawledPage> pages, IEnumerable<CrawlIssue> issues)
    {
        var pageMap = pages.ToDictionary(p => p.Id, p => p.Url);
        var sb = new StringBuilder();
        sb.AppendLine("Type,Url,Code,Category,Severity,Title");

        foreach (var issue in issues)
        {
            pageMap.TryGetValue(issue.PageId ?? Guid.Empty, out var pageUrl);
            sb.AppendLine($"Issue,{Escape(pageUrl)},{Escape(issue.Code)},{issue.Category},{issue.Severity},{Escape(issue.Title)}");
        }

        return Encoding.UTF8.GetBytes(sb.ToString());
    }

    private static string Escape(string? value)
        => "\"" + (value ?? string.Empty).Replace("\"", "\"\"") + "\"";
}
