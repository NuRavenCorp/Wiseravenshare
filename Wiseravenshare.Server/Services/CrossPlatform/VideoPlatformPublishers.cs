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
            var apiKey = _configuration["Social:Zernio:ApiKey"];
            return !string.IsNullOrWhiteSpace(apiKey);
        }

        return !string.IsNullOrWhiteSpace(_configuration["Social:TikTok:AccessToken"]);
    }

    public async Task<CrossPlatformPublishResultDto> PublishAsync(CrossPlatformPublishRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.MediaUrl) || request.MediaType != SocialMediaType.Video)
        {
            return new CrossPlatformPublishResultDto
            {
                Platform = Platform,
                Success = false,
                Error = "TikTok publish requires a public videoUrl; photo and text posts are not supported."
            };
        }

        if (UseZernio())
        {
            return await PublishViaZernioAsync(request);
        }

        var accessToken = _configuration["Social:TikTok:AccessToken"];
        if (string.IsNullOrWhiteSpace(accessToken))
        {
            return CrossPlatformErrors.NotConfigured(Platform, "Social:TikTok:AccessToken");
        }

        var publishRequest = new
        {
            post_info = new
            {
                title = request.Message.Truncate(150),
                privacy_level = "PUBLIC_TO_EVERYONE",
                disable_comment = false,
                disable_duet = false,
                disable_stitch = false,
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
                return CrossPlatformErrors.Failed(Platform, $"TikTok publish failed ({(int)response.StatusCode}): {body.Truncate(400)}");
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
            return CrossPlatformErrors.Failed(Platform, $"TikTok publish failed: {ex.Message}");
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
        var publishPath = _configuration["Social:Zernio:TikTok:PublishPath"] ?? ZernioDefaultTikTokPath;
        var scheduleAtUtc = _configuration["Social:Zernio:TikTok:ScheduleAtUtc"];
        var saveAsDraft = _configuration.GetValue("Social:Zernio:TikTok:SaveAsDraft", false);

        if (!Uri.TryCreate($"{baseUrl}{publishPath}", UriKind.Absolute, out var endpoint))
        {
            return CrossPlatformErrors.Failed(Platform, "Zernio TikTok endpoint is invalid.");
        }

        var caption = request.Message.Truncate(2200);
        var hashtags = ExtractHashtags(caption);

        var payload = new
        {
            videoUrl = request.MediaUrl,
            caption,
            hashtags,
            scheduleAtUtc = string.IsNullOrWhiteSpace(scheduleAtUtc) ? null : scheduleAtUtc,
            saveAsDraft,
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
}

/// <summary>
/// Publishes video to YouTube by delegating to the existing IYouTubeService
/// (OAuth upload pipeline already wired in this project).
/// </summary>
public class YouTubePublisher : ICrossPlatformPublisher
{
    private readonly IYouTubeService _youTubeService;
    private readonly ILogger<YouTubePublisher> _logger;

    public YouTubePublisher(IYouTubeService youTubeService, ILogger<YouTubePublisher> logger)
    {
        _youTubeService = youTubeService;
        _logger = logger;
    }

    public string Platform => SocialPlatforms.YouTube;

    public bool IsConfigured() => true; // IYouTubeService reports its own errors at publish time.

    public async Task<CrossPlatformPublishResultDto> PublishAsync(CrossPlatformPublishRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.MediaUrl) || request.MediaType != SocialMediaType.Video)
        {
            return new CrossPlatformPublishResultDto
            {
                Platform = Platform,
                Success = false,
                Error = "YouTube publish requires a public videoUrl."
            };
        }

        try
        {
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
            return CrossPlatformErrors.Failed(Platform, ex.Message);
        }
    }
}
