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

    public TwitterPublisher(HttpClient httpClient, IConfiguration configuration, ILogger<TwitterPublisher> logger)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
    }

    public string Platform => SocialPlatforms.Twitter;

    public bool IsConfigured()
    {
        if (UseZernio())
        {
            return !string.IsNullOrWhiteSpace(_configuration["Social:Zernio:ApiKey"]);
        }

        return !string.IsNullOrWhiteSpace(_configuration["Social:Twitter:AccessToken"]);
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
        if (string.IsNullOrWhiteSpace(accessToken))
        {
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
                return CrossPlatformErrors.Failed(Platform, $"Twitter publish failed ({(int)response.StatusCode}): {body.Truncate(400)}");
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

    public LinkedInPublisher(HttpClient httpClient, IConfiguration configuration, ILogger<LinkedInPublisher> logger)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
    }

    public string Platform => SocialPlatforms.LinkedIn;

    public bool IsConfigured()
    {
        if (UseZernio())
        {
            return !string.IsNullOrWhiteSpace(_configuration["Social:Zernio:ApiKey"]);
        }

        return !string.IsNullOrWhiteSpace(_configuration["Social:LinkedIn:AccessToken"]);
    }

    public async Task<CrossPlatformPublishResultDto> PublishAsync(CrossPlatformPublishRequest request)
    {
        if (UseZernio())
        {
            return await PublishViaZernioAsync(request);
        }

        var accessToken = _configuration["Social:LinkedIn:AccessToken"];
        if (string.IsNullOrWhiteSpace(accessToken))
        {
            return CrossPlatformErrors.NotConfigured(Platform, "Social:LinkedIn:AccessToken");
        }

        try
        {
            var authorUrn = await ResolveAuthorUrnAsync(accessToken);
            if (string.IsNullOrWhiteSpace(authorUrn))
            {
                return CrossPlatformErrors.Failed(Platform, "Could not resolve LinkedIn author URN. Set Social:LinkedIn:AuthorUrn or ensure r_liteprofile scope.");
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
                return CrossPlatformErrors.Failed(Platform, $"LinkedIn publish failed ({(int)response.StatusCode}): {body.Truncate(400)}");
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
