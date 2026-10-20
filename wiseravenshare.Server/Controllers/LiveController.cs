using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/live")]
public sealed class LiveController : ControllerBase
{
    private static readonly HashSet<string> KeepPhrases = new(StringComparer.OrdinalIgnoreCase)
    {
        "keep",
        "keep it",
        "keep this",
        "save",
        "save it",
    };

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly LiveStreamStateStore _liveStreamStateStore;
    private readonly IBlobStorageService _blobStorageService;
    private readonly ILogger<LiveController> _logger;

    public LiveController(
        IHttpClientFactory httpClientFactory,
        LiveStreamStateStore liveStreamStateStore,
        IBlobStorageService blobStorageService,
        ILogger<LiveController> logger)
    {
        _httpClientFactory = httpClientFactory;
        _liveStreamStateStore = liveStreamStateStore;
        _blobStorageService = blobStorageService;
        _logger = logger;
    }

    [HttpGet("feed")]
    [AllowAnonymous]
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
    [AllowAnonymous]
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

    [HttpPost("{streamId}/start")]
    [Authorize]
    public IActionResult StartStream([FromRoute] string streamId, [FromBody] LiveStreamStartRequest? body = null)
    {
        if (string.IsNullOrWhiteSpace(streamId))
        {
            return BadRequest(new { message = "streamId is required." });
        }

        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        var now = DateTime.UtcNow;
        var title = string.IsNullOrWhiteSpace(body?.title) ? "Untitled live" : body.title.Trim();
        var audioOnly = body?.is_audio_only ?? false;
        var existing = _liveStreamStateStore.Update(streamId, stream =>
        {
            stream.title = title;
            stream.status = "live";
            stream.is_audio_only = audioOnly;
            stream.started_at ??= now;
            stream.ended_at = null;
            stream.deleted_at = null;
        });

        if (existing is null)
        {
            existing = _liveStreamStateStore.Create(new LiveStreamState
            {
                id = streamId,
                created_by_id = userId,
                streamer_id = userId,
                title = title,
                status = "live",
                is_audio_only = audioOnly,
                started_at = now,
                created_date = now,
                updated_date = now
            });
        }

        return Ok(new
        {
            stream_id = existing.id,
            started_at = existing.started_at,
            status = existing.status
        });
    }

    [HttpPost("{streamId}/segments/presign")]
    [Authorize]
    public async Task<IActionResult> PresignSegment(
        [FromRoute] string streamId,
        [FromBody] LiveSegmentRequest request,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(streamId))
        {
            return BadRequest(new { message = "streamId is required." });
        }

        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        if (!_liveStreamStateStore.TryGet(streamId, out var stream))
        {
            return NotFound(new { message = "Stream not found." });
        }

