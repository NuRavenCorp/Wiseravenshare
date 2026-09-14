using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using Wiseravenshare.Server.Models;

namespace Wiseravenshare.Server.Services.AiAssistant;

public interface IUserAiConnectorChatService
{
    bool IsConfigured(UserAiConnectorSettings? settings);
    Task<IReadOnlyList<string>> GetModelsAsync(UserAiConnectorSettings settings, CancellationToken ct = default);
    Task<AiChatResponse> ChatAsync(AiChatRequest request, UserAiConnectorSettings settings, CancellationToken ct = default);
    IAsyncEnumerable<string> ChatStreamAsync(AiChatRequest request, UserAiConnectorSettings settings, CancellationToken ct = default);
}

public sealed class UserAiConnectorChatService : IUserAiConnectorChatService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<UserAiConnectorChatService> _logger;

    private const string SystemPrompt =
        "You are the Wiseravenshare Assistant, a friendly support helper inside the Wiseravenshare " +
        "social platform (Ravensight). You help users with questions about the platform: posting content, " +
        "cross-posting to Facebook, Instagram, YouTube, TikTok, Twitter/X and LinkedIn, account and profile " +
        "questions, feed features, and general troubleshooting. Be concise, warm and practical.";

    public UserAiConnectorChatService(IHttpClientFactory httpClientFactory, ILogger<UserAiConnectorChatService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public bool IsConfigured(UserAiConnectorSettings? settings)
    {
        if (settings is null || !settings.Enabled)
        {
            return false;
        }

        var provider = NormalizeProvider(settings.Provider);
        if (provider == "deepseek" || provider == "openai" || provider == "gradient")
        {
            return !string.IsNullOrWhiteSpace(settings.BaseUrl) && !string.IsNullOrWhiteSpace(settings.ApiKey);
        }

        if (provider == "ollama" || provider == "llamacpp")
        {
            return !string.IsNullOrWhiteSpace(settings.BaseUrl);
        }

        return false;
    }

    public async Task<IReadOnlyList<string>> GetModelsAsync(UserAiConnectorSettings settings, CancellationToken ct = default)
    {
        var provider = NormalizeProvider(settings.Provider);
        var baseUrl = SanitizeBaseUrl(settings.BaseUrl);
        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            return [];
        }

        var client = CreateClient(settings);

        try
        {
            if (provider == "ollama")
            {
                var doc = await client.GetFromJsonAsync<JsonElement>($"{baseUrl}/api/tags", ct);
                var models = new List<string>();
                if (doc.TryGetProperty("models", out var arr) && arr.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in arr.EnumerateArray())
                    {
                        if (item.TryGetProperty("name", out var name))
                        {
                            var model = name.GetString();
                            if (!string.IsNullOrWhiteSpace(model)) models.Add(model.Trim());
                        }
                    }
                }

                return models;
            }

            var openAiLike = await client.GetFromJsonAsync<JsonElement>($"{baseUrl}/v1/models", ct);
            var values = new List<string>();
            if (openAiLike.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in data.EnumerateArray())
                {
                    if (item.TryGetProperty("id", out var idNode))
                    {
                        var id = idNode.GetString();
                        if (!string.IsNullOrWhiteSpace(id)) values.Add(id.Trim());
                    }
                }
            }

            return values;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "BYO AI model list failed for provider {Provider}", provider);
            return [];
        }
    }

    public async Task<AiChatResponse> ChatAsync(AiChatRequest request, UserAiConnectorSettings settings, CancellationToken ct = default)
    {
        var provider = NormalizeProvider(settings.Provider);
        var baseUrl = SanitizeBaseUrl(settings.BaseUrl);
        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            return new AiChatResponse { Success = false, Error = "AI connector base URL is required." };
        }

        var message = (request.Message ?? string.Empty).Trim();
        if (message.Length == 0)
        {
            return new AiChatResponse { Success = false, Error = "Message is required." };
        }

        var client = CreateClient(settings);
        var model = ResolveModel(request.Model, settings, provider);

        try
        {
            if (provider == "ollama")
            {
                var payload = new
                {
                    model,
                    messages = BuildMessages(request),
                    stream = false,
                    options = new { temperature = 0.6, num_predict = 700 }
                };

                using var response = await client.PostAsJsonAsync($"{baseUrl}/api/chat", payload, ct);
                var body = await response.Content.ReadAsStringAsync(ct);
                if (!response.IsSuccessStatusCode)
                {
                    return new AiChatResponse { Success = false, Error = $"AI connector returned {(int)response.StatusCode}." };
                }

                using var doc = JsonDocument.Parse(body);
                var content = doc.RootElement.TryGetProperty("message", out var msg)
                    && msg.TryGetProperty("content", out var contentNode)
                    ? contentNode.GetString()
                    : string.Empty;

                return new AiChatResponse
                {
                    Success = true,
                    Reply = (content ?? string.Empty).Trim(),
                    Model = model
                };
            }

            var openPayload = new
            {
                model,
                messages = BuildMessages(request),
                stream = false,
                temperature = 0.6,
                max_tokens = 700
            };

            using var openResponse = await client.PostAsJsonAsync($"{baseUrl}/v1/chat/completions", openPayload, ct);
            var openBody = await openResponse.Content.ReadAsStringAsync(ct);
            if (!openResponse.IsSuccessStatusCode)
            {
                return new AiChatResponse { Success = false, Error = $"AI connector returned {(int)openResponse.StatusCode}." };
            }

            using var openDoc = JsonDocument.Parse(openBody);
            var reply = openDoc.RootElement.TryGetProperty("choices", out var choices)
                && choices.ValueKind == JsonValueKind.Array
                && choices.GetArrayLength() > 0
                && choices[0].TryGetProperty("message", out var messageNode)
                && messageNode.TryGetProperty("content", out var assistantContentNode)
                ? assistantContentNode.GetString()
                : string.Empty;

            return new AiChatResponse
            {
                Success = true,
                Reply = (reply ?? string.Empty).Trim(),
                Model = model
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "BYO AI chat failed for provider {Provider}", provider);
            return new AiChatResponse
            {
                Success = false,
                Error = "Your AI connector is unreachable right now."
            };
        }
    }

    public async IAsyncEnumerable<string> ChatStreamAsync(
        AiChatRequest request,
        UserAiConnectorSettings settings,
        [EnumeratorCancellation] CancellationToken ct = default)
    {
        var provider = NormalizeProvider(settings.Provider);
        var baseUrl = SanitizeBaseUrl(settings.BaseUrl);
        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            yield return "AI connector base URL is required.";
            yield break;
        }

        var model = ResolveModel(request.Model, settings, provider);
        var client = CreateClient(settings);

        if (provider == "ollama")
        {
            var payload = new
            {
                model,
                messages = BuildMessages(request),
                stream = true,
                options = new { temperature = 0.6, num_predict = 700 }
            };

            HttpResponseMessage? response = null;
            string? error = null;
            try
            {
                response = await client.PostAsJsonAsync($"{baseUrl}/api/chat", payload, ct);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "BYO AI streaming failed for provider {Provider}", provider);
                error = "Your AI connector is unreachable right now.";
            }

            if (error is not null)
            {
                yield return error;
                yield break;
            }

            using (response)
            {
                if (response is null || !response.IsSuccessStatusCode)
                {
                    yield return "Your AI connector is unavailable right now.";
                    yield break;
                }

                await using var stream = await response.Content.ReadAsStreamAsync(ct);
                using var reader = new StreamReader(stream, Encoding.UTF8);

                while (!reader.EndOfStream && !ct.IsCancellationRequested)
                {
                    var line = await reader.ReadLineAsync(ct);
                    if (string.IsNullOrWhiteSpace(line))
                    {
                        continue;
                    }

                    var token = TryParseOllamaToken(line);
                    if (!string.IsNullOrWhiteSpace(token))
                    {
                        yield return token;
                    }
                }
            }

            yield break;
        }

        var openPayload = new
        {
            model,
            messages = BuildMessages(request),
            stream = true,
            temperature = 0.6,
            max_tokens = 700
        };

        using var requestMessage = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/v1/chat/completions")
        {
            Content = JsonContent.Create(openPayload)
        };

        HttpResponseMessage? openResponse = null;
        string? openError = null;
        try
        {
            openResponse = await client.SendAsync(requestMessage, HttpCompletionOption.ResponseHeadersRead, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "BYO AI streaming failed for provider {Provider}", provider);
            openError = "Your AI connector is unreachable right now.";
        }

        if (openError is not null)
        {
            yield return openError;
            yield break;
        }

        using (openResponse)
        {
            if (openResponse is null || !openResponse.IsSuccessStatusCode)
            {
                yield return "Your AI connector is unavailable right now.";
                yield break;
            }

            await using var openStream = await openResponse.Content.ReadAsStreamAsync(ct);
            using var streamReader = new StreamReader(openStream, Encoding.UTF8);

            while (!streamReader.EndOfStream && !ct.IsCancellationRequested)
            {
                var line = await streamReader.ReadLineAsync(ct);
                if (string.IsNullOrWhiteSpace(line) || !line.StartsWith("data:", StringComparison.Ordinal))
                {
                    continue;
                }

                var json = line[5..].Trim();
                if (json == "[DONE]")
                {
                    break;
                }

                var token = TryParseOpenAiStreamToken(json);
                if (!string.IsNullOrWhiteSpace(token))
                {
                    yield return token;
                }
            }
        }
    }

    private static string? TryParseOllamaToken(string line)
    {
        try
        {
            using var doc = JsonDocument.Parse(line);
            return doc.RootElement.TryGetProperty("message", out var msg)
                && msg.TryGetProperty("content", out var contentNode)
                ? contentNode.GetString()
                : string.Empty;
        }
        catch
        {
            return string.Empty;
        }
    }

    private static string? TryParseOpenAiStreamToken(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            return doc.RootElement.TryGetProperty("choices", out var choices)
                && choices.ValueKind == JsonValueKind.Array
                && choices.GetArrayLength() > 0
                && choices[0].TryGetProperty("delta", out var delta)
                && delta.TryGetProperty("content", out var contentNode)
                ? contentNode.GetString()
                : string.Empty;
        }
        catch
        {
            return string.Empty;
        }
    }

    private HttpClient CreateClient(UserAiConnectorSettings settings)
    {
        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(100);
        client.DefaultRequestHeaders.Remove("Authorization");

        if (!string.IsNullOrWhiteSpace(settings.ApiKey))
        {
            client.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", settings.ApiKey.Trim());
        }

        return client;
    }

    private static string ResolveModel(string? requestedModel, UserAiConnectorSettings settings, string provider)
    {
        var model = (requestedModel ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(model))
        {
            return model;
        }

        model = (settings.DefaultModel ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(model))
        {
            return model;
        }

        return provider switch
        {
            "deepseek" => "deepseek-chat",
            "gradient" => "gpt-4o-mini",
            "ollama" => "llama3.2",
            _ => "gpt-4o-mini"
        };
    }

    private static string NormalizeProvider(string? provider)
    {
        var value = (provider ?? string.Empty).Trim().ToLowerInvariant();
        return value switch
        {
            "deepseek" => "deepseek",
            "gradient" => "gradient",
            "ollama" => "ollama",
            "llamacpp" or "llama.cpp" or "llama-cpp" => "llamacpp",
            _ => "openai"
        };
    }

    private static string SanitizeBaseUrl(string? value)
    {
        var raw = (value ?? string.Empty).Trim().TrimEnd('/');
        if (!Uri.TryCreate(raw, UriKind.Absolute, out var uri))
        {
            return string.Empty;
        }

        if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
        {
            return string.Empty;
        }

        if (string.IsNullOrWhiteSpace(uri.Host) || raw.Contains('@'))
        {
            return string.Empty;
        }

        return raw;
    }

    private static List<object> BuildMessages(AiChatRequest request)
    {
        var messages = new List<object> { new { role = "system", content = SystemPrompt } };

        if (request.History is { Count: > 0 })
        {
            foreach (var item in request.History.TakeLast(12))
            {
                var role = item.Role?.ToLowerInvariant() is "assistant" or "ai" ? "assistant" : "user";
                messages.Add(new { role, content = Truncate(item.Content, 4000) });
            }
        }

        messages.Add(new { role = "user", content = Truncate(request.Message, 4000) });
        return messages;
    }

    private static string Truncate(string? value, int max)
    {
        var source = value ?? string.Empty;
        return source.Length <= max ? source : source[..max];
    }
}
