// Wiseravenshare.Server/Services/CrossPlatform/MetaPlatformPublishers.cs
using System.Net.Http.Json;
using System.Text.Json;
using System.Net.Http.Headers;
using Wiseravenshare.Server.DTOs.Social;

namespace Wiseravenshare.Server.Services.CrossPlatform;

/// <summary>
/// Publishes to a Facebook Page via the Graph API: text/link to /feed,
/// photos to /photos, videos to /videos (PULL_FROM_URL).
/// Config: Social:Facebook:PageId, Social:Facebook:PageAccessToken.
/// </summary>
public class FacebookPublisher : ICrossPlatformPublisher
{
    protected const string GraphBase = "https://graph.facebook.com/v26.0";
    private const string ZernioDefaultBaseUrl = "https://api.zernio.com";

    protected readonly HttpClient _httpClient;
    protected readonly IConfiguration _configuration;
    protected readonly ILogger _logger;

    public FacebookPublisher(HttpClient httpClient, IConfiguration configuration, ILogger<FacebookPublisher> logger)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
    }

    public virtual string Platform => SocialPlatforms.Facebook;

    protected virtual string PageId => _configuration["Social:Facebook:PageId"] ?? string.Empty;
    protected virtual string AccessToken => _configuration["Social:Facebook:PageAccessToken"] ?? string.Empty;
    protected virtual string ProviderKey => "Social:Facebook:Provider";
    protected virtual string ZernioPathKey => "Social:Zernio:Facebook:PublishPath";
    protected virtual string ZernioDefaultPath => "/v1/facebook/publish";

    // Instagram shares the same Graph base and token shape but different config keys.
    protected virtual string IdKey => "Social:Facebook:PageId";
    protected virtual string TokenKey => "Social:Facebook:PageAccessToken";

    public virtual bool IsConfigured()
    {
        if (UseZernio())
        {
            return !string.IsNullOrWhiteSpace(GetZernioApiKey());
        }

        return !string.IsNullOrWhiteSpace(PageId) && !string.IsNullOrWhiteSpace(AccessToken);
    }

    public virtual async Task<CrossPlatformPublishResultDto> PublishAsync(CrossPlatformPublishRequest request)
    {
        if (UseZernio())
        {
            return await PublishViaZernioAsync(request);
        }

        if (!IsConfigured())
        {
            return CrossPlatformErrors.NotConfigured(Platform, $"{IdKey} and {TokenKey}");
        }

        try
        {
            return request.MediaType switch
            {
                SocialMediaType.Video when !string.IsNullOrWhiteSpace(request.MediaUrl)
                    => await PostFormAsync($"{GraphBase}/{PageId}/videos", new Dictionary<string, string>
                    {
                        ["description"] = request.Message,
                        ["file_url"] = request.MediaUrl,
                        ["access_token"] = AccessToken
                    }),
                SocialMediaType.Photo when !string.IsNullOrWhiteSpace(request.MediaUrl)
                    => await PostFormAsync($"{GraphBase}/{PageId}/photos", new Dictionary<string, string>
                    {
                        ["caption"] = request.Message,
                        ["url"] = request.MediaUrl,
                        ["access_token"] = AccessToken
                    }),
                _ => await PostFormAsync($"{GraphBase}/{PageId}/feed", WithLink(new Dictionary<string, string>
                    {
                        ["message"] = request.Message,
                        ["access_token"] = AccessToken
                    }, request.MediaUrl))
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "{Platform} publish threw for post {PostId}", Platform, request.PostId);
            return CrossPlatformErrors.Failed(Platform, $"{Platform} publish failed: {ex.Message}");
        }
    }

    protected virtual async Task<CrossPlatformPublishResultDto> PublishViaZernioAsync(CrossPlatformPublishRequest request)
    {
        var apiKey = GetZernioApiKey();
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return CrossPlatformErrors.NotConfigured(Platform, "Social:Zernio:ApiKey");
        }

        var baseUrl = (_configuration["Social:Zernio:BaseUrl"] ?? ZernioDefaultBaseUrl).TrimEnd('/');
        var publishPath = _configuration[ZernioPathKey] ?? ZernioDefaultPath;
        if (!Uri.TryCreate($"{baseUrl}{publishPath}", UriKind.Absolute, out var endpoint))
        {
            return CrossPlatformErrors.Failed(Platform, $"Zernio {Platform} endpoint is invalid.");
        }

        var payload = new
        {
            message = request.Message.Truncate(2200),
            mediaUrl = request.MediaUrl,
            mediaType = request.MediaType,
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
                _logger.LogWarning("Zernio {Platform} publish failed ({Status}): {Body}", Platform, (int)response.StatusCode, body);
                return CrossPlatformErrors.Failed(Platform, $"Zernio {Platform} publish failed ({(int)response.StatusCode}): {body.Truncate(400)}");
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
            _logger.LogWarning(ex, "Zernio {Platform} publish threw for post {PostId}", Platform, request.PostId);
            return CrossPlatformErrors.Failed(Platform, $"Zernio {Platform} publish failed: {ex.Message}");
        }
    }

    protected async Task<CrossPlatformPublishResultDto> PostFormAsync(string url, Dictionary<string, string> form)
    {
        using var content = new FormUrlEncodedContent(form);
        using var response = await _httpClient.PostAsync(url, content);
        var body = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("{Platform} publish failed ({Status}): {Body}", Platform, (int)response.StatusCode, body);
            return CrossPlatformErrors.Failed(Platform, $"{Platform} publish failed ({(int)response.StatusCode}): {TrimError(body)}");
        }

        using var document = JsonDocument.Parse(body);
        var postId = document.RootElement.TryGetProperty("post_id", out var pid) ? pid.GetString()
            : document.RootElement.TryGetProperty("id", out var id) ? id.GetString()
            : null;

        return new CrossPlatformPublishResultDto
        {
            Platform = Platform,
            Success = true,
            ExternalPostId = postId,
            ExternalPostUrl = string.IsNullOrWhiteSpace(postId) ? null : $"https://www.facebook.com/{postId}"
        };
    }

    protected static Dictionary<string, string> WithLink(Dictionary<string, string> form, string? link)
    {
        if (!string.IsNullOrWhiteSpace(link))
        {
            form["link"] = link;
        }
        return form;
    }

    protected static string TrimError(string body)
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
        }
        catch
        {
            // Non-JSON error body.
        }
        return body.Length <= 400 ? body : body[..400];
    }

    protected bool UseZernio()
    {
        var provider = (_configuration[ProviderKey] ?? "native")
            .Trim()
            .ToLowerInvariant();
        return provider == "zernio";
    }

    protected static string? ReadJsonString(JsonElement element, string propertyName)
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

    protected string? GetZernioApiKey() =>
        _configuration["Social:Zernio:ApiKey"]
        ?? _configuration["Social_Zernio_APIKey"]
        ?? _configuration["ZERNIO_API_KEY"];
}

/// <summary>
/// Publishes an Instagram media post through the Instagram Graph API Content
/// Publishing flow: create a media container from the public URL, then publish it.
/// Photos and videos only — Instagram has no text-only posts via the API.
/// Config: Social:Instagram:BusinessAccountId, Social:Instagram:AccessToken.
/// </summary>
public class InstagramPublisher : FacebookPublisher
{
    public InstagramPublisher(HttpClient httpClient, IConfiguration configuration, ILogger<InstagramPublisher> logger)
        : base(httpClient, configuration, logger)
    {
    }

    public override string Platform => SocialPlatforms.Instagram;

    protected override string PageId => _configuration["Social:Instagram:BusinessAccountId"] ?? string.Empty;
    protected override string AccessToken => _configuration["Social:Instagram:AccessToken"] ?? string.Empty;
    protected override string ProviderKey => "Social:Instagram:Provider";
    protected override string ZernioPathKey => "Social:Zernio:Instagram:PublishPath";
    protected override string ZernioDefaultPath => "/v1/instagram/publish";
    protected override string IdKey => "Social:Instagram:BusinessAccountId";
    protected override string TokenKey => "Social:Instagram:AccessToken";

    public override async Task<CrossPlatformPublishResultDto> PublishAsync(CrossPlatformPublishRequest request)
    {
        if (!IsConfigured())
        {
            return CrossPlatformErrors.NotConfigured(Platform, $"{IdKey} and {TokenKey}");
        }

        if (string.IsNullOrWhiteSpace(request.MediaUrl) || request.MediaType == SocialMediaType.Text)
        {
            return new CrossPlatformPublishResultDto
            {
                Platform = Platform,
                Success = false,
                Error = "Instagram requires a photo or video URL; text-only posts are not supported by the API."
            };
        }

        try
        {
            var isVideo = request.MediaType == SocialMediaType.Video;
            var containerForm = new Dictionary<string, string>
            {
                ["access_token"] = AccessToken,
                [isVideo ? "video_url" : "image_url"] = request.MediaUrl!,
                [isVideo ? "media_type" : "caption"] = isVideo ? "REELS" : request.Message.Truncate(2200)
            };
            if (isVideo)
            {
                containerForm["caption"] = request.Message.Truncate(2200);
            }

            // Step 1: create the media container.
            using var containerContent = new FormUrlEncodedContent(containerForm);
            using var containerResponse = await _httpClient.PostAsync(
                $"{GraphBase}/{PageId}/media", containerContent);
            var containerBody = await containerResponse.Content.ReadAsStringAsync();

            if (!containerResponse.IsSuccessStatusCode)
            {
                _logger.LogWarning("Instagram container creation failed ({Status}): {Body}",
                    (int)containerResponse.StatusCode, containerBody);
                return CrossPlatformErrors.Failed(Platform, $"Instagram container creation failed ({(int)containerResponse.StatusCode}): {TrimError(containerBody)}");
            }

            string? creationId;
            using (var doc = JsonDocument.Parse(containerBody))
            {
                creationId = doc.RootElement.TryGetProperty("id", out var idNode) ? idNode.GetString() : null;
            }

            if (string.IsNullOrWhiteSpace(creationId))
            {
                return CrossPlatformErrors.Failed(Platform, "Instagram did not return a media container id.");
            }

            // Step 2: publish the container.
            using var publishContent = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["creation_id"] = creationId,
                ["access_token"] = AccessToken
            });
            using var publishResponse = await _httpClient.PostAsync(
                $"{GraphBase}/{PageId}/media_publish", publishContent);
            var publishBody = await publishResponse.Content.ReadAsStringAsync();

            if (!publishResponse.IsSuccessStatusCode)
            {
                return CrossPlatformErrors.Failed(Platform, $"Instagram publish failed ({(int)publishResponse.StatusCode}): {TrimError(publishBody)}");
            }

            using var publishDoc = JsonDocument.Parse(publishBody);
            var publishedId = publishDoc.RootElement.TryGetProperty("id", out var pubId) ? pubId.GetString() : null;

            return new CrossPlatformPublishResultDto
            {
                Platform = Platform,
                Success = true,
                ExternalPostId = publishedId,
                ExternalPostUrl = string.IsNullOrWhiteSpace(publishedId) ? null : $"https://www.instagram.com/p/{publishedId}"
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Instagram publish threw for post {PostId}", request.PostId);
            return CrossPlatformErrors.Failed(Platform, $"Instagram publish failed: {ex.Message}");
        }
    }
}
