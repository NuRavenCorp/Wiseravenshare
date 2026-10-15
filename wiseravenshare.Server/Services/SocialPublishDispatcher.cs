using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace Wiseravenshare.Server.Services;

public interface ISocialPublishDispatcher
{
    /// <summary>
    /// Fire-and-forget dispatch of a published post to the Facebook publishing
    /// middleware. Never throws; failures are logged so post creation is never
    /// blocked by the downstream pipeline.
    /// </summary>
    Task DispatchAsync(Guid postId, string content, string? mediaUrl, string mediaType);
}

/// <summary>
/// Trigger (checklist step 1): notifies the Python middleware that new
/// Wiseravenshare content is ready to be mirrored to Facebook. The middleware
/// then performs download -> optimize -> Graph API upload -> feed post.
/// </summary>
public class SocialPublishDispatcher : ISocialPublishDispatcher
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<SocialPublishDispatcher> _logger;

    public SocialPublishDispatcher(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<SocialPublishDispatcher> logger)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task DispatchAsync(Guid postId, string content, string? mediaUrl, string mediaType)
    {
        var baseUrl = _configuration["Social:Publish:MiddlewareWebhookUrl"]
            ?? _configuration["SOCIAL_PUBLISH_MIDDLEWARE_WEBHOOK_URL"];
        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            _logger.LogDebug("SocialPublish:MiddlewareWebhookUrl not configured; skipping dispatch for post {PostId}.", postId);
            return;
        }

        try
        {
            var payload = new Dictionary<string, object?>
            {
                ["event"] = "post.published",
                ["job_id"] = $"wr-{postId:N}",
                ["message"] = content ?? string.Empty,
                ["media_url"] = mediaUrl,
                ["media_type"] = mediaType,
                ["source"] = "wiseravenshare"
            };

            var request = new HttpRequestMessage(HttpMethod.Post, baseUrl)
            {
                Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json")
            };

            var token = _configuration["Social:Publish:WebhookToken"]
                ?? _configuration["WEBHOOK_TOKEN"]
                ?? _configuration["SOCIAL_PUBLISH_WEBHOOK_TOKEN"];
            if (!string.IsNullOrWhiteSpace(token))
            {
                request.Headers.Add("X-WR-Webhook-Token", token);
            }

            var client = _httpClientFactory.CreateClient("SocialPublish");
            using var response = await client.SendAsync(request);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning(
                    "Social publish middleware returned {StatusCode} for post {PostId}; the middleware may retry via its own queue.",
                    (int)response.StatusCode,
                    postId);
            }
            else
            {
                _logger.LogInformation("Dispatched post {PostId} to social publish middleware.", postId);
            }
        }
        catch (Exception ex)
        {
            // Never let cross-posting failures break post creation.
            _logger.LogWarning(ex, "Failed to dispatch post {PostId} to social publish middleware.", postId);
        }
    }
}
