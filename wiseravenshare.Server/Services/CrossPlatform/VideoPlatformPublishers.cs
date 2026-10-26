// Wiseravenshare.Server/Services/CrossPlatform/VideoPlatformPublishers.cs
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Wiseravenshare.Server.DTOs.Social;

namespace Wiseravenshare.Server.Services.CrossPlatform;

/// <summary>
/// Publishes video to TikTok via the Content Posting API (PULL_FROM_URL).
/// Videos only — TikTok has no photo/text posts via the API.
/// Config: Social:TikTok:AccessToken.
/// </summary>
public class TikTokPublisher : ICrossPlatformPublisher
{
    private const string ApiBase = "https://open.tiktokapis.com/v2";
    private const string ZernioDefaultBaseUrl = "https://api.zernio.com";
    private const string ZernioDefaultTikTokPath = "/v1/tiktok/publish";

    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<TikTokPublisher> _logger;

    public TikTokPublisher(HttpClient httpClient, IConfiguration configuration, ILogger<TikTokPublisher> logger)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
    }

    public string Platform => SocialPlatforms.TikTok;

    public bool IsConfigured()
    {
        if (UseZernio())
        {
            var apiKey = GetZernioApiKey();
            return !string.IsNullOrWhiteSpace(apiKey);
        }

        var nativeConfigured = !string.IsNullOrWhiteSpace(_configuration["Social:TikTok:AccessToken"]);
        if (UseZernioFallback())
        {
            return nativeConfigured || !string.IsNullOrWhiteSpace(GetZernioApiKey());
        }

        return nativeConfigured;
    }

    public async Task<CrossPlatformPublishResultDto> PublishAsync(CrossPlatformPublishRequest request)
    {
        if (UseZernio())
        {
            return await PublishViaZernioAsync(request);
        }

        if (string.IsNullOrWhiteSpace(request.MediaUrl) || request.MediaType != SocialMediaType.Video)
        {
            if (UseZernioFallback() && !string.IsNullOrWhiteSpace(GetZernioApiKey()))
            {
                return await PublishViaZernioAsync(request);
            }

            return new CrossPlatformPublishResultDto
            {
                Platform = Platform,
                Success = false,
                Error = "TikTok native publish requires a public videoUrl; photo and text posts are only supported via Zernio."
            };
        }

        var accessToken = _configuration["Social:TikTok:AccessToken"];
        if (string.IsNullOrWhiteSpace(accessToken))
        {
            if (UseZernioFallback() && !string.IsNullOrWhiteSpace(GetZernioApiKey()))
            {
                return await PublishViaZernioAsync(request);
            }

            return CrossPlatformErrors.NotConfigured(Platform, "Social:TikTok:AccessToken");
        }

        var disableComment = request.DisableComment ?? false;
        var disableDuet = request.DisableDuet ?? false;
        var disableStitch = request.DisableStitch ?? false;
        var publishRequest = new
        {
            post_info = new
            {
                title = request.Message.Truncate(150),
                privacy_level = "PUBLIC_TO_EVERYONE",
                disable_comment = disableComment,
                disable_duet = disableDuet,
                disable_stitch = disableStitch,
                video_cover_timestamp_ms = 1000
            },
            source_info = new
            {
                source = "PULL_FROM_URL",
                video_url = request.MediaUrl
            }
        };

        try
        {
            using var httpRequest = new HttpRequestMessage(HttpMethod.Post, $"{ApiBase}/post/publish/video/init/");
            httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            httpRequest.Content = JsonContent.Create(publishRequest);

            using var response = await _httpClient.SendAsync(httpRequest);
            var body = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("TikTok publish failed ({Status}): {Body}", (int)response.StatusCode, body);
                var nativeError = CrossPlatformErrors.Failed(Platform, $"TikTok publish failed ({(int)response.StatusCode}): {body.Truncate(400)}");
                if (UseZernioFallback() && !string.IsNullOrWhiteSpace(GetZernioApiKey()))
                {
                    var fallbackResult = await PublishViaZernioAsync(request);
                    if (fallbackResult.Success)
                    {
                        return fallbackResult;
                    }

                    fallbackResult.Error = $"Native TikTok publish failed: {nativeError.Error ?? "Unknown error"} | Zernio fallback failed: {fallbackResult.Error ?? "Unknown error"}";
                    return fallbackResult;
                }

                return nativeError;
            }

            using var document = JsonDocument.Parse(body);
            var publishId = document.RootElement.TryGetProperty("data", out var data)
                && data.TryGetProperty("publish_id", out var pid)
                ? pid.GetString()
                : null;

            return new CrossPlatformPublishResultDto
            {
                Platform = Platform,
                Success = true,
                ExternalPostId = publishId,
                ExternalPostUrl = string.IsNullOrWhiteSpace(publishId) ? null : $"https://www.tiktok.com/upload?publish_id={publishId}"
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "TikTok publish threw for post {PostId}", request.PostId);
            if (UseZernioFallback() && !string.IsNullOrWhiteSpace(GetZernioApiKey()))
            {
                var fallbackResult = await PublishViaZernioAsync(request);
                if (fallbackResult.Success)
                {
                    return fallbackResult;
                }

                fallbackResult.Error = $"Native TikTok publish failed: {ex.Message} | Zernio fallback failed: {fallbackResult.Error ?? "Unknown error"}";
                return fallbackResult;
            }

            return CrossPlatformErrors.Failed(Platform, $"TikTok publish failed: {ex.Message}");
        }
    }

    private async Task<CrossPlatformPublishResultDto> PublishViaZernioAsync(CrossPlatformPublishRequest request)
    {
        var apiKey = GetZernioApiKey();
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return CrossPlatformErrors.NotConfigured(Platform, "Social:Zernio:ApiKey");
        }

        var baseUrl = (_configuration["Social:Zernio:BaseUrl"] ?? ZernioDefaultBaseUrl).TrimEnd('/');
        var publishPath = _configuration["Social:Zernio:TikTok:PublishPath"] ?? ZernioDefaultTikTokPath;
        var configuredScheduleAtUtc = _configuration["Social:Zernio:TikTok:ScheduleAtUtc"];
        var configuredSaveAsDraft = _configuration.GetValue("Social:Zernio:TikTok:SaveAsDraft", false);

        if (!Uri.TryCreate($"{baseUrl}{publishPath}", UriKind.Absolute, out var endpoint))
        {
            return CrossPlatformErrors.Failed(Platform, "Zernio TikTok endpoint is invalid.");
        }

        var allMediaUrls = (request.MediaUrls ?? [])
            .Where(url => !string.IsNullOrWhiteSpace(url))
            .Select(url => url.Trim())
            .ToList();
        if (!string.IsNullOrWhiteSpace(request.MediaUrl))
        {
            allMediaUrls.Insert(0, request.MediaUrl.Trim());
        }
        allMediaUrls = allMediaUrls
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var isPhoto = string.Equals(request.MediaType, SocialMediaType.Photo, StringComparison.OrdinalIgnoreCase);
        var isVideo = string.Equals(request.MediaType, SocialMediaType.Video, StringComparison.OrdinalIgnoreCase)
            || (!isPhoto && !string.IsNullOrWhiteSpace(request.MediaUrl));
        if (!isPhoto && !isVideo)
        {
            return CrossPlatformErrors.Failed(Platform, "Zernio TikTok publish supports only video or photo posts.");
        }

        if (isPhoto && allMediaUrls.Count == 0)
        {
            return CrossPlatformErrors.Failed(Platform, "Zernio TikTok photo publish requires at least one public image URL.");
        }

        if (isVideo && allMediaUrls.Count == 0)
        {
            return CrossPlatformErrors.Failed(Platform, "Zernio TikTok video publish requires a public video URL.");
        }

        var caption = request.Message.Truncate(2200);
        var hashtags = ExtractHashtags(caption);
        var scheduleAtUtc = string.IsNullOrWhiteSpace(request.ScheduleAtUtc)
            ? configuredScheduleAtUtc
            : request.ScheduleAtUtc;
        var saveAsDraft = request.SaveAsDraft ?? configuredSaveAsDraft;
        var disableComment = request.DisableComment ?? false;
        var disableDuet = request.DisableDuet ?? false;
        var disableStitch = request.DisableStitch ?? false;

        var payload = new
        {
            mediaType = isPhoto ? "photo" : "video",
            videoUrl = isVideo ? allMediaUrls[0] : null,
            imageUrls = isPhoto ? allMediaUrls.Take(35).ToList() : null,
            caption,
            hashtags,
            scheduleAtUtc = string.IsNullOrWhiteSpace(scheduleAtUtc) ? null : scheduleAtUtc,
            saveAsDraft,
            interaction = new
            {
                disableComment,
                disableDuet,
                disableStitch
            },
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
            httpRequest.Content = JsonContent.Create(payload);

            using var response = await _httpClient.SendAsync(httpRequest);
            var body = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Zernio TikTok publish failed ({Status}): {Body}", (int)response.StatusCode, body);
                return CrossPlatformErrors.Failed(Platform, $"Zernio TikTok publish failed ({(int)response.StatusCode}): {body.Truncate(400)}");
            }

            using var document = JsonDocument.Parse(body);
            var externalPostId = ReadJsonString(document.RootElement, "publishId")
                ?? ReadJsonString(document.RootElement, "postId")
                ?? ReadJsonString(document.RootElement, "id")
                ?? (document.RootElement.TryGetProperty("data", out var data)
                    ? ReadJsonString(data, "publishId")
                        ?? ReadJsonString(data, "postId")
                        ?? ReadJsonString(data, "id")
                    : null);

            var externalPostUrl = ReadJsonString(document.RootElement, "postUrl")
                ?? ReadJsonString(document.RootElement, "url")
                ?? (document.RootElement.TryGetProperty("data", out var postData)
                    ? ReadJsonString(postData, "postUrl")
                        ?? ReadJsonString(postData, "url")
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
            _logger.LogWarning(ex, "Zernio TikTok publish threw for post {PostId}", request.PostId);
            return CrossPlatformErrors.Failed(Platform, $"Zernio TikTok publish failed: {ex.Message}");
        }
    }

    private bool UseZernio()
    {
        var provider = (_configuration["Social:TikTok:Provider"] ?? "native")
            .Trim()
            .ToLowerInvariant();
        return provider == "zernio";
    }

    private bool UseZernioFallback()
    {
        var provider = (_configuration["Social:TikTok:Provider"] ?? "native")
            .Trim()
            .ToLowerInvariant();
        if (provider is "fallback" or "native-fallback" or "zernio-fallback")
        {
            return true;
        }

        return _configuration.GetValue("Social:Zernio:FallbackEnabled", false);
    }

    private static List<string> ExtractHashtags(string caption)
    {
        if (string.IsNullOrWhiteSpace(caption))
        {
            return [];
        }

        return caption
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(token => token.StartsWith('#') && token.Length > 1)
            .Select(token => token.Trim().TrimEnd('.', ',', ';', ':', '!', '?'))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(30)
            .ToList();
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

    private string? GetZernioApiKey() =>
        _configuration["Social:Zernio:ApiKey"]
        ?? _configuration["Social_Zernio_APIKey"]
        ?? _configuration["ZERNIO_API_KEY"];
}

