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

        // Aggregator services are optional; skip platform if service isn't registered.
        var tikTokService = scope.ServiceProvider.GetService<ITikTokAggregatorService>();
        var facebookService = scope.ServiceProvider.GetService<IFacebookAggregatorService>();
        var instagramService = scope.ServiceProvider.GetService<IInstagramAggregatorService>();
        var youTubeService = scope.ServiceProvider.GetService<IYouTubeAggregatorService>();

        var users = userStore.GetAllUsersSnapshot();
        var now = DateTimeOffset.UtcNow;

        foreach (var user in users)
        {
            if (cancellationToken.IsCancellationRequested) break;

            // TikTok
            await TryRefreshForPlatformAsync(
                user,
                user.SocialFeeds?.TikTok,
                tikTokService,
                "TikTok",
                now,
                async (connection) =>
                {
                    var refreshResult = await tikTokService.RefreshTokenAsync(connection.RefreshToken);
                    return refreshResult;
                },
                updateRequest => userStore.UpdateSocialFeeds(user.Id, updateRequest),
                cancellationToken);

            if (cancellationToken.IsCancellationRequested) break;

            // Facebook
            await TryRefreshForPlatformAsync(
                user,
                user.SocialFeeds?.Facebook,
                facebookService,
                "Facebook",
                now,
                async (connection) =>
                {
                    var refreshResult = await facebookService.RefreshTokenAsync(connection.RefreshToken);
                    return refreshResult;
                },
                updateRequest => userStore.UpdateSocialFeeds(user.Id, updateRequest),
                cancellationToken);

            if (cancellationToken.IsCancellationRequested) break;

            // Instagram
            await TryRefreshForPlatformAsync(
                user,
                user.SocialFeeds?.Instagram,
                instagramService,
                "Instagram",
                now,
                async (connection) =>
                {
                    var refreshResult = await instagramService.RefreshTokenAsync(connection.RefreshToken);
                    return refreshResult;
                },
                updateRequest => userStore.UpdateSocialFeeds(user.Id, updateRequest),
                cancellationToken);

            if (cancellationToken.IsCancellationRequested) break;

            // YouTube
            await TryRefreshForPlatformAsync(
                user,
                user.SocialFeeds?.YouTube,
                youTubeService,
                "YouTube",
                now,
                async (connection) =>
                {
                    var refreshResult = await youTubeService.RefreshTokenAsync(connection.RefreshToken);
                    return refreshResult;
                },
                updateRequest => userStore.UpdateSocialFeeds(user.Id, updateRequest),
                cancellationToken);
        }
    }

    private async Task TryRefreshForPlatformAsync(
        User user,
        SocialConnection? connection,
        object? service,
        string platformName,
        DateTimeOffset now,
        Func<SocialConnection, Task<object?>> refreshInvoker,
        Action<UpdateSocialFeedsRequest> persistUpdate,
        CancellationToken cancellationToken)
    {
        if (connection == null || service == null || !connection.Enabled || string.IsNullOrWhiteSpace(connection.RefreshToken))
        {
            return;
        }

        var expiresAt = connection.TokenExpiresAt ?? now;
        var timeRemaining = expiresAt - now;

        if (timeRemaining <= ExpirationThreshold)
        {
            _logger.LogInformation(
                "{Platform} token for user {UserId} is near expiration ({RemainingHours:F1}h remaining). Initiating token refresh...",
                platformName,
                user.Id,
                timeRemaining.TotalHours);

            try
            {
                var refreshResult = await refreshInvoker(connection);

                if (refreshResult != null)
                {
                    // Use dynamic to access commonly named properties (AccessToken, RefreshToken, ExpiresIn).
                    dynamic r = refreshResult;
                    string? newAccess = r.AccessToken;
                    string? newRefresh = r.RefreshToken;
                    int? expiresIn = r.ExpiresIn;

                    if (!string.IsNullOrWhiteSpace(newAccess))
                    {
                        connection.AccessToken = newAccess;
                        if (!string.IsNullOrWhiteSpace(newRefresh))
                        {
                            connection.RefreshToken = newRefresh;
                        }

                        if (expiresIn.HasValue)
                        {
                            connection.TokenExpiresAt = now.AddSeconds(expiresIn.Value);
                        }

                        var updateReq = new UpdateSocialFeedsRequest();
                        switch (platformName)
                        {
                            case "TikTok": updateReq.TikTok = connection; break;
                            case "Facebook": updateReq.Facebook = connection; break;
                            case "Instagram": updateReq.Instagram = connection; break;
                            case "YouTube": updateReq.YouTube = connection; break;
                        }

                        persistUpdate(updateReq);

                        _logger.LogInformation("Successfully rotated {Platform} tokens for user {UserId}.", platformName, user.Id);
                        return;
                    }
                }

                _logger.LogWarning("Failed to refresh {Platform} token for user {UserId}. Stored refresh token may be invalid.", platformName, user.Id);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error refreshing {Platform} token for user {UserId}.", platformName, user.Id);
            }
        }
    }
}