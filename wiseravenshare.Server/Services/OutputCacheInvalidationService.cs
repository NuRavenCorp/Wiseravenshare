using Microsoft.AspNetCore.OutputCaching;

namespace Wiseravenshare.Server.Services;

public sealed class OutputCacheInvalidationService
{
    private readonly IOutputCacheStore _outputCacheStore;
    private readonly PerformanceMetricsService _metricsService;
    private readonly ILogger<OutputCacheInvalidationService> _logger;

    public OutputCacheInvalidationService(
        IOutputCacheStore outputCacheStore,
        PerformanceMetricsService metricsService,
        ILogger<OutputCacheInvalidationService> logger)
    {
        _outputCacheStore = outputCacheStore;
        _metricsService = metricsService;
        _logger = logger;
    }

    public Task InvalidateFeedAsync(CancellationToken cancellationToken = default)
    {
        return InvalidateTagAsync("feed", cancellationToken);
    }

    public Task InvalidateMarketAsync(CancellationToken cancellationToken = default)
    {
        return InvalidateTagAsync("market", cancellationToken);
    }

    public Task InvalidateEvolutionAsync(CancellationToken cancellationToken = default)
    {
        return InvalidateTagAsync("evolution", cancellationToken);
    }

    public async Task InvalidateTagAsync(string tag, CancellationToken cancellationToken = default)
    {
        var safeTag = string.IsNullOrWhiteSpace(tag) ? "unknown" : tag.Trim();

        try
        {
            await _outputCacheStore.EvictByTagAsync(safeTag, cancellationToken);
            _metricsService.RecordCacheInvalidation(safeTag);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Output cache invalidation failed for tag {Tag}.", safeTag);
        }
    }
}
