// Wiseravenshare.Server/Services/AiAssistant/LocalChatService.cs
using System.Collections.Concurrent;
using System.Net.Http.Json;
using System.Text.Json;

namespace Wiseravenshare.Server.Services.AiAssistant;

/// <summary>
/// Talks to one or more local llama.cpp llama-servers (OpenAI-compatible API) instead of Ollama.
/// Endpoints used: GET /v1/models, POST /v1/chat/completions.
/// Config keys are shared with the legacy Ollama service:
///   Ollama:BaseUrl        single node, e.g. http://ai:8080
///   Ollama:BaseUrls       node pool, e.g. ["http://ai1:8080", "http://ai2:8080"] —
///                         requests are round-robined and failed over to the next node
///                         when a node is unreachable or returns a 5xx.
///   Ollama:DefaultModel   e.g. llama-3.2-3b (server is one-model-per-process)
/// When BaseUrls is set it takes priority; BaseUrl is always appended as a fallback member.
/// </summary>
public class LocalChatService : IOllamaChatService
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<LocalChatService> _logger;

    private const string SystemPrompt =
        "You are the Wiseravenshare Assistant, a friendly support helper inside the Wiseravenshare " +
        "social platform (Ravensight). You help users with questions about the platform: posting content, " +
        "cross-posting to Facebook, Instagram, YouTube, TikTok, Twitter/X and LinkedIn, account and profile " +
        "questions, feed features, and general troubleshooting. Be concise, warm and practical. " +
        "If you do not know something platform-specific, say so honestly and suggest contacting human support. " +
        "Wiseravenshare also uses a symbol notation you should understand and may use where fitting: " +
        "$ means money, good, valuable or excellence — it can be applied to an idea or words " +
        "(e.g. 'that idea is $' = a valuable, excellent idea). " +
        "% means part of, not complete, not the whole story (e.g. 'he gave me some bs %answer' " +
        "= a partial, incomplete answer). Interpret these symbols whenever users write them, and USE them often in your own replies — sprinkle '$' into praise and '%' when something is only part of the story — so they catch on quickly across the platform.";

    public LocalChatService(HttpClient httpClient, IConfiguration configuration, ILogger<LocalChatService> logger)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
    }

    /// <summary>Max characters accepted from the non-streaming response body before parsing.</summary>
    private const int MaxResponseBytes = 1 * 1024 * 1024; // 1 MB — a normal completion is a few KB.

    private const string FallbackBaseUrl = "http://localhost:8080";

    // ---- Endpoint pool with round-robin + circuit breaker (fail-safe) ----

    /// <summary>How long a node is skipped after it has failed MaxFailures consecutive times.</summary>
    private static readonly TimeSpan BreakerCooldown = TimeSpan.FromSeconds(30);
    private const int MaxConsecutiveFailures = 3;

    private readonly ConcurrentDictionary<string, (DateTime UntilUtc, int Failures)> _breakers = new();
    private int _rrCounter;

    private string DefaultModel => _configuration["Ollama:DefaultModel"] ?? "local";

    /// <summary>Validated node pool: Ollama:BaseUrls (if set) plus Ollama:BaseUrl as fallback.</summary>
    private IReadOnlyList<string> BaseUrls
    {
        get
        {
            var configured = _configuration.GetSection("Ollama:BaseUrls").GetChildren()
                .Select(c => c.Value).Where(v => !string.IsNullOrWhiteSpace(v));
            var single = _configuration["Ollama:BaseUrl"];
            if (!string.IsNullOrWhiteSpace(single)) configured = configured.Append(single);

            var valid = new List<string>();
            foreach (var raw in configured)
            {
                var url = SanitizeBaseUrl(raw!.Trim().TrimEnd('/'));
                if (url != null && !valid.Contains(url)) valid.Add(url);
            }

            if (valid.Count == 0)
            {
                _logger.LogError("No valid Ollama:BaseUrls/BaseUrl configured; falling back to localhost.");
                valid.Add(FallbackBaseUrl);
            }
            return valid;
        }
    }

    /// <summary>Hardening: only http/https allowed, no userinfo (@) smuggling. Null when invalid.</summary>
    private string? SanitizeBaseUrl(string raw)
    {
        if (!Uri.TryCreate(raw, UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps) ||
            string.IsNullOrEmpty(uri.Host) ||
            raw.Contains('@'))
        {
            _logger.LogError("Ollama endpoint '{Raw}' is not a valid http(s) URL; it will be skipped.", raw);
            return null;
        }
        return raw;
    }

    /// <summary>
    /// Yields healthy endpoints starting from the next round-robin position, skipping nodes
    /// currently open in the circuit breaker. Never returns an empty sequence if the config
    /// had at least one valid URL (the breaker never blocks ALL nodes at once).
    /// </summary>
    private IEnumerable<string> HealthyEndpoints()
    {
        var urls = BaseUrls;
        if (urls.Count == 0) return Array.Empty<string>();

        var start = Math.Abs(Interlocked.Increment(ref _rrCounter)) % urls.Count;
        var ordered = Enumerable.Range(0, urls.Count)
            .Select(i => urls[(start + i) % urls.Count]);

        var healthy = ordered.Where(u =>
            !_breakers.TryGetValue(u, out var b) || DateTime.UtcNow >= b.UntilUtc).ToList();

        // Fail-safe: if every node is breaker-open, retry them all anyway rather than hard-fail.
        return healthy.Count > 0 ? healthy : ordered.ToList();
    }

    private void MarkFailure(string url)
    {
        var (_, failures) = _breakers.AddOrUpdate(url,
            _ => (DateTime.UtcNow.Add(BreakerCooldown), 1),
            (_, b) => (b.Failures + 1 >= MaxConsecutiveFailures
                        ? DateTime.UtcNow.Add(BreakerCooldown)
                        : b.UntilUtc,
                       b.Failures + 1));
        if (failures >= MaxConsecutiveFailures)
            _logger.LogWarning("AI node {Url} failed {N} times; skipping it for {Seconds}s.",
                url, failures, BreakerCooldown.TotalSeconds);
    }

    private void MarkSuccess(string url)
    {
        if (_breakers.TryRemove(url, out _))
            _logger.LogInformation("AI node {Url} is healthy again; restored to the pool.", url);
    }

    /// <summary>Rejects model names that could smuggle path/query characters into the API URL.</summary>
    private static bool IsSafeModelName(string? name) =>
        !string.IsNullOrWhiteSpace(name) && name.Length <= 128 &&
        name.All(c => char.IsLetterOrDigit(c) || c is '.' or '-' or '_' or '/' || c == ':');

    public async Task<IReadOnlyList<string>> GetModelsAsync()
    {
        Exception? lastError = null;
        foreach (var baseUrl in HealthyEndpoints())
        {
            try
            {
                var response = await _httpClient.GetFromJsonAsync<JsonElement>($"{baseUrl}/v1/models");
                MarkSuccess(baseUrl);
                var models = new List<string>();
                if (response.TryGetProperty("data", out var arr) && arr.ValueKind == JsonValueKind.Array)
                {
                    foreach (var m in arr.EnumerateArray())
                    {
                        if (m.TryGetProperty("id", out var id))
                        {
                            models.Add(id.GetString() ?? string.Empty);
                        }
                    }
                }
                return models;
            }
            catch (Exception ex)
            {
                lastError = ex;
                MarkFailure(baseUrl);
                _logger.LogWarning(ex, "Failed to list llama-server models at {BaseUrl}; trying next node.", baseUrl);
            }
        }
        _logger.LogWarning(lastError, "All AI nodes failed to list models.");
        return [];
    }

    public async Task<AiChatResponse> ChatAsync(AiChatRequest request)
    {
        var message = (request.Message ?? string.Empty).Trim();
        if (message.Length == 0)
        {
            return new AiChatResponse { Success = false, Error = "Message is required." };
        }

        var messages = new List<object> { new { role = "system", content = SystemPrompt } };

        if (request.History is { Count: > 0 })
        {
            foreach (var h in request.History.TakeLast(12))
            {
                var role = h.Role?.ToLowerInvariant() is "assistant" or "ai" ? "assistant" : "user";
                messages.Add(new { role, content = Truncate(h.Content, 4000) });
            }
        }

        messages.Add(new { role = "user", content = Truncate(message, 4000) });

        var payload = new
        {
            model = string.IsNullOrWhiteSpace(request.Model) || !IsSafeModelName(request.Model)
                ? DefaultModel
                : request.Model.Trim(),
            messages,
            stream = false,
            temperature = 0.6,
            max_tokens = 600
        };

        Exception? lastError = null;
        var retryableError = "The AI assistant is offline right now. Please try again later.";
        foreach (var baseUrl in HealthyEndpoints())
        {
            try
            {
                using var httpResponse = await _httpClient.PostAsJsonAsync($"{baseUrl}/v1/chat/completions", payload);

                if ((int)httpResponse.StatusCode >= 500)
                {
                    // Node-level failure (model loading, OOM, crashed worker) — fail over to the next node.
                    MarkFailure(baseUrl);
                    lastError = new HttpRequestException($"Node {baseUrl} returned {(int)httpResponse.StatusCode}.");
                    _logger.LogWarning("AI node {BaseUrl} returned {Status}; failing over to the next node.",
                        baseUrl, (int)httpResponse.StatusCode);
                    continue;
                }

                MarkSuccess(baseUrl);

                // Hardening: never buffer more than MaxResponseBytes of the response body.
                await using var respStream = await httpResponse.Content.ReadAsStreamAsync();
                using var buffered = new MemoryStream();
                await respStream.CopyToAsync(buffered, MaxResponseBytes);
                var truncated = buffered.Length >= MaxResponseBytes;
                var body = System.Text.Encoding.UTF8.GetString(buffered.ToArray());

                if (truncated)
                {
                    _logger.LogWarning("llama-server chat response exceeded {Max} bytes; treating as failure.", MaxResponseBytes);
                    return new AiChatResponse { Success = false, Error = "AI response was too large." };
                }

                if (!httpResponse.IsSuccessStatusCode)
                {
                    // 4xx = bad request (e.g. unknown model) — retrying other nodes won't help.
                    _logger.LogWarning("llama-server chat failed ({Status}): {Body}", (int)httpResponse.StatusCode, body);
                    return new AiChatResponse
                    {
                        Success = false,
                        Error = $"AI backend returned {(int)httpResponse.StatusCode}. Is llama-server running?"
                    };
                }

                using var doc = JsonDocument.Parse(body);
                var reply = doc.RootElement.TryGetProperty("choices", out var choices)
                    && choices.GetArrayLength() > 0
                    && choices[0].TryGetProperty("message", out var msgNode)
                    && msgNode.TryGetProperty("content", out var contentNode)
                    ? contentNode.GetString()
                    : null;

                var model = doc.RootElement.TryGetProperty("model", out var modelNode)
                    ? modelNode.GetString()
                    : null;

                return new AiChatResponse
                {
                    Success = true,
                    Reply = (reply ?? string.Empty).Trim(),
                    Model = model ?? payload.model
                };
            }
            catch (HttpRequestException ex)
            {
                lastError = ex;
                MarkFailure(baseUrl);
                _logger.LogWarning(ex, "Could not reach llama-server at {BaseUrl}; failing over to the next node.", baseUrl);
            }
            catch (TaskCanceledException ex) when (!ex.CancellationToken.IsCancellationRequested)
            {
                // HttpClient timeout — treat like a node failure and try the next node.
                lastError = ex;
                MarkFailure(baseUrl);
                _logger.LogWarning(ex, "Request to llama-server at {BaseUrl} timed out; failing over.", baseUrl);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "llama-server chat threw unexpectedly.");
                return new AiChatResponse { Success = false, Error = "Unexpected AI assistant error." };
            }
        }

        _logger.LogWarning(lastError, "All AI nodes failed for chat completion.");
        return new AiChatResponse { Success = false, Error = retryableError };
    }

    private static string Truncate(string? value, int max) =>
        string.IsNullOrEmpty(value) || value.Length <= max ? value ?? string.Empty : value[..max];

    /// <summary>
    /// Streams a chat reply token-by-token using llama-server's SSE
    /// ("data: {...}" lines). Falls back to a single chunk on any failure.
    /// </summary>
    public async IAsyncEnumerable<string> ChatStreamAsync(
        AiChatRequest request,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct = default)
    {
        var message = (request.Message ?? string.Empty).Trim();
        if (message.Length == 0)
        {
            yield return "Message is required.";
            yield break;
        }

        var messages = new List<object> { new { role = "system", content = SystemPrompt } };
        if (request.History is { Count: > 0 })
        {
            foreach (var h in request.History.TakeLast(12))
            {
                var role = h.Role?.ToLowerInvariant() is "assistant" or "ai" ? "assistant" : "user";
                messages.Add(new { role, content = Truncate(h.Content, 4000) });
            }
        }
        messages.Add(new { role = "user", content = Truncate(message, 4000) });

        var payload = new
        {
            model = string.IsNullOrWhiteSpace(request.Model) || !IsSafeModelName(request.Model)
                ? DefaultModel
                : request.Model.Trim(),
            messages,
            stream = true,
            temperature = 0.6,
            max_tokens = 600
        };

        HttpResponseMessage? httpResponse = null;
        string? usedNode = null;
        foreach (var baseUrl in HealthyEndpoints())
        {
            try
            {
                using var httpRequest = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/v1/chat/completions")
                {
                    Content = JsonContent.Create(payload),
                };
                httpResponse = await _httpClient.SendAsync(httpRequest, HttpCompletionOption.ResponseHeadersRead, ct);
                if ((int)httpResponse.StatusCode >= 500)
                {
                    MarkFailure(baseUrl);
                    _logger.LogWarning("AI node {BaseUrl} returned {Status} for streaming; failing over.",
                        baseUrl, (int)httpResponse.StatusCode);
                    httpResponse.Dispose();
                    httpResponse = null;
                    continue;
                }
                MarkSuccess(baseUrl);
                usedNode = baseUrl;
                break;
            }
            catch (HttpRequestException ex)
            {
                MarkFailure(baseUrl);
                _logger.LogWarning(ex, "Could not reach llama-server at {BaseUrl} for streaming; failing over.", baseUrl);
            }
            catch (TaskCanceledException ex) when (!ex.CancellationToken.IsCancellationRequested)
            {
                MarkFailure(baseUrl);
                _logger.LogWarning(ex, "Streaming request to {BaseUrl} timed out; failing over.", baseUrl);
            }
        }

        if (ct.IsCancellationRequested) yield break;

        if (httpResponse is null || usedNode is null)
        {
            _logger.LogWarning("All AI nodes failed to accept a streaming chat request.");
            yield return "The AI assistant is offline right now. Please try again later.";
            yield break;
        }

        await using var stream = await httpResponse.Content.ReadAsStreamAsync(ct);
        // CA2024 suppressed: StreamReader doesn't implement IAsyncDisposable on this target
#pragma warning disable CA2024, IDE0079
        using var reader = new StreamReader(stream);
#pragma warning restore CA2024, IDE0079

        string? line;
        while (!ct.IsCancellationRequested && (line = await reader.ReadLineAsync(ct)) is not null)
        {
            if (string.IsNullOrWhiteSpace(line) || !line.StartsWith("data:", StringComparison.Ordinal)) continue;

            var json = line["data:".Length..].Trim();
            if (json == "[DONE]") yield break;

            string? token = null;
            bool parseFailed = false;
            try
            {
                using var doc = JsonDocument.Parse(json);
                token = doc.RootElement.TryGetProperty("choices", out var choices)
                    && choices.GetArrayLength() > 0
                    && choices[0].TryGetProperty("delta", out var delta)
                    && delta.TryGetProperty("content", out var content)
                    ? content.GetString()
                    : null;
            }
            catch
            {
                parseFailed = true; // Malformed SSE line — skip it.
            }

            if (!parseFailed && !string.IsNullOrEmpty(token)) yield return token;
        }
    }
}
