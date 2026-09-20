using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.HostedServices;

public class SocialTokenRefreshBackgroundService : BackgroundService
{
    private static readonly TimeSpan CheckInterval = TimeSpan.FromHours(2);
    private static readonly TimeSpan ExpirationThreshold = TimeSpan.FromHours(6);

    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<SocialTokenRefreshBackgroundService> _logger;

    public SocialTokenRefreshBackgroundService(IServiceProvider serviceProvider, ILogger<SocialTokenRefreshBackgroundService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("SocialTokenRefreshBackgroundService started. Interval: {Interval}", CheckInterval);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await PerformTokenMaintenanceAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred during social token refresh maintenance pass.");
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

        _logger.LogInformation("SocialTokenRefreshBackgroundService stopped.");
    }

    private async Task PerformTokenMaintenanceAsync(CancellationToken cancellationToken)
    {
        using var scope = _serviceProvider.CreateScope();
        var userStore = scope.ServiceProvider.GetRequiredService<UserStore>();

        // Aggregator services are optional. Only TikTok has a concrete refresh service today.
        var tikTokService = scope.ServiceProvider.GetService<ITikTokAggregatorService>();

        var users = userStore.GetAllUsersSnapshot();
        var now = DateTimeOffset.UtcNow;

        foreach (var user in users)
        {
            if (cancellationToken.IsCancellationRequested) break;

            // TikTok
            await TryRefreshAsync(
                platformName: "TikTok",
                userId: user.Id,
                connection: user.SocialFeeds?.TikTok,
                serviceRefresh: async (rt) => tikTokService == null ? null : await tikTokService.RefreshTokenAsync(rt),
                updateAction: (conn) => userStore.UpdateSocialFeeds(user.Id, new UpdateSocialFeedsRequest { TikTok = conn }),
                now,
                cancellationToken);

        }
    }

    // serviceRefresh returns a refresh result object that is expected to have AccessToken, RefreshToken and ExpiresIn properties.
    private async Task TryRefreshAsync(
        string platformName,
        string userId,
        SocialFeedConnection? connection,
        Func<string, Task<dynamic?>> serviceRefresh,
        Action<SocialFeedConnection> updateAction,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        if (connection == null || !connection.Enabled || string.IsNullOrWhiteSpace(connection.RefreshToken))
            return;

        var expiresAt = connection.TokenExpiresAt ?? now;
        var timeRemaining = expiresAt - now;

        if (timeRemaining > ExpirationThreshold)
            return;

        _logger.LogInformation(
            "{Platform} token for user {UserId} is near expiration ({RemainingHours:F1}h remaining). Initiating token refresh...",
            platformName,
            userId,
            timeRemaining.TotalHours);

        if (serviceRefresh == null)
        {
            _logger.LogDebug("No service registered for {Platform}; skipping refresh for user {UserId}.", platformName, userId);
            return;
        }

        try
        {
            var refreshResult = await serviceRefresh(connection.RefreshToken);
            if (refreshResult != null && !string.IsNullOrWhiteSpace((string?)refreshResult.AccessToken))
            {
                connection.AccessToken = refreshResult.AccessToken;
                if (!string.IsNullOrWhiteSpace((string?)refreshResult.RefreshToken))
                {
                    connection.RefreshToken = refreshResult.RefreshToken;
                }

                // ExpiresIn is expected to be seconds (int). If missing, keep existing expiry.
                try
                {
                    var expiresIn = (int)refreshResult.ExpiresIn;
                    connection.TokenExpiresAt = now.AddSeconds(expiresIn);
                }
                catch
                {
                    // ignore if ExpiresIn not present or not an int
                }

                updateAction(connection);
                _logger.LogInformation("Successfully rotated {Platform} tokens for user {UserId}.", platformName, userId);
            }
            else
            {
                _logger.LogWarning("Failed to refresh {Platform} token for user {UserId}. Stored refresh token may be invalid.", platformName, userId);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error refreshing {Platform} token for user {UserId}.", platformName, userId);
        }
    }
}
