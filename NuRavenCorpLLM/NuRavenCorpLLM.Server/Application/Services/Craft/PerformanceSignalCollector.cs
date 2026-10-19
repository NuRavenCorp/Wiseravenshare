// Application/Services/Craft/PerformanceSignalCollector.cs
namespace NuRavenCorpLLM.Application.Services.Craft;

public interface IPerformanceSignalCollector
{
    Task<PerformanceMetrics> CollectAsync(Guid contentId, CancellationToken ct = default);
}

public record PerformanceMetrics(
    int Views,
    int Likes,
    int Comments,
    int Shares,
    int Bookmarks,
    double EngagementRate,
    double? WatchThroughPercent,
    double? AvgReadTimeSec);

public class PerformanceSignalCollector : IPerformanceSignalCollector
{
    private readonly IPostAnalyticsRepository _analytics;
    private readonly IVideoRepository _videos;

    public PerformanceSignalCollector(IPostAnalyticsRepository analytics, IVideoRepository videos)
    {
        _analytics = analytics; _videos = videos;
    }

    public async Task<PerformanceMetrics> CollectAsync(Guid contentId, CancellationToken ct = default)
    {
        var a = await _analytics.GetByContentAsync(contentId);
        var views = a?.Views ?? 0;
        var interactions = (a?.Likes ?? 0) + (a?.Comments ?? 0) + (a?.Reposts ?? 0) + (a?.Shares ?? 0);
        var engagement = views > 0 ? (double)interactions / views * 100 : 0;

        return new PerformanceMetrics(
            views,
            a?.Likes ?? 0,
            a?.Comments ?? 0,
            a?.Shares ?? 0,
            a?.Reposts ?? 0,
            engagement,
            null,
            a?.AvgTimeSpent
        );
    }
}

public interface IPostAnalyticsRepository
{
    Guid ContentId { get; }

    Task<PostAnalytics?> GetByContentAsync(Guid contentId, CancellationToken ct = default);
}

public class PostAnalytics
{
    public int Views { get; set; }
    public int Likes { get; set; }
    public int Comments { get; set; }
    public int Reposts { get; set; }
    public int Shares { get; set; }
    public double? AvgTimeSpent { get; set; }
}

public interface IVideoRepository
{
    Task GetByIdAsync(Guid contentId);
}