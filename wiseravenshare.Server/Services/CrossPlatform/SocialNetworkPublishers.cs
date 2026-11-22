// Wiseravenshare.Server/Services/CrossPlatform/SocialNetworkPublishers.cs
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Wiseravenshare.Server.DTOs.Social;

namespace Wiseravenshare.Server.Services.CrossPlatform;

/// <summary>
/// Publishes to X (Twitter) via API v2 POST /2/tweets using OAuth 2.0 user context.
/// Text posts always; media is attached as a link when no media id is available.
/// Config: Social:Twitter:AccessToken (user access token).
/// </summary>
public class TwitterPublisher : ICrossPlatformPublisher
{
    private const string ApiBase = "https://api.twitter.com/2";
    private const string ZernioDefaultBaseUrl = "https://api.zernio.com";
    private const string ZernioDefaultPublishPath = "/v1/twitter/publish";

    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<TwitterPublisher> _logger;
    private readonly UserStore? _userStore;

    public TwitterPublisher(HttpClient httpClient, IConfiguration configuration, ILogger<TwitterPublisher> logger, IServiceProvider serviceProvider)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
        _userStore = serviceProvider.GetService<UserStore>();
    }

    public string Platform => SocialPlatforms.Twitter;

    public bool IsConfigured()
    {
        if (UseZernio())
        {
            return !string.IsNullOrWhiteSpace(_configuration["Social:Zernio:ApiKey"]);
        }

        var nativeConfigured = !string.IsNullOrWhiteSpace(_configuration["Social:Twitter:AccessToken"]);
        if (UseZernioFallback())
        {
            return nativeConfigured || !string.IsNullOrWhiteSpace(_configuration["Social:Zernio:ApiKey"]);
        }

        return nativeConfigured;
    }

    public bool IsConfigured(Guid userId)
    {
        if (IsConfigured()) return true;
        if (userId != Guid.Empty && _userStore != null)
        {
            if ((_userStore.TryGetById(userId.ToString(), out var user) || _userStore.TryGetById(userId.ToString("N"), out user)) &&
                user?.SocialFeeds?.Twitter?.Enabled == true)
            {
                return !string.IsNullOrWhiteSpace(user.SocialFeeds.Twitter.AccessToken) || !string.IsNullOrWhiteSpace(user.SocialFeeds.Twitter.Username);
            }
        }
        return false;
    }

    public async Task<CrossPlatformPublishResultDto> PublishAsync(CrossPlatformPublishRequest request)
    {
        // 280 chars hard limit; leave room for an appended link.
        var text = request.Message.Truncate(string.IsNullOrWhiteSpace(request.MediaUrl) ? 280 : 260);
        if (!string.IsNullOrWhiteSpace(request.MediaUrl))
        {
            text = $"{text} {request.MediaUrl}".Trim();
        }

        if (UseZernio())
        {
            return await PublishViaZernioAsync(request, text);
        }

        var accessToken = _configuration["Social:Twitter:AccessToken"];
        if (request.UserId != Guid.Empty && _userStore != null)
        {
            if ((_userStore.TryGetById(request.UserId.ToString(), out var user) || _userStore.TryGetById(request.UserId.ToString("N"), out user)) &&
                !string.IsNullOrWhiteSpace(user?.SocialFeeds?.Twitter?.AccessToken))
            {
                accessToken = user.SocialFeeds.Twitter.AccessToken;
            }
        }
        if (string.IsNullOrWhiteSpace(accessToken))
        {
            if (UseZernioFallback() && !string.IsNullOrWhiteSpace(_configuration["Social:Zernio:ApiKey"]))
            {
                return await PublishViaZernioAsync(request, text);
            }

            return CrossPlatformErrors.NotConfigured(Platform, "Social:Twitter:AccessToken");
        }

        try
        {
            using var httpRequest = new HttpRequestMessage(HttpMethod.Post, $"{ApiBase}/tweets");
            httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            httpRequest.Content = new StringContent(
                JsonSerializer.Serialize(new { text }),
                Encoding.UTF8,
                "application/json");

            using var response = await _httpClient.SendAsync(httpRequest);
            var body = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Twitter publish failed ({Status}): {Body}", (int)response.StatusCode, body);
                var nativeError = CrossPlatformErrors.Failed(Platform, $"Twitter publish failed ({(int)response.StatusCode}): {body.Truncate(400)}");
                if (UseZernioFallback() && !string.IsNullOrWhiteSpace(_configuration["Social:Zernio:ApiKey"]))
                {
                    var fallbackResult = await PublishViaZernioAsync(request, text);
                    if (fallbackResult.Success)
                    {
                        return fallbackResult;
                    }

                    fallbackResult.Error = $"Native Twitter publish failed: {nativeError.Error ?? "Unknown error"} | Zernio fallback failed: {fallbackResult.Error ?? "Unknown error"}";
                    return fallbackResult;
                }

                return nativeError;
            }

            using var document = JsonDocument.Parse(body);
            var tweetId = document.RootElement.TryGetProperty("data", out var data)
                && data.TryGetProperty("id", out var idNode)
                ? idNode.GetString()
                : null;

            return new CrossPlatformPublishResultDto
            {
                Platform = Platform,
                Success = true,
                ExternalPostId = tweetId,
                ExternalPostUrl = string.IsNullOrWhiteSpace(tweetId) ? null : $"https://x.com/i/web/status/{tweetId}"
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Twitter publish threw for post {PostId}", request.PostId);
            if (UseZernioFallback() && !string.IsNullOrWhiteSpace(_configuration["Social:Zernio:ApiKey"]))
            {
                var fallbackResult = await PublishViaZernioAsync(request, text);
                if (fallbackResult.Success)
                {
                    return fallbackResult;
                }

                fallbackResult.Error = $"Native Twitter publish failed: {ex.Message} | Zernio fallback failed: {fallbackResult.Error ?? "Unknown error"}";
                return fallbackResult;
            }

            return CrossPlatformErrors.Failed(Platform, $"Twitter publish failed: {ex.Message}");
        }
    }

    private async Task<CrossPlatformPublishResultDto> PublishViaZernioAsync(CrossPlatformPublishRequest request, string text)
    {
        var apiKey = _configuration["Social:Zernio:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return CrossPlatformErrors.NotConfigured(Platform, "Social:Zernio:ApiKey");
        }

        var baseUrl = (_configuration["Social:Zernio:BaseUrl"] ?? ZernioDefaultBaseUrl).TrimEnd('/');
        var publishPath = _configuration["Social:Zernio:Twitter:PublishPath"] ?? ZernioDefaultPublishPath;
        if (!Uri.TryCreate($"{baseUrl}{publishPath}", UriKind.Absolute, out var endpoint))
        {
            return CrossPlatformErrors.Failed(Platform, "Zernio Twitter endpoint is invalid.");
        }

        var payload = new
        {
            text,
            mediaUrl = request.MediaUrl,
            metadata = new
            {
                source = "wiseravenshare",
                postId = request.PostId.ToString()
            }
        };

        try
        {
            using var httpRequest = new HttpRequestMessage(HttpMethod.Post, endpoint);
            httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
            httpRequest.Headers.TryAddWithoutValidation("X-Api-Key", apiKey);
            httpRequest.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

            using var response = await _httpClient.SendAsync(httpRequest);
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Zernio Twitter publish failed ({Status}): {Body}", (int)response.StatusCode, body);
                return CrossPlatformErrors.Failed(Platform, $"Zernio Twitter publish failed ({(int)response.StatusCode}): {body.Truncate(400)}");
            }

            using var document = JsonDocument.Parse(body);
            var externalPostId = ReadJsonString(document.RootElement, "postId")
                ?? ReadJsonString(document.RootElement, "id")
                ?? (document.RootElement.TryGetProperty("data", out var data)
                    ? ReadJsonString(data, "postId") ?? ReadJsonString(data, "id")
                    : null);
            var externalPostUrl = ReadJsonString(document.RootElement, "postUrl")
                ?? ReadJsonString(document.RootElement, "url")
                ?? (document.RootElement.TryGetProperty("data", out var urlData)
                    ? ReadJsonString(urlData, "postUrl") ?? ReadJsonString(urlData, "url")
                    : null);

            return new CrossPlatformPublishResultDto
            {
                Platform = Platform,
                Success = true,
                ExternalPostId = externalPostId,
                ExternalPostUrl = externalPostUrl
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Zernio Twitter publish threw for post {PostId}", request.PostId);
            return CrossPlatformErrors.Failed(Platform, $"Zernio Twitter publish failed: {ex.Message}");
        }
    }

    private bool UseZernio()
    {
        var provider = (_configuration["Social:Twitter:Provider"] ?? "native")
            .Trim()
            .ToLowerInvariant();
        return provider == "zernio";
    }

    private bool UseZernioFallback()
    {
        var provider = (_configuration["Social:Twitter:Provider"] ?? "native")
            .Trim()
            .ToLowerInvariant();
        if (provider is "fallback" or "native-fallback" or "zernio-fallback")
        {
            return true;
        }

        return _configuration.GetValue("Social:Zernio:FallbackEnabled", false);
    }

    private static string? ReadJsonString(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property))
        {
            return null;
        }

        if (property.ValueKind == JsonValueKind.String)
        {
            var value = property.GetString();
            return string.IsNullOrWhiteSpace(value) ? null : value;
        }

        var serialized = property.ToString();
        return string.IsNullOrWhiteSpace(serialized) ? null : serialized;
    }
}

