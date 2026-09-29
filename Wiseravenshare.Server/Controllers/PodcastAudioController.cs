using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Net.Http.Headers;

namespace Wiseravenshare.Server.Controllers;

/// <summary>
/// Gateway for the Python audio-processing microservice.
/// Proxies multipart audio uploads to the FastAPI service at
/// AudioService:BaseUrl (default http://localhost:8001) and
/// streams the processed WAV back to the React client.
/// </summary>
[ApiController]
[Route("api/podcast-audio")]
[Authorize]
public sealed class PodcastAudioController : ControllerBase
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<PodcastAudioController> _logger;

    private static readonly HashSet<string> AllowedContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "audio/wav", "audio/wave", "audio/x-wav",
        "audio/mpeg", "audio/mp3",
        "audio/mp4", "audio/x-m4a",
        "audio/flac", "audio/x-flac",
        "audio/ogg", "audio/vorbis",
        "application/octet-stream"
    };

    public PodcastAudioController(
        IHttpClientFactory httpClientFactory,
        ILogger<PodcastAudioController> logger)
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
            var client = _httpClientFactory.CreateClient("AudioService");
            var response = await client.GetAsync("/health");
            var body = await response.Content.ReadAsStringAsync();
            return response.IsSuccessStatusCode
                ? Ok(new { upstream = "ok", detail = body })
                : StatusCode(502, new { upstream = "degraded", detail = body });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Audio service health check failed.");
            return StatusCode(503, new { upstream = "unreachable", message = ex.Message });
        }
    }

    /// <summary>
    /// Process a podcast audio file through the Audacity-equivalent DSP chain.
    /// Applies DC removal → noise reduction → noise gate → compression → -16 LUFS normalisation.
    /// Returns the cleaned WAV as a file download.
    /// </summary>
    [HttpPost("process")]
    [RequestSizeLimit(524_288_000)] // 500 MB
    [RequestFormLimits(MultipartBodyLengthLimit = 524_288_000)]
    public async Task<IActionResult> ProcessAudio(IFormFile audioFile, CancellationToken cancellationToken)
    {
        if (audioFile is null || audioFile.Length == 0)
            return BadRequest(new { message = "Please attach an audio file." });

        var contentType = audioFile.ContentType ?? "application/octet-stream";
        if (!AllowedContentTypes.Contains(contentType))
            return BadRequest(new { message = $"Unsupported content type '{contentType}'." });

        using var client = _httpClientFactory.CreateClient("AudioService");
        using var multipart = new MultipartFormDataContent();
        await using var stream = audioFile.OpenReadStream();

        var fileContent = new StreamContent(stream);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        multipart.Add(fileContent, "file", audioFile.FileName ?? "upload.wav");

        HttpResponseMessage upstreamResponse;
        try
        {
            upstreamResponse = await client.PostAsync("/process", multipart, cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Audio processing service is unreachable.");
            return StatusCode(503, new { message = "Audio processing service is unavailable. Please try again later." });
        }

        if (!upstreamResponse.IsSuccessStatusCode)
        {
            var error = await upstreamResponse.Content.ReadAsStringAsync(cancellationToken);
            _logger.LogError("Audio service returned {Status}: {Error}", (int)upstreamResponse.StatusCode, error);
            return StatusCode((int)upstreamResponse.StatusCode, new { message = "Audio processing failed.", detail = error });
        }

        var processed = await upstreamResponse.Content.ReadAsByteArrayAsync(cancellationToken);
        var outputName = $"processed_{Guid.NewGuid():N}.wav";
        return File(processed, "audio/wav", outputName);
    }
}