/// <summary>
/// Publishes video to YouTube by delegating to the existing IYouTubeService
/// (OAuth upload pipeline already wired in this project).
/// Photo and text posts are routed to the YouTube Community Post API using
/// the per-user OAuth token obtained via the existing YouTube connect flow.
/// </summary>
public class YouTubePublisher : ICrossPlatformPublisher
{
    private const string ZernioDefaultBaseUrl = "https://api.zernio.com";
    private const string ZernioDefaultPublishPath = "/v1/youtube/publish";

    private readonly IYouTubeService _youTubeService;
    private readonly IYouTubeTokenService _youTubeTokenService;
    private readonly IConfiguration _configuration;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<YouTubePublisher> _logger;

    public YouTubePublisher(
        IYouTubeService youTubeService,
        IYouTubeTokenService youTubeTokenService,
        IConfiguration configuration,
        IHttpClientFactory httpClientFactory,
        ILogger<YouTubePublisher> logger)
    {
        _youTubeService = youTubeService;
        _youTubeTokenService = youTubeTokenService;
        _configuration = configuration;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public string Platform => SocialPlatforms.YouTube;

    public bool IsConfigured()
    {
        if (UseZernio())
        {
            return CanUseZernio();
        }

        return true; // Token availability is checked at publish time.
    }

    public async Task<CrossPlatformPublishResultDto> PublishAsync(CrossPlatformPublishRequest request)
    {
        // Photo and text posts are routed to the YouTube Community Post alternative.
        var isPhoto = request.MediaType == SocialMediaType.Photo
            || (string.IsNullOrWhiteSpace(request.MediaUrl) && request.MediaType != SocialMediaType.Video);
        var isTextOnly = string.IsNullOrWhiteSpace(request.MediaUrl);

        if (isPhoto || isTextOnly)
        {
            return await PublishCommunityPostAsync(request);
        }

        if (request.MediaType != SocialMediaType.Video)
        {
            // Non-video, non-photo (e.g. music) — graceful skip with explanation.
            return new CrossPlatformPublishResultDto
            {
                Platform = Platform,
                Success = false,
                Skipped = true,
                SkipReason = $"YouTube does not support {request.MediaType} posts. Use a video or share as a Community Post."
            };
        }

        try
        {
            if (UseZernio())
            {
                return await PublishViaZernioAsync(request);
            }

            var title = request.Message.Truncate(100);
            var description = $"Shared from Ravensight feed. Source: {request.MediaUrl}";
            var publishedUrl = await _youTubeService.PublishVideoFromUrlAsync(request.MediaUrl, title, description);

            return new CrossPlatformPublishResultDto
            {
                Platform = Platform,
                Success = true,
                ExternalPostUrl = publishedUrl
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "YouTube publish failed for post {PostId}", request.PostId);
            if (UseZernioFallback() && CanUseZernio())
            {
                var fallbackResult = await PublishViaZernioAsync(request);
                if (fallbackResult.Success)
                {
                    return fallbackResult;
                }

                fallbackResult.Error = $"Native YouTube video publish failed: {ex.Message} | Zernio fallback failed: {fallbackResult.Error ?? "Unknown error"}";
                return fallbackResult;
            }

            return CrossPlatformErrors.Failed(Platform, ex.Message);
        }
    }

    /// <summary>
    /// Alternative route for photo/text posts: YouTube Community Post (channel Community tab).
    /// Uses the per-user OAuth token stored when the user connected their YouTube account.
    /// Falls back to Zernio bridge if configured, or skips gracefully with a clear message.
    /// </summary>
    private async Task<CrossPlatformPublishResultDto> PublishCommunityPostAsync(CrossPlatformPublishRequest request)
    {
        if (UseZernio())
        {
            return await PublishCommunityViaZernioAsync(request);
        }

        // Resolve per-user token from the stored YouTube connection (obtained at OAuth connect time).
        var userId = request.UserId != Guid.Empty ? request.UserId.ToString() : null;
        var accessToken = userId is not null
            ? await _youTubeTokenService.GetValidAccessTokenAsync(userId)
            : null;

        // Fall back to global config token if user-level token is absent.
        if (string.IsNullOrWhiteSpace(accessToken))
            accessToken = _configuration["Social:YouTube:OAuthAccessToken"];

        if (string.IsNullOrWhiteSpace(accessToken))
        {
            if (UseZernioFallback() && CanUseZernio())
            {
                return await PublishCommunityViaZernioAsync(request);
            }

            return new CrossPlatformPublishResultDto
            {
                Platform = Platform,
                Success = false,
                Skipped = true,
                SkipReason = "YouTube photo/text posts require your channel to be connected. " +
                             "Go to Social Hub → Connect → YouTube and grant posting permissions."
            };
        }

        // Build Community Post text — embed photo URL when present so followers can view the image.
        var text = string.IsNullOrWhiteSpace(request.MediaUrl)
            ? request.Message.Truncate(5000)
            : $"{request.Message.Truncate(4900)}\n\n📸 {request.MediaUrl}";

        try
        {
            var endpoint = "https://www.googleapis.com/youtube/v3/communityPosts?part=snippet";
            var client = _httpClientFactory.CreateClient();
            using var httpRequest = new HttpRequestMessage(HttpMethod.Post, endpoint);
            httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            httpRequest.Content = System.Net.Http.Json.JsonContent.Create(new
            {
                snippet = new
                {
                    textOriginalContent = text,
                    type = "text"
                }
            });

            using var response = await client.SendAsync(httpRequest);
            var body = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("YouTube Community Post failed ({Status}): {Body}", (int)response.StatusCode, body);
                var nativeError = CrossPlatformErrors.Failed(Platform, $"YouTube Community Post failed ({(int)response.StatusCode}): {body.Truncate(400)}");
                if (UseZernioFallback() && CanUseZernio())
                {
                    var fallbackResult = await PublishCommunityViaZernioAsync(request);
                    if (fallbackResult.Success)
                    {
                        return fallbackResult;
                    }

                    fallbackResult.Error = $"Native YouTube community publish failed: {nativeError.Error ?? "Unknown error"} | Zernio fallback failed: {fallbackResult.Error ?? "Unknown error"}";
                    return fallbackResult;
                }

                return nativeError;
            }

            using var document = System.Text.Json.JsonDocument.Parse(body);
            var postId = document.RootElement.TryGetProperty("id", out var idEl) ? idEl.GetString() : null;

            return new CrossPlatformPublishResultDto
            {
                Platform = Platform,
                Success = true,
                ExternalPostId = postId,
                ExternalPostUrl = string.IsNullOrWhiteSpace(postId) ? null : $"https://www.youtube.com/post/{postId}"
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "YouTube Community Post threw for post {PostId}", request.PostId);
            if (UseZernioFallback() && CanUseZernio())
            {
                var fallbackResult = await PublishCommunityViaZernioAsync(request);
                if (fallbackResult.Success)
                {
                    return fallbackResult;
                }

                fallbackResult.Error = $"Native YouTube community publish failed: {ex.Message} | Zernio fallback failed: {fallbackResult.Error ?? "Unknown error"}";
                return fallbackResult;
            }

            return CrossPlatformErrors.Failed(Platform, $"YouTube Community Post failed: {ex.Message}");
        }
    }

