using NuRavenCorpLLM.Services;

namespace NuRavenCorpLLM.Application.Services.Assistant;

public class ChatterLearningBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ChatterLearningBackgroundService> _logger;

    public ChatterLearningBackgroundService(
        IServiceScopeFactory scopeFactory,
        ILogger<ChatterLearningBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var learning = scope.ServiceProvider.GetRequiredService<IChatterLearningService>();
                var feedback = scope.ServiceProvider.GetRequiredService<IFeedbackLearningService>();

                await feedback.ApplyFeedbackToSamplesAsync(stoppingToken);
                await learning.CurateAndPromoteAsync(100);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Learning background loop failed");
            }

            await Task.Delay(TimeSpan.FromMinutes(15), stoppingToken);
        }
    }
}