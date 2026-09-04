using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Wiseravenshare.Server.Services;

public interface ITikTokAggregatorService
{
    string GetAuthorizeUrl(string redirectUri, string? state = null);
    Task<TikTokTokenResponseDto?> ExchangeCodeForTokenAsync(string code, string redirectUri);
    Task<TikTokTokenResponseDto?> RefreshTokenAsync(string refreshToken);
    Task<TikTokUserInfoResultDto?> GetUserProfileAsync(string accessToken);
    Task<TikTokVideoListResultDto?> GetVideoCatalogAsync(string accessToken, long cursor = 0, int maxCount = 20);
}

public class TikTokAggregatorService : ITikTokAggregatorService
{
    private const string TikTokAuthorizeBaseUrl = "https://www.tiktok.com/v2/auth/authorize/";
    private const string TikTokApiBase = "https://open.tiktokapis.com/v2";

    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<TikTokAggregatorService> _logger;

    public TikTokAggregatorService(HttpClient httpClient, IConfiguration configuration, ILogger<TikTokAggregatorService> logger)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
    }

    public string GetAuthorizeUrl(string redirectUri, string? state = null)
    {
        var clientKey = _configuration["Social:TikTok:ClientKey"] ?? _configuration["Social:TikTok:Key"] ?? string.Empty;
        var scopes = "user.info.basic,video.list,video.publish,video.upload";
        var safeState = string.IsNullOrWhiteSpace(state) ? Guid.NewGuid().ToString("N") : state;

        var query = $"client_key={Uri.EscapeDataString(clientKey)}" +
                    $"&scope={Uri.EscapeDataString(scopes)}" +
                    $"&response_type=code" +
                    $"&redirect_uri={Uri.EscapeDataString(redirectUri)}" +
                    $"&state={Uri.EscapeDataString(safeState)}";

        return $"{TikTokAuthorizeBaseUrl}?{query}";
    }

    public async Task<TikTokTokenResponseDto?> ExchangeCodeForTokenAsync(string code, string redirectUri)
    {
        var clientKey = _configuration["Social:TikTok:ClientKey"] ?? _configuration["Social:TikTok:Key"];
        var clientSecret = _configuration["Social:TikTok:ClientSecret"] ?? _configuration["Social:TikTok:Secret"];

        if (string.IsNullOrWhiteSpace(clientKey) || string.IsNullOrWhiteSpace(clientSecret))
        {
            _logger.LogWarning("TikTok ClientKey or ClientSecret is not configured.");
            return null;
        }

        var form = new Dictionary<string, string>
        {
            ["client_key"] = clientKey,
            ["client_secret"] = clientSecret,
            ["code"] = code,
            ["grant_type"] = "authorization_code",
            ["redirect_uri"] = redirectUri
        };

        try
        {
            using var content = new FormUrlEncodedContent(form);
            using var response = await _httpClient.PostAsync($"{TikTokApiBase}/oauth/token/", content);
            var json = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("TikTok OAuth token exchange failed ({Status}): {Body}", (int)response.StatusCode, json);
                return null;
            }

            return ParseTokenResponse(json);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception during TikTok token exchange.");
            return null;
        }
    }

    public async Task<TikTokTokenResponseDto?> RefreshTokenAsync(string refreshToken)
    {
        var clientKey = _configuration["Social:TikTok:ClientKey"] ?? _configuration["Social:TikTok:Key"];
        var clientSecret = _configuration["Social:TikTok:ClientSecret"] ?? _configuration["Social:TikTok:Secret"];

        if (string.IsNullOrWhiteSpace(clientKey) || string.IsNullOrWhiteSpace(clientSecret) || string.IsNullOrWhiteSpace(refreshToken))
        {
            return null;
        }

        var form = new Dictionary<string, string>
        {
            ["client_key"] = clientKey,
            ["client_secret"] = clientSecret,
            ["grant_type"] = "refresh_token",
            ["refresh_token"] = refreshToken
        };

        try
        {
            using var content = new FormUrlEncodedContent(form);
            using var response = await _httpClient.PostAsync($"{TikTokApiBase}/oauth/token/", content);
            var json = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("TikTok refresh_token call failed ({Status}): {Body}", (int)response.StatusCode, json);
                return null;
            }

            // CRUCIAL RULE: TikTok returns a brand NEW refresh_token on every refresh request.
            var tokenResult = ParseTokenResponse(json);
            if (tokenResult != null && !string.IsNullOrWhiteSpace(tokenResult.RefreshToken))
            {
                _logger.LogInformation("TikTok token refreshed successfully. New RefreshToken issued for OpenId: {OpenId}", tokenResult.OpenId);
            }

            return tokenResult;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception during TikTok token refresh.");
            return null;
        }
    }

    public async Task<TikTokUserInfoResultDto?> GetUserProfileAsync(string accessToken)
    {
        if (string.IsNullOrWhiteSpace(accessToken)) return null;

        var fields = "open_id,union_id,avatar_url,avatar_url_100,display_name,bio_description,follower_count,following_count,likes_count";
        var url = $"{TikTokApiBase}/user/info/?fields={Uri.EscapeDataString(fields)}";

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

            using var response = await _httpClient.SendAsync(request);
            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync();
                _logger.LogWarning("TikTok GetUserProfile failed ({Status}): {Body}", (int)response.StatusCode, body);
                return null;
            }

            var json = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);

            if (doc.RootElement.TryGetProperty("data", out var data) && data.TryGetProperty("user", out var user))
            {
                return new TikTokUserInfoResultDto
                {
                    OpenId = user.TryGetProperty("open_id", out var openId) ? openId.GetString() : null,
                    UnionId = user.TryGetProperty("union_id", out var unionId) ? unionId.GetString() : null,
                    DisplayName = user.TryGetProperty("display_name", out var dName) ? dName.GetString() : null,
                    AvatarUrl = user.TryGetProperty("avatar_url", out var avUrl) ? avUrl.GetString() : null,
                    BioDescription = user.TryGetProperty("bio_description", out var bio) ? bio.GetString() : null,
                    FollowerCount = user.TryGetProperty("follower_count", out var fc) && fc.ValueKind == JsonValueKind.Number ? fc.GetInt64() : 0,
                    FollowingCount = user.TryGetProperty("following_count", out var fgc) && fgc.ValueKind == JsonValueKind.Number ? fgc.GetInt64() : 0,
                    LikesCount = user.TryGetProperty("likes_count", out var lc) && lc.ValueKind == JsonValueKind.Number ? lc.GetInt64() : 0
                };
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed fetching TikTok user profile.");
        }

        return null;
    }

    public async Task<TikTokVideoListResultDto?> GetVideoCatalogAsync(string accessToken, long cursor = 0, int maxCount = 20)
    {
        if (string.IsNullOrWhiteSpace(accessToken)) return null;

        var safeMaxCount = Math.Clamp(maxCount, 1, 20);
        var url = $"{TikTokApiBase}/video/list/";

        var requestPayload = new
        {
            fields = new[]
            {
                "id",
                "title",
                "video_description",
                "create_time",
                "cover_image_url",
                "share_url",
                "embed_link",
                "like_count",
                "comment_count",
                "share_count",
                "view_count"
            },
            max_count = safeMaxCount,
            cursor = cursor
        };

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            request.Content = JsonContent.Create(requestPayload);

            using var response = await _httpClient.SendAsync(request);
            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync();
                _logger.LogWarning("TikTok GetVideoCatalog failed ({Status}): {Body}", (int)response.StatusCode, body);
                return null;
            }

            var json = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);

            if (doc.RootElement.TryGetProperty("data", out var data))
            {
                var result = new TikTokVideoListResultDto
                {
                    Cursor = data.TryGetProperty("cursor", out var cNode) && cNode.ValueKind == JsonValueKind.Number ? cNode.GetInt64() : 0,
                    HasMore = data.TryGetProperty("has_more", out var hmNode) && hmNode.ValueKind == JsonValueKind.True
                };

                if (data.TryGetProperty("videos", out var videos) && videos.ValueKind == JsonValueKind.Array)
                {
                    foreach (var video in videos.EnumerateArray())
                    {
                        result.Videos.Add(new TikTokVideoItemDto
                        {
                            Id = video.TryGetProperty("id", out var idNode) ? idNode.GetString() ?? string.Empty : string.Empty,
                            Title = video.TryGetProperty("title", out var tNode) ? tNode.GetString() : null,
                            VideoDescription = video.TryGetProperty("video_description", out var descNode) ? descNode.GetString() : null,
                            CreateTime = video.TryGetProperty("create_time", out var ctNode) && ctNode.ValueKind == JsonValueKind.Number ? ctNode.GetInt64() : 0,
                            CoverImageUrl = video.TryGetProperty("cover_image_url", out var coverNode) ? coverNode.GetString() : null,
                            ShareUrl = video.TryGetProperty("share_url", out var shareNode) ? shareNode.GetString() : null,
                            EmbedLink = video.TryGetProperty("embed_link", out var embedNode) ? embedNode.GetString() : null,
                            LikeCount = video.TryGetProperty("like_count", out var lkNode) && lkNode.ValueKind == JsonValueKind.Number ? lkNode.GetInt64() : 0,
                            CommentCount = video.TryGetProperty("comment_count", out var cmNode) && cmNode.ValueKind == JsonValueKind.Number ? cmNode.GetInt64() : 0,
                            ShareCount = video.TryGetProperty("share_count", out var shNode) && shNode.ValueKind == JsonValueKind.Number ? shNode.GetInt64() : 0,
                            ViewCount = video.TryGetProperty("view_count", out var vwNode) && vwNode.ValueKind == JsonValueKind.Number ? vwNode.GetInt64() : 0
                        });
                    }
                }

                return result;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed fetching TikTok video catalog.");
        }

        return null;
    }

    private static TikTokTokenResponseDto? ParseTokenResponse(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);

            // TikTok OAuth responses can place parameters directly at root or inside "data"
            var root = doc.RootElement;
            if (root.TryGetProperty("data", out var dataNode) && dataNode.ValueKind == JsonValueKind.Object)
            {
                root = dataNode;
            }

            var accessToken = root.TryGetProperty("access_token", out var atNode) ? atNode.GetString() : null;
            var refreshToken = root.TryGetProperty("refresh_token", out var rtNode) ? rtNode.GetString() : null;
            var openId = root.TryGetProperty("open_id", out var oidNode) ? oidNode.GetString() : null;

            if (string.IsNullOrWhiteSpace(accessToken))
            {
                return null;
            }

            return new TikTokTokenResponseDto
            {
                AccessToken = accessToken,
                RefreshToken = refreshToken,
                OpenId = openId,
                ExpiresIn = root.TryGetProperty("expires_in", out var expNode) && expNode.ValueKind == JsonValueKind.Number ? expNode.GetInt64() : 86400,
                RefreshExpiresIn = root.TryGetProperty("refresh_expires_in", out var rexpNode) && rexpNode.ValueKind == JsonValueKind.Number ? rexpNode.GetInt64() : 31536000,
                Scope = root.TryGetProperty("scope", out var scNode) ? scNode.GetString() : null,
                TokenType = root.TryGetProperty("token_type", out var ttNode) ? ttNode.GetString() : "Bearer"
            };
        }
        catch
        {
            return null;
        }
    }
}

