using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace WiseRavenShare.Server.Application.Services.Assistant;

public interface ITextToSpeechService
{
    Task<TtsResult> SynthesizeAsync(string text, string voiceId, CancellationToken ct = default);
}

public class TtsOptions
{
    public string Provider { get; set; } = "openai";
    public string? OpenAiKey { get; set; }
    public string? ElevenLabsKey { get; set; }
    public string? ElevenLabsBaseUrl { get; set; } = "https://api.elevenlabs.io/v1";
    public string DefaultVoiceId { get; set; } = "alloy";
}

public class TextToSpeechService : ITextToSpeechService
{
    private readonly HttpClient _http;
    private readonly TtsOptions _opts;

    public TextToSpeechService(HttpClient http, IOptions<TtsOptions> opts)
    {
        _http = http;
        _opts = opts.Value;
    }

    public async Task<TtsResult> SynthesizeAsync(string text, string voiceId, CancellationToken ct = default)
    {
        return _opts.Provider.ToLowerInvariant() switch
        {
            "elevenlabs" => await ElevenLabsAsync(text, voiceId, ct),
            _ => await OpenAiTtsAsync(text, voiceId, ct)
        };
    }

    private async Task<TtsResult> OpenAiTtsAsync(string text, string voiceId, CancellationToken ct)
    {
        var body = new
        {
            model = "tts-1",
            input = text,
            voice = string.IsNullOrEmpty(voiceId) ? _opts.DefaultVoiceId : voiceId,
            response_format = "mp3"
        };
        using var req = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/audio/speech")
        {
            Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json")
        };
        req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _opts.OpenAiKey);

        using var resp = await _http.SendAsync(req, ct);
        resp.EnsureSuccessStatusCode();
        var bytes = await resp.Content.ReadAsByteArrayAsync(ct);
        var dur = EstimateDuration(text);
        return new TtsResult(bytes, "audio/mpeg", dur);
    }

    private async Task<TtsResult> ElevenLabsAsync(string text, string voiceId, CancellationToken ct)
    {
        var body = new
        {
            text,
            model_id = "eleven_multilingual_v2",
            voice_settings = new { stability = 0.5, similarity_boost = 0.75 }
        };
        using var req = new HttpRequestMessage(HttpMethod.Post,
            $"{_opts.ElevenLabsBaseUrl}/text-to-speech/{voiceId}")
        {
            Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json")
        };
        req.Headers.Add("xi-api-key", _opts.ElevenLabsKey);

        using var resp = await _http.SendAsync(req, ct);
        resp.EnsureSuccessStatusCode();
        var bytes = await resp.Content.ReadAsByteArrayAsync(ct);
        return new TtsResult(bytes, "audio/mpeg", EstimateDuration(text));
    }

    private static int EstimateDuration(string text)
    {
        var words = text.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length;
        return (int)(words * 400);
    }
}
