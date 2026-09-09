using System.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Wiseravenshare.Server.Services;

/// <summary>
/// Background job service that periodically recalculates trending scores
/// for user-generated content (posts, videos, music).
/// Runs every 5 minutes to update viral coefficients and trending scores.
/// </summary>
public sealed class ContentTrendingRecalculationJob : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<ContentTrendingRecalculationJob> _logger;
    private readonly TimeSpan _recalculationInterval = TimeSpan.FromMinutes(5);
    private DateTime _nextRecalculation = DateTime.UtcNow.AddMinutes(1); // Start after 1 minute

    public ContentTrendingRecalculationJob(
        IServiceProvider serviceProvider,
        ILogger<ContentTrendingRecalculationJob> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("ContentTrendingRecalculationJob started. Will recalculate every {interval} minutes.",
            _recalculationInterval.TotalMinutes);

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                var now = DateTime.UtcNow;
                if (now >= _nextRecalculation)
                {
                    await RecalculateTrendingAsync(stoppingToken);
                    _nextRecalculation = now.Add(_recalculationInterval);
                }

                // Check every 30 seconds
                await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
            }
        }
        catch (OperationCanceledException)
        {
            _logger.LogInformation("ContentTrendingRecalculationJob is shutting down.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error in ContentTrendingRecalculationJob");
            throw;
        }
    }

    private async Task RecalculateTrendingAsync(CancellationToken ct)
    {
        using var scope = _serviceProvider.CreateScope();
        var contentCrawler = scope.ServiceProvider.GetRequiredService<IContentCrawlerService>();

        var stopwatch = Stopwatch.StartNew();
        try
        {
            await contentCrawler.RecalculateTrendScoresAsync(ct);
            stopwatch.Stop();
            _logger.LogInformation("Trending score recalculation completed in {duration}ms.",
                stopwatch.ElapsedMilliseconds);
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            _logger.LogError(ex, "Failed to recalculate trending scores after {duration}ms.",
                stopwatch.ElapsedMilliseconds);
        }
    }
}

/// <summary>
/// Configuration helper for content trending background job.
/// </summary>
public static class ContentTrendingConfiguration
{
    /// <summary>
    /// Add the content trending recalculation job to the host.
    /// </summary>
    public static IServiceCollection AddContentTrendingBackgroundJob(
        this IServiceCollection services,
        bool enabled = true)
    {
        if (enabled)
        {
            services.AddHostedService<ContentTrendingRecalculationJob>();
        }

        return services;
    }
}
