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

    /// <summary>
    /// Cross-posts an uploaded media item (video or photo) to the requested social platforms.
    /// Used by the video/photo upload endpoints so uploads land in the same share pipeline as feed shares.
    /// </summary>
    Task<PublishSocialContentResponse> PublishMediaUploadAsync(
        Guid userId,
        string message,
        string publicMediaUrl,
        string mediaType,
        bool publishToFacebook,
        bool publishToTikTok,
        bool publishToYouTube);
}

public class SocialPlatformService : ISocialPlatformService
{
    private const string FacebookGraphBase = "https://graph.facebook.com/v20.0";
    private const string TikTokApiBase = "https://open.tiktokapis.com/v2";

    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<SocialPlatformService> _logger;
    private readonly IYouTubeService _youTubeService;

    public SocialPlatformService(HttpClient httpClient, IConfiguration configuration, ILogger<SocialPlatformService> logger, IYouTubeService youTubeService)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
        _youTubeService = youTubeService;
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
        var mediaType = ResolveMediaType(request);

        if (request.PublishToFacebook)
        {
            response.Results.Add(mediaType switch
            {
                SocialMediaType.Video => await PublishToFacebookAsync(message, request.LinkUrl, request.VideoUrl),
                SocialMediaType.Photo => await PublishPhotoToFacebookAsync(message, request.LinkUrl, request.PhotoUrl),
                _ => await PublishToFacebookAsync(message, request.LinkUrl, null)
            });
        }

        if (request.PublishToTikTok && mediaType == SocialMediaType.Photo)
        {
            // TikTok only accepts video; surface a clear result instead of silently dropping the photo.
            response.Results.Add(new SocialPublishResultDto
            {
                Platform = "tiktok",
                Success = false,
                Error = "TikTok does not support photo posts. Share photos to Facebook or YouTube instead."
            });
        }
        else if (request.PublishToTikTok)
        {
            response.Results.Add(await PublishToTikTokAsync(message, request.VideoUrl));
        }

        if (request.PublishToYouTube)
        {
            response.Results.Add(await PublishToYouTubeAsync(message, request.VideoUrl));
        }

        _logger.LogInformation(
            "User {UserId} requested cross-post. Facebook={Facebook}, TikTok={TikTok}, YouTube={YouTube}, MediaType={MediaType}",
            userId,
            request.PublishToFacebook,
            request.PublishToTikTok,
            request.PublishToYouTube,
            mediaType);

