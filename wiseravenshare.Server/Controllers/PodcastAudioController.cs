using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

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
        "video/mp4", "audio/aac", "audio/webm", "audio/opus", "audio/x-ms-wma",
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

    public class AssemblyAiSyncRequest
    {
        public string SpeechModel { get; set; } = "universal-3-5-pro";
        public bool WordTimestamps { get; set; } = true;
        public bool ExtractAudioFirst { get; set; } = false;
        public bool? SpeakerLabels { get; set; }
        public bool? AutoChapters { get; set; }
        public bool? IabCategories { get; set; }
        public bool? SentimentAnalysis { get; set; }
        public bool? Summarization { get; set; }
    }

    public sealed class AssemblyAiSyncUrlRequest : AssemblyAiSyncRequest
    {
        public string AudioUrl { get; set; } = string.Empty;
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

    [HttpPost("assemblyai/warm")]
    public async Task<IActionResult> WarmAssemblyAiSync([FromBody] AssemblyAiSyncRequest? request, CancellationToken cancellationToken)
    {
        request ??= new AssemblyAiSyncRequest();
        using var client = _httpClientFactory.CreateClient("AudioService");
        using var payload = new StringContent(JsonSerializer.Serialize(new
        {
            speech_model = request.SpeechModel,
            word_timestamps = true,
            speaker_labels = request.SpeakerLabels,
            auto_chapters = request.AutoChapters,
            iab_categories = request.IabCategories,
            sentiment_analysis = request.SentimentAnalysis,
        }), Encoding.UTF8, "application/json");

        HttpResponseMessage response;
        try
        {
            response = await client.PostAsync("/assemblyai/warm", payload, cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "AssemblyAI warm endpoint is unreachable.");
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                message = "AssemblyAI warmup is unavailable."
            });
        }

        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("AssemblyAI warm proxy failed with status {Status}: {Body}", (int)response.StatusCode, body);
            return StatusCode((int)response.StatusCode, new { message = "AssemblyAI warmup failed.", detail = body });
        }

        return Content(body, "application/json");
    }

    /// <summary>
    /// Process a podcast audio file through the Audacity-equivalent DSP chain.
    /// Applies DC removal → noise reduction → noise gate → compression → -16 LUFS normalisation.
    /// Returns the cleaned WAV as a file download.
    /// </summary>
    [HttpPost("process")]
    [AllowAnonymous]
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

    [HttpPost("assemblyai/transcribe")]
    [RequestSizeLimit(524_288_000)] // 500 MB
    [RequestFormLimits(MultipartBodyLengthLimit = 524_288_000)]
    public async Task<IActionResult> SyncTranscribeAudio(
        IFormFile audioFile,
        [FromForm] string speechModel = "universal-3-5-pro",
        [FromForm] bool wordTimestamps = true,
        [FromForm] bool extractAudioFirst = false,
        [FromForm] bool? speakerLabels = null,
        [FromForm] bool? autoChapters = null,
        [FromForm] bool? iabCategories = null,
        [FromForm] bool? sentimentAnalysis = null,
        [FromForm] bool? summarization = null,
        CancellationToken cancellationToken = default)
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
        multipart.Add(new StringContent(speechModel), "speech_model");
        multipart.Add(new StringContent(wordTimestamps ? "true" : "false"), "word_timestamps");
        multipart.Add(new StringContent(extractAudioFirst ? "true" : "false"), "extract_audio_first");
        if (speakerLabels.HasValue) multipart.Add(new StringContent(speakerLabels.Value ? "true" : "false"), "speaker_labels");
        if (autoChapters.HasValue) multipart.Add(new StringContent(autoChapters.Value ? "true" : "false"), "auto_chapters");
        if (iabCategories.HasValue) multipart.Add(new StringContent(iabCategories.Value ? "true" : "false"), "iab_categories");
        if (sentimentAnalysis.HasValue) multipart.Add(new StringContent(sentimentAnalysis.Value ? "true" : "false"), "sentiment_analysis");
        if (summarization.HasValue) multipart.Add(new StringContent(summarization.Value ? "true" : "false"), "summarization");

        HttpResponseMessage upstreamResponse;
        try
        {
            upstreamResponse = await client.PostAsync("/assemblyai/transcribe-file", multipart, cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "AssemblyAI sync transcription service is unreachable.");
            return StatusCode(503, new { message = "AssemblyAI transcription service is unavailable. Please try again later." });
        }

        var body = await upstreamResponse.Content.ReadAsStringAsync(cancellationToken);
        if (!upstreamResponse.IsSuccessStatusCode)
        {
            _logger.LogError("AssemblyAI sync transcription returned {Status}: {Error}", (int)upstreamResponse.StatusCode, body);
            return StatusCode((int)upstreamResponse.StatusCode, new { message = "AssemblyAI transcription failed.", detail = body });
        }

        return Content(body, "application/json");
    }

    [HttpPost("assemblyai/transcribe-url")]
    public async Task<IActionResult> SyncTranscribeUrl([FromBody] AssemblyAiSyncUrlRequest request, CancellationToken cancellationToken)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.AudioUrl))
            return BadRequest(new { message = "audioUrl is required." });

        using var client = _httpClientFactory.CreateClient("AudioService");
        using var payload = new StringContent(JsonSerializer.Serialize(new
        {
            audio_url = request.AudioUrl,
            speech_model = request.SpeechModel,
            word_timestamps = true,
            speaker_labels = request.SpeakerLabels,
            auto_chapters = request.AutoChapters,
            iab_categories = request.IabCategories,
            sentiment_analysis = request.SentimentAnalysis,
            summarization = request.Summarization,
        }), Encoding.UTF8, "application/json");

        HttpResponseMessage response;
        try
        {
            response = await client.PostAsync("/assemblyai/transcribe-url", payload, cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "AssemblyAI URL sync transcription service is unreachable.");
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                message = "AssemblyAI transcription service is unavailable."
            });
        }

        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("AssemblyAI sync URL proxy failed with status {Status}: {Body}", (int)response.StatusCode, body);
            return StatusCode((int)response.StatusCode, new { message = "AssemblyAI URL transcription failed.", detail = body });
        }

        return Content(body, "application/json");
    }

    /// <summary>Convert audio to broadly supported MP3 for browsers without a decoder for the source codec.</summary>
    [HttpPost("browser-compatible")]
    [RequestSizeLimit(524_288_000)]
    [RequestFormLimits(MultipartBodyLengthLimit = 524_288_000)]
    public async Task<IActionResult> ConvertForBrowser(IFormFile audioFile, CancellationToken cancellationToken)
    {
        if (audioFile is null || audioFile.Length == 0)
            return BadRequest(new { message = "Please attach an audio file." });

        if (!AllowedContentTypes.Contains(audioFile.ContentType ?? "application/octet-stream"))
            return BadRequest(new { message = "Unsupported audio content type." });

        using var client = _httpClientFactory.CreateClient("AudioService");
        using var multipart = new MultipartFormDataContent();
        await using var stream = audioFile.OpenReadStream();
        var fileContent = new StreamContent(stream);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue(audioFile.ContentType ?? "application/octet-stream");
        multipart.Add(fileContent, "file", Path.GetFileName(audioFile.FileName ?? "audio"));

        HttpResponseMessage response;
        try
        {
            response = await client.PostAsync("/browser-compatible", multipart, cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Browser-compatible audio service is unreachable.");
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = "Audio conversion is unavailable." });
        }

        using (response)
        {
            if (!response.IsSuccessStatusCode)
            {
                var detail = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogWarning("Audio conversion returned {Status}: {Detail}", (int)response.StatusCode, detail);
                return StatusCode((int)response.StatusCode, new { message = "Audio conversion failed.", detail });
            }

            var converted = await response.Content.ReadAsByteArrayAsync(cancellationToken);
            return File(converted, "audio/mpeg", "browser-compatible.mp3");
        }
    }
}

