using Microsoft.Extensions.Hosting;
using Wiseravenshare.Server.Models;

namespace Wiseravenshare.Server.Services;

public sealed class RavensightMediaRetentionCleanupService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<RavensightMediaRetentionCleanupService> _logger;

    public RavensightMediaRetentionCleanupService(
        IServiceScopeFactory scopeFactory,
        ILogger<RavensightMediaRetentionCleanupService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Run once at startup, then periodically.
        await RunCleanupCycleAsync(stoppingToken);

        var timer = new PeriodicTimer(TimeSpan.FromHours(1));
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                await RunCleanupCycleAsync(stoppingToken);
            }
        }
        catch (OperationCanceledException)
        {
            // Graceful shutdown.
        }
        finally
        {
            timer.Dispose();
        }
    }

    private async Task RunCleanupCycleAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var catalogStore = scope.ServiceProvider.GetRequiredService<RavensightMediaCatalogStore>();

            var expired = await catalogStore.GetExpiredAssetsAsync(DateTime.UtcNow, 200, cancellationToken);
            if (expired.Count == 0)
            {
                return;
            }

            var deletedCount = 0;
            foreach (var asset in expired)
            {
                try
                {
                    if (!string.IsNullOrWhiteSpace(asset.AbsolutePath) && File.Exists(asset.AbsolutePath))
                    {
                        File.Delete(asset.AbsolutePath);
                    }

                    await catalogStore.MarkAssetDeletedAsync(asset.Id, DateTime.UtcNow, cancellationToken);
                    deletedCount++;
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to delete expired Ravensight media asset {AssetId} ({FileName})", asset.Id, asset.FileName);
                }
            }

            if (deletedCount > 0)
            {
                _logger.LogInformation("Ravensight retention cleanup removed {DeletedCount} expired media assets", deletedCount);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Ravensight retention cleanup cycle failed");
        }
    }
}
