using System.Globalization;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Wiseravenshare.Server.DTOs.Social;

namespace Wiseravenshare.Server.Services;

public interface ISocialPlatformService
{
    Task<IReadOnlyList<SocialFeedItemDto>> GetFacebookFeedAsync(string? pageId, int limit);
    Task<IReadOnlyList<SocialFeedItemDto>> GetTikTokFeedAsync(string? username, int limit);
    Task<PublishSocialContentResponse> PublishAsync(Guid userId, PublishSocialContentRequest request);
}

public class SocialPlatformService : ISocialPlatformService
{
    private const string FacebookGraphBase = "https://graph.facebook.com/v20.0";
    private const string TikTokApiBase = "https://open.tiktokapis.com/v2";

    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<SocialPlatformService> _logger;

    public SocialPlatformService(HttpClient httpClient, IConfiguration configuration, ILogger<SocialPlatformService> logger)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<IReadOnlyList<SocialFeedItemDto>> GetFacebookFeedAsync(string? pageId, int limit)
    {
        var resolvedPageId = string.IsNullOrWhiteSpace(pageId)
            ? _configuration["Social:Facebook:PageId"]
            : pageId;

        var pageToken = _configuration["Social:Facebook:PageAccessToken"];

        if (string.IsNullOrWhiteSpace(resolvedPageId) || string.IsNullOrWhiteSpace(pageToken))
        {
            return [];
        }

        var safeLimit = Math.Clamp(limit, 1, 25);
        var fields = "id,message,created_time,permalink_url,full_picture";
        var url = $"{FacebookGraphBase}/{resolvedPageId}/posts?fields={Uri.EscapeDataString(fields)}&limit={safeLimit}&access_token={Uri.EscapeDataString(pageToken)}";

        using var response = await _httpClient.GetAsync(url);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync();
            _logger.LogWarning("Facebook feed request failed: {Status} {Body}", (int)response.StatusCode, body);
            return [];
        }

        var json = await response.Content.ReadAsStringAsync();
        using var document = JsonDocument.Parse(json);
        if (!document.RootElement.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        var items = new List<SocialFeedItemDto>();
        foreach (var entry in data.EnumerateArray())
        {
            items.Add(new SocialFeedItemDto
            {
                Platform = "facebook",
                ExternalId = entry.TryGetProperty("id", out var id) ? id.GetString() ?? string.Empty : string.Empty,
                Text = entry.TryGetProperty("message", out var message) ? message.GetString() : null,
                MediaUrl = entry.TryGetProperty("full_picture", out var picture) ? picture.GetString() : null,
                PermalinkUrl = entry.TryGetProperty("permalink_url", out var permalink) ? permalink.GetString() : null,
                AuthorHandle = resolvedPageId,
                CreatedAt = ParseDate(entry, "created_time")
            });
        }

        return items;
    }

    public async Task<IReadOnlyList<SocialFeedItemDto>> GetTikTokFeedAsync(string? username, int limit)
    {
        var resolvedUsername = string.IsNullOrWhiteSpace(username)
            ? _configuration["Social:TikTok:Username"]
            : username;

        var accessToken = _configuration["Social:TikTok:AccessToken"];
        if (string.IsNullOrWhiteSpace(resolvedUsername) || string.IsNullOrWhiteSpace(accessToken))
        {
            return [];
        }

        var safeLimit = Math.Clamp(limit, 1, 20);
        var fields = "id,create_time,cover_image_url,share_url,title,video_description";
        var requestUrl = $"{TikTokApiBase}/video/list/?fields={Uri.EscapeDataString(fields)}";

        using var request = new HttpRequestMessage(HttpMethod.Post, requestUrl);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        request.Content = JsonContent.Create(new { max_count = safeLimit });

        using var response = await _httpClient.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync();
            _logger.LogWarning("TikTok feed request failed: {Status} {Body}", (int)response.StatusCode, body);
            return [];
        }

        var json = await response.Content.ReadAsStringAsync();
        using var document = JsonDocument.Parse(json);
        if (!document.RootElement.TryGetProperty("data", out var data)
            || !data.TryGetProperty("videos", out var videos)
            || videos.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        var items = new List<SocialFeedItemDto>();
        foreach (var video in videos.EnumerateArray())
        {
            var title = video.TryGetProperty("title", out var titleNode) ? titleNode.GetString() : null;
            var description = video.TryGetProperty("video_description", out var descriptionNode) ? descriptionNode.GetString() : null;

            items.Add(new SocialFeedItemDto
            {
                Platform = "tiktok",
                ExternalId = video.TryGetProperty("id", out var id) ? id.GetString() ?? string.Empty : string.Empty,
                Text = string.IsNullOrWhiteSpace(description) ? title : description,
                MediaUrl = video.TryGetProperty("cover_image_url", out var cover) ? cover.GetString() : null,
                PermalinkUrl = video.TryGetProperty("share_url", out var share) ? share.GetString() : null,
                AuthorHandle = resolvedUsername,
                CreatedAt = ParseUnixDate(video, "create_time")
            });
        }

        return items;
    }

