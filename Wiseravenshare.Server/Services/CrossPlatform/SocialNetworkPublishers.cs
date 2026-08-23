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

    public bool IsConfigured() =>
        !string.IsNullOrWhiteSpace(_configuration["Social:Twitter:AccessToken"]);

    public async Task<CrossPlatformPublishResultDto> PublishAsync(CrossPlatformPublishRequest request)
    {
        var accessToken = _configuration["Social:Twitter:AccessToken"];
        if (string.IsNullOrWhiteSpace(accessToken))
        {
            return CrossPlatformErrors.NotConfigured(Platform, "Social:Twitter:AccessToken");
        }

        // 280 chars hard limit; leave room for an appended link.
        var text = request.Message.Truncate(string.IsNullOrWhiteSpace(request.MediaUrl) ? 280 : 260);
        if (!string.IsNullOrWhiteSpace(request.MediaUrl))
        {
            text = $"{text} {request.MediaUrl}".Trim();
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

    public bool IsConfigured() =>
        !string.IsNullOrWhiteSpace(_configuration["Social:LinkedIn:AccessToken"]);

    public async Task<CrossPlatformPublishResultDto> PublishAsync(CrossPlatformPublishRequest request)
    {
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

