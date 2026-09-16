using System.Net.Http.Headers;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using WiseRavenShare.Server.Application.Services.Assistant;

namespace WiseRavenShare.Server.Infrastructure.External;

public class OpenAiOptions
{
    public string ApiKey { get; set; } = string.Empty;
    public string BaseUrl { get; set; } = "https://api.openai.com/v1";
    public string ChatModel { get; set; } = "gpt-4o-mini";
    public string EmbeddingModel { get; set; } = "text-embedding-3-small";
}

public class OpenAiClient
{
    private readonly HttpClient _http;
    private readonly OpenAiOptions _opts;
    private readonly ILogger<OpenAiClient> _logger;

    public OpenAiClient(HttpClient http, IOptions<OpenAiOptions> opts, ILogger<OpenAiClient> logger)
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

    public async Task<LlmResponse> ChatAsync(LlmRequest req, CancellationToken ct)
    {
        var body = new Dictionary<string, object?>
        {
            ["model"] = req.Model ?? _opts.ChatModel,
            ["temperature"] = req.Temperature,
            ["max_tokens"] = req.MaxTokens,
            ["messages"] = req.Messages.Select(m => new { role = m.Role, content = m.Content }).ToArray()
        };
        if (req.JsonMode) body["response_format"] = new { type = "json_object" };

        var json = JsonSerializer.Serialize(body);
        using var content = new StringContent(json, Encoding.UTF8, "application/json");
        using var response = await _http.PostAsync("/chat/completions", content, ct);
        response.EnsureSuccessStatusCode();

        using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
        var root = doc.RootElement;

        var msgContent = root.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString() ?? "";
        var usage = root.TryGetProperty("usage", out var u) ? u : default;

        return new LlmResponse
        {
            Content = msgContent,
            Model = root.GetProperty("model").GetString() ?? "",
            PromptTokens = usage.ValueKind == JsonValueKind.Object ? usage.GetProperty("prompt_tokens").GetInt32() : 0,
            CompletionTokens = usage.ValueKind == JsonValueKind.Object ? usage.GetProperty("completion_tokens").GetInt32() : 0
        };
    }

    public async IAsyncEnumerable<LlmStreamChunk> ChatStreamAsync(
        LlmRequest req,
        [EnumeratorCancellation] CancellationToken ct)
    {
        var body = new Dictionary<string, object?>
        {
            ["model"] = req.Model ?? _opts.ChatModel,
            ["temperature"] = req.Temperature,
            ["max_tokens"] = req.MaxTokens,
            ["messages"] = req.Messages.Select(m => new { role = m.Role, content = m.Content }).ToArray(),
            ["stream"] = true,
            ["stream_options"] = new { include_usage = true }
        };

        var json = JsonSerializer.Serialize(body);
        using var request = new HttpRequestMessage(HttpMethod.Post, "/chat/completions")
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json")
        };
        using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        response.EnsureSuccessStatusCode();

        using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var reader = new StreamReader(stream, Encoding.UTF8);

        int promptTokens = 0, completionTokens = 0;
        while (!reader.EndOfStream && !ct.IsCancellationRequested)
        {
            var line = await reader.ReadLineAsync();
            if (string.IsNullOrWhiteSpace(line)) continue;
            if (!line.StartsWith("data: ")) continue;

            var payload = line[6..].Trim();
            if (payload == "[DONE]") yield break;

            string? delta = null;
            try
            {
                using var chunk = JsonDocument.Parse(payload);
                var root = chunk.RootElement;
                var choices = root.GetProperty("choices");
                if (choices.GetArrayLength() > 0)
                {
                    var d = choices[0].TryGetProperty("delta", out var deltaObj) ?
                            deltaObj : default;
                    if (d.ValueKind != JsonValueKind.Undefined &&
                        d.TryGetProperty("content", out var c))
                    {
                        delta = c.GetString();
                    }
                }

                if (root.TryGetProperty("usage", out var usage) && usage.ValueKind == JsonValueKind.Object)
                {
                    promptTokens = usage.TryGetProperty("prompt_tokens", out var pt) ? pt.GetInt32() : 0;
                    completionTokens = usage.TryGetProperty("completion_tokens", out var ctok) ? ctok.GetInt32() : 0;
                }
            }
            catch { /* ignore malformed chunks */ }

            if (!string.IsNullOrEmpty(delta))
                yield return new LlmStreamChunk(delta, false);
        }

        yield return new LlmStreamChunk(null, true, promptTokens, completionTokens);
    }

    public async Task<float[]> EmbedAsync(string text, CancellationToken ct = default)
    {
        var body = new Dictionary<string, object?>
        {
            ["model"] = _opts.EmbeddingModel,
            ["input"] = text
        };
        var json = JsonSerializer.Serialize(body);
        using var content = new StringContent(json, Encoding.UTF8, "application/json");
        using var response = await _http.PostAsync("/embeddings", content, ct);
        response.EnsureSuccessStatusCode();
        using var doc = await JsonDocument.ParseAsync(
            await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
        var arr = doc.RootElement.GetProperty("data")[0].GetProperty("embedding");
        var result = new float[arr.GetArrayLength()];
        int i = 0;
        foreach (var v in arr.EnumerateArray()) result[i++] = v.GetSingle();
        return result;
    }
}

public class LlmGatewayAdapter : ILlmGateway
{
    private readonly OpenAiClient _client;
    public LlmGatewayAdapter(OpenAiClient client) => _client = client;
    public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct = default) =>
        _client.ChatAsync(request, ct);
    public IAsyncEnumerable<LlmStreamChunk> StreamAsync(LlmRequest request, CancellationToken ct = default) =>
        _client.ChatStreamAsync(request, ct);
    public Task<float[]> EmbedAsync(string text, CancellationToken ct = default) =>
        _client.EmbedAsync(text, ct);
}
