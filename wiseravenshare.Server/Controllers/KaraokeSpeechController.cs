using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using WiseRavenShare.Server.Application.Services.Assistant;

namespace Wiseravenshare.Server.Controllers;

/// <summary>
/// Gateway for the Python karaoke-speech microservice (port 8003).
/// Provides:
///   - WebSocket proxy for streaming STT lyric alignment
///   - TTS announcement and score-feedback endpoints
///   - POST /score for Levenshtein accuracy scoring
/// </summary>
[ApiController]
[Route("api/karaoke/speech")]
[Authorize]
public sealed class KaraokeSpeechController : ControllerBase
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<KaraokeSpeechController> _logger;
    private readonly IConfiguration _configuration;
    private readonly ISpeechToTextService _speechToTextService;

    public KaraokeSpeechController(
        IHttpClientFactory httpClientFactory,
        ILogger<KaraokeSpeechController> logger,
        IConfiguration configuration,
        ISpeechToTextService speechToTextService)
    {
        _httpClientFactory  = httpClientFactory;
        _logger             = logger;
        _configuration      = configuration;
        _speechToTextService = speechToTextService;
    }

    // ----------------------------------------------------------------
    // HEALTH
    // ----------------------------------------------------------------

    [HttpGet("health")]
    [AllowAnonymous]
    public async Task<IActionResult> Health()
    {
        try
        {
            var client   = _httpClientFactory.CreateClient("KaraokeSpeechService");
            var response = await client.GetAsync("/health");
            var body     = await response.Content.ReadAsStringAsync();
            return response.IsSuccessStatusCode
                ? Ok(new { upstream = "ok",      detail = body })
                : StatusCode(502, new { upstream = "degraded", detail = body });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Karaoke speech service health check failed.");
            return StatusCode(503, new { upstream = "unreachable", message = ex.Message });
        }
    }

    // ----------------------------------------------------------------
    // STT WEBSOCKET PROXY
    // Accepts a browser WebSocket and relays audio bytes to Python /ws/stt
    // Relays JSON word-timestamp frames back to the browser.
    // ----------------------------------------------------------------

    [HttpGet("stt-stream")]
    [AllowAnonymous] // Auth handled via token query param for WS upgrade
    public async Task SttStream(CancellationToken cancellationToken)
    {
        if (!HttpContext.WebSockets.IsWebSocketRequest)
        {
            HttpContext.Response.StatusCode = (int)HttpStatusCode.BadRequest;
            await HttpContext.Response.WriteAsync("WebSocket upgrade required.", cancellationToken);
            return;
        }

        using var browserSocket = await HttpContext.WebSockets.AcceptWebSocketAsync();
        _logger.LogInformation("Karaoke STT WebSocket accepted.");

        var speechServiceBase = _configuration["KaraokeSpeechService:BaseUrl"] ?? "http://localhost:8003";
        var wsUri = new Uri(speechServiceBase
            .Replace("http://", "ws://")
            .Replace("https://", "wss://")
            + "/ws/stt");

        using var pythonSocket = new ClientWebSocket();

        try
        {
            await pythonSocket.ConnectAsync(wsUri, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Cannot connect to karaoke speech WebSocket at {Uri}", wsUri);
            await browserSocket.CloseAsync(
                WebSocketCloseStatus.InternalServerError,
                "STT service unavailable",
                cancellationToken);
            return;
        }

        // Relay in both directions concurrently
        var browserToPython = RelayAsync(browserSocket, pythonSocket, cancellationToken);
        var pythonToBrowser = RelayAsync(pythonSocket, browserSocket, cancellationToken);
        await Task.WhenAny(browserToPython, pythonToBrowser);

        _logger.LogInformation("Karaoke STT WebSocket closed.");
    }

    private static async Task RelayAsync(
        WebSocket source,
        WebSocket destination,
        CancellationToken ct)
    {
        var buffer = new byte[8192];
        while (source.State == WebSocketState.Open && destination.State == WebSocketState.Open)
        {
            WebSocketReceiveResult result;
            try
            {
                result = await source.ReceiveAsync(buffer, ct);
            }
            catch
            {
                break;
            }

            if (result.MessageType == WebSocketMessageType.Close)
            {
                if (destination.State == WebSocketState.Open)
                    await destination.CloseAsync(WebSocketCloseStatus.NormalClosure, "Peer closed", ct);
                break;
            }

            if (destination.State == WebSocketState.Open)
            {
                await destination.SendAsync(
                    new ArraySegment<byte>(buffer, 0, result.Count),
                    result.MessageType,
                    result.EndOfMessage,
                    ct);
            }
        }
    }

    // ----------------------------------------------------------------
    // TTS ANNOUNCE
    // ----------------------------------------------------------------

    /// <summary>
    /// Generate a spoken announcement WAV.
    /// Used for: "Next singer in 10 seconds", "Now playing: Bohemian Rhapsody"
    /// </summary>
    [HttpGet("announce")]
    [AllowAnonymous]
    public async Task<IActionResult> Announce(
        [FromQuery] string text,
        [FromQuery] int rate = 160,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(text))
            return BadRequest(new { message = "text is required." });

        if (text.Length > 500)
            return BadRequest(new { message = "text must be 500 characters or fewer." });

        try
        {
            var client   = _httpClientFactory.CreateClient("KaraokeSpeechService");
            var url      = $"/tts/announce?text={Uri.EscapeDataString(text)}&rate={rate}";
            var response = await client.GetAsync(url, cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                var err = await response.Content.ReadAsStringAsync(cancellationToken);
                return StatusCode(502, new { message = "TTS failed.", detail = err });
            }

            var wavBytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
            return File(wavBytes, "audio/wav");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "TTS announce failed for text: {Text}", text);
            return StatusCode(503, new { message = "TTS service unavailable.", error = ex.Message });
        }
    }

    // ----------------------------------------------------------------
    // TTS SCORE FEEDBACK
    // ----------------------------------------------------------------

    /// <summary>
    /// Spoken score feedback after a karaoke performance.
    /// </summary>
    [HttpGet("score-feedback")]
    [AllowAnonymous]
    public async Task<IActionResult> ScoreFeedback(
        [FromQuery] int score,
        [FromQuery] string? song = null,
        CancellationToken cancellationToken = default)
    {
        if (score < 0 || score > 100)
            return BadRequest(new { message = "score must be 0–100." });

        try
        {
            var client   = _httpClientFactory.CreateClient("KaraokeSpeechService");
            var url      = $"/tts/score-feedback?score={score}";
            if (!string.IsNullOrWhiteSpace(song))
                url += $"&song={Uri.EscapeDataString(song)}";

            var response = await client.GetAsync(url, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var err = await response.Content.ReadAsStringAsync(cancellationToken);
                return StatusCode(502, new { message = "Score feedback TTS failed.", detail = err });
            }

            var wavBytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
            return File(wavBytes, "audio/wav");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "TTS score-feedback failed.");
            return StatusCode(503, new { message = "TTS service unavailable.", error = ex.Message });
        }
    }

    // ----------------------------------------------------------------
    // SCORING (proxied)
    // ----------------------------------------------------------------

    /// <summary>
    /// Score a karaoke performance: compare STT transcript against reference lyrics.
    /// Returns accuracy 0–100, label, and spoken feedback text.
    /// Falls back to a local Levenshtein word-error-rate scorer when the Python service is unavailable.
    /// </summary>
    [HttpPost("score")]
    [AllowAnonymous]
    public async Task<IActionResult> ScorePerformance(
        [FromBody] ScorePerformanceRequest body,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(body.Reference))
            return BadRequest(new { message = "reference lyrics required." });

        try
        {
            var client  = _httpClientFactory.CreateClient("KaraokeSpeechService");
            var payload = JsonSerializer.Serialize(new
            {
                reference  = body.Reference,
                hypothesis = body.Hypothesis ?? string.Empty,
                song_title = body.SongTitle
            });
            var content  = new StringContent(payload, Encoding.UTF8, "application/json");
            var response = await client.PostAsync("/score", content, cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                var err = await response.Content.ReadAsStringAsync(cancellationToken);
                return StatusCode(502, new { message = "Scoring failed.", detail = err });
            }

            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            return Content(json, "application/json");
        }
        catch (Exception ex)
        {
            // Python speech service unavailable — fall back to local word-error-rate scorer.
            _logger.LogWarning(ex, "Karaoke speech service unavailable; using local Levenshtein fallback scorer.");
            return LocalLevenshteinScore(body.Reference, body.Hypothesis ?? string.Empty, body.SongTitle);
        }
    }

    /// <summary>
    /// Local fallback scorer: word-level Levenshtein / word-error-rate.
    /// Returns the same shape as the Python scorer so the client works identically.
    /// </summary>
    private static IActionResult LocalLevenshteinScore(string reference, string hypothesis, string? songTitle)
    {
        var refWords = Tokenise(reference);
        var hypWords = Tokenise(hypothesis);

        var distance = WordLevenshtein(refWords, hypWords);
        var total    = Math.Max(1, refWords.Length);
        var wer      = (double)distance / total;                // 0 = perfect, 1+ = bad
        var accuracy = (int)Math.Round(Math.Max(0.0, 1.0 - wer) * 100);

        var label = accuracy switch
        {
            >= 90 => "Excellent",
            >= 75 => "Great",
            >= 55 => "Good",
            >= 35 => "Keep practising",
            _     => "Try again"
        };

        var feedback = accuracy >= 70
            ? $"Great job on '{songTitle ?? "that song"}'! You scored {accuracy}%."
            : $"You scored {accuracy}% on '{songTitle ?? "that song"}'. Keep practising!";

        return new JsonResult(new
        {
            accuracy,
            label,
            feedback,
            fallback = true,  // lets client show "scored locally" indicator
            wordErrorRate = Math.Round(wer, 3)
        });
    }

    private static string[] Tokenise(string text) =>
        text.ToLowerInvariant()
            .Split([' ', '\t', '\r', '\n', ',', '.', '!', '?', ';', ':', '"', '\''],
                   StringSplitOptions.RemoveEmptyEntries);

    private static int WordLevenshtein(string[] a, string[] b)
    {
        int m = a.Length, n = b.Length;
        var dp = new int[m + 1, n + 1];
        for (var i = 0; i <= m; i++) dp[i, 0] = i;
        for (var j = 0; j <= n; j++) dp[0, j] = j;
        for (var i = 1; i <= m; i++)
            for (var j = 1; j <= n; j++)
                dp[i, j] = a[i - 1] == b[j - 1]
                    ? dp[i - 1, j - 1]
                    : 1 + Math.Min(dp[i - 1, j - 1], Math.Min(dp[i - 1, j], dp[i, j - 1]));
        return dp[m, n];
    }

    // ----------------------------------------------------------------
    // DIRECT FILE TRANSCRIBE
    // ----------------------------------------------------------------

    [HttpPost("transcribe")]
    [AllowAnonymous]
    [RequestSizeLimit(25_000_000)]
    public async Task<IActionResult> Transcribe(CancellationToken cancellationToken)
    {
        if (!Request.HasFormContentType)
        {
            return BadRequest(new { message = "multipart/form-data is required." });
        }

        var form = await Request.ReadFormAsync(cancellationToken);
        var audio = form.Files.GetFile("audio")
            ?? form.Files.GetFile("file")
            ?? form.Files.FirstOrDefault();

        if (audio is null || audio.Length == 0)
        {
            return BadRequest(new { message = "Audio file required." });
        }

        await using var stream = audio.OpenReadStream();
        try
        {
            var contentType = string.IsNullOrWhiteSpace(audio.ContentType)
                ? "application/octet-stream"
                : audio.ContentType;
            var result = await _speechToTextService.TranscribeAsync(stream, contentType, audio.FileName, cancellationToken);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Karaoke speech transcribe failed for {FileName}.", audio.FileName);
            return BadRequest(new { message = ex.Message });
        }
    }

    // ----------------------------------------------------------------
    // WORD-LEVEL EXTRACTION — vocal isolation → Whisper word timestamps
    // ----------------------------------------------------------------

    /// <summary>
    /// POST /api/karaoke/speech/transcribe/words
    /// Proxies to the python-karaoke /transcribe/words endpoint.
    /// That endpoint:
    ///   1. Runs demucs --two-stems=vocals to strip background music
    ///   2. Runs Whisper with word_timestamps=True on the clean vocals
    ///   3. Returns {text, language, words:[{word,start,end,prob}], lrc, word_count, vocals_isolated}
    /// </summary>
    [HttpPost("transcribe/words")]
    [AllowAnonymous]
    [RequestSizeLimit(100_000_000)] // 100 MB — music files are larger than voice memos
    public async Task<IActionResult> TranscribeWords(CancellationToken cancellationToken)
    {
        if (!Request.HasFormContentType)
            return BadRequest(new { message = "multipart/form-data is required." });

        var form = await Request.ReadFormAsync(cancellationToken);
        var audio = form.Files.GetFile("audio")
            ?? form.Files.GetFile("file")
            ?? form.Files.FirstOrDefault();

        if (audio is null || audio.Length == 0)
            return BadRequest(new { message = "Audio file required." });

        var isolate = form["isolate_vocals"].ToString() is not ("false" or "0");
        var language = form["language"].ToString() ?? "";

        try
        {
            using var client = _httpClientFactory.CreateClient("KaraokeService");
            using var multipart = new System.Net.Http.MultipartFormDataContent();

            await using var stream = audio.OpenReadStream();
            var fileContent = new System.Net.Http.StreamContent(stream);
            fileContent.Headers.ContentType =
                new System.Net.Http.Headers.MediaTypeHeaderValue(
                    audio.ContentType ?? "application/octet-stream");
            multipart.Add(fileContent, "file", audio.FileName ?? "audio.mp3");
            multipart.Add(new System.Net.Http.StringContent(isolate ? "true" : "false"), "isolate_vocals");
            if (!string.IsNullOrWhiteSpace(language))
                multipart.Add(new System.Net.Http.StringContent(language), "language");

            var response = await client.PostAsync("/transcribe/words", multipart, cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                var err = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogWarning("python-karaoke /transcribe/words returned {Status}: {Err}",
                    (int)response.StatusCode, err);
                // Fall back to basic Whisper transcription when the python service is unavailable
                var fallbackStream = audio.OpenReadStream();
                try
                {
                    var contentType = string.IsNullOrWhiteSpace(audio.ContentType)
                        ? "application/octet-stream" : audio.ContentType;
                    var sttResult = await _speechToTextService.TranscribeAsync(
                        fallbackStream, contentType, audio.FileName, cancellationToken);
                    return Ok(new
                    {
                        text       = sttResult.Text,
                        language   = sttResult.Language,
                        words      = Array.Empty<object>(),
                        lrc        = "",
                        word_count = 0,
                        vocals_isolated = false,
                        fallback   = true,
                    });
                }
                finally { await fallbackStream.DisposeAsync(); }
            }

            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            return Content(json, "application/json");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Word-level transcription failed for {FileName}.", audio.FileName);
            return BadRequest(new { message = ex.Message });
        }
    }
}

public sealed class ScorePerformanceRequest
{
    public string Reference  { get; set; } = string.Empty;
    public string? Hypothesis { get; set; }
    public string? SongTitle  { get; set; }
}
