using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Cryptography;
using System.Text;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/contentcrawler")]
[Authorize]
[FeatureCompartment("content-crawler")]
public class ContentCrawlerController : ControllerBase
{
    private readonly IContentCrawlerService _service;
    private readonly IConfiguration _configuration;
    private readonly ILogger<ContentCrawlerController> _logger;

    public ContentCrawlerController(
        IContentCrawlerService service,
        IConfiguration configuration,
        ILogger<ContentCrawlerController> logger)
    {
        _service = service;
        _configuration = configuration;
        _logger = logger;
    }

    /// <summary>
    /// Get trending user-generated content (posts, videos, music).
    /// </summary>
    [HttpGet("trending")]
    public async Task<ActionResult<ContentCrawlerSummaryDto>> GetTrending(
        [FromQuery] string? contentType,
        [FromQuery] string? countryCode,
        [FromQuery] int topN = 12,
        CancellationToken ct = default)
    {
        var result = await _service.GetTrendingAsync(contentType, countryCode, topN, ct);
        return Ok(result);
    }

    /// <summary>
    /// Get emerging topics/hashtags from trending content.
    /// </summary>
    [HttpGet("trending/topics")]
    public async Task<ActionResult<IReadOnlyList<string>>> GetEmergingTopics(
        [FromQuery] string? countryCode,
        CancellationToken ct = default)
    {
        var topics = await _service.GetEmergingTopicsAsync(countryCode, ct);
        return Ok(topics);
    }

    /// <summary>
    /// Ingest user-generated content into the crawler.
    /// (Typically called from background jobs or post/video/music services)
    /// </summary>
    [HttpPost("ingest")]
    [AllowAnonymous]  // Allow background service to call without auth
    public async Task<ActionResult> IngestContent(
        [FromBody] IngestContentRequest request,
        CancellationToken ct = default)
    {
        if (!HasCrawlerWriteAccess())
        {
            return Unauthorized(new { error = "A valid crawler ingestion credential is required." });
        }

        if (request == null)
            return BadRequest("Request cannot be null");

        if (request.ContentId == Guid.Empty || string.IsNullOrWhiteSpace(request.ContentType))
            return BadRequest("ContentId and ContentType are required");

        await _service.IngestUserContentAsync(
            request.ContentId,
            request.ContentType,
            request.Title ?? string.Empty,
            request.CreatorId,
            request.CreatorName ?? string.Empty,
            request.Tags,
            request.CountryCode,
            ct
        );

        return Accepted();
    }

    /// <summary>
    /// Update engagement metrics for content (views, likes, shares).
    /// </summary>
    [HttpPut("engagement/{contentId:guid}")]
    [AllowAnonymous]  // Allow background service to call without auth
    public async Task<ActionResult> UpdateEngagement(
        [FromRoute] Guid contentId,
        [FromBody] UpdateEngagementRequest request,
        CancellationToken ct = default)
    {
        if (!HasCrawlerWriteAccess())
        {
            return Unauthorized(new { error = "A valid crawler ingestion credential is required." });
        }

        if (contentId == Guid.Empty)
            return BadRequest("Invalid contentId");

        await _service.UpdateEngagementAsync(
            contentId,
            request?.ViewCount ?? 0,
            request?.LikeCount ?? 0,
            request?.ShareCount ?? 0,
            ct
        );

        return NoContent();
    }

    private bool HasCrawlerWriteAccess()
    {
        if (User.Identity?.IsAuthenticated == true)
        {
            return true;
        }

        var configuredKey = (_configuration["InternalApi:ContentCrawlerIngestKey"]
            ?? _configuration["CONTENT_CRAWLER_INGEST_KEY"]
            ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(configuredKey))
        {
            _logger.LogWarning("Rejected anonymous content crawler write because InternalApi:ContentCrawlerIngestKey is not configured.");
            return false;
        }

        var providedKey = Request.Headers["X-Internal-Api-Key"].ToString().Trim();
        if (string.IsNullOrWhiteSpace(providedKey))
        {
            return false;
        }

        var configuredBytes = Encoding.UTF8.GetBytes(configuredKey);
        var providedBytes = Encoding.UTF8.GetBytes(providedKey);
        return CryptographicOperations.FixedTimeEquals(configuredBytes, providedBytes);
    }

    /// <summary>
    /// Force recalculation of trending scores.
    /// (Admin endpoint for manual trigger)
    /// </summary>
    [HttpPost("recalculate-scores")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult> RecalculateScores(CancellationToken ct = default)
    {
        await _service.RecalculateTrendScoresAsync(ct);
        return Accepted(new { message = "Trend score recalculation started" });
    }
}

public class IngestContentRequest
{
    public Guid ContentId { get; set; }
    public string? ContentType { get; set; }  // Post, Video, Music, Story
    public string? Title { get; set; }
    public Guid CreatorId { get; set; }
    public string? CreatorName { get; set; }
    public string[]? Tags { get; set; }
    public string? CountryCode { get; set; }
}

public class UpdateEngagementRequest
{
    public int ViewCount { get; set; }
    public int LikeCount { get; set; }
    public int ShareCount { get; set; }
}