/// <summary>
/// Publishes to LinkedIn via the UGC Posts endpoint (wMemberEmail / member-urn flow).
/// Text and link posts natively; images/videos require a registered upload asset.
/// Config: Social:LinkedIn:AccessToken, optional Social:LinkedIn:AuthorUrn
/// (defaults to "personal" which resolves the member urn via /v2/userinfo).
/// </summary>
public class LinkedInPublisher : ICrossPlatformPublisher
{
    private const string ApiBase = "https://api.linkedin.com";
    private const string ZernioDefaultBaseUrl = "https://api.zernio.com";
    private const string ZernioDefaultPublishPath = "/v1/linkedin/publish";

    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<LinkedInPublisher> _logger;
    private readonly UserStore? _userStore;

    public LinkedInPublisher(HttpClient httpClient, IConfiguration configuration, ILogger<LinkedInPublisher> logger, IServiceProvider serviceProvider)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
        _userStore = serviceProvider.GetService<UserStore>();
    }

    public string Platform => SocialPlatforms.LinkedIn;

    public bool IsConfigured()
    {
        if (UseZernio())
        {
            return !string.IsNullOrWhiteSpace(_configuration["Social:Zernio:ApiKey"]);
        }

        var nativeConfigured = !string.IsNullOrWhiteSpace(_configuration["Social:LinkedIn:AccessToken"]);
        if (UseZernioFallback())
        {
            return nativeConfigured || !string.IsNullOrWhiteSpace(_configuration["Social:Zernio:ApiKey"]);
        }

        return nativeConfigured;
    }

    public bool IsConfigured(Guid userId)
    {
        if (IsConfigured()) return true;
        if (userId != Guid.Empty && _userStore != null)
        {
            if ((_userStore.TryGetById(userId.ToString(), out var user) || _userStore.TryGetById(userId.ToString("N"), out user)) &&
                user?.SocialFeeds?.LinkedIn?.Enabled == true)
            {
                return !string.IsNullOrWhiteSpace(user.SocialFeeds.LinkedIn.AccessToken) || !string.IsNullOrWhiteSpace(user.SocialFeeds.LinkedIn.Username);
            }
        }
        return false;
    }

    public async Task<CrossPlatformPublishResultDto> PublishAsync(CrossPlatformPublishRequest request)
    {
        if (UseZernio())
        {
            return await PublishViaZernioAsync(request);
        }

        var accessToken = _configuration["Social:LinkedIn:AccessToken"];
        if (request.UserId != Guid.Empty && _userStore != null)
        {
            if ((_userStore.TryGetById(request.UserId.ToString(), out var user) || _userStore.TryGetById(request.UserId.ToString("N"), out user)) &&
                !string.IsNullOrWhiteSpace(user?.SocialFeeds?.LinkedIn?.AccessToken))
            {
                accessToken = user.SocialFeeds.LinkedIn.AccessToken;
            }
        }
        if (string.IsNullOrWhiteSpace(accessToken))
        {
            if (UseZernioFallback() && !string.IsNullOrWhiteSpace(_configuration["Social:Zernio:ApiKey"]))
            {
                return await PublishViaZernioAsync(request);
            }

            return CrossPlatformErrors.NotConfigured(Platform, "Social:LinkedIn:AccessToken");
        }

        try
        {
            var authorUrn = await ResolveAuthorUrnAsync(accessToken);
            if (string.IsNullOrWhiteSpace(authorUrn))
            {
                var nativeError = CrossPlatformErrors.Failed(Platform, "Could not resolve LinkedIn author URN. Set Social:LinkedIn:AuthorUrn or ensure r_liteprofile scope.");
                if (UseZernioFallback() && !string.IsNullOrWhiteSpace(_configuration["Social:Zernio:ApiKey"]))
                {
                    var fallbackResult = await PublishViaZernioAsync(request);
                    if (fallbackResult.Success)
                    {
                        return fallbackResult;
                    }

                    fallbackResult.Error = $"Native LinkedIn publish failed: {nativeError.Error ?? "Unknown error"} | Zernio fallback failed: {fallbackResult.Error ?? "Unknown error"}";
                    return fallbackResult;
                }

                return nativeError;
            }

            var payload = BuildPostPayload(authorUrn, request);

            using var httpRequest = new HttpRequestMessage(HttpMethod.Post, $"{ApiBase}/v2/ugcPosts");
            httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            httpRequest.Headers.Add("X-Restli-Protocol-Version", "2.0.0");
            httpRequest.Content = new StringContent(
                JsonSerializer.Serialize(payload),
                Encoding.UTF8,
                "application/json");

            using var response = await _httpClient.SendAsync(httpRequest);
            var body = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("LinkedIn publish failed ({Status}): {Body}", (int)response.StatusCode, body);
                var nativeError = CrossPlatformErrors.Failed(Platform, $"LinkedIn publish failed ({(int)response.StatusCode}): {body.Truncate(400)}");
                if (UseZernioFallback() && !string.IsNullOrWhiteSpace(_configuration["Social:Zernio:ApiKey"]))
                {
                    var fallbackResult = await PublishViaZernioAsync(request);
                    if (fallbackResult.Success)
                    {
                        return fallbackResult;
                    }

                    fallbackResult.Error = $"Native LinkedIn publish failed: {nativeError.Error ?? "Unknown error"} | Zernio fallback failed: {fallbackResult.Error ?? "Unknown error"}";
                    return fallbackResult;
                }

                return nativeError;
            }

            // Response header x-restli-id holds the created post id.
            var postId = response.Headers.TryGetValues("x-restli-id", out var values)
                ? values.FirstOrDefault()
                : null;

            return new CrossPlatformPublishResultDto
            {
                Platform = Platform,
                Success = true,
                ExternalPostId = postId,
                ExternalPostUrl = string.IsNullOrWhiteSpace(postId) ? null : $"https://www.linkedin.com/feed/update/{postId}"
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "LinkedIn publish threw for post {PostId}", request.PostId);
            if (UseZernioFallback() && !string.IsNullOrWhiteSpace(_configuration["Social:Zernio:ApiKey"]))
            {
                var fallbackResult = await PublishViaZernioAsync(request);
                if (fallbackResult.Success)
                {
                    return fallbackResult;
                }

                fallbackResult.Error = $"Native LinkedIn publish failed: {ex.Message} | Zernio fallback failed: {fallbackResult.Error ?? "Unknown error"}";
                return fallbackResult;
            }

            return CrossPlatformErrors.Failed(Platform, $"LinkedIn publish failed: {ex.Message}");
        }
    }

    private async Task<CrossPlatformPublishResultDto> PublishViaZernioAsync(CrossPlatformPublishRequest request)
    {
        var apiKey = _configuration["Social:Zernio:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return CrossPlatformErrors.NotConfigured(Platform, "Social:Zernio:ApiKey");
        }

        var baseUrl = (_configuration["Social:Zernio:BaseUrl"] ?? ZernioDefaultBaseUrl).TrimEnd('/');
        var publishPath = _configuration["Social:Zernio:LinkedIn:PublishPath"] ?? ZernioDefaultPublishPath;
        if (!Uri.TryCreate($"{baseUrl}{publishPath}", UriKind.Absolute, out var endpoint))
        {
            return CrossPlatformErrors.Failed(Platform, "Zernio LinkedIn endpoint is invalid.");
        }

        var payload = new
        {
            message = request.Message.Truncate(3000),
            mediaUrl = request.MediaUrl,
            metadata = new
            {
                source = "wiseravenshare",
                postId = request.PostId.ToString()
            }
        };

        try
        {
            using var httpRequest = new HttpRequestMessage(HttpMethod.Post, endpoint);
            httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
            httpRequest.Headers.TryAddWithoutValidation("X-Api-Key", apiKey);
            httpRequest.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

            using var response = await _httpClient.SendAsync(httpRequest);
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Zernio LinkedIn publish failed ({Status}): {Body}", (int)response.StatusCode, body);
                return CrossPlatformErrors.Failed(Platform, $"Zernio LinkedIn publish failed ({(int)response.StatusCode}): {body.Truncate(400)}");
            }

            using var document = JsonDocument.Parse(body);
            var externalPostId = ReadJsonString(document.RootElement, "postId")
                ?? ReadJsonString(document.RootElement, "id")
                ?? (document.RootElement.TryGetProperty("data", out var data)
                    ? ReadJsonString(data, "postId") ?? ReadJsonString(data, "id")
                    : null);
            var externalPostUrl = ReadJsonString(document.RootElement, "postUrl")
                ?? ReadJsonString(document.RootElement, "url")
                ?? (document.RootElement.TryGetProperty("data", out var urlData)
                    ? ReadJsonString(urlData, "postUrl") ?? ReadJsonString(urlData, "url")
                    : null);

            return new CrossPlatformPublishResultDto
            {
                Platform = Platform,
                Success = true,
                ExternalPostId = externalPostId,
                ExternalPostUrl = externalPostUrl
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Zernio LinkedIn publish threw for post {PostId}", request.PostId);
            return CrossPlatformErrors.Failed(Platform, $"Zernio LinkedIn publish failed: {ex.Message}");
        }
    }

    private bool UseZernio()
    {
        var provider = (_configuration["Social:LinkedIn:Provider"] ?? "native")
            .Trim()
            .ToLowerInvariant();
        return provider == "zernio";
    }

    private bool UseZernioFallback()
    {
        var provider = (_configuration["Social:LinkedIn:Provider"] ?? "native")
            .Trim()
            .ToLowerInvariant();
        if (provider is "fallback" or "native-fallback" or "zernio-fallback")
        {
            return true;
        }

        return _configuration.GetValue("Social:Zernio:FallbackEnabled", false);
    }

    private static string? ReadJsonString(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property))
        {
            return null;
        }

        if (property.ValueKind == JsonValueKind.String)
        {
            var value = property.GetString();
            return string.IsNullOrWhiteSpace(value) ? null : value;
        }

        var serialized = property.ToString();
        return string.IsNullOrWhiteSpace(serialized) ? null : serialized;
    }

    private async Task<string?> ResolveAuthorUrnAsync(string accessToken)
    {
        var configured = _configuration["Social:LinkedIn:AuthorUrn"];
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return configured.StartsWith("urn:", StringComparison.OrdinalIgnoreCase) ? configured : $"urn:li:person:{configured}";
        }

        using var request = new HttpRequestMessage(HttpMethod.Get, $"{ApiBase}/v2/userinfo");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        using var response = await _httpClient.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.TryGetProperty("sub", out var sub) ? $"urn:li:person:{sub.GetString()}" : null;
    }

    private static object BuildPostPayload(string authorUrn, CrossPlatformPublishRequest request)
    {
        var commentary = request.Message.Truncate(3000);

        // Media posts via the API need a pre-registered asset URN; until one is supplied,
        // attach the public URL as a link attribution for photos/videos.
        var mediaKwargs = string.IsNullOrWhiteSpace(request.MediaUrl)
            ? null
            : new Dictionary<string, string> { ["url"] = request.MediaUrl! };

        return new Dictionary<string, object>
        {
            ["author"] = authorUrn,
            ["lifecycleState"] = "PUBLISHED",
            ["specificContent"] = new Dictionary<string, object>
            {
                ["com.linkedin.ugc.ShareContent"] = new Dictionary<string, object>
                {
                    ["shareCommentary"] = new Dictionary<string, string> { ["text"] = commentary },
                    ["shareMediaCategory"] = mediaKwargs is null ? "NONE" : "ARTICLE",
                    ["media"] = mediaKwargs is null
                        ? Array.Empty<object>()
                        : new object[]
                        {
                            new Dictionary<string, object>
                            {
                                ["status"] = "READY",
                                ["originalUrl"] = request.MediaUrl!
                            }
                        }
                }
            },
            ["visibility"] = new Dictionary<string, string>
            {
                ["com.linkedin.ugc.MemberNetworkVisibility"] = "PUBLIC"
            }
        };
    }
}

