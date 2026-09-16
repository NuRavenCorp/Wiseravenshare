using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities.Crawler;
using Wiseravenshare.Server.Infrastructure.Data;

namespace Wiseravenshare.Server.Services.Crawler;

public interface IHealthScoreCalculator
{
    Task<HealthScores> CalculateAsync(Guid jobId, CancellationToken ct = default);
}

public sealed class HealthScoreCalculator : IHealthScoreCalculator
{
    private readonly AppDbContext _db;

    public HealthScoreCalculator(AppDbContext db)
    {
        _db = db;
    }

    public async Task<HealthScores> CalculateAsync(Guid jobId, CancellationToken ct = default)
    {
        var pages = await _db.Set<CrawledPage>().AsNoTracking().Where(p => p.CrawlJobId == jobId).ToListAsync(ct);
        var issues = await _db.Set<CrawlIssue>().AsNoTracking().Where(i => i.CrawlJobId == jobId).ToListAsync(ct);

        if (pages.Count == 0)
        {
            return new HealthScores();
        }

        var scores = new HealthScores
        {
            Seo = ComputeCategoryScore(issues, IssueCategory.Seo, pages.Count),
            Performance = ComputeCategoryScore(issues, IssueCategory.Performance, pages.Count),
            Accessibility = ComputeCategoryScore(issues, IssueCategory.Accessibility, pages.Count),
            Security = ComputeCategoryScore(issues, IssueCategory.Security, pages.Count),
            Content = ComputeCategoryScore(issues, IssueCategory.Content, pages.Count),
            Links = ComputeCategoryScore(issues, IssueCategory.Links, pages.Count),
            AvgResponseTimeMs = (decimal)pages.Average(p => p.ResponseTimeMs)
        };

        scores.Overall = Math.Round(
            scores.Seo * 0.20m +
            scores.Performance * 0.20m +
            scores.Accessibility * 0.15m +
            scores.Security * 0.20m +
            scores.Content * 0.15m +
            scores.Links * 0.10m, 2);

        return scores;
    }

    private static decimal ComputeCategoryScore(IEnumerable<CrawlIssue> issues, IssueCategory category, int pageCount)
    {
        var categoryIssues = issues.Where(i => i.Category == category).ToList();
        if (categoryIssues.Count == 0)
        {
            return 100m;
        }

        var penalty = categoryIssues.Sum(issue => issue.Severity switch
        {
            IssueSeverity.Critical => 10m,
            IssueSeverity.High => 5m,
            IssueSeverity.Medium => 2m,
            IssueSeverity.Low => 0.5m,
            _ => 0.1m
        });

        var normalized = penalty / Math.Max(1, pageCount) * 10m;
        return Math.Max(0m, Math.Round(100m - normalized, 2));
    }
}
