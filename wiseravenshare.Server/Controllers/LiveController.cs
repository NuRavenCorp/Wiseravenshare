using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/live")]
[AllowAnonymous]
public sealed class LiveController : ControllerBase
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly LiveStreamStateStore _liveStreamStateStore;
    private readonly ILogger<LiveController> _logger;

    public LiveController(
        IHttpClientFactory httpClientFactory,
        LiveStreamStateStore liveStreamStateStore,
        ILogger<LiveController> logger)
    {
        _httpClientFactory = httpClientFactory;
        _liveStreamStateStore = liveStreamStateStore;
        _logger = logger;
    }

    [HttpGet("feed")]
    public async Task<IActionResult> Feed(
        [FromQuery] string viewer_id,
        [FromQuery] int limit = 50,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(viewer_id))
        {
            return BadRequest(new { message = "viewer_id is required." });
        }

        var boundedLimit = Math.Clamp(limit, 1, 100);
        var query = $"live/feed?viewer_id={Uri.EscapeDataString(viewer_id)}&limit={boundedLimit}";

        try
        {
            using var client = _httpClientFactory.CreateClient("PythonMatrixService");
            var response = await client.GetAsync(query, cancellationToken);
            var raw = await response.Content.ReadAsStringAsync(cancellationToken);
            var mediaType = response.Content.Headers.ContentType?.MediaType;

            if (string.Equals(mediaType, "application/json", StringComparison.OrdinalIgnoreCase))
            {
                return new ContentResult
                {
                    Content = raw,
                    ContentType = "application/json",
                    StatusCode = (int)response.StatusCode,
                };
            }

            return StatusCode((int)response.StatusCode, new { message = raw });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Live feed proxy request failed.");
            return Ok(new { streams = BuildLocalFeed(boundedLimit) });
        }
    }

    [HttpGet("training-data")]
    public async Task<IActionResult> TrainingData(
        [FromQuery] int limit = 500,
        CancellationToken cancellationToken = default)
    {
        var boundedLimit = Math.Clamp(limit, 1, 5000);
        var query = $"live/training-data?limit={boundedLimit}";

        try
        {
            using var client = _httpClientFactory.CreateClient("PythonMatrixService");
            var response = await client.GetAsync(query, cancellationToken);
            var raw = await response.Content.ReadAsStringAsync(cancellationToken);
            var mediaType = response.Content.Headers.ContentType?.MediaType;

            if (string.Equals(mediaType, "application/json", StringComparison.OrdinalIgnoreCase))
            {
                return new ContentResult
                {
                    Content = raw,
                    ContentType = "application/json",
                    StatusCode = (int)response.StatusCode,
                };
            }

            return StatusCode((int)response.StatusCode, new { message = raw });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Live feed training data proxy request failed.");
            return StatusCode(503, new { message = "Live feed training data is unavailable." });
        }
    }

    private IReadOnlyList<object> BuildLocalFeed(int limit)
    {
        return _liveStreamStateStore.GetAll()
            .Where(stream => string.Equals(stream.status, "live", StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(stream => stream.chunk_sequence)
            .ThenByDescending(stream => stream.updated_date)
            .Take(Math.Clamp(limit, 1, 100))
            .Select(stream => (object)new
            {
                stream_id = stream.id,
                title = stream.title,
                category = stream.is_audio_only ? "audio" : "video",
                viewer_count = 0,
                streamer_id = stream.streamer_id,
                current_chunk_uri = stream.current_chunk_uri,
                chunk_sequence = stream.chunk_sequence,
                is_audio_only = stream.is_audio_only,
                started_at = stream.started_at,
                updated_date = stream.updated_date
            })
            .ToList();
    }
}