        if (!IsOwner(stream, userId))
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "Not your stream." });
        }

        if (stream.ended_at.HasValue)
        {
            return Conflict(new { message = "Stream already ended." });
        }

        if (request.segment_index < 0)
        {
            return BadRequest(new { message = "segment_index must be >= 0." });
        }

        var key = $"live/{streamId}/segments/{request.segment_index:D6}.webm";
        var uploadUrl = await _blobStorageService.GetPresignedUploadUrlAsync(key, "video/webm", TimeSpan.FromMinutes(5));
        if (string.IsNullOrWhiteSpace(uploadUrl))
        {
            return StatusCode(503, new { message = "Blob upload signing is unavailable." });
        }

        _liveStreamStateStore.UpsertSegment(streamId, request.segment_index, key, Math.Max(0, request.size_bytes), request.sha256 ?? string.Empty);
        return Ok(new
        {
            url = uploadUrl,
            key,
            segment_index = request.segment_index
        });
    }

    [HttpPost("{streamId}/segments/{index:int}/confirm")]
    [Authorize]
    public async Task<IActionResult> ConfirmSegment(
        [FromRoute] string streamId,
        [FromRoute] int index,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(streamId))
        {
            return BadRequest(new { message = "streamId is required." });
        }

        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        if (!_liveStreamStateStore.TryGet(streamId, out var stream))
        {
            return NotFound(new { message = "Stream not found." });
        }

        if (!IsOwner(stream, userId))
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "Not your stream." });
        }

        var segment = _liveStreamStateStore.GetSegments(streamId).FirstOrDefault(x => x.segment_index == index);
        if (segment is null)
        {
            return NotFound(new { message = "Unknown segment." });
        }

        var exists = await _blobStorageService.ExistsAsync(segment.storage_key, cancellationToken);
        if (!exists)
        {
            return Conflict(new { message = "Segment not found in storage." });
        }

        _liveStreamStateStore.MarkSegmentUploaded(streamId, index);
        var streamPath = StreamingUrlHelper.StreamByBlobPath(segment.storage_key);
        _liveStreamStateStore.Update(streamId, s =>
        {
            s.current_chunk_uri = streamPath;
            s.chunk_sequence = Math.Max(s.chunk_sequence, index + 1);
        });

        var totalDone = _liveStreamStateStore.GetSegments(streamId).Count(x => string.Equals(x.upload_state, "done", StringComparison.OrdinalIgnoreCase));
        return Ok(new
        {
            confirmed = true,
            total_segments = totalDone
        });
    }

    [HttpPost("{streamId}/end")]
    [Authorize]
    public IActionResult EndStream([FromRoute] string streamId)
    {
        if (string.IsNullOrWhiteSpace(streamId))
        {
            return BadRequest(new { message = "streamId is required." });
        }

        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        if (!_liveStreamStateStore.TryGet(streamId, out var stream))
        {
            return NotFound(new { message = "Stream not found." });
        }

        if (!IsOwner(stream, userId))
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "Not your stream." });
        }

        var ended = _liveStreamStateStore.Update(streamId, s =>
        {
            s.ended_at ??= DateTime.UtcNow;
            s.status = "ended";
            if (!s.kept_permanently)
            {
                s.expires_at = s.ended_at.Value.AddHours(72);
            }
        });

        return Ok(new
        {
            stream_id = ended?.id,
            ended_at = ended?.ended_at,
            expires_at = ended?.expires_at,
            kept_permanently = ended?.kept_permanently ?? false
        });
    }

    [HttpPost("{streamId}/keep")]
    [Authorize]
    public IActionResult KeepStream([FromRoute] string streamId)
    {
        if (string.IsNullOrWhiteSpace(streamId))
        {
            return BadRequest(new { message = "streamId is required." });
        }

        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        if (!_liveStreamStateStore.TryGet(streamId, out var stream))
        {
            return NotFound(new { message = "Stream not found." });
        }

        if (!IsOwner(stream, userId))
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "Not your stream." });
        }

        var alreadyKept = stream.kept_permanently;
        _liveStreamStateStore.TryMarkKeep(streamId, userId, "ui", null, out var updated);
        return Ok(new
        {
            kept = true,
            already = alreadyKept,
            stream_id = streamId,
            kept_at = updated?.kept_at
        });
    }

    [HttpPost("{streamId}/message")]
    [Authorize]
    public IActionResult StreamMessage([FromRoute] string streamId, [FromBody] LiveStreamMessageRequest? body)
    {
        if (string.IsNullOrWhiteSpace(streamId))
        {
            return BadRequest(new { message = "streamId is required." });
        }

        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        if (!_liveStreamStateStore.TryGet(streamId, out var stream))
        {
            return NotFound(new { message = "Stream not found." });
        }

        if (!IsOwner(stream, userId))
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "Not your stream." });
        }

        var text = body?.text?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(text))
        {
            return BadRequest(new { message = "text is required." });
        }

        var isKeep = KeepPhrases.Contains(text) || text.StartsWith("keep ", StringComparison.OrdinalIgnoreCase);
        if (isKeep && !stream.kept_permanently)
        {
            _liveStreamStateStore.TryMarkKeep(streamId, userId, "text", text, out _);
        }

        return Ok(new
        {
            kept = isKeep,
            text
        });
    }

    [HttpGet("{streamId}/expiry")]
    [Authorize]
    public IActionResult GetExpiry([FromRoute] string streamId, [FromQuery] string? user_id = null)
    {
        if (string.IsNullOrWhiteSpace(streamId))
        {
            return BadRequest(new { message = "streamId is required." });
        }

        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        if (!_liveStreamStateStore.TryGet(streamId, out var stream))
        {
            return NotFound(new { message = "Stream not found." });
        }

        if (!IsOwner(stream, userId))
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "Not your stream." });
        }

        var now = DateTime.UtcNow;
        var expiresAt = stream.expires_at;
        int? secondsRemaining = null;
        if (expiresAt.HasValue)
        {
            secondsRemaining = (int)Math.Floor((expiresAt.Value - now).TotalSeconds);
        }

        return Ok(new
        {
            stream_id = stream.id,
            kept_permanently = stream.kept_permanently,
            kept_at = stream.kept_at,
            expires_at = expiresAt,
            seconds_remaining = secondsRemaining,
            reminder_sent_at = stream.expiry_reminder_sent_at,
            deleted_at = stream.deleted_at,
            in_reminder_window = secondsRemaining.HasValue
                && secondsRemaining.Value > 0
                && secondsRemaining.Value <= 24 * 3600
                && !stream.kept_permanently
        });
    }

    private IReadOnlyList<object> BuildLocalFeed(int limit)
    {
        return _liveStreamStateStore.GetAll()
            .Where(stream => stream.deleted_at is null)
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

    private bool TryResolveUserId(out string userId)
    {
        userId = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue("sub")
            ?? User.FindFirstValue("id")
            ?? string.Empty;
        return !string.IsNullOrWhiteSpace(userId);
    }

    private static bool IsOwner(LiveStreamState stream, string userId)
    {
        return string.Equals(stream.created_by_id, userId, StringComparison.OrdinalIgnoreCase)
            || string.Equals(stream.streamer_id, userId, StringComparison.OrdinalIgnoreCase);
    }
}

public sealed class LiveStreamMessageRequest
{
    public string text { get; set; } = string.Empty;
}

public sealed class LiveStreamStartRequest
{
    public string? title { get; set; }
    public bool is_audio_only { get; set; }
}

public sealed class LiveSegmentRequest
{
    public int segment_index { get; set; }
    public long size_bytes { get; set; }
    public string? sha256 { get; set; }
}
