using Wiseravenshare.Server.Services.FM;

namespace Wiseravenshare.Server.HostedServices;

/// <summary>
/// Background agent that runs every 5 minutes and promotes radio stations from
/// PendingApproval to Active once all three activation criteria are met:
///   1. SubscriptionPrice > 0  (set at creation)
///   2. WiseCoinDeposited >= 100  (deducted from wallet at creation)
///   3. StripeSetupComplete == true  (confirmed via POST /confirm-stripe)
/// </summary>
public sealed class RadioStationActivationAgentService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<RadioStationActivationAgentService> _logger;

    public RadioStationActivationAgentService(
        IServiceScopeFactory scopeFactory,
        ILogger<RadioStationActivationAgentService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Small startup delay to let the app fully initialize.
        await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);

        var timer = new PeriodicTimer(TimeSpan.FromMinutes(5));
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                await RunActivationCycleAsync(stoppingToken);
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

    private async Task RunActivationCycleAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var service = scope.ServiceProvider.GetRequiredService<ICreatorRadioStationService>();
            var count = await service.ProcessPendingActivationsAsync(cancellationToken);
            if (count > 0)
            {
                _logger.LogInformation("RadioStationActivationAgent: activated {Count} station(s)", count);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "RadioStationActivationAgent: activation cycle failed");
        }
    }
}
