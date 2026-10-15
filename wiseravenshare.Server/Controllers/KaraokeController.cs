using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
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
    private readonly ILogger<KaraokeController> _logger;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public KaraokeController(
        IHttpClientFactory httpClientFactory,
        ILogger<KaraokeController> logger)
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
            var client = _httpClientFactory.CreateClient("KaraokeService");
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

public sealed class KaraokePurchaseRequest
{
    public string SongId { get; set; } = string.Empty;
}
