using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Collections.Concurrent;
using WiseRavenShare.Server.Application.Services.Assistant;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Services;

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
    private const int MaxLanguageCodes = 10;
    private static readonly ConcurrentDictionary<string, List<DateTimeOffset>> TokenIssueWindows = new(StringComparer.Ordinal);
    private static readonly ConcurrentDictionary<string, List<FinalizedTurnRecord>> FinalizedTurnsBySession = new(StringComparer.Ordinal);

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<KaraokeSpeechController> _logger;
    private readonly IConfiguration _configuration;
    private readonly ISpeechToTextService _speechToTextService;
    private readonly AppDbContext _db;
    private readonly PerformanceCompletionService _performanceCompletionService;

    public KaraokeSpeechController(
        IHttpClientFactory httpClientFactory,
        ILogger<KaraokeSpeechController> logger,
        IConfiguration configuration,
        ISpeechToTextService speechToTextService,
        AppDbContext db,
        PerformanceCompletionService performanceCompletionService)
    {
        _httpClientFactory  = httpClientFactory;
        _logger             = logger;
        _configuration      = configuration;
        _speechToTextService = speechToTextService;
        _db = db;
        _performanceCompletionService = performanceCompletionService;
    }

    // ----------------------------------------------------------------
    // STREAM TOKEN (AssemblyAI)
    // ----------------------------------------------------------------

    [HttpPost("stream-token")]
    [HttpPost("~/api/karaoke/stream-token")]
    public async Task<IActionResult> IssueStreamingToken(
        [FromBody] KaraokeStreamTokenRequest? request,
        CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Authentication required." });
        }

        var maxPerHour = Math.Clamp(_configuration.GetValue("KaraokeSpeech:TokenRateLimitPerHour", 30), 1, 300);
        if (!TryConsumeTokenIssueSlot(userId.ToString("N"), maxPerHour))
        {
            return StatusCode(StatusCodes.Status429TooManyRequests, new
            {
                message = "Too many stream token requests. Please try again later."
            });
        }

        var languageCodes = await ResolveLanguageCodesAsync(request, cancellationToken);
        var maxSessionDurationSeconds = Math.Clamp(
            request?.TokenTtlSeconds ?? _configuration.GetValue("KaraokeSpeech:TokenTtlSeconds", 3600),
            300,
            3600);
        using var client = _httpClientFactory.CreateClient("assemblyai");
        using var response = await client.GetAsync(
            $"/v3/token?expires_in_seconds=60&max_session_duration_seconds={maxSessionDurationSeconds}",
            cancellationToken);
        var payload = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("AssemblyAI token request failed ({Status}): {Payload}", (int)response.StatusCode, payload);
            return StatusCode(StatusCodes.Status502BadGateway, new
            {
                message = "Unable to issue streaming token."
            });
        }

        using var json = JsonDocument.Parse(payload);
        var token = json.RootElement.TryGetProperty("token", out var tokenNode)
            ? tokenNode.GetString()
            : null;
        if (string.IsNullOrWhiteSpace(token))
        {
            return StatusCode(StatusCodes.Status502BadGateway, new { message = "Streaming token response was invalid." });
        }

        var resolvedVoiceFocus = ResolveVoiceFocusMode(request);
        return Ok(new
        {
            token,
            languageCodes,
            voiceFocus = resolvedVoiceFocus
        });
    }

    // ----------------------------------------------------------------
    // FINALIZED TURN INGEST (word timestamps for lyric alignment)
    // ----------------------------------------------------------------

    [HttpPost("turns/finalized")]
    public IActionResult PersistFinalizedTurn([FromBody] FinalizedTurnRequest request)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.SessionId))
        {
            return BadRequest(new { message = "sessionId is required." });
        }

        if (!request.EndOfTurn || string.IsNullOrWhiteSpace(request.Transcript))
        {
            return BadRequest(new { message = "Only finalized turns with transcript can be persisted." });
        }

        var words = (request.Words ?? [])
            .Where(w => !string.IsNullOrWhiteSpace(w.Word))
            .OrderBy(w => w.Start)
            .ToArray();

        var turn = new FinalizedTurnRecord
        {
            TurnOrder = request.TurnOrder,
            Transcript = request.Transcript.Trim(),
            StartMilliseconds = words.Length > 0 ? (long?)Math.Round(words.Min(w => w.Start * 1000d)) : null,
            EndMilliseconds = words.Length > 0 ? (long?)Math.Round(words.Max(w => w.End * 1000d)) : null,
            CreatedAtUtc = DateTimeOffset.UtcNow
        };

        var sessionId = request.SessionId.Trim();
        FinalizedTurnsBySession.AddOrUpdate(
            sessionId,
            _ => [turn],
            (_, existing) =>
            {
                existing.Add(turn);
                if (existing.Count > 500)
                {
                    existing.RemoveRange(0, existing.Count - 500);
                }
                return existing;
            });

        return Ok(new { persisted = true, aligned = false });
    }

    [HttpPost("performances/{performanceId:guid}")]
    public async Task<IActionResult> StartPerformance(
        [FromRoute] Guid performanceId,
        [FromBody] StartKaraokePerformanceRequest request,
        CancellationToken cancellationToken)
    {
        if (request is null || request.SongId == Guid.Empty)
        {
            return BadRequest(new { message = "songId is required." });
        }

        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Authentication required." });
        }

        await _performanceCompletionService.CreatePerformanceAsync(
            performanceId,
            userId,
            request.SongId,
            request.StartedAtUtc ?? DateTimeOffset.UtcNow,
            cancellationToken);

        return Ok(new { created = true, performanceId });
    }

    [HttpPost("performances/{performanceId:guid}/complete")]
    public async Task<IActionResult> CompletePerformance(
        [FromRoute] Guid performanceId,
        [FromBody] CompleteKaraokePerformanceRequest request,
        CancellationToken cancellationToken)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.SessionId))
        {
            return BadRequest(new { message = "sessionId is required." });
        }

        if (request.SongId == Guid.Empty)
        {
            return BadRequest(new { message = "songId is required." });
        }

        var sessionId = request.SessionId.Trim();
        if (!FinalizedTurnsBySession.TryGetValue(sessionId, out var turns) || turns.Count == 0)
        {
            return BadRequest(new { message = "No finalized turns were captured for the session." });
        }

        var normalizedTurns = turns
            .OrderBy(x => x.TurnOrder)
            .Select(x => new FinalTurn(
                x.TurnOrder,
                x.Transcript,
                x.StartMilliseconds,
                x.EndMilliseconds))
            .ToArray();

        var result = await _performanceCompletionService.CompleteAsync(
            performanceId,
            request.SongId,
            normalizedTurns,
            cancellationToken);

        FinalizedTurnsBySession.TryRemove(sessionId, out _);
        return Ok(result);
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
        var incomingQuery = HttpContext.Request.QueryString.HasValue
            ? HttpContext.Request.QueryString.Value
            : string.Empty;
        var wsUri = new Uri(
            speechServiceBase
                .Replace("http://", "ws://")
                .Replace("https://", "wss://")
                .TrimEnd('/')
            + "/ws/stt"
            + incomingQuery);

        using var pythonSocket = new ClientWebSocket();
        var internalToken = _configuration["KaraokeService:InternalToken"]
            ?? _configuration["KaraokeService__InternalToken"];
        if (!string.IsNullOrWhiteSpace(internalToken))
        {
            pythonSocket.Options.SetRequestHeader("X-Internal-Token", internalToken);
        }

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

        using var relayCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        var relayToken = relayCts.Token;

        // Relay in both directions concurrently
        var browserToPython = RelayAsync(browserSocket, pythonSocket, relayToken);
        var pythonToBrowser = RelayAsync(pythonSocket, browserSocket, relayToken);
        await Task.WhenAny(browserToPython, pythonToBrowser);
        relayCts.Cancel();

        if (browserSocket.State == WebSocketState.Open || browserSocket.State == WebSocketState.CloseReceived)
        {
            await browserSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Stream ended", CancellationToken.None);
        }

        if (pythonSocket.State == WebSocketState.Open || pythonSocket.State == WebSocketState.CloseReceived)
        {
            await pythonSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Stream ended", CancellationToken.None);
        }

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

    private async Task<string[]> ResolveLanguageCodesAsync(KaraokeStreamTokenRequest? request, CancellationToken cancellationToken)
    {
        var values = new List<string>(MaxLanguageCodes);

        if (request?.TrackId is not null)
        {
            var track = await _db.KaraokeTracks
                .AsNoTracking()
                .Where(t => t.Id == request.TrackId.Value)
                .Select(t => new { t.Language })
                .FirstOrDefaultAsync(cancellationToken);

            if (!string.IsNullOrWhiteSpace(track?.Language))
            {
                values.AddRange(track.Language
                    .Split([",", ";", "|", "/", " "], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
            }
        }

        if (!string.IsNullOrWhiteSpace(request?.SongLanguage))
        {
            values.AddRange(request.SongLanguage
                .Split([",", ";", "|", "/", " "], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
        }

        if (request?.LanguageCodes is not null)
        {
            values.AddRange(request.LanguageCodes);
        }

        var deduped = values
            .Select(NormalizeLanguageCode)
            .Where(code => !string.IsNullOrWhiteSpace(code))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(MaxLanguageCodes)
            .ToArray();

        return deduped.Length > 0 ? deduped : ["en"];
    }

    private static string NormalizeLanguageCode(string? value)
    {
        var candidate = (value ?? string.Empty).Trim().Replace('_', '-');
        if (candidate.Length < 2 || candidate.Length > 12)
        {
            return string.Empty;
        }

        foreach (var ch in candidate)
        {
            if (!(char.IsLetterOrDigit(ch) || ch == '-'))
            {
                return string.Empty;
            }
        }

        return candidate.ToLowerInvariant();
    }

    private static string? ResolveVoiceFocusMode(KaraokeStreamTokenRequest? request)
    {
        if (request?.ABTest is true)
        {
            return null;
        }

        return string.Equals(request?.MicrophoneProfile, "close-vocal", StringComparison.OrdinalIgnoreCase)
            ? "near-field"
            : null;
    }

    private static bool TryConsumeTokenIssueSlot(string userKey, int maxPerHour)
    {
        var now = DateTimeOffset.UtcNow;
        var cutoff = now.AddHours(-1);
        var list = TokenIssueWindows.GetOrAdd(userKey, _ => []);
        lock (list)
        {
            list.RemoveAll(ts => ts < cutoff);
            if (list.Count >= maxPerHour)
            {
                return false;
            }

            list.Add(now);
            return true;
        }
    }
}

public sealed class ScorePerformanceRequest
{
    public string Reference  { get; set; } = string.Empty;
    public string? Hypothesis { get; set; }
    public string? SongTitle  { get; set; }
}

public sealed class KaraokeStreamTokenRequest
{
    public Guid? TrackId { get; set; }
    public string? SongLanguage { get; set; }
    public string[]? LanguageCodes { get; set; }
    public string? MicrophoneProfile { get; set; }
    public bool ABTest { get; set; }
    public int? TokenTtlSeconds { get; set; }
}

public sealed class FinalizedTurnRequest
{
    public string SessionId { get; set; } = string.Empty;
    public int TurnOrder { get; set; }
    public string Transcript { get; set; } = string.Empty;
    public bool EndOfTurn { get; set; }
    public FinalizedWordTimestamp[]? Words { get; set; }
}

public sealed class CompleteKaraokePerformanceRequest
{
    public string SessionId { get; set; } = string.Empty;
    public Guid SongId { get; set; }
}

public sealed class StartKaraokePerformanceRequest
{
    public Guid SongId { get; set; }
    public DateTimeOffset? StartedAtUtc { get; set; }
}

public sealed class FinalizedWordTimestamp
{
    public string Word { get; set; } = string.Empty;
    public double Start { get; set; }
    public double End { get; set; }
}

internal sealed class FinalizedTurnRecord
{
    public int TurnOrder { get; init; }
    public string Transcript { get; init; } = string.Empty;
    public long? StartMilliseconds { get; init; }
    public long? EndMilliseconds { get; init; }
    public DateTimeOffset CreatedAtUtc { get; init; }
}