    public async Task<PublishSocialContentResponse> PublishAsync(Guid userId, PublishSocialContentRequest request)
    {
        var response = new PublishSocialContentResponse();
        var message = request.Message.Trim();

        if (request.PublishToFacebook)
        {
            response.Results.Add(await PublishToFacebookAsync(message, request.LinkUrl));
        }

        if (request.PublishToTikTok)
        {
            response.Results.Add(await PublishToTikTokAsync(message, request.VideoUrl));
        }

        _logger.LogInformation(
            "User {UserId} requested cross-post. Facebook={Facebook}, TikTok={TikTok}",
            userId,
            request.PublishToFacebook,
            request.PublishToTikTok);

        return response;
    }

    private async Task<SocialPublishResultDto> PublishToFacebookAsync(string message, string? linkUrl)
    {
        var pageId = _configuration["Social:Facebook:PageId"];
        var pageToken = _configuration["Social:Facebook:PageAccessToken"];

        if (string.IsNullOrWhiteSpace(pageId) || string.IsNullOrWhiteSpace(pageToken))
        {
            return new SocialPublishResultDto
            {
                Platform = "facebook",
                Success = false,
                Error = "Facebook is not configured. Set Social:Facebook:PageId and Social:Facebook:PageAccessToken."
            };
        }

        var form = new Dictionary<string, string>
        {
            ["message"] = message,
            ["access_token"] = pageToken
        };

        if (!string.IsNullOrWhiteSpace(linkUrl))
        {
            form["link"] = linkUrl;
        }

        using var content = new FormUrlEncodedContent(form);
        using var httpResponse = await _httpClient.PostAsync($"{FacebookGraphBase}/{pageId}/feed", content);

        var body = await httpResponse.Content.ReadAsStringAsync();
        if (!httpResponse.IsSuccessStatusCode)
        {
            return new SocialPublishResultDto
            {
                Platform = "facebook",
                Success = false,
                Error = $"Facebook publish failed ({(int)httpResponse.StatusCode}): {TrimError(body)}"
            };
        }

        using var document = JsonDocument.Parse(body);
        var postId = document.RootElement.TryGetProperty("id", out var id) ? id.GetString() : null;

        return new SocialPublishResultDto
        {
            Platform = "facebook",
            Success = true,
            ExternalPostId = postId,
            ExternalPostUrl = string.IsNullOrWhiteSpace(postId) ? null : $"https://www.facebook.com/{postId}"
        };
    }

    private async Task<SocialPublishResultDto> PublishToTikTokAsync(string message, string? videoUrl)
    {
        var accessToken = _configuration["Social:TikTok:AccessToken"];
        if (string.IsNullOrWhiteSpace(accessToken))
        {
            return new SocialPublishResultDto
            {
                Platform = "tiktok",
                Success = false,
                Error = "TikTok is not configured. Set Social:TikTok:AccessToken."
            };
        }

        if (string.IsNullOrWhiteSpace(videoUrl))
        {
            return new SocialPublishResultDto
            {
                Platform = "tiktok",
                Success = false,
                Error = "TikTok publish requires a public videoUrl."
            };
        }

        var publishRequest = new
        {
            post_info = new
            {
                title = message.Length > 150 ? message[..150] : message,
                privacy_level = "PUBLIC_TO_EVERYONE",
                disable_comment = false,
                disable_duet = false,
                disable_stitch = false,
                video_cover_timestamp_ms = 1000
            },
            source_info = new
            {
                source = "PULL_FROM_URL",
                video_url = videoUrl
            }
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, $"{TikTokApiBase}/post/publish/video/init/");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        request.Content = JsonContent.Create(publishRequest);

        using var httpResponse = await _httpClient.SendAsync(request);
        var body = await httpResponse.Content.ReadAsStringAsync();

        if (!httpResponse.IsSuccessStatusCode)
        {
            return new SocialPublishResultDto
            {
                Platform = "tiktok",
                Success = false,
                Error = $"TikTok publish failed ({(int)httpResponse.StatusCode}): {TrimError(body)}"
            };
        }

        using var document = JsonDocument.Parse(body);
        var publishId = document.RootElement.TryGetProperty("data", out var data)
            && data.TryGetProperty("publish_id", out var pid)
            ? pid.GetString()
            : null;

        return new SocialPublishResultDto
        {
            Platform = "tiktok",
            Success = true,
            ExternalPostId = publishId,
            ExternalPostUrl = string.IsNullOrWhiteSpace(publishId) ? null : $"https://www.tiktok.com/upload?publish_id={publishId}"
        };
    }

    private static DateTimeOffset? ParseDate(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var node))
        {
            return null;
        }

        var value = node.GetString();
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var parsed)
            ? parsed
            : null;
    }

    private static DateTimeOffset? ParseUnixDate(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var node))
        {
            return null;
        }

        var value = node.GetString();
        if (!long.TryParse(value, out var unixSeconds))
        {
            return null;
        }

        return DateTimeOffset.FromUnixTimeSeconds(unixSeconds);
    }

    private static string TrimError(string body)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return "Unknown error";
        }

        return body.Length <= 400 ? body : body[..400];
    }
}
