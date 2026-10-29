using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Wiseravenshare.Server.Entities.Karaoke;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Services;
using Wiseravenshare.Server.Shared;

namespace Wiseravenshare.Server.Controllers;

/// <summary>
/// Gateway for the Python karaoke-engine microservice.
/// Proxies song uploads to the FastAPI service at KaraokeService:BaseUrl
/// (default http://localhost:8002) and streams the backing track WAV back.
/// Licensing: users may upload songs they own / have rights to. Public domain
/// and UltraStar community tracks are always safe. Mainstream licensed catalogues
/// require a commercial KTV API licence (Singa, Agora, ZEGO).
/// </summary>
[ApiController]
[Route("api/karaoke")]
[Authorize]
public sealed class KaraokeController : ControllerBase
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<KaraokeController> _logger;
    private readonly AppDbContext _db;
    private readonly IBlobStorageService _blob;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public KaraokeController(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<KaraokeController> logger,
        AppDbContext db,
        IBlobStorageService blob)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _logger = logger;
        _db = db;
        _blob = blob;
    }

    [HttpGet("health")]
    [AllowAnonymous]
    public async Task<IActionResult> Health()
    {
        try
        {
            var client = _httpClientFactory.CreateClient("KaraokeService");
            ConfigureInternalToken(client);
            var response = await client.GetAsync("/health");
            var body = await response.Content.ReadAsStringAsync();
            return response.IsSuccessStatusCode
                ? Ok(new { upstream = "ok", detail = body })
                : StatusCode(502, new { upstream = "degraded", detail = body });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Karaoke service health check failed.");
            return StatusCode(503, new { upstream = "unreachable", message = ex.Message });
        }
    }

    /// <summary>
    /// Upload a song file and enqueue backing-track generation.
    /// The job is processed asynchronously to avoid request gateway timeouts.
    /// </summary>
    [HttpPost("generate-backing")]
    [AllowAnonymous]
    [RequestSizeLimit(314_572_800)] // 300 MB
    [RequestFormLimits(MultipartBodyLengthLimit = 314_572_800)]
    [Microsoft.AspNetCore.Http.Timeouts.RequestTimeout("KaraokeUploadPolicy")]
    public async Task<IActionResult> GenerateBackingJob(IFormFile audioFile, CancellationToken cancellationToken)
    {
        if (audioFile is null || audioFile.Length == 0)
            return BadRequest(new { message = "Please attach an audio file." });

        // Use the upload-specific client which has an infinite operation timeout.
        using var client = _httpClientFactory.CreateClient("KaraokeServiceUpload");
        ConfigureInternalToken(client);
        using var multipart = new MultipartFormDataContent();
        await using var stream = audioFile.OpenReadStream();

        var userId = ResolveUserId();
        var fileContent = new StreamContent(stream);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue(
            audioFile.ContentType ?? "application/octet-stream");
        multipart.Add(fileContent, "file", audioFile.FileName ?? "song.mp3");
        multipart.Add(new StringContent(userId), "user_id");
        multipart.Add(new StringContent(audioFile.FileName ?? "Uploaded Song"), "song_title");

        HttpResponseMessage upstreamResponse;
        try
        {
            upstreamResponse = await client.PostAsync("/generate-backing/jobs", multipart, cancellationToken);
        }
        catch (Exception ex) when (ex is HttpRequestException || ex is TaskCanceledException || ex is OperationCanceledException)
        {
            _logger.LogWarning(ex, "Karaoke engine is unreachable or timed out.");
            return StatusCode(503, new { message = "Vocal separation service is unavailable. The karaoke engine runs as a separate service and is not active in this environment." });
        }

        if (!upstreamResponse.IsSuccessStatusCode)
        {
            var error = await upstreamResponse.Content.ReadAsStringAsync(cancellationToken);
            _logger.LogError("Karaoke service returned {Status}: {Error}", (int)upstreamResponse.StatusCode, error);
            return StatusCode((int)upstreamResponse.StatusCode, new { message = "Backing track generation failed.", detail = error });
        }

        return await ProxyJsonResponse(upstreamResponse, cancellationToken);
    }

    [HttpGet("jobs/{jobId}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetGenerateBackingJobStatus(string jobId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(jobId))
            return BadRequest(new { message = "JobId is required." });

        try
        {
            using var client = _httpClientFactory.CreateClient("KaraokeService");
            ConfigureInternalToken(client);
            var userId = ResolveUserId();
            var response = await client.GetAsync($"/jobs/{Uri.EscapeDataString(jobId)}?user_id={Uri.EscapeDataString(userId)}", cancellationToken);
            return await ProxyJsonResponse(response, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Karaoke job status proxy failed for job {JobId}.", jobId);
            return StatusCode(503, new { message = "Karaoke job status service is unavailable." });
        }
    }

    [HttpGet("jobs/{jobId}/instrumental")]
    [AllowAnonymous]
    public async Task<IActionResult> GetGenerateBackingJobInstrumental(string jobId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(jobId))
            return BadRequest(new { message = "JobId is required." });

        try
        {
            using var client = _httpClientFactory.CreateClient("KaraokeService");
            ConfigureInternalToken(client);
            var userId = ResolveUserId();
            var response = await client.GetAsync($"/jobs/{Uri.EscapeDataString(jobId)}/instrumental?user_id={Uri.EscapeDataString(userId)}", cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                var detail = await response.Content.ReadAsStringAsync(cancellationToken);
                return StatusCode((int)response.StatusCode, new { message = "Could not fetch generated backing track.", detail });
            }

            var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
            var contentType = response.Content.Headers.ContentType?.MediaType ?? "audio/wav";
            var fileName = $"instrumental_{jobId}.wav";
            return File(bytes, contentType, fileName);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Karaoke job instrumental proxy failed for job {JobId}.", jobId);
            return StatusCode(503, new { message = "Karaoke instrumental service is unavailable." });
        }
    }

    [HttpGet("catalogue")]
    [AllowAnonymous]
    public async Task<IActionResult> GetCatalogue(CancellationToken cancellationToken)
    {
        try
        {
            using var client = _httpClientFactory.CreateClient("KaraokeService");
            ConfigureInternalToken(client);
            var userId = User.Identity?.IsAuthenticated == true ? ResolveUserId() : "anonymous";
            var response = await client.GetAsync($"/catalogue?user_id={Uri.EscapeDataString(userId)}", cancellationToken);
            return await ProxyJsonResponse(response, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Karaoke catalogue proxy failed.");
            return StatusCode(503, new { message = "Karaoke catalogue is currently unavailable." });
        }
    }

    [HttpGet("workspace")]
    [AllowAnonymous]
    public async Task<IActionResult> GetWorkspace(CancellationToken cancellationToken)
    {
        try
        {
            using var client = _httpClientFactory.CreateClient("KaraokeService");
            ConfigureInternalToken(client);
            var userId = ResolveUserId();
            var response = await client.GetAsync($"/workspace?user_id={Uri.EscapeDataString(userId)}", cancellationToken);
            return await ProxyJsonResponse(response, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Karaoke workspace proxy failed.");
            return StatusCode(503, new { message = "Karaoke workspace service is unavailable." });
        }
    }

    [HttpGet("library")]
    [AllowAnonymous]
    public async Task<IActionResult> GetLibrary(CancellationToken cancellationToken)
    {
        try
        {
            using var client = _httpClientFactory.CreateClient("KaraokeService");
            ConfigureInternalToken(client);
            var userId = ResolveUserId();
            var response = await client.GetAsync($"/library?user_id={Uri.EscapeDataString(userId)}", cancellationToken);
            return await ProxyJsonResponse(response, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Karaoke library proxy failed.");
            return StatusCode(503, new { message = "Karaoke library service is unavailable." });
        }
    }

    [HttpGet("library/{trackId}/instrumental")]
    [AllowAnonymous]
    public async Task<IActionResult> GetLibraryInstrumental(string trackId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(trackId))
            return BadRequest(new { message = "TrackId is required." });

        try
        {
            using var client = _httpClientFactory.CreateClient("KaraokeService");
            ConfigureInternalToken(client);
            var userId = ResolveUserId();
            var response = await client.GetAsync($"/library/{Uri.EscapeDataString(trackId)}/instrumental?user_id={Uri.EscapeDataString(userId)}", cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                var detail = await response.Content.ReadAsStringAsync(cancellationToken);
                return StatusCode((int)response.StatusCode, new { message = "Could not fetch stored backing track.", detail });
            }

            var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
            var contentType = response.Content.Headers.ContentType?.MediaType ?? "audio/wav";
            var fileName = $"instrumental_{trackId}.wav";
            return File(bytes, contentType, fileName);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Karaoke library instrumental proxy failed for track {TrackId}.", trackId);
            return StatusCode(503, new { message = "Karaoke library service is unavailable." });
        }
    }

    [HttpPost("purchase")]
    public async Task<IActionResult> PurchaseSong([FromBody] KaraokePurchaseRequest request, CancellationToken cancellationToken)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.SongId))
            return BadRequest(new { message = "SongId is required." });

        try
        {
            using var client = _httpClientFactory.CreateClient("KaraokeService");
            ConfigureInternalToken(client);
            var userId = ResolveUserId();
            var payload = JsonSerializer.Serialize(new
            {
                user_id = userId,
                song_id = request.SongId.Trim()
            });
            using var body = new StringContent(payload, Encoding.UTF8, "application/json");
            var response = await client.PostAsync("/purchase", body, cancellationToken);
            return await ProxyJsonResponse(response, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Karaoke purchase proxy failed.");
            return StatusCode(503, new { message = "Karaoke purchase service is unavailable." });
        }
    }

    // ── DB Catalog endpoints ──────────────────────────────────────────────

    /// <summary>
    /// GET /api/karaoke/db-catalog
    /// Returns all public KaraokeTracks from the DB, with resolved CDN URLs,
    /// grouped by genre. Status filter defaults to Ready+Pending so both
    /// processed tracks and those awaiting the python engine are visible.
    /// </summary>
    [HttpGet("db-catalog")]
    [AllowAnonymous]
    public async Task<IActionResult> GetDbCatalog(
        [FromQuery] string? genre = null,
        [FromQuery] string? status = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 60,
        CancellationToken cancellationToken = default)
    {
        pageSize = Math.Clamp(pageSize, 1, 200);
        page     = Math.Max(1, page);

        var query = _db.KaraokeTracks
            .AsNoTracking()
            .Where(t => t.IsPublic && !t.IsDeleted);

        if (!string.IsNullOrWhiteSpace(genre))
            query = query.Where(t => EF.Functions.ILike(t.Genre ?? "", $"%{genre}%"));

        if (!string.IsNullOrWhiteSpace(status) &&
            Enum.TryParse<KaraokeTrackStatus>(status, ignoreCase: true, out var parsedStatus))
            query = query.Where(t => t.Status == parsedStatus);

        var total = await query.CountAsync(cancellationToken);
        var tracks = await query
            .OrderBy(t => t.Genre)
            .ThenBy(t => t.Artist)
            .ThenBy(t => t.Title)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        var items = tracks.Select(t => MapTrack(t)).ToList();

        // Group by genre for the UI — grouping on the raw entity avoids
        // the anonymous-type reflection issue with LINQ GroupBy.
        var grouped = tracks
            .GroupBy(t => NormaliseGenre(t.Genre))
            .OrderBy(g => g.Key)
            .Select(g => new { genre = g.Key, tracks = g.Select(MapTrack).ToList() })
            .ToList();

        return Ok(new { total, page, pageSize, items, grouped });
    }

    /// <summary>
    /// GET /api/karaoke/db-catalog/genres
    /// Distinct genre list for the genre filter chips in the UI.
    /// </summary>
    [HttpGet("db-catalog/genres")]
    [AllowAnonymous]
    public async Task<IActionResult> GetGenres(CancellationToken cancellationToken)
    {
        var genres = await _db.KaraokeTracks
            .AsNoTracking()
            .Where(t => t.IsPublic && !t.IsDeleted && t.Genre != null)
            .Select(t => t.Genre!)
            .Distinct()
            .OrderBy(g => g)
            .ToListAsync(cancellationToken);

        // Normalise and de-dup (e.g. "Blues / R&B" and "Blues" → one entry)
        var normalised = genres
            .SelectMany(g => g.Split(["/", "&", ",", " | "], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            .Select(NormaliseGenre)
            .Where(g => g.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(g => g)
            .ToList();

        return Ok(new { genres = normalised });
    }

    /// <summary>
    /// POST /api/karaoke/db-catalog/{id}/play
    /// Increments the play counter for a track and records the user interaction.
    /// </summary>
    [HttpPost("db-catalog/{id:guid}/play")]
    [AllowAnonymous]
    public async Task<IActionResult> RecordPlay(Guid id, CancellationToken cancellationToken)
    {
        var track = await _db.KaraokeTracks.FindAsync([id], cancellationToken);
        if (track is null || !track.IsPublic)
            return NotFound();

        track.PlayCount++;

        var userId = User.GetUserId();
        if (userId != Guid.Empty)
        {
            _db.KaraokeTrackPlays.Add(new KaraokeTrackPlay
            {
                TrackId   = id,
                UserId    = userId,
                PlayedAt  = DateTime.UtcNow,
            });
        }

        await _db.SaveChangesAsync(cancellationToken);
        return Ok(new { playCount = track.PlayCount });
    }

    // ── helpers ───────────────────────────────────────────────────────────

    private object MapTrack(KaraokeTrack t)
    {
        // Resolve CDN URL from blob key when a cached URL isn't already stored.
        string? ResolveUrl(string? cached, string? blobKey)
        {
            if (!string.IsNullOrWhiteSpace(cached)) return cached;
            if (string.IsNullOrWhiteSpace(blobKey)) return null;
            return _blob.IsConfigured ? _blob.ResolvePublicUrl(blobKey) : null;
        }

        return new
        {
            id               = t.Id,
            title            = t.Title,
            artist           = t.Artist,
            album            = t.Album,
            genre            = t.Genre,
            language         = t.Language,
            year             = t.Year,
            license          = t.License,
            licenseUrl       = t.LicenseUrl,
            attributionText  = t.AttributionText,
            sourceUrl        = t.SourceUrl,
            status           = t.Status.ToString(),
            hasInstrumental  = t.HasInstrumental,
            hasLrc           = t.HasLrc,
            durationSeconds  = t.DurationSeconds,
            playCount        = t.PlayCount,
            rating           = t.Rating,
            // Resolved playback URLs
            instrumentalUrl  = ResolveUrl(t.InstrumentalUrl, t.InstrumentalBlobKey),
            lrcUrl           = ResolveUrl(t.LrcUrl,          t.LrcBlobKey),
            coverImageUrl    = ResolveUrl(t.CoverImageUrl,   t.CoverImageBlobKey),
            // Inline lyrics for immediate display
            lrcContent       = t.LrcContent,
            plainLyrics      = t.PlainLyrics,
        };
    }

    private static string NormaliseGenre(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return "Other";
        var trimmed = raw.Trim();
        // Map common compound genres to a canonical label
        if (trimmed.Contains("R&B", StringComparison.OrdinalIgnoreCase)
            || trimmed.Contains("Soul", StringComparison.OrdinalIgnoreCase))
            return "R&B / Soul";
        if (trimmed.Contains("Soft Rock", StringComparison.OrdinalIgnoreCase))
            return "Soft Rock";
        if (trimmed.Contains("Blues", StringComparison.OrdinalIgnoreCase))
            return "Blues";
        if (trimmed.Contains("Classical", StringComparison.OrdinalIgnoreCase))
            return "Classical";
        if (trimmed.Contains("Jazz", StringComparison.OrdinalIgnoreCase))
            return "Jazz";
        if (trimmed.Contains("Folk", StringComparison.OrdinalIgnoreCase))
            return "Folk";
        if (trimmed.Contains("Pop", StringComparison.OrdinalIgnoreCase))
            return "Pop";
        if (trimmed.Contains("Rock", StringComparison.OrdinalIgnoreCase))
            return "Rock";
        if (trimmed.Contains("Hip Hop", StringComparison.OrdinalIgnoreCase)
            || trimmed.Contains("Funk", StringComparison.OrdinalIgnoreCase))
            return "Hip Hop / Funk";
        if (trimmed.Contains("Electronic", StringComparison.OrdinalIgnoreCase)
            || trimmed.Contains("EDM", StringComparison.OrdinalIgnoreCase)
            || trimmed.Contains("Lo-Fi", StringComparison.OrdinalIgnoreCase))
            return "Electronic";
        return trimmed;
    }

    private string ResolveUserId()
    {
        var userId = User.GetUserId();
        return userId == Guid.Empty ? "anonymous" : userId.ToString("N");
    }

    private void ConfigureInternalToken(HttpClient client)
    {
        var token = _configuration["KaraokeService:InternalToken"]
            ?? _configuration["KaraokeService__InternalToken"];
        if (string.IsNullOrWhiteSpace(token))
        {
            return;
        }

        client.DefaultRequestHeaders.Remove("X-Internal-Token");
        client.DefaultRequestHeaders.TryAddWithoutValidation("X-Internal-Token", token);
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

public sealed class KaraokePurchaseRequest
{
    public string SongId { get; set; } = string.Empty;
}
