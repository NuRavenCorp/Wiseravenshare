// Application/Services/Assistant/SpeechToTextService.cs
using System.Net.Http.Headers;
using Microsoft.Extensions.Options;
using NuRavenCorpLLM.Infrastructure.External;
using System.Text.Json;

namespace NuRavenCorpLLM.Application.Services.Assistant;

public interface ISpeechToTextService
{
    Task<SttResult> TranscribeAsync(Stream audio, string mimeType, CancellationToken ct = default);
}

public record SttResult(string Text, string? Language, double? Confidence, int DurationMs);

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
        _http = http; _opts = opts.Value; _logger = logger;
        _http.BaseAddress = new Uri(_opts.BaseUrl);
        _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _opts.ApiKey);
    }

    public async Task<SttResult> TranscribeAsync(Stream audio, string mimeType, CancellationToken ct = default)
    {
        using var form = new MultipartFormDataContent();
        var audioContent = new StreamContent(audio);
        audioContent.Headers.ContentType = new MediaTypeHeaderValue(mimeType);
        form.Add(audioContent, "file", "audio.webm");
        form.Add(new StringContent(_opts.Model), "model");
        form.Add(new StringContent("verbose_json"), "response_format");

        using var response = await _http.PostAsync("/audio/transcriptions", form, ct);
        response.EnsureSuccessStatusCode();

        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
        var root = doc.RootElement;
        var text = root.GetProperty("text").GetString() ?? "";
        var lang = root.TryGetProperty("language", out var l) ? l.GetString() : null;
        var dur = root.TryGetProperty("duration", out var d) ? (int)(d.GetDouble() * 1000) : 0;
        return new SttResult(text, lang, null, dur);
    }
}