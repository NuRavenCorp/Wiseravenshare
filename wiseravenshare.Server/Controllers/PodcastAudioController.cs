using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Shared;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Infrastructure.Data;

namespace Wiseravenshare.Server.Controllers;

/// <summary>
/// Karaoke lyrics transcription via AssemblyAI v2 REST API.
/// Calls AssemblyAI directly — no Python audio-processing microservice required.
///
/// Flow (pre-recorded):
///   1. Upload file bytes → POST /v2/upload  → { upload_url }
///   2. Submit job       → POST /v2/transcript → { id, status }
///   3. Poll             → GET  /v2/transcript/{id} until status == "completed"
///   4. Normalise + return { text, words[], word_count, lrc, transcript_id }
///
/// The async submit/poll endpoints (/jobs) keep every HTTP leg under 5 s,
/// working around the DigitalOcean App Platform 30-second gateway timeout.
/// </summary>
[ApiController]
[Route("api/podcast-audio")]
[Authorize]
public sealed class PodcastAudioController : ControllerBase
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<PodcastAudioController> _logger;
    private readonly IServiceScopeFactory _scopeFactory;

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

    // Karaoke context prompt sent to AssemblyAI U3.5 Pro for improved accuracy.
    private const string KaraokePrompt = "Music lyrics being sung. Transcribe each word accurately including all repetitions and filler words.";

    private string BucketsRoot => _configuration["Persistence:BucketsRoot"] ?? "/app/Buckets";

    public PodcastAudioController(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<PodcastAudioController> logger,
        IServiceScopeFactory scopeFactory)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _logger = logger;
        _scopeFactory = scopeFactory;
    }

    // ── DTOs ──────────────────────────────────────────────────────────────────

    public sealed class AssemblyAiUrlRequest
    {
        public string AudioUrl { get; set; } = string.Empty;
        public string SpeechModel { get; set; } = "universal-3-5-pro";
        public bool WordTimestamps { get; set; } = true;
        public bool ExtractAudioFirst { get; set; } = false;
    }

    // Legacy aliases kept for backward compat — must not derive from sealed.
    public sealed class AssemblyAiSyncUrlRequest
    {
        public string AudioUrl { get; set; } = string.Empty;
        public string SpeechModel { get; set; } = "universal-3-5-pro";
        public bool WordTimestamps { get; set; } = true;
        public bool ExtractAudioFirst { get; set; } = false;
    }
    public sealed class AssemblyAiTranslateRequest
    {
        public string TranscriptId { get; set; } = string.Empty;
        public List<string> TargetLanguages { get; set; } = new() { "en" };
        public bool Formal { get; set; } = false;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private string GetApiKey()
    {
        return _configuration["ASSEMBLYAI_API_KEY"]
            ?? _configuration["AssemblyAi:ApiKey"]
            ?? _configuration["Authentication:AssemblyAiApiKey"]
            ?? string.Empty;
    }

    private HttpClient CreateApiClient()
    {
        var client = _httpClientFactory.CreateClient("AssemblyAiApi");
        var key = GetApiKey();
        if (!string.IsNullOrWhiteSpace(key))
        {
            // AssemblyAI REST: Authorization is the raw key — no "Bearer" prefix.
            client.DefaultRequestHeaders.Remove("Authorization");
            client.DefaultRequestHeaders.Add("Authorization", key);
        }
        return client;
    }

    /// <summary>Upload raw bytes to /v2/upload. Returns upload_url.</summary>
    private async Task<string> UploadFileAsync(byte[] bytes, string contentType, CancellationToken ct)
    {
        using var client = CreateApiClient();
        using var content = new ByteArrayContent(bytes);
        content.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        var resp = await client.PostAsync("/v2/upload", content, ct);
        var body = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode)
            throw new InvalidOperationException($"AssemblyAI upload failed ({(int)resp.StatusCode}): {body}");
        var json = JsonNode.Parse(body);
        var url = json?["upload_url"]?.GetValue<string>();
        if (string.IsNullOrWhiteSpace(url))
            throw new InvalidOperationException("AssemblyAI upload returned no upload_url.");
        return url;
    }

    private static bool IsLocalOrPrivateAddress(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return true;
        if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps) return true;
        var host = uri.Host;
        if (string.Equals(host, "localhost", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(host, "127.0.0.1", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(host, "::1", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }
        if (System.Net.IPAddress.TryParse(host, out var ip))
        {
            if (System.Net.IPAddress.IsLoopback(ip)) return true;
            var bytes = ip.GetAddressBytes();
            if (ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
            {
                if (bytes[0] == 10) return true;
                if (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31) return true;
                if (bytes[0] == 192 && bytes[1] == 168) return true;
                if (bytes[0] == 169 && bytes[1] == 254) return true;
            }
        }
        return false;
    }

    private async Task<(byte[] Bytes, string ContentType)> DownloadAudioBytesAsync(
        string url,
        string? authHeader,
        CancellationToken ct)
    {
        using var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromMinutes(3);
        if (!string.IsNullOrWhiteSpace(authHeader))
        {
            client.DefaultRequestHeaders.TryAddWithoutValidation("Authorization", authHeader);
        }
        using var resp = await client.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct);
        if (!resp.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Failed to download audio from {url}: {(int)resp.StatusCode} {resp.ReasonPhrase}");
        }
        var contentType = resp.Content.Headers.ContentType?.MediaType ?? "audio/mpeg";
        var bytes = await resp.Content.ReadAsByteArrayAsync(ct);
        if (bytes.Length == 0)
        {
            throw new InvalidOperationException($"Downloaded audio from {url} was empty.");
        }
        return (bytes, contentType);
    }

    /// <summary>
    /// Resolves audioUrl so AssemblyAI can access it.
    /// If audioUrl points to a local karaoke song, reads directly from disk and uploads to /v2/upload.
    /// If audioUrl is local/private/relative, downloads and uploads to /v2/upload.
    /// </summary>
    private async Task<string> PrepareAudioUrlForAssemblyAiAsync(
        string audioUrl,
        string? authHeader,
        string? requestBaseUrl,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(audioUrl))
            throw new ArgumentException("Audio URL cannot be empty.", nameof(audioUrl));

        var trimmed = audioUrl.Trim();

        // Already hosted on AssemblyAI CDN
        if (trimmed.StartsWith("https://cdn.assemblyai.com/", StringComparison.OrdinalIgnoreCase))
        {
            return trimmed;
        }

        // Check if this points to a local KaraokeSongFile (e.g. /api/karaoke/songs/{id}/stream)
        var songMatch = Regex.Match(trimmed, @"/api/karaoke/songs/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})", RegexOptions.IgnoreCase);
        if (songMatch.Success && Guid.TryParse(songMatch.Groups[1].Value, out var songId))
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var song = await db.KaraokeSongFiles.AsNoTracking().FirstOrDefaultAsync(s => s.Id == songId && !s.IsDeleted, ct);
            if (song != null)
            {
                if (song.IsMigratedToCloud && !string.IsNullOrWhiteSpace(song.CloudPublicUrl))
                {
                    trimmed = song.CloudPublicUrl;
                }
                else if (!string.IsNullOrWhiteSpace(song.LocalBucketKey))
                {
                    var fullPath = Path.Combine(BucketsRoot, song.LocalBucketKey);
                    if (System.IO.File.Exists(fullPath))
                    {
                        var bytes = await System.IO.File.ReadAllBytesAsync(fullPath, ct);
                        var contentType = song.ContentType ?? "audio/mpeg";
                        _logger.LogInformation("Uploading local karaoke song {SongId} ({Bytes} bytes) to AssemblyAI /v2/upload.", songId, bytes.Length);
                        return await UploadFileAsync(bytes, contentType, ct);
                    }
                }
            }
        }

        // Check if this is a direct path to a file on local disk
        if (System.IO.File.Exists(trimmed))
        {
            var bytes = await System.IO.File.ReadAllBytesAsync(trimmed, ct);
            return await UploadFileAsync(bytes, "audio/mpeg", ct);
        }

        // Resolve relative URL
        var downloadUrl = trimmed;
        if (downloadUrl.StartsWith("/", StringComparison.Ordinal))
        {
            var baseUri = !string.IsNullOrWhiteSpace(requestBaseUrl)
                ? requestBaseUrl.TrimEnd('/')
                : (_configuration["App:BaseUrl"] ?? "http://localhost:5000").TrimEnd('/');
            downloadUrl = $"{baseUri}{downloadUrl}";
        }

        // If it's local / private address, AssemblyAI won't be able to reach it. Download and upload directly.
        if (IsLocalOrPrivateAddress(downloadUrl))
        {
            _logger.LogInformation("Audio URL {Url} is local/private. Downloading and uploading to AssemblyAI /v2/upload.", downloadUrl);
            var (bytes, contentType) = await DownloadAudioBytesAsync(downloadUrl, authHeader, ct);
            return await UploadFileAsync(bytes, contentType, ct);
        }

        return downloadUrl;
    }

    /// <summary>Submit a transcript job. Returns AssemblyAI transcript id.</summary>
    private async Task<string> SubmitTranscriptAsync(string audioUrl, CancellationToken ct)
    {
        using var client = CreateApiClient();
        var payload = new StringContent(JsonSerializer.Serialize(new
        {
            audio_url = audioUrl,
            speech_models = new[] { "universal-3-5-pro", "universal-2" },
            language_detection = true,
            word_timestamps = true,
            punctuate = true,
            format_text = true,
            prompt = KaraokePrompt,
        }), Encoding.UTF8, "application/json");

        var resp = await client.PostAsync("/v2/transcript", payload, ct);
        var body = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode)
            throw new InvalidOperationException($"AssemblyAI submit failed ({(int)resp.StatusCode}): {body}");
        var json = JsonNode.Parse(body);
        var id = json?["id"]?.GetValue<string>();
        if (string.IsNullOrWhiteSpace(id))
            throw new InvalidOperationException("AssemblyAI submit returned no transcript id.");
        return id;
    }

    /// <summary>Poll /v2/transcript/{id} until completed or error. Returns raw AssemblyAI JSON.</summary>
    private async Task<JsonNode> PollTranscriptAsync(string transcriptId, CancellationToken ct, TimeSpan? timeout = null)
    {
        var deadline = DateTime.UtcNow.Add(timeout ?? TimeSpan.FromMinutes(20));
        using var client = CreateApiClient();
        while (DateTime.UtcNow < deadline)
        {
            await Task.Delay(3000, ct);
            var resp = await client.GetAsync($"/v2/transcript/{transcriptId}", ct);
            var body = await resp.Content.ReadAsStringAsync(ct);
            if (!resp.IsSuccessStatusCode)
                throw new InvalidOperationException($"AssemblyAI poll failed ({(int)resp.StatusCode}): {body}");
            var json = JsonNode.Parse(body) ?? throw new InvalidOperationException("Empty poll response.");
            var status = json["status"]?.GetValue<string>();
            if (status == "completed") return json;
            if (status == "error")
            {
                var err = json["error"]?.GetValue<string>() ?? "Unknown error";
                throw new InvalidOperationException($"AssemblyAI transcription error: {err}");
            }
            // queued | processing — keep polling
        }
        throw new TimeoutException("AssemblyAI transcription timed out.");
    }

    /// <summary>
    /// Group raw AssemblyAI words into lines using:
    ///   - silence gap >= maxGapMs between consecutive words
    ///   - max words per line
    ///   - sentence-ending punctuation (., !, ?)
    /// Returns list of lists; each inner list is one line.
    /// Timestamps are in ms (AssemblyAI native format).
    /// </summary>
    private static List<List<(string Text, double StartMs, double EndMs)>> GroupWords(
        JsonArray rawWords, int maxPerLine = 7, double maxGapMs = 700)
    {
        var result = new List<List<(string Text, double StartMs, double EndMs)>>();
        var current = new List<(string Text, double StartMs, double EndMs)>();

        foreach (var w in rawWords)
        {
            if (w is null) continue;
            var text    = w["text"]?.GetValue<string>() ?? "";
            if (string.IsNullOrWhiteSpace(text)) continue;
            var startMs = w["start"]?.GetValue<double>() ?? 0;
            var endMs   = w["end"]?.GetValue<double>()   ?? 0;

            if (current.Count > 0)
            {
                var gap = startMs - current[^1].EndMs;
                if (current.Count >= maxPerLine || gap >= maxGapMs)
                {
                    result.Add(current);
                    current = new List<(string Text, double StartMs, double EndMs)>();
                }
            }
            current.Add((text, startMs, endMs));

            if (text.TrimEnd().EndsWith('.') || text.TrimEnd().EndsWith('!') || text.TrimEnd().EndsWith('?'))
            {
                result.Add(current);
                current = new List<(string Text, double StartMs, double EndMs)>();
            }
        }
        if (current.Count > 0) result.Add(current);
        return result;
    }

    /// <summary>
    /// Convert AssemblyAI words array to LRC using gap + punctuation grouping.
    /// </summary>
    private static string WordsToLrc(JsonArray words)
    {
        if (words.Count == 0) return string.Empty;
        var groups = GroupWords(words);
        var lines  = new List<string>();
        foreach (var group in groups)
        {
            if (group.Count == 0) continue;
            var startSec = group[0].StartMs / 1000.0;
            var mm = ((int)Math.Floor(startSec / 60)).ToString("D2");
            var ss = ((int)Math.Floor(startSec % 60)).ToString("D2");
            var ms = ((int)Math.Round((startSec % 1) * 100)).ToString("D2");
            lines.Add($"[{mm}:{ss}.{ms}]{string.Join(" ", group.Select(x => x.Text))}");
        }
        return string.Join("\n", lines);
    }

    /// <summary>
    /// Build karaoke_lines array (ms timestamps) for word-fill animation in the player.
    /// Format: [{ start, end, words:[{text,start,end}] }]
    /// </summary>
    private static JsonArray BuildKaraokeLines(JsonArray rawWords)
    {
        var groups = GroupWords(rawWords);
        var result = new JsonArray();
        foreach (var group in groups)
        {
            if (group.Count == 0) continue;
            var wordNodes = new JsonArray();
            foreach (var (text, startMs, endMs) in group)
                wordNodes.Add(new JsonObject { ["text"] = text, ["start"] = startMs, ["end"] = endMs });
            result.Add(new JsonObject
            {
                ["start"] = group[0].StartMs,
                ["end"]   = group[^1].EndMs,
                ["words"] = wordNodes
            });
        }
        return result;
    }

    /// <summary>
    /// Build WebVTT with per-word timestamps (word-timed karaoke captions).
    /// Format mirrors the Python export_word_timed_vtt() output.
    /// </summary>
    private static string BuildWordTimedVtt(JsonArray rawWords)
    {
        var groups = GroupWords(rawWords);
        var sb = new System.Text.StringBuilder();
        sb.AppendLine("WEBVTT");
        sb.AppendLine("Kind: captions");
        sb.AppendLine("Language: und");
        sb.AppendLine();

        int cueNumber = 1;
        foreach (var group in groups)
        {
            if (group.Count == 0) continue;
            var cueStart = group[0].StartMs;
            var cueEnd   = Math.Max(group[^1].EndMs, cueStart + 100);

            sb.AppendLine(cueNumber.ToString());
            sb.AppendLine($"{VttTime(cueStart)} --> {VttTime(cueEnd)}");
            sb.AppendLine(string.Join(" ", group.Select(w => $"<{VttTime(w.StartMs)}>{w.Text}")));
            sb.AppendLine();
            cueNumber++;
        }
        return sb.ToString();
    }

    private static string VttTime(double ms)
    {
        var totalMs = (long)Math.Max(0, ms);
        var hours   = totalMs / 3_600_000;
        var minutes = (totalMs % 3_600_000) / 60_000;
        var seconds = (totalMs % 60_000) / 1_000;
        var millis  = totalMs % 1_000;
        return $"{hours:D2}:{minutes:D2}:{seconds:D2}.{millis:D3}";
    }

    /// <summary>
    /// Convert an AssemblyAI completed-transcript JsonNode to the normalised shape
    /// the frontend KaraokeExtractor expects:
    ///   { text, words[{word,start,end}], word_count, lrc, vtt, karaoke_lines, transcript_id, language_code }
    /// words use seconds; karaoke_lines + vtt use ms (for the player's rAF fill animation).
    /// </summary>
    private static string NormaliseToJson(JsonNode aai)
    {
        var text         = aai["text"]?.GetValue<string>()          ?? string.Empty;
        var langCode     = aai["language_code"]?.GetValue<string>() ?? "en";
        var transcriptId = aai["id"]?.GetValue<string>()            ?? string.Empty;
        var rawWords     = aai["words"] as JsonArray                 ?? new JsonArray();

        // words[] — seconds for LRC compat
        var words = new JsonArray();
        foreach (var w in rawWords)
        {
            if (w is null) continue;
            var wText   = w["text"]?.GetValue<string>()       ?? "";
            var startMs = w["start"]?.GetValue<double>()      ?? 0;
            var endMs   = w["end"]?.GetValue<double>()        ?? 0;
            var conf    = w["confidence"]?.GetValue<double>() ?? 1.0;
            words.Add(new JsonObject
            {
                ["word"]       = wText,
                ["start"]      = Math.Round(startMs / 1000.0, 3),
                ["end"]        = Math.Round(endMs   / 1000.0, 3),
                ["confidence"] = conf
            });
        }

        var lrc          = WordsToLrc(rawWords);
        var vtt          = BuildWordTimedVtt(rawWords);
        var karaokeLines = BuildKaraokeLines(rawWords);

        var result = new JsonObject
        {
            ["text"]          = text,
            ["words"]         = words,
            ["word_count"]    = words.Count,
            ["lrc"]           = lrc,
            ["vtt"]           = vtt,
            ["karaoke_lines"] = karaokeLines,
            ["transcript_id"] = transcriptId,
            ["language_code"] = langCode,
            ["vocals_isolated"] = false
        };
        return result.ToJsonString();
    }

    // ── Health ────────────────────────────────────────────────────────────────

    [HttpGet("health")]
    [AllowAnonymous]
    public async Task<IActionResult> Health()
    {
        var key = GetApiKey();
        if (string.IsNullOrWhiteSpace(key))
            return StatusCode(503, new { upstream = "unconfigured", message = "ASSEMBLYAI_API_KEY is not set." });

        try
        {
            using var client = CreateApiClient();
            var resp = await client.GetAsync("/v2/transcript?limit=1");
            return resp.IsSuccessStatusCode
                ? Ok(new { upstream = "ok", provider = "assemblyai" })
                : StatusCode(502, new { upstream = "degraded", status = (int)resp.StatusCode });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "AssemblyAI health check failed.");
            return StatusCode(503, new { upstream = "unreachable", message = ex.Message });
        }
    }

    // ── Warm (no-op kept for compat) ──────────────────────────────────────────

    [HttpPost("assemblyai/warm")]
    public IActionResult WarmAssemblyAi() => Ok(new { status = "ok", provider = "assemblyai" });

    // ── Sync transcribe file ──────────────────────────────────────────────────

    [HttpPost("assemblyai/transcribe")]
    [RequestSizeLimit(524_288_000)]
    [RequestFormLimits(MultipartBodyLengthLimit = 524_288_000)]
    public async Task<IActionResult> TranscribeFile(
        IFormFile audioFile,
        [FromForm] string speechModel = "universal-3-5-pro",
        [FromForm] bool wordTimestamps = true,
        [FromForm] bool extractAudioFirst = false,
        CancellationToken cancellationToken = default)
    {
        if (audioFile is null || audioFile.Length == 0)
            return BadRequest(new { message = "Please attach an audio file." });

        var contentType = audioFile.ContentType ?? "application/octet-stream";
        if (!AllowedContentTypes.Contains(contentType))
            return BadRequest(new { message = $"Unsupported content type '{contentType}'." });

        var key = GetApiKey();
        if (string.IsNullOrWhiteSpace(key))
            return StatusCode(503, new { message = "AssemblyAI API key is not configured on the server." });

        try
        {
            using var ms = new System.IO.MemoryStream();
            await audioFile.OpenReadStream().CopyToAsync(ms, cancellationToken);
            var bytes = ms.ToArray();

            var uploadUrl   = await UploadFileAsync(bytes, contentType, cancellationToken);
            var transcriptId = await SubmitTranscriptAsync(uploadUrl, cancellationToken);
            var result       = await PollTranscriptAsync(transcriptId, cancellationToken);
            return Content(NormaliseToJson(result), "application/json");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "AssemblyAI file transcription failed.");
            return StatusCode(503, new { message = "Transcription failed.", detail = ex.Message });
        }
    }

    // ── Sync transcribe URL ───────────────────────────────────────────────────

    [HttpPost("assemblyai/transcribe-url")]
    public async Task<IActionResult> TranscribeUrl(
        [FromBody] AssemblyAiUrlRequest request,
        CancellationToken cancellationToken)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.AudioUrl))
            return BadRequest(new { message = "audioUrl is required." });

        var key = GetApiKey();
        if (string.IsNullOrWhiteSpace(key))
            return StatusCode(503, new { message = "AssemblyAI API key is not configured on the server." });

        try
        {
            var authHeader = Request.Headers.Authorization.ToString();
            var baseUrl    = $"{Request.Scheme}://{Request.Host}";

            string resolvedAudioUrl;
            try
            {
                resolvedAudioUrl = await PrepareAudioUrlForAssemblyAiAsync(request.AudioUrl, authHeader, baseUrl, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Pre-resolving audio URL failed; attempting direct submission for {Url}.", request.AudioUrl);
                resolvedAudioUrl = request.AudioUrl;
            }

            string transcriptId;
            try
            {
                transcriptId = await SubmitTranscriptAsync(resolvedAudioUrl, cancellationToken);
            }
            catch (InvalidOperationException ex) when (ex.Message.Contains("audio_url is invalid", StringComparison.OrdinalIgnoreCase)
                                                    || ex.Message.Contains("disallowed address", StringComparison.OrdinalIgnoreCase))
            {
                _logger.LogWarning("AssemblyAI rejected URL ({Msg}). Downloading and uploading bytes to /v2/upload.", ex.Message);
                var (bytes, contentType) = await DownloadAudioBytesAsync(resolvedAudioUrl.StartsWith("http", StringComparison.OrdinalIgnoreCase) ? resolvedAudioUrl : request.AudioUrl, authHeader, cancellationToken);
                var uploadUrl = await UploadFileAsync(bytes, contentType, cancellationToken);
                transcriptId  = await SubmitTranscriptAsync(uploadUrl, cancellationToken);
            }

            var result = await PollTranscriptAsync(transcriptId, cancellationToken);
            return Content(NormaliseToJson(result), "application/json");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "AssemblyAI URL transcription failed for {Url}.", request.AudioUrl);
            return StatusCode(503, new { message = "Transcription failed.", detail = ex.Message });
        }
    }

    // ── Async job: submit file ────────────────────────────────────────────────

    private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, TranscribeJob> _transcribeJobs = new();

    private sealed class TranscribeJob
    {
        public string Status { get; set; } = "queued"; // queued|processing|completed|failed
        public string? Error { get; set; }
        public string? ResultJson { get; set; }
        /// <summary>AssemblyAI transcript id, set once submitted so the poll endpoint can check AAI directly.</summary>
        public string? AaiTranscriptId { get; set; }
        public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
        public Guid? UserId { get; init; }
    }

    [HttpPost("assemblyai/transcribe/jobs")]
    [RequestSizeLimit(524_288_000)]
    [RequestFormLimits(MultipartBodyLengthLimit = 524_288_000)]
    public async Task<IActionResult> SubmitTranscribeJob(
        IFormFile audioFile,
        [FromForm] string speechModel = "universal-3-5-pro",
        [FromForm] bool wordTimestamps = true,
        [FromForm] bool extractAudioFirst = false,
        CancellationToken cancellationToken = default)
    {
        if (audioFile is null || audioFile.Length == 0)
            return BadRequest(new { message = "Please attach an audio file." });

        var contentType = audioFile.ContentType ?? "application/octet-stream";
        if (!AllowedContentTypes.Contains(contentType))
            return BadRequest(new { message = $"Unsupported content type '{contentType}'." });

        var key = GetApiKey();
        if (string.IsNullOrWhiteSpace(key))
            return StatusCode(503, new { message = "AssemblyAI API key is not configured on the server." });

        // Buffer file to memory so it survives the request lifetime.
        using var ms = new System.IO.MemoryStream();
        await audioFile.OpenReadStream().CopyToAsync(ms, cancellationToken);
        var fileBytes = ms.ToArray();

        var userId = User.GetUserId();
        var jobId  = Guid.NewGuid().ToString("N");
        var job    = new TranscribeJob { UserId = userId != Guid.Empty ? userId : null };
        _transcribeJobs[jobId] = job;

        // Prune jobs older than 30 min.
        var pruneTime = DateTime.UtcNow.AddMinutes(-30);
        foreach (var kvp in _transcribeJobs.Where(x => x.Value.CreatedAt < pruneTime).ToList())
            _transcribeJobs.TryRemove(kvp.Key, out _);

        _ = Task.Run(async () =>
        {
            job.Status = "processing";
            try
            {
                using var cts = new System.Threading.CancellationTokenSource(TimeSpan.FromMinutes(25));
                var uploadUrl   = await UploadFileAsync(fileBytes, contentType, cts.Token);
                var aaiId       = await SubmitTranscriptAsync(uploadUrl, cts.Token);
                job.AaiTranscriptId = aaiId;
                var result      = await PollTranscriptAsync(aaiId, cts.Token, TimeSpan.FromMinutes(22));
                job.ResultJson  = NormaliseToJson(result);
                job.Status      = "completed";
            }
            catch (Exception ex)
            {
                job.Error  = ex.Message;
                job.Status = "failed";
                _logger.LogWarning(ex, "Async transcription job {JobId} failed.", jobId);
            }
        });

        return Accepted(new { job_id = jobId, status = "queued" });
    }

    // ── Async job: submit URL ─────────────────────────────────────────────────

    [HttpPost("assemblyai/transcribe-url/jobs")]
    public async Task<IActionResult> SubmitTranscribeUrlJob(
        [FromBody] AssemblyAiUrlRequest request,
        CancellationToken cancellationToken = default)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.AudioUrl))
            return BadRequest(new { message = "audioUrl is required." });

        var key = GetApiKey();
        if (string.IsNullOrWhiteSpace(key))
            return StatusCode(503, new { message = "AssemblyAI API key is not configured on the server." });

        var userId     = User.GetUserId();
        var jobId      = Guid.NewGuid().ToString("N");
        var job        = new TranscribeJob { UserId = userId != Guid.Empty ? userId : null };
        _transcribeJobs[jobId] = job;

        var audioUrl   = request.AudioUrl;
        var authHeader = Request.Headers.Authorization.ToString();
        var baseUrl    = $"{Request.Scheme}://{Request.Host}";

        _ = Task.Run(async () =>
        {
            job.Status = "processing";
            try
            {
                using var cts = new System.Threading.CancellationTokenSource(TimeSpan.FromMinutes(25));
                string resolvedAudioUrl;
                try
                {
                    resolvedAudioUrl = await PrepareAudioUrlForAssemblyAiAsync(audioUrl, authHeader, baseUrl, cts.Token);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Pre-resolving audio URL failed in job {JobId}; attempting direct submission for {Url}.", jobId, audioUrl);
                    resolvedAudioUrl = audioUrl;
                }

                string aaiId;
                try
                {
                    aaiId = await SubmitTranscriptAsync(resolvedAudioUrl, cts.Token);
                }
                catch (InvalidOperationException ex) when (ex.Message.Contains("audio_url is invalid", StringComparison.OrdinalIgnoreCase)
                                                        || ex.Message.Contains("disallowed address", StringComparison.OrdinalIgnoreCase))
                {
                    _logger.LogWarning("AssemblyAI rejected URL ({Msg}) in job {JobId}. Downloading and uploading bytes to /v2/upload.", ex.Message, jobId);
                    var (bytes, contentType) = await DownloadAudioBytesAsync(resolvedAudioUrl.StartsWith("http", StringComparison.OrdinalIgnoreCase) ? resolvedAudioUrl : audioUrl, authHeader, cts.Token);
                    var uploadUrl = await UploadFileAsync(bytes, contentType, cts.Token);
                    aaiId = await SubmitTranscriptAsync(uploadUrl, cts.Token);
                }

                job.AaiTranscriptId = aaiId;
                var result     = await PollTranscriptAsync(aaiId, cts.Token, TimeSpan.FromMinutes(22));
                job.ResultJson = NormaliseToJson(result);
                job.Status     = "completed";
            }
            catch (Exception ex)
            {
                job.Error  = ex.Message;
                job.Status = "failed";
                _logger.LogWarning(ex, "Async URL transcription job {JobId} failed.", jobId);
            }
        });

        return Accepted(new { job_id = jobId, status = "queued" });
    }

    // ── Async job: poll status ────────────────────────────────────────────────

    [HttpGet("assemblyai/transcribe/jobs/{jobId}")]
    public async Task<IActionResult> GetTranscribeJobStatus(string jobId, CancellationToken cancellationToken)
    {
        if (!_transcribeJobs.TryGetValue(jobId, out var job))
            return NotFound(new { message = "Job not found or expired." });

        var currentUserId = User.GetUserId();
        if (job.UserId.HasValue && currentUserId != Guid.Empty && job.UserId.Value != currentUserId && !User.IsInRole("Admin"))
            return Forbid();

        // If still processing but we have an AAI id, do a single live poll to get latest status.
        if (job.Status == "processing" && !string.IsNullOrWhiteSpace(job.AaiTranscriptId))
        {
            try
            {
                using var client = CreateApiClient();
                var resp = await client.GetAsync($"/v2/transcript/{job.AaiTranscriptId}", cancellationToken);
                if (resp.IsSuccessStatusCode)
                {
                    var body = await resp.Content.ReadAsStringAsync(cancellationToken);
                    var json = JsonNode.Parse(body);
                    var aaiStatus = json?["status"]?.GetValue<string>();
                    if (aaiStatus == "completed")
                    {
                        job.ResultJson = NormaliseToJson(json!);
                        job.Status     = "completed";
                    }
                    else if (aaiStatus == "error")
                    {
                        job.Error  = json?["error"]?.GetValue<string>() ?? "AssemblyAI error";
                        job.Status = "failed";
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Live poll for job {JobId} failed; background worker will complete it.", jobId);
            }
        }

        if (job.Status == "completed" && job.ResultJson is not null)
        {
            _transcribeJobs.TryRemove(jobId, out _);
            return Content($"{{\"status\":\"completed\",\"result\":{job.ResultJson}}}", "application/json");
        }

        return Ok(new { status = job.Status, error = job.Error });
    }

    // ── Translate (stub — kept for compat; requires a completed transcript) ───

    [HttpPost("assemblyai/translate")]
    public IActionResult TranslateTranscript([FromBody] AssemblyAiTranslateRequest request)
    {
        // Translation via AssemblyAI's speech_understanding endpoint requires a POST
        // to /v2/transcript with speech_understanding.request.translation config.
        // For karaoke the lyrics are always returned in the original language, so this
        // is a low-priority stub. Return a clear explanation rather than silently failing.
        return StatusCode(501, new
        {
            message = "Transcript translation is not yet wired directly. " +
                      "Submit a new transcription with the target language set in the prompt parameter."
        });
    }

    // ── Audio processing (stub — kept for compat; requires Python service) ────

    [HttpPost("process")]
    [AllowAnonymous]
    [RequestSizeLimit(524_288_000)]
    [RequestFormLimits(MultipartBodyLengthLimit = 524_288_000)]
    public IActionResult ProcessAudio()
    {
        return StatusCode(501, new
        {
            message = "Audio DSP processing is handled by the Python audio-processor service. " +
                      "It is not required for karaoke transcription."
        });
    }

    [HttpPost("browser-compatible")]
    [RequestSizeLimit(524_288_000)]
    [RequestFormLimits(MultipartBodyLengthLimit = 524_288_000)]
    public IActionResult ConvertForBrowser()
    {
        return StatusCode(501, new
        {
            message = "Browser-compatible audio conversion requires the Python audio-processor service."
        });
    }
}
