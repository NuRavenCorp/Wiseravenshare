using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Wiseravenshare.Server.Services.Personalization;

/// <summary>
/// Uses Google Gemini 1.5 Flash (free tier) for zero-cost AI tag extraction.
/// Free quota: 15 RPM, 1M tokens/day, 1500 RPD.
/// API docs: https://ai.google.dev/gemini-api/docs/quickstart
/// </summary>
public interface IGeminiTagService
{
    Task<IReadOnlyList<string>> ExtractTagsAsync(string content, int maxTags = 12, CancellationToken ct = default);
    Task<string>  SummarizeAsync(string content, CancellationToken ct = default);
    Task<string?> DetectLanguageAsync(string content, CancellationToken ct = default);
}

public sealed class GeminiTagService : IGeminiTagService
{
    private readonly HttpClient         _http;
    private readonly ILogger<GeminiTagService> _log;
    private readonly string             _apiKey;

    private const string BaseUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

    public GeminiTagService(HttpClient http, ILogger<GeminiTagService> log, IConfiguration config)
    {
        _http   = http;
        _log    = log;
        _apiKey = config["Gemini:ApiKey"] ?? config["GEMINI_API_KEY"] ?? string.Empty;
    }

    public async Task<IReadOnlyList<string>> ExtractTagsAsync(
        string content, int maxTags = 12, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(content)) return Array.Empty<string>();

        var truncated = content.Length > 1200 ? content[..1200] : content;
        var prompt =
            $"Extract up to {maxTags} short topical tags from the text below. " +
            "Return ONLY a JSON array of lowercase tag strings, no explanation, no markdown fences.\n\n" +
            truncated;

        var raw = await CallGeminiAsync(prompt, ct);
        if (raw is null) return Array.Empty<string>();

        // Strip any markdown fences the model might have added.
        raw = raw.Trim();
        if (raw.StartsWith("```"))
        {
            var end = raw.LastIndexOf("```");
            raw = raw[(raw.IndexOf('\n') + 1)..end].Trim();
        }

        try
        {
            var tags = JsonSerializer.Deserialize<string[]>(raw) ?? Array.Empty<string>();
            return tags
                .Select(t => t.Trim().ToLowerInvariant())
                .Where(t => t.Length is >= 2 and <= 80)
                .Distinct()
                .Take(maxTags)
                .ToArray();
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Failed to parse Gemini tag response: {Raw}", raw);
            return Array.Empty<string>();
        }
    }

    public async Task<string> SummarizeAsync(string content, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(content)) return string.Empty;
        var prompt = "Summarize the following in one sentence (max 140 chars):\n\n" + content[..Math.Min(content.Length, 3000)];
        return (await CallGeminiAsync(prompt, ct)) ?? string.Empty;
    }

    public async Task<string?> DetectLanguageAsync(string content, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(content)) return null;
        var prompt = "Reply with ONLY the ISO 639-1 language code (e.g. en, es, fr) of the text below:\n\n" + content[..Math.Min(content.Length, 500)];
        var result = (await CallGeminiAsync(prompt, ct))?.Trim().ToLowerInvariant();
        return result?.Length is >= 2 and <= 3 ? result : null;
    }

    // ── Core request ──────────────────────────────────────────────────────────
    private async Task<string?> CallGeminiAsync(string prompt, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(_apiKey))
        {
            _log.LogDebug("Gemini API key not configured — skipping AI tag extraction.");
            return null;
        }

        try
        {
            var body = new
            {
                contents = new[]
                {
                    new { parts = new[] { new { text = prompt } } }
                },
                generationConfig = new
                {
                    temperature       = 0.2,
                    maxOutputTokens   = 256,
                    responseMimeType  = "text/plain"
                }
            };

            var url  = $"{BaseUrl}?key={_apiKey}";
            using var resp = await _http.PostAsJsonAsync(url, body, ct);

            if (!resp.IsSuccessStatusCode)
            {
                _log.LogWarning("Gemini API returned {Status}", resp.StatusCode);
                return null;
            }

            using var doc = await JsonDocument.ParseAsync(await resp.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
            var text = doc.RootElement
                .GetProperty("candidates")[0]
                .GetProperty("content")
                .GetProperty("parts")[0]
                .GetProperty("text")
                .GetString();

            return text;
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Gemini API call failed");
            return null;
        }
    }
}