public class TikTokTokenResponseDto
{
    [JsonPropertyName("access_token")]
    public string AccessToken { get; set; } = string.Empty;

    [JsonPropertyName("expires_in")]
    public long ExpiresIn { get; set; }

    [JsonPropertyName("refresh_token")]
    public string? RefreshToken { get; set; }

    [JsonPropertyName("refresh_expires_in")]
    public long RefreshExpiresIn { get; set; }

    [JsonPropertyName("open_id")]
    public string? OpenId { get; set; }

    [JsonPropertyName("scope")]
    public string? Scope { get; set; }

    [JsonPropertyName("token_type")]
    public string? TokenType { get; set; }
}

public class TikTokUserInfoResultDto
{
    public string? OpenId { get; set; }
    public string? UnionId { get; set; }
    public string? DisplayName { get; set; }
    public string? AvatarUrl { get; set; }
    public string? BioDescription { get; set; }
    public long FollowerCount { get; set; }
    public long FollowingCount { get; set; }
    public long LikesCount { get; set; }
}

public class TikTokVideoItemDto
{
    public string Id { get; set; } = string.Empty;
    public string? Title { get; set; }
    public string? VideoDescription { get; set; }
    public long CreateTime { get; set; }
    public string? CoverImageUrl { get; set; }
    public string? ShareUrl { get; set; }
    public string? EmbedLink { get; set; }
    public long LikeCount { get; set; }
    public long CommentCount { get; set; }
    public long ShareCount { get; set; }
    public long ViewCount { get; set; }
}

public class TikTokVideoListResultDto
{
    public List<TikTokVideoItemDto> Videos { get; set; } = [];
    public long Cursor { get; set; }
    public bool HasMore { get; set; }
}
