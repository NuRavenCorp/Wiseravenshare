using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace WiseRavenShare.Server.Application.Services.Assistant;

public interface ISpeechToTextService
{
    Task<SttResult> TranscribeAsync(Stream audio, string mimeType, string? fileName = null, CancellationToken ct = default);
}

public class WhisperOptions
{
    public string ApiKey { get; set; } = string.Empty;
    public string BaseUrl { get; set; } = "https://api.openai.com/v1";
    public string Model { get; set; } = "whisper-1";
}

public class SpeechToTextService : ISpeechToTextService
{
    private readonly HttpClient _http;
    private readonly WhisperOptions _opts;
    private readonly ILogger<SpeechToTextService> _logger;

    public SpeechToTextService(HttpClient http, IOptions<WhisperOptions> opts, ILogger<SpeechToTextService> logger)
    {
        _http = http;
        _opts = opts.Value;
        _logger = logger;
        _http.BaseAddress = new Uri(_opts.BaseUrl);
        if (!string.IsNullOrEmpty(_opts.ApiKey))
        {
            _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _opts.ApiKey);
        }
    }

    public async Task<SttResult> TranscribeAsync(Stream audio, string mimeType, string? fileName = null, CancellationToken ct = default)
    {
        var normalizedMimeType = NormalizeMimeType(mimeType, fileName);
        var normalizedFileName = NormalizeFileName(fileName, normalizedMimeType);
        using var buffer = new MemoryStream();
        await audio.CopyToAsync(buffer, ct);
        var audioBytes = buffer.ToArray();

        var hasVersionedBasePath = _http.BaseAddress?.AbsolutePath
            .Contains("/v1", StringComparison.OrdinalIgnoreCase) == true;
        var endpoints = hasVersionedBasePath
            ? new[] { "audio/transcriptions", "v1/audio/transcriptions" }
            : new[] { "v1/audio/transcriptions", "audio/transcriptions" };

        HttpRequestException? lastError = null;
        foreach (var endpoint in endpoints)
        {
            try
            {
                using var response = await PostTranscriptionAsync(endpoint, audioBytes, normalizedMimeType, normalizedFileName, ct);
                response.EnsureSuccessStatusCode();

                using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
                var root = doc.RootElement;
                var text = root.GetProperty("text").GetString() ?? "";
                var lang = root.TryGetProperty("language", out var l) ? l.GetString() : null;
                var dur = root.TryGetProperty("duration", out var d) ? (int)(d.GetDouble() * 1000) : 0;
                return new SttResult(text, lang, null, dur);
            }
            catch (HttpRequestException ex)
            {
                lastError = ex;
                _logger.LogWarning(ex, "STT transcription attempt failed at endpoint '{Endpoint}'.", endpoint);
            }
        }

        throw lastError ?? new HttpRequestException("Speech-to-text transcription failed.");
    }

    private async Task<HttpResponseMessage> PostTranscriptionAsync(
        string endpoint,
        byte[] audioBytes,
        string normalizedMimeType,
        string normalizedFileName,
        CancellationToken ct)
    {
        using var form = new MultipartFormDataContent();
        var audioContent = new ByteArrayContent(audioBytes);
        audioContent.Headers.ContentType = new MediaTypeHeaderValue(normalizedMimeType);
        form.Add(audioContent, "file", normalizedFileName);
        form.Add(new StringContent(_opts.Model), "model");
        form.Add(new StringContent("verbose_json"), "response_format");
        return await _http.PostAsync(endpoint, form, ct);
    }

    private static string NormalizeMimeType(string? mimeType, string? fileName)
    {
        var value = mimeType?.Trim();
        if (!string.IsNullOrWhiteSpace(value) &&
            !value.Equals("application/octet-stream", StringComparison.OrdinalIgnoreCase) &&
            MediaTypeHeaderValue.TryParse(value, out var parsed))
        {
            return parsed.MediaType ?? "audio/webm";
        }

        var ext = Path.GetExtension(fileName ?? string.Empty).ToLowerInvariant();
        return ext switch
        {
            ".mp3" => "audio/mpeg",
            ".mpga" => "audio/mpeg",
            ".m4a" => "audio/mp4",
            ".mp4" => "video/mp4",
            ".wav" => "audio/wav",
            ".webm" => "audio/webm",
            ".ogg" => "audio/ogg",
            _ => "audio/webm"
        };
    }

    private static string NormalizeFileName(string? fileName, string mimeType)
    {
        if (!string.IsNullOrWhiteSpace(fileName) && Path.HasExtension(fileName))
        {
            return Path.GetFileName(fileName);
        }

        var ext = mimeType.ToLowerInvariant() switch
        {
            "audio/mpeg" => ".mp3",
            "audio/mp4" => ".m4a",
            "video/mp4" => ".mp4",
            "audio/wav" => ".wav",
            "audio/ogg" => ".ogg",
            _ => ".webm"
        };
        return $"audio{ext}";
    }
}
