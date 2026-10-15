using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Text;
using System.Text.Json;
using Wiseravenshare.Server.Shared;

namespace Wiseravenshare.Server.Controllers;

/// <summary>
/// Gateway for the Python video-processor microservice.
/// Proxies HLS segmentation jobs to the FastAPI service at VideoProcessorService:BaseUrl
/// (default http://localhost:8004).
/// </summary>
[ApiController]
[Route("api/video-processor")]
[Authorize]
public sealed class VideoProcessorController : ControllerBase
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<VideoProcessorController> _logger;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public VideoProcessorController(
        IHttpClientFactory httpClientFactory,
        ILogger<VideoProcessorController> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    [HttpGet("health")]
    [AllowAnonymous]
    public async Task<IActionResult> Health()
    {
        try
        {
            using var client = _httpClientFactory.CreateClient("VideoProcessorService");
            var response = await client.GetAsync("/health");
            var body = await response.Content.ReadAsStringAsync();
            return response.IsSuccessStatusCode
                ? Ok(new { upstream = "ok", detail = body })
                : StatusCode(502, new { upstream = "degraded", detail = body });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Video processor health check failed.");
            return StatusCode(503, new { upstream = "unreachable", message = ex.Message });
        }
    }

    /// <summary>
    /// Enqueue an HLS segmentation job for a previously uploaded video.
    /// </summary>
    [HttpPost("hls/jobs")]
    public async Task<IActionResult> CreateHlsJob([FromBody] JsonElement body, CancellationToken cancellationToken)
    {
        var objectKey = body.TryGetProperty("objectKey", out var okProp) ? okProp.GetString() : null;
        var title = body.TryGetProperty("title", out var titleProp) ? titleProp.GetString() : null;

        if (string.IsNullOrWhiteSpace(objectKey))
            return BadRequest(new { message = "objectKey is required." });

        try
        {
            using var client = _httpClientFactory.CreateClient("VideoProcessorService");
            var userId = ResolveUserId();
            var payload = JsonSerializer.Serialize(new
            {
                object_key = objectKey,
                user_id = userId,
                title = string.IsNullOrWhiteSpace(title) ? objectKey : title
            });
            using var content = new StringContent(payload, Encoding.UTF8, "application/json");
            var response = await client.PostAsync("/hls/jobs", content, cancellationToken);
            return await ProxyJsonResponse(response, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Video processor HLS job creation failed.");
            return StatusCode(503, new { message = "Video processor service is unavailable." });
        }
    }

    /// <summary>
    /// Poll the status of an HLS segmentation job.
    /// </summary>
    [HttpGet("hls/jobs/{jobId}")]
    public async Task<IActionResult> GetHlsJobStatus(string jobId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(jobId))
            return BadRequest(new { message = "jobId is required." });

        try
        {
            using var client = _httpClientFactory.CreateClient("VideoProcessorService");
            var userId = ResolveUserId();
            var response = await client.GetAsync(
                $"/hls/jobs/{Uri.EscapeDataString(jobId)}?user_id={Uri.EscapeDataString(userId)}",
                cancellationToken);
            return await ProxyJsonResponse(response, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Video processor job status proxy failed for job {JobId}.", jobId);
            return StatusCode(503, new { message = "Video processor service is unavailable." });
        }
    }

    private string ResolveUserId()
    {
        var userId = User.GetUserId();
        return userId == Guid.Empty ? "anonymous" : userId.ToString("N");
    }

    private static async Task<IActionResult> ProxyJsonResponse(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        var raw = await response.Content.ReadAsStringAsync(cancellationToken);
        var contentType = response.Content.Headers.ContentType?.MediaType;

        if (string.Equals(contentType, "application/json", StringComparison.OrdinalIgnoreCase))
        {
            using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(raw) ? "{}" : raw);
            return new JsonResult(doc.RootElement.Clone()) { StatusCode = (int)response.StatusCode };
        }

        return new JsonResult(new { detail = raw }) { StatusCode = (int)response.StatusCode };
    }
}