    private async Task<CrossPlatformPublishResultDto> PublishCommunityViaZernioAsync(CrossPlatformPublishRequest request)
    {
        var apiKey = _configuration["Social:Zernio:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return CrossPlatformErrors.NotConfigured(Platform, "Social:Zernio:ApiKey");
        }

        var baseUrl = (_configuration["Social:Zernio:BaseUrl"] ?? ZernioDefaultBaseUrl).TrimEnd('/');
        var publishPath = _configuration["Social:Zernio:YouTube:CommunityPostPath"] ?? "/v1/youtube/community-post";
        if (!Uri.TryCreate($"{baseUrl}{publishPath}", UriKind.Absolute, out var endpoint))
        {
            return CrossPlatformErrors.Failed(Platform, "Zernio YouTube community-post endpoint is invalid.");
        }

        var payload = new
        {
            caption = request.Message.Truncate(5000),
            imageUrl = request.MediaUrl,
            metadata = new { source = "wiseravenshare", postId = request.PostId.ToString() }
        };

        try
        {
            var client = _httpClientFactory.CreateClient();
            using var httpRequest = new HttpRequestMessage(HttpMethod.Post, endpoint);
            httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
            httpRequest.Headers.TryAddWithoutValidation("X-Api-Key", apiKey);
            httpRequest.Content = System.Net.Http.Json.JsonContent.Create(payload);

            using var response = await client.SendAsync(httpRequest);
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Zernio YouTube community post failed ({Status}): {Body}", (int)response.StatusCode, body);
                return CrossPlatformErrors.Failed(Platform, $"Zernio YouTube community post failed ({(int)response.StatusCode}): {body.Truncate(400)}");
            }

            using var document = System.Text.Json.JsonDocument.Parse(body);
            var externalPostId = ReadJsonString(document.RootElement, "postId")
                ?? ReadJsonString(document.RootElement, "id")
                ?? (document.RootElement.TryGetProperty("data", out var d)
                    ? ReadJsonString(d, "postId") ?? ReadJsonString(d, "id") : null);
            var externalPostUrl = ReadJsonString(document.RootElement, "postUrl")
                ?? ReadJsonString(document.RootElement, "url")
                ?? (document.RootElement.TryGetProperty("data", out var ud)
                    ? ReadJsonString(ud, "postUrl") ?? ReadJsonString(ud, "url") : null);

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
            _logger.LogWarning(ex, "Zernio YouTube community post threw for post {PostId}", request.PostId);
            return CrossPlatformErrors.Failed(Platform, $"Zernio YouTube community post failed: {ex.Message}");
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
        var publishPath = _configuration["Social:Zernio:YouTube:PublishPath"] ?? ZernioDefaultPublishPath;
        if (!Uri.TryCreate($"{baseUrl}{publishPath}", UriKind.Absolute, out var endpoint))
        {
            return CrossPlatformErrors.Failed(Platform, "Zernio YouTube endpoint is invalid.");
        }

        var payload = new
        {
            videoUrl = request.MediaUrl,
            title = request.Message.Truncate(100),
            description = request.Message.Truncate(5000),
            metadata = new
            {
                source = "wiseravenshare",
                postId = request.PostId.ToString()
            }
        };

        try
        {
            var client = _httpClientFactory.CreateClient();
            using var httpRequest = new HttpRequestMessage(HttpMethod.Post, endpoint);
            httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
            httpRequest.Headers.TryAddWithoutValidation("X-Api-Key", apiKey);
            httpRequest.Content = JsonContent.Create(payload);

            using var response = await client.SendAsync(httpRequest);
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Zernio YouTube publish failed ({Status}): {Body}", (int)response.StatusCode, body);
                return CrossPlatformErrors.Failed(Platform, $"Zernio YouTube publish failed ({(int)response.StatusCode}): {body.Truncate(400)}");
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
            _logger.LogWarning(ex, "Zernio YouTube publish threw for post {PostId}", request.PostId);
            return CrossPlatformErrors.Failed(Platform, $"Zernio YouTube publish failed: {ex.Message}");
        }
    }

    private bool UseZernio()
    {
        var provider = (_configuration["Social:YouTube:Provider"] ?? "native")
            .Trim()
            .ToLowerInvariant();
        return provider == "zernio";
    }

    private bool UseZernioFallback()
    {
        var provider = (_configuration["Social:YouTube:Provider"] ?? "native")
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

    private bool CanUseZernio() =>
        !string.IsNullOrWhiteSpace(_configuration["Social:Zernio:ApiKey"]);
}
