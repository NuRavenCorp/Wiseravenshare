using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Net.Http.Headers;

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
    /// Upload a song file; receive the instrumental backing track (vocals removed).
    /// Processing via htdemucs_ft typically takes 1–3 minutes on CPU, up to 30 s on GPU.
    /// </summary>
    [HttpPost("generate-backing")]
    [RequestSizeLimit(314_572_800)] // 300 MB
    [RequestFormLimits(MultipartBodyLengthLimit = 314_572_800)]
    public async Task<IActionResult> GenerateBacking(IFormFile audioFile, CancellationToken cancellationToken)
    {
        if (audioFile is null || audioFile.Length == 0)
            return BadRequest(new { message = "Please attach an audio file." });

        using var client = _httpClientFactory.CreateClient("KaraokeService");
        using var multipart = new MultipartFormDataContent();
        await using var stream = audioFile.OpenReadStream();

        var fileContent = new StreamContent(stream);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue(
            audioFile.ContentType ?? "application/octet-stream");
        multipart.Add(fileContent, "file", audioFile.FileName ?? "song.mp3");

        HttpResponseMessage upstreamResponse;
        try
        {
            upstreamResponse = await client.PostAsync("/generate-backing", multipart, cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Karaoke engine is unreachable.");
            return StatusCode(503, new { message = "Karaoke service is unavailable. Please try again later." });
        }

        if (!upstreamResponse.IsSuccessStatusCode)
        {
            var error = await upstreamResponse.Content.ReadAsStringAsync(cancellationToken);
            _logger.LogError("Karaoke service returned {Status}: {Error}", (int)upstreamResponse.StatusCode, error);
            return StatusCode((int)upstreamResponse.StatusCode, new { message = "Backing track generation failed.", detail = error });
        }

        var bytes = await upstreamResponse.Content.ReadAsByteArrayAsync(cancellationToken);
        return File(bytes, "audio/wav", $"instrumental_{Guid.NewGuid():N}.wav");
    }

    /// <summary>
    /// Simple catalogue endpoint — returns public-domain / UltraStar community songs
    /// that are safe to use without commercial licensing.
    /// Replace with a real database query once the song library is seeded.
    /// </summary>
    [HttpGet("catalogue")]
    [AllowAnonymous]
    public IActionResult GetCatalogue()
    {
        var catalogue = new[]
        {
            new { id = "pd-001", title = "Beethoven – Ode to Joy",    artist = "Public Domain", durationSeconds = 210, source = "musopen" },
            new { id = "pd-002", title = "Bach – Air on the G String", artist = "Public Domain", durationSeconds = 293, source = "musopen" },
            new { id = "pd-003", title = "Vivaldi – Spring (from The Four Seasons)", artist = "Public Domain", durationSeconds = 200, source = "musopen" },
            new { id = "us-001", title = "UltraStar Demo Song",       artist = "UltraStar Community", durationSeconds = 180, source = "ultrastar-community" },
        };
        return Ok(catalogue);
    }
}