        return response;
    }

    public async Task<PublishSocialContentResponse> PublishMediaUploadAsync(
        Guid userId,
        string message,
        string publicMediaUrl,
        string mediaType,
        bool publishToFacebook,
        bool publishToTikTok,
        bool publishToYouTube)
    {
        var request = new PublishSocialContentRequest
        {
            Message = string.IsNullOrWhiteSpace(message) ? "New upload from Wiseravenshare" : message.Trim(),
            VideoUrl = mediaType == SocialMediaType.Video ? publicMediaUrl : null,
            PhotoUrl = mediaType == SocialMediaType.Photo ? publicMediaUrl : null,
            LinkUrl = publicMediaUrl,
            MediaType = mediaType,
            PublishToFacebook = publishToFacebook,
            PublishToTikTok = publishToTikTok,
            PublishToYouTube = publishToYouTube
        };

        return await PublishAsync(userId, request);
    }

    private static string ResolveMediaType(PublishSocialContentRequest request)
    {
        var raw = (request.MediaType ?? SocialMediaType.Auto).Trim().ToLowerInvariant();

        if (raw is SocialMediaType.Text or SocialMediaType.Photo or SocialMediaType.Video)
        {
            return raw;
        }

        // Auto-detect from whichever media URL was supplied.
        if (!string.IsNullOrWhiteSpace(request.VideoUrl))
        {
            return SocialMediaType.Video;
        }

        if (!string.IsNullOrWhiteSpace(request.PhotoUrl))
        {
            return SocialMediaType.Photo;
        }

        return SocialMediaType.Text;
    }

    private async Task<SocialPublishResultDto> PublishToFacebookAsync(string message, string? linkUrl, string? videoUrl = null)
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

        // Real video posts must go through the /videos edge; the /feed edge only accepts text, links and photos.
        if (!string.IsNullOrWhiteSpace(videoUrl))
        {
            return await PublishVideoToFacebookAsync(pageId, pageToken, message, videoUrl);
        }

        return await PublishToFacebookFeedAsync(pageId, pageToken, message, linkUrl);
    }

    private async Task<SocialPublishResultDto> PublishVideoToFacebookAsync(string pageId, string pageToken, string message, string videoUrl)
    {
        // Reel-style video post via the Graph API /videos edge (PULL_FROM_URL keeps the upload server-side).
        var form = new Dictionary<string, string>
        {
            ["description"] = message,
            ["file_url"] = videoUrl,
            ["access_token"] = pageToken
        };

        try
        {
            using var content = new FormUrlEncodedContent(form);
            using var httpResponse = await _httpClient.PostAsync($"{FacebookGraphBase}/{pageId}/videos", content);

            var body = await httpResponse.Content.ReadAsStringAsync();
            if (!httpResponse.IsSuccessStatusCode)
            {
                _logger.LogWarning(
                    "Facebook /videos publish failed ({Status}): {Body}. Falling back to a feed link post.",
                    (int)httpResponse.StatusCode,
                    TrimError(body));

                // The /videos edge requires extra app review (video_upload) and a publicly reachable file_url.
                // When it is unavailable, still land the share on the Page as a link post instead of dropping it.
                return await PublishToFacebookFeedAsync(pageId, pageToken, message, videoUrl);
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
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Facebook video publish threw for video URL {VideoUrl}", videoUrl);
            return new SocialPublishResultDto
            {
                Platform = "facebook",
                Success = false,
                Error = $"Facebook video publish failed: {ex.Message}"
            };
        }
    }

    private async Task<SocialPublishResultDto> PublishToFacebookFeedAsync(string pageId, string pageToken, string message, string? linkUrl)
    {
        try
        {
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
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Facebook feed fallback publish threw for URL {LinkUrl}", linkUrl);
            return new SocialPublishResultDto
            {
                Platform = "facebook",
                Success = false,
                Error = $"Facebook publish failed: {ex.Message}"
            };
        }
    }

    private async Task<SocialPublishResultDto> PublishPhotoToFacebookAsync(string message, string? linkUrl, string? photoUrl)
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

        return await PublishPhotoToFacebookConfiguredAsync(pageId, pageToken, message, linkUrl, photoUrl);
    }

    private async Task<SocialPublishResultDto> PublishPhotoToFacebookConfiguredAsync(string pageId, string pageToken, string message, string? linkUrl, string? photoUrl)
    {
        if (string.IsNullOrWhiteSpace(photoUrl))
        {
            return new SocialPublishResultDto
            {
                Platform = "facebook",
                Success = false,
                Error = "Facebook photo publish requires a public photoUrl."
            };
        }

        var form = new Dictionary<string, string>
        {
            ["caption"] = message,
            ["url"] = photoUrl,
            ["access_token"] = pageToken
        };

        try
        {
            using var content = new FormUrlEncodedContent(form);
            using var httpResponse = await _httpClient.PostAsync($"{FacebookGraphBase}/{pageId}/photos", content);

            var body = await httpResponse.Content.ReadAsStringAsync();
            if (!httpResponse.IsSuccessStatusCode)
            {
                return new SocialPublishResultDto
                {
                    Platform = "facebook",
                    Success = false,
                    Error = $"Facebook photo publish failed ({(int)httpResponse.StatusCode}): {TrimError(body)}"
                };
            }

            using var document = JsonDocument.Parse(body);
            var postId = document.RootElement.TryGetProperty("post_id", out var pid)
                ? pid.GetString()
                : (document.RootElement.TryGetProperty("id", out var altId) ? altId.GetString() : null);

            return new SocialPublishResultDto
            {
                Platform = "facebook",
                Success = true,
                ExternalPostId = postId,
                ExternalPostUrl = string.IsNullOrWhiteSpace(postId) ? null : $"https://www.facebook.com/{postId}"
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Facebook photo publish threw for photo URL {PhotoUrl}", photoUrl);
            return new SocialPublishResultDto
            {
                Platform = "facebook",
                Success = false,
                Error = $"Facebook photo publish failed: {ex.Message}"
            };
        }
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

    private async Task<SocialPublishResultDto> PublishToYouTubeAsync(string message, string? videoUrl)
    {
        if (string.IsNullOrWhiteSpace(videoUrl))
        {
            return new SocialPublishResultDto
            {
                Platform = "youtube",
                Success = false,
                Error = "YouTube publish requires a public videoUrl."
            };
        }

        try
        {
            var title = message.Length > 100 ? message[..100] : message;
            var description = $"Shared from Ravensight feed. Source: {videoUrl}";
            var publishedUrl = await _youTubeService.PublishVideoFromUrlAsync(videoUrl, title, description);

            return new SocialPublishResultDto
            {
                Platform = "youtube",
                Success = true,
                ExternalPostUrl = publishedUrl
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "YouTube publish failed for shared video URL.");
            return new SocialPublishResultDto
            {
                Platform = "youtube",
                Success = false,
                Error = ex.Message
            };
        }
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
            return "Unknown error (non-200 HTTP status returned by upstream platform API).";
        }

        try
        {
            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.TryGetProperty("error", out var errNode))
            {
                if (errNode.ValueKind == JsonValueKind.Object && errNode.TryGetProperty("message", out var msgNode))
                {
                    return msgNode.GetString() ?? body;
                }
                if (errNode.ValueKind == JsonValueKind.String)
                {
                    return errNode.GetString() ?? body;
                }
            }
            if (doc.RootElement.TryGetProperty("error_description", out var descNode))
            {
                return descNode.GetString() ?? body;
            }
        }
        catch
        {
            // Fallback for non-JSON error bodies
        }

        return body.Length <= 400 ? body : body[..400];
    }
}
