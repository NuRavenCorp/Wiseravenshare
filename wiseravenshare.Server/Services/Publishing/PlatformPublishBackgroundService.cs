// Wiseravenshare.Server/Services/Publishing/PlatformPublishBackgroundService.cs
using Wiseravenshare.Server.Interfaces.Services;

namespace Wiseravenshare.Server.Services.Publishing;

/// <summary>
/// Polls for scheduled cross-platform publishes that are due and executes them.
/// Runs every minute; each pass is serialized via a semaphore so overlapping
/// ticks never double-publish the same scheduled item.
/// </summary>
public class PlatformPublishBackgroundService : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(1);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<PlatformPublishBackgroundService> _logger;
    private readonly SemaphoreSlim _gate = new(1, 1);

    public PlatformPublishBackgroundService(IServiceScopeFactory scopeFactory, ILogger<PlatformPublishBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Scheduled publish worker started (interval: {Interval})", Interval);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(Interval, stoppingToken);
                await _gate.WaitAsync(stoppingToken);
                try
                {
                    using var scope = _scopeFactory.CreateScope();
                    var publishService = scope.ServiceProvider.GetRequiredService<IPlatformPublishService>();
                    var processed = await publishService.ProcessScheduledPublishesAsync(stoppingToken);
                    if (processed > 0)
                    {
                        _logger.LogInformation("Scheduled publish worker processed {Count} publish(es)", processed);
                    }
                }
                finally
                {
                    _gate.Release();
                }
            }
            catch (OperationCanceledException)
            {
                // normal shutdown
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Scheduled publish worker pass failed");
            }
        }
    }
}
