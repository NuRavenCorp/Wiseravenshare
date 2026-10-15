using Wiseravenshare.Server.Entities.Crawler;

namespace Wiseravenshare.Server.Services.Crawler;

public interface ICrawlerOrchestrator
{
    Task<CrawlJob> StartCrawlAsync(StartCrawlRequest request, Guid userId, CancellationToken ct = default);
    Task<CrawlJob> GetJobAsync(Guid jobId, CancellationToken ct = default);
    Task<IReadOnlyList<CrawlJob>> GetJobsAsync(Guid? userId = null, CancellationToken ct = default);
    Task<IReadOnlyList<CrawledPage>> GetPagesAsync(Guid jobId, int page, int pageSize, CancellationToken ct = default);
    Task<CrawledPage?> GetPageAsync(Guid pageId, CancellationToken ct = default);
    Task<IReadOnlyList<CrawlIssue>> GetIssuesAsync(Guid jobId, string? category, string? severity, string? code, int page, int pageSize, CancellationToken ct = default);
    Task<IReadOnlyList<CrawlMetric>> GetMetricsAsync(Guid jobId, CancellationToken ct = default);
    Task<CrawlReportDto> GenerateReportAsync(Guid jobId, ReportFormat format, CancellationToken ct = default);
    Task<bool> CancelJobAsync(Guid jobId, CancellationToken ct = default);
    Task<bool> DeleteJobAsync(Guid jobId, CancellationToken ct = default);
}
