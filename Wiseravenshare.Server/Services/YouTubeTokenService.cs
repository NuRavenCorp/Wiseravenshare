using Wiseravenshare.Server.Models;

namespace Wiseravenshare.Server.Services;

public interface IYouTubeTokenService
{
    Task<string?> GetValidAccessTokenAsync(string userId, CancellationToken ct = default);
}

public sealed class YouTubeTokenService : IYouTubeTokenService
{
    private static readonly TimeSpan RefreshThreshold = TimeSpan.FromMinutes(5);

    private readonly UserStore _userStore;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<YouTubeTokenService> _logger;

    public YouTubeTokenService(
        UserStore userStore,
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<YouTubeTokenService> logger)
    {
        _userStore = userStore;
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<string?> GetValidAccessTokenAsync(string userId, CancellationToken ct = default)
    {
        if (!_userStore.TryGetById(userId, out var user) || user is null)
            return null;

        var connection = user.SocialFeeds?.YouTube;
        if (connection is null || string.IsNullOrWhiteSpace(connection.AccessToken))
            return null;

        var expiresAt = connection.TokenExpiresAt ?? DateTimeOffset.MinValue;
        if (expiresAt - DateTimeOffset.UtcNow >= RefreshThreshold)
            return connection.AccessToken;

        if (string.IsNullOrWhiteSpace(connection.RefreshToken))
        {
            _logger.LogWarning("YouTube token for user {UserId} is expired with no refresh token.", userId);
            return null;
        }

        var clientId = _configuration["Authentication:OAuthProviders:Google:ClientId"];
        var clientSecret = _configuration["Authentication:OAuthProviders:Google:ClientSecret"];
        if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
            return connection.AccessToken;

        try
        {
            using var http = _httpClientFactory.CreateClient();
            var form = new Dictionary<string, string>
            {
                ["client_id"] = clientId,
                ["client_secret"] = clientSecret,
                ["refresh_token"] = connection.RefreshToken,
                ["grant_type"] = "refresh_token"
            };
            using var response = await http.PostAsync(
                "https://oauth2.googleapis.com/token",
                new FormUrlEncodedContent(form), ct);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("YouTube token refresh failed for user {UserId}: {Status}.", userId, response.StatusCode);
                return connection.AccessToken;
            }

            await using var stream = await response.Content.ReadAsStreamAsync(ct);
            using var doc = await System.Text.Json.JsonDocument.ParseAsync(stream, cancellationToken: ct);
            var newToken = doc.RootElement.GetProperty("access_token").GetString();
            var expiresIn = doc.RootElement.TryGetProperty("expires_in", out var exEl) ? exEl.GetInt32() : 3600;

            connection.AccessToken = newToken ?? connection.AccessToken;
            connection.TokenExpiresAt = DateTimeOffset.UtcNow.AddSeconds(expiresIn);
            _userStore.UpdateSocialFeeds(userId, new UpdateSocialFeedsRequest { YouTube = connection });
            _logger.LogInformation("Refreshed YouTube access token for user {UserId}.", userId);
            return connection.AccessToken;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception refreshing YouTube token for user {UserId}.", userId);
            return connection.AccessToken;
        }
    }
}
