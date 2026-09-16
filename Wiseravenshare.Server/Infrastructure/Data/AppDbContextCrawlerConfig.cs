using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities.Crawler;

namespace Wiseravenshare.Server.Infrastructure.Data;

public static class AppDbContextCrawlerConfig
{
    public static void ConfigureCrawler(this ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<CrawlJob>(entity =>
        {
            entity.HasIndex(job => new { job.CreatedById, job.CreatedAt });
            entity.Property(job => job.IncludePatterns).HasColumnType("text[]");
            entity.Property(job => job.ExcludePatterns).HasColumnType("text[]");
            entity.Property(job => job.CustomUserAgents).HasColumnType("text[]");
        });

        modelBuilder.Entity<CrawledPage>(entity =>
        {
            entity.HasIndex(page => new { page.CrawlJobId, page.Url }).IsUnique();
            entity.Property(page => page.SchemaTypes).HasColumnType("text[]");
            entity.Property(page => page.ContentHash).HasMaxLength(128);
        });

        modelBuilder.Entity<CrawlIssue>(entity =>
        {
            entity.HasIndex(issue => new { issue.CrawlJobId, issue.Category, issue.Severity });
            entity.Property(issue => issue.Tags).HasColumnType("text[]");
        });

        modelBuilder.Entity<CrawlLink>(entity =>
        {
            entity.HasIndex(link => new { link.CrawlJobId, link.SourceUrl });
            entity.HasIndex(link => new { link.CrawlJobId, link.TargetUrl });
        });

        modelBuilder.Entity<CrawlMetric>(entity =>
        {
            entity.HasIndex(metric => new { metric.CrawlJobId, metric.MetricKey, metric.RecordedAt });
        });

        modelBuilder.Entity<CrawlReportRecord>(entity =>
        {
            entity.HasIndex(report => new { report.CrawlJobId, report.GeneratedAt });
        });
    }
}
