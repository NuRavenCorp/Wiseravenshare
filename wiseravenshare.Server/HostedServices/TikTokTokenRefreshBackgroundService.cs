using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.HostedServices;

public class TikTokTokenRefreshBackgroundService : BackgroundService
{
    private static readonly TimeSpan CheckInterval = TimeSpan.FromHours(2);
    private static readonly TimeSpan ExpirationThreshold = TimeSpan.FromHours(6);

    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<TikTokTokenRefreshBackgroundService> _logger;

    public TikTokTokenRefreshBackgroundService(IServiceProvider serviceProvider, ILogger<TikTokTokenRefreshBackgroundService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("TikTokTokenRefreshBackgroundService started. Interval: {Interval}", CheckInterval);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await PerformTokenMaintenanceAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred during TikTok token refresh maintenance pass.");
            }

            try
            {
                await Task.Delay(CheckInterval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }

        _logger.LogInformation("TikTokTokenRefreshBackgroundService stopped.");
    }

    private async Task PerformTokenMaintenanceAsync(CancellationToken cancellationToken)
    {
        using var scope = _serviceProvider.CreateScope();
        var userStore = scope.ServiceProvider.GetRequiredService<UserStore>();
        var tikTokService = scope.ServiceProvider.GetRequiredService<ITikTokAggregatorService>();

        var users = userStore.GetAllUsersSnapshot();
        var now = DateTimeOffset.UtcNow;

        foreach (var user in users)
        {
            if (cancellationToken.IsCancellationRequested) break;

            var connection = user.SocialFeeds?.TikTok;
            if (connection == null || !connection.Enabled || string.IsNullOrWhiteSpace(connection.RefreshToken))
            {
                continue;
            }

            var expiresAt = connection.TokenExpiresAt ?? now;
            var timeRemaining = expiresAt - now;

            if (timeRemaining <= ExpirationThreshold)
            {
                _logger.LogInformation(
                    "TikTok token for user {UserId} is near expiration ({RemainingHours:F1}h remaining). Initiating token refresh...",
                    user.Id,
                    timeRemaining.TotalHours);

                var refreshResult = await tikTokService.RefreshTokenAsync(connection.RefreshToken);
                if (refreshResult != null && !string.IsNullOrWhiteSpace(refreshResult.AccessToken))
                {
                    connection.AccessToken = refreshResult.AccessToken;
                    if (!string.IsNullOrWhiteSpace(refreshResult.RefreshToken))
                    {
                        connection.RefreshToken = refreshResult.RefreshToken;
                    }
                    connection.TokenExpiresAt = now.AddSeconds(refreshResult.ExpiresIn);

                    userStore.UpdateSocialFeeds(user.Id, new UpdateSocialFeedsRequest
                    {
                        TikTok = connection
                    });

                    _logger.LogInformation("Successfully rotated TikTok tokens for user {UserId}.", user.Id);
                }
                else
                {
                    _logger.LogWarning("Failed to refresh TikTok token for user {UserId}. Stored refresh token may be invalid.", user.Id);
                }
            }
        }
    }
}
