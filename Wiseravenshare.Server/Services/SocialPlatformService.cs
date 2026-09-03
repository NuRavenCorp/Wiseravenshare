using System.Globalization;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Wiseravenshare.Server.DTOs.Social;

namespace Wiseravenshare.Server.Services;

public interface ISocialPlatformService
{
    Task<IReadOnlyList<SocialFeedItemDto>> GetFacebookFeedAsync(string? pageId, int limit);
    Task<IReadOnlyList<SocialFeedItemDto>> GetTikTokFeedAsync(string? username, int limit);
    Task<IReadOnlyList<SocialFeedItemDto>> GetBlueskyFeedAsync(string? handle, int limit);
    Task<IReadOnlyList<SocialFeedItemDto>> GetRedditFeedAsync(string? subreddit, int limit);
    Task<IReadOnlyList<SocialFeedItemDto>> GetYouTubeFeedAsync(string? channelIdOrHandle, int limit);
    Task<IReadOnlyList<SocialFeedItemDto>> GetRssFeedAsync(string feedUrl, int limit);
    Task<IReadOnlyList<SocialFeedItemDto>> GetUnifiedFeedAsync(
        string? facebookPageId,
        string? tikTokUsername,
        string? blueskyHandle,
        string? subreddit,
        string? youtubeChannel,
        string? rssFeedUrl,
        string? searchQuery,
        int limit);

    Task<PublishSocialContentResponse> PublishAsync(Guid userId, PublishSocialContentRequest request);

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
    private const string FacebookGraphBase = "https://graph.facebook.com/v26.0";
    private const string TikTokApiBase = "https://open.tiktokapis.com/v2";
    private const string BlueskyPublicApiBase = "https://public.api.bsky.app/xrpc";
    private const string BlueskyAuthApiBase = "https://bsky.social/xrpc";
    private const string RedditBase = "https://www.reddit.com";

    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<SocialPlatformService> _logger;
    private readonly IYouTubeService _youTubeService;
    private readonly IRssFeedService _rssFeedService;

    public SocialPlatformService(
        HttpClient httpClient,
        IConfiguration configuration,
        ILogger<SocialPlatformService> logger,
        IYouTubeService youTubeService,
        IRssFeedService rssFeedService)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
        _youTubeService = youTubeService;
        _rssFeedService = rssFeedService;
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

        try
        {
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
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed fetching Facebook feed for page {PageId}", resolvedPageId);
            return [];
        }
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