/// <summary>
/// Publishes to Bluesky via AT Protocol com.atproto.repo.createRecord.
/// Reads credentials from user profile or system configuration.
/// </summary>
public class BlueskyPublisher : ICrossPlatformPublisher
{
    private const string BlueskyApiBase = "https://bsky.social/xrpc";
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<BlueskyPublisher> _logger;
    private readonly UserStore? _userStore;

    public BlueskyPublisher(HttpClient httpClient, IConfiguration configuration, ILogger<BlueskyPublisher> logger, IServiceProvider serviceProvider)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
        _userStore = serviceProvider.GetService<UserStore>();
    }

    public string Platform => SocialPlatforms.Bluesky;

    public bool IsConfigured()
    {
        return !string.IsNullOrWhiteSpace(_configuration["Social:Bluesky:Handle"])
            || !string.IsNullOrWhiteSpace(_configuration["Social:Bluesky:AccessToken"]);
    }

    public bool IsConfigured(Guid userId)
    {
        if (IsConfigured()) return true;
        if (userId != Guid.Empty && _userStore != null)
        {
            if ((_userStore.TryGetById(userId.ToString(), out var user) || _userStore.TryGetById(userId.ToString("N"), out user)) &&
                user?.SocialFeeds?.Bluesky?.Enabled == true)
            {
                return !string.IsNullOrWhiteSpace(user.SocialFeeds.Bluesky.AccessToken) || !string.IsNullOrWhiteSpace(user.SocialFeeds.Bluesky.Username);
            }
        }
        return false;
    }

    public async Task<CrossPlatformPublishResultDto> PublishAsync(CrossPlatformPublishRequest request)
    {
        // 300 grapheme limit for Bluesky posts
        var text = request.Message.Truncate(string.IsNullOrWhiteSpace(request.MediaUrl) ? 300 : 270);
        if (!string.IsNullOrWhiteSpace(request.MediaUrl))
        {
            text = $"{text} {request.MediaUrl}".Trim();
        }

        var handle = (_configuration["Social:Bluesky:Handle"] ?? string.Empty).Trim().TrimStart('@');
        var accessJwt = (_configuration["Social:Bluesky:AccessToken"] ?? string.Empty).Trim();
        var appPassword = (_configuration["Social:Bluesky:AppPassword"] ?? string.Empty).Trim();
        var did = string.Empty;

        if (request.UserId != Guid.Empty && _userStore != null)
        {
            if ((_userStore.TryGetById(request.UserId.ToString(), out var user) || _userStore.TryGetById(request.UserId.ToString("N"), out user)) && user?.SocialFeeds?.Bluesky is not null)
            {
                var bsky = user.SocialFeeds.Bluesky;
                if (!string.IsNullOrWhiteSpace(bsky.AccessToken)) accessJwt = bsky.AccessToken;
                if (!string.IsNullOrWhiteSpace(bsky.Username)) handle = bsky.Username.TrimStart('@');
                if (!string.IsNullOrWhiteSpace(bsky.DestinationId)) did = bsky.DestinationId;
            }
        }

        if (string.IsNullOrWhiteSpace(accessJwt) && !string.IsNullOrWhiteSpace(handle) && !string.IsNullOrWhiteSpace(appPassword))
        {
            try
            {
                var sessionRequest = new { identifier = handle, password = appPassword };
                var sessionContent = new StringContent(JsonSerializer.Serialize(sessionRequest), Encoding.UTF8, "application/json");
                using var sessionResponse = await _httpClient.PostAsync($"{BlueskyApiBase}/com.atproto.server.createSession", sessionContent);
                if (sessionResponse.IsSuccessStatusCode)
                {
                    await using var sStream = await sessionResponse.Content.ReadAsStreamAsync();
                    using var sJson = await JsonDocument.ParseAsync(sStream);
                    accessJwt = sJson.RootElement.TryGetProperty("accessJwt", out var aj) ? aj.GetString() ?? string.Empty : string.Empty;
                    if (string.IsNullOrWhiteSpace(did))
                        did = sJson.RootElement.TryGetProperty("did", out var dNode) ? dNode.GetString() ?? string.Empty : string.Empty;
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to create Bluesky session for publishing.");
            }
        }

        if (string.IsNullOrWhiteSpace(accessJwt))
        {
            return CrossPlatformErrors.NotConfigured(Platform, "Bluesky access token / credentials unavailable.");
        }

        try
        {
            var repo = !string.IsNullOrWhiteSpace(did) ? did : (!string.IsNullOrWhiteSpace(handle) ? handle : "self");
            var record = new
            {
                repo,
                collection = "app.bsky.feed.post",
                record = new
                {
                    type = "app.bsky.feed.post",
                    text,
                    createdAt = DateTime.UtcNow.ToString("o")
                }
            };

            using var postRequest = new HttpRequestMessage(HttpMethod.Post, $"{BlueskyApiBase}/com.atproto.repo.createRecord");
            postRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessJwt);
            postRequest.Content = new StringContent(JsonSerializer.Serialize(record), Encoding.UTF8, "application/json");

            using var postResponse = await _httpClient.SendAsync(postRequest);
            var responseBody = await postResponse.Content.ReadAsStringAsync();

            if (!postResponse.IsSuccessStatusCode)
            {
                _logger.LogWarning("Bluesky publish failed ({Status}): {Body}", (int)postResponse.StatusCode, responseBody);
                return CrossPlatformErrors.Failed(Platform, $"Bluesky publish failed: {responseBody.Truncate(300)}");
            }

            using var doc = JsonDocument.Parse(responseBody);
            var uri = doc.RootElement.TryGetProperty("uri", out var uriNode) ? uriNode.GetString() ?? string.Empty : string.Empty;
            var rkey = uri.Split('/').LastOrDefault() ?? string.Empty;
            var postUrl = !string.IsNullOrWhiteSpace(handle) && !string.IsNullOrWhiteSpace(rkey)
                ? $"https://bsky.app/profile/{handle}/post/{rkey}"
                : null;

            return new CrossPlatformPublishResultDto
            {
                Platform = Platform,
                Success = true,
                ExternalPostId = rkey,
                ExternalPostUrl = postUrl
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Bluesky publish threw for post {PostId}", request.PostId);
            return CrossPlatformErrors.Failed(Platform, $"Bluesky publish failed: {ex.Message}");
        }
    }
}