        try
        {
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
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed fetching TikTok feed for username {Username}", resolvedUsername);
            return [];
        }
    }

    public async Task<IReadOnlyList<SocialFeedItemDto>> GetBlueskyFeedAsync(string? handle, int limit)
    {
        var resolvedHandle = string.IsNullOrWhiteSpace(handle)
            ? _configuration["Social:Bluesky:Handle"] ?? "bsky.app"
            : handle.Trim().TrimStart('@');

        if (string.IsNullOrWhiteSpace(resolvedHandle))
        {
            return [];
        }

        var safeLimit = Math.Clamp(limit, 1, 30);
        var url = $"{BlueskyPublicApiBase}/app.bsky.feed.getAuthorFeed?actor={Uri.EscapeDataString(resolvedHandle)}&limit={safeLimit}";

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.UserAgent.ParseAdd("Wiseravenshare/1.0 (Social Aggregator)");

            using var response = await _httpClient.SendAsync(request);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Bluesky feed request failed for handle {Handle}: {StatusCode}", resolvedHandle, response.StatusCode);
                return [];
            }

            var json = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);

            if (!doc.RootElement.TryGetProperty("feed", out var feedArray) || feedArray.ValueKind != JsonValueKind.Array)
            {
                return [];
            }

            var items = new List<SocialFeedItemDto>();
            foreach (var item in feedArray.EnumerateArray())
            {
                if (!item.TryGetProperty("post", out var post)) continue;

                var uri = post.TryGetProperty("uri", out var uriNode) ? uriNode.GetString() : null;
                var record = post.TryGetProperty("record", out var recNode) ? recNode : default;
                var text = record.ValueKind == JsonValueKind.Object && record.TryGetProperty("text", out var textNode) ? textNode.GetString() : null;
                var createdAtStr = record.ValueKind == JsonValueKind.Object && record.TryGetProperty("createdAt", out var createdNode) ? createdNode.GetString() : null;

                var author = post.TryGetProperty("author", out var authorNode) ? authorNode : default;
                var authorHandle = author.ValueKind == JsonValueKind.Object && author.TryGetProperty("handle", out var hNode) ? hNode.GetString() : resolvedHandle;

                // Extract image media URL if present in embed
                string? mediaUrl = null;
                if (post.TryGetProperty("embed", out var embed) && embed.ValueKind == JsonValueKind.Object)
                {
                    if (embed.TryGetProperty("images", out var images) && images.ValueKind == JsonValueKind.Array && images.GetArrayLength() > 0)
                    {
                        var firstImage = images[0];
                        mediaUrl = firstImage.TryGetProperty("fullsize", out var full) ? full.GetString()
                            : (firstImage.TryGetProperty("thumb", out var thumb) ? thumb.GetString() : null);
                    }
                    else if (embed.TryGetProperty("external", out var external) && external.TryGetProperty("thumb", out var extThumb))
                    {
                        mediaUrl = extThumb.GetString();
                    }
                }

                // Construct web permalink: https://bsky.app/profile/{handle}/post/{postId}
                string? permalink = null;
                if (!string.IsNullOrWhiteSpace(uri) && !string.IsNullOrWhiteSpace(authorHandle))
                {
                    var rkey = uri.Split('/').LastOrDefault();
                    permalink = $"https://bsky.app/profile/{authorHandle}/post/{rkey}";
                }

                items.Add(new SocialFeedItemDto
                {
                    Platform = "bluesky",
                    ExternalId = uri ?? Guid.NewGuid().ToString(),
                    Text = text,
                    MediaUrl = mediaUrl,
                    PermalinkUrl = permalink,
                    AuthorHandle = authorHandle,
                    CreatedAt = DateTimeOffset.TryParse(createdAtStr, out var parsed) ? parsed : DateTimeOffset.UtcNow
                });
            }

            return items;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed fetching Bluesky feed for {Handle}", resolvedHandle);
            return [];
        }
    }

    public async Task<IReadOnlyList<SocialFeedItemDto>> GetRedditFeedAsync(string? subreddit, int limit)
    {
        var resolvedSubreddit = string.IsNullOrWhiteSpace(subreddit)
            ? _configuration["Social:Reddit:Subreddit"] ?? "technology"
            : subreddit.Trim().TrimStart('r', '/');

        if (string.IsNullOrWhiteSpace(resolvedSubreddit))
        {
            return [];
        }

        var safeLimit = Math.Clamp(limit, 1, 30);
        var url = $"{RedditBase}/r/{Uri.EscapeDataString(resolvedSubreddit)}/hot.json?limit={safeLimit}";

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Wiseravenshare/1.0 (Reddit Feed Engine)");

            using var response = await _httpClient.SendAsync(request);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Reddit request failed for r/{Subreddit}: {StatusCode}", resolvedSubreddit, response.StatusCode);
                return [];
            }

            var json = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);

            if (!doc.RootElement.TryGetProperty("data", out var data)
                || !data.TryGetProperty("children", out var children)
                || children.ValueKind != JsonValueKind.Array)
            {
                return [];
            }

            var items = new List<SocialFeedItemDto>();
            foreach (var child in children.EnumerateArray())
            {
                if (!child.TryGetProperty("data", out var postData)) continue;

                var id = postData.TryGetProperty("id", out var idNode) ? idNode.GetString() : null;
                var title = postData.TryGetProperty("title", out var titleNode) ? titleNode.GetString() : null;
                var selftext = postData.TryGetProperty("selftext", out var selfNode) ? selfNode.GetString() : null;
                var permalinkRel = postData.TryGetProperty("permalink", out var permNode) ? permNode.GetString() : null;
                var author = postData.TryGetProperty("author", out var authorNode) ? authorNode.GetString() : null;
                var thumbnail = postData.TryGetProperty("thumbnail", out var thumbNode) ? thumbNode.GetString() : null;
                var urlPost = postData.TryGetProperty("url", out var urlNode) ? urlNode.GetString() : null;
                var createdUtc = postData.TryGetProperty("created_utc", out var timeNode) ? timeNode.GetDouble() : 0;
                var score = postData.TryGetProperty("score", out var scoreNode) ? scoreNode.GetInt32() : 0;
                var numComments = postData.TryGetProperty("num_comments", out var commNode) ? commNode.GetInt32() : 0;

                string? mediaUrl = null;
                if (!string.IsNullOrWhiteSpace(urlPost) && Regex.IsMatch(urlPost, @"\.(jpg|jpeg|png|gif|webp)(\?|$)", RegexOptions.IgnoreCase))
                {
                    mediaUrl = urlPost;
                }
                else if (!string.IsNullOrWhiteSpace(thumbnail) && (thumbnail.StartsWith("http://") || thumbnail.StartsWith("https://")))
                {
                    mediaUrl = thumbnail;
                }

                var fullText = string.IsNullOrWhiteSpace(selftext)
                    ? title
                    : $"{title}\n\n{selftext}";

                var permalink = !string.IsNullOrWhiteSpace(permalinkRel)
                    ? $"{RedditBase}{permalinkRel}"
                    : (urlPost ?? $"{RedditBase}/r/{resolvedSubreddit}");

                items.Add(new SocialFeedItemDto
                {
                    Platform = "reddit",
                    ExternalId = id ?? Guid.NewGuid().ToString(),
                    Text = $"[r/{resolvedSubreddit} • {score} ⬆️ • {numComments} 💬]\n{fullText}",
                    MediaUrl = mediaUrl,
                    PermalinkUrl = permalink,
                    AuthorHandle = $"u/{author ?? "anonymous"}",
                    CreatedAt = createdUtc > 0 ? DateTimeOffset.FromUnixTimeSeconds((long)createdUtc) : DateTimeOffset.UtcNow
                });
            }

            return items;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed fetching Reddit feed for r/{Subreddit}", resolvedSubreddit);
            return [];
        }
    }

    public async Task<IReadOnlyList<SocialFeedItemDto>> GetYouTubeFeedAsync(string? channelIdOrHandle, int limit)
    {
        var target = string.IsNullOrWhiteSpace(channelIdOrHandle)
            ? _configuration["Social:YouTube:ChannelId"] ?? _configuration["Social:YouTube:Handle"]
            : channelIdOrHandle.Trim();

        if (string.IsNullOrWhiteSpace(target))
        {
            return [];
        }

        string rssUrl;
        if (target.StartsWith("UC") && target.Length >= 20)
        {
            rssUrl = $"https://www.youtube.com/feeds/videos.xml?channel_id={target}";
        }
        else
        {
            var cleanHandle = target.TrimStart('@');
            rssUrl = $"https://www.youtube.com/feeds/videos.xml?user={cleanHandle}";
        }

        var items = await _rssFeedService.FetchAndParseFeedAsync(rssUrl, limit);

        // Customize items for YouTube platform branding
        return items.Select(item => new SocialFeedItemDto
        {
            Platform = "youtube",
            ExternalId = item.ExternalId,
            Text = item.Text,
            MediaUrl = item.MediaUrl,
            PermalinkUrl = item.PermalinkUrl,
            AuthorHandle = item.AuthorHandle,
            CreatedAt = item.CreatedAt
        }).ToList();
    }

    public async Task<IReadOnlyList<SocialFeedItemDto>> GetRssFeedAsync(string feedUrl, int limit)
    {
        return await _rssFeedService.FetchAndParseFeedAsync(feedUrl, limit);
    }

    public async Task<IReadOnlyList<SocialFeedItemDto>> GetUnifiedFeedAsync(
        string? facebookPageId,
        string? tikTokUsername,
        string? blueskyHandle,
        string? subreddit,
        string? youtubeChannel,
        string? rssFeedUrl,
        string? searchQuery,
        int limit)
    {
        var safeLimit = Math.Clamp(limit, 1, 100);
        var perPlatformLimit = Math.Max(10, safeLimit / 2);

        var tasks = new List<Task<IReadOnlyList<SocialFeedItemDto>>>();

        if (!string.IsNullOrWhiteSpace(facebookPageId) || !string.IsNullOrWhiteSpace(_configuration["Social:Facebook:PageId"]))
        {
            tasks.Add(GetFacebookFeedAsync(facebookPageId, perPlatformLimit));
        }

        if (!string.IsNullOrWhiteSpace(tikTokUsername) || !string.IsNullOrWhiteSpace(_configuration["Social:TikTok:Username"]))
        {
            tasks.Add(GetTikTokFeedAsync(tikTokUsername, perPlatformLimit));
        }

        if (!string.IsNullOrWhiteSpace(blueskyHandle) || !string.IsNullOrWhiteSpace(_configuration["Social:Bluesky:Handle"]))
        {
            tasks.Add(GetBlueskyFeedAsync(blueskyHandle, perPlatformLimit));
        }

        if (!string.IsNullOrWhiteSpace(subreddit) || !string.IsNullOrWhiteSpace(_configuration["Social:Reddit:Subreddit"]))
        {
            tasks.Add(GetRedditFeedAsync(subreddit, perPlatformLimit));
        }

        if (!string.IsNullOrWhiteSpace(youtubeChannel) || !string.IsNullOrWhiteSpace(_configuration["Social:YouTube:ChannelId"]))
        {
            tasks.Add(GetYouTubeFeedAsync(youtubeChannel, perPlatformLimit));
        }

        if (!string.IsNullOrWhiteSpace(rssFeedUrl))
        {
            tasks.Add(GetRssFeedAsync(rssFeedUrl, perPlatformLimit));
        }

        var results = await Task.WhenAll(tasks);
        var combined = results
            .SelectMany(r => r)
            .OrderByDescending(item => item.CreatedAt ?? DateTimeOffset.MinValue)
            .ToList();

        if (!string.IsNullOrWhiteSpace(searchQuery))
        {
            var query = searchQuery.Trim();
            combined = combined.Where(item =>
                (item.Text != null && item.Text.Contains(query, StringComparison.OrdinalIgnoreCase)) ||
                (item.AuthorHandle != null && item.AuthorHandle.Contains(query, StringComparison.OrdinalIgnoreCase)) ||
                (item.Platform != null && item.Platform.Contains(query, StringComparison.OrdinalIgnoreCase))
            ).ToList();
        }

        return combined.Take(safeLimit).ToList();
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
                SocialMediaType.Music => await PublishMusicToFacebookAsync(message, request.LinkUrl, request.MusicUrl),
                _ => await PublishToFacebookAsync(message, request.LinkUrl, null)
            });
        }

        if (request.PublishToTikTok && (mediaType == SocialMediaType.Photo || mediaType == SocialMediaType.Music))
        {
            var mediaName = mediaType == SocialMediaType.Music ? "music" : "photo";
            response.Results.Add(new SocialPublishResultDto
            {
                Platform = "tiktok",
                Success = false,
                Error = $"TikTok does not support {mediaName} posts. Share to Facebook or YouTube instead."
            });
        }
        else if (request.PublishToTikTok)
        {
            response.Results.Add(await PublishToTikTokAsync(message, request.VideoUrl));
        }

        if (request.PublishToYouTube && (mediaType == SocialMediaType.Photo || mediaType == SocialMediaType.Music))
        {
            var mediaName = mediaType == SocialMediaType.Music ? "music" : "photo";
            response.Results.Add(new SocialPublishResultDto
            {
                Platform = "youtube",
                Success = false,
                Error = $"YouTube does not support {mediaName} posts via API. Share to Facebook instead."
            });
        }
        else if (request.PublishToYouTube)
        {
            response.Results.Add(await PublishToYouTubeAsync(message, request.VideoUrl));
        }

        if (request.PublishToBluesky)
        {
            response.Results.Add(await PublishToBlueskyAsync(message, request.LinkUrl, request.PhotoUrl));
        }

        _logger.LogInformation(
            "User {UserId} requested cross-post. Facebook={Facebook}, TikTok={TikTok}, YouTube={YouTube}, Bluesky={Bluesky}, MediaType={MediaType}",
            userId,
            request.PublishToFacebook,
            request.PublishToTikTok,
            request.PublishToYouTube,
            request.PublishToBluesky,
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

        if (raw is SocialMediaType.Text or SocialMediaType.Photo or SocialMediaType.Video or SocialMediaType.Music)
        {
            return raw;
        }

        if (!string.IsNullOrWhiteSpace(request.VideoUrl))
        {
            return SocialMediaType.Video;
        }

        if (!string.IsNullOrWhiteSpace(request.PhotoUrl))
        {
            return SocialMediaType.Photo;
        }

        if (!string.IsNullOrWhiteSpace(request.MusicUrl))
        {
            return SocialMediaType.Music;
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

        if (!string.IsNullOrWhiteSpace(videoUrl))
        {
            return await PublishVideoToFacebookAsync(pageId, pageToken, message, videoUrl);
        }

        return await PublishToFacebookFeedAsync(pageId, pageToken, message, linkUrl);
    }

    private async Task<SocialPublishResultDto> PublishVideoToFacebookAsync(string pageId, string pageToken, string message, string videoUrl)
    {
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

    private async Task<SocialPublishResultDto> PublishMusicToFacebookAsync(string message, string? linkUrl, string? musicUrl)
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

        return await PublishMusicToFacebookConfiguredAsync(pageId, pageToken, message, linkUrl, musicUrl);
    }

    private async Task<SocialPublishResultDto> PublishMusicToFacebookConfiguredAsync(string pageId, string pageToken, string message, string? linkUrl, string? musicUrl)
    {
        if (string.IsNullOrWhiteSpace(musicUrl))
        {
            return new SocialPublishResultDto
            {
                Platform = "facebook",
                Success = false,
                Error = "Facebook music publish requires a public musicUrl."
            };
        }

        var form = new Dictionary<string, string>
        {
            ["message"] = $"{message}\n\n🎵 Audio: {musicUrl}",
            ["access_token"] = pageToken
        };

        if (!string.IsNullOrWhiteSpace(linkUrl))
        {
            form["link"] = linkUrl;
        }

        try
        {
            using var content = new FormUrlEncodedContent(form);
            using var httpResponse = await _httpClient.PostAsync($"{FacebookGraphBase}/{pageId}/feed", content);

            var body = await httpResponse.Content.ReadAsStringAsync();
            if (!httpResponse.IsSuccessStatusCode)
            {
                return new SocialPublishResultDto
                {
                    Platform = "facebook",
                    Success = false,
                    Error = $"Facebook music publish failed ({(int)httpResponse.StatusCode}): {TrimError(body)}"
                };
            }

            using var document = JsonDocument.Parse(body);
            var postId = document.RootElement.TryGetProperty("id", out var pid) ? pid.GetString() : null;

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
            _logger.LogWarning(ex, "Facebook music publish threw for music URL {MusicUrl}", musicUrl);
            return new SocialPublishResultDto
            {
                Platform = "facebook",
                Success = false,
                Error = $"Facebook music publish failed: {ex.Message}"
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

        try
        {
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
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "TikTok publish failed for video URL {VideoUrl}", videoUrl);
            return new SocialPublishResultDto
            {
                Platform = "tiktok",
                Success = false,
                Error = $"TikTok publish failed: {ex.Message}"
            };
        }
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

    private async Task<SocialPublishResultDto> PublishToBlueskyAsync(string message, string? linkUrl, string? photoUrl)
    {
        var handle = _configuration["Social:Bluesky:Handle"];
        var appPassword = _configuration["Social:Bluesky:AppPassword"];

        if (string.IsNullOrWhiteSpace(handle) || string.IsNullOrWhiteSpace(appPassword))
        {
            return new SocialPublishResultDto
            {
                Platform = "bluesky",
                Success = false,
                Error = "Bluesky is not configured. Set Social:Bluesky:Handle and Social:Bluesky:AppPassword in settings."
            };
        }

        try
        {
            // 1. Create Session
            var authPayload = new { identifier = handle, password = appPassword };
            using var authResponse = await _httpClient.PostAsJsonAsync($"{BlueskyAuthApiBase}/com.atproto.server.createSession", authPayload);

            if (!authResponse.IsSuccessStatusCode)
            {
                var errBody = await authResponse.Content.ReadAsStringAsync();
                return new SocialPublishResultDto
                {
                    Platform = "bluesky",
                    Success = false,
                    Error = $"Bluesky authentication failed: {TrimError(errBody)}"
                };
            }

            var authJson = await authResponse.Content.ReadAsStringAsync();
            using var authDoc = JsonDocument.Parse(authJson);
            var accessJwt = authDoc.RootElement.GetProperty("accessJwt").GetString();
            var did = authDoc.RootElement.GetProperty("did").GetString();

            // 2. Post Record
            var postText = message;
            if (!string.IsNullOrWhiteSpace(linkUrl))
            {
                postText = $"{postText}\n\n{linkUrl}";
            }

            var recordObj = new
            {
                repo = did,
                collection = "app.bsky.feed.post",
                record = new
                {
                    text = postText,
                    createdAt = DateTimeOffset.UtcNow.ToString("o"),
                    mtype = "app.bsky.feed.post"
                }
            };

            using var postReq = new HttpRequestMessage(HttpMethod.Post, $"{BlueskyAuthApiBase}/com.atproto.repo.createRecord");
            postReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessJwt);
            postReq.Content = JsonContent.Create(recordObj);

            using var postRes = await _httpClient.SendAsync(postReq);
            var postBody = await postRes.Content.ReadAsStringAsync();

            if (!postRes.IsSuccessStatusCode)
            {
                return new SocialPublishResultDto
                {
                    Platform = "bluesky",
                    Success = false,
                    Error = $"Bluesky post failed: {TrimError(postBody)}"
                };
            }

            using var postDoc = JsonDocument.Parse(postBody);
            var uri = postDoc.RootElement.GetProperty("uri").GetString();
            var rkey = uri?.Split('/').LastOrDefault();
            var postUrl = $"https://bsky.app/profile/{handle}/post/{rkey}";

            return new SocialPublishResultDto
            {
                Platform = "bluesky",
                Success = true,
                ExternalPostId = uri,
                ExternalPostUrl = postUrl
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Bluesky publish failed for handle {Handle}", handle);
            return new SocialPublishResultDto
            {
                Platform = "bluesky",
                Success = false,
                Error = $"Bluesky publish error: {ex.Message}"
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
        }

        return body.Length <= 400 ? body : body[..400];
    }
}
