// Wiseravenshare.Server/Services/AiAssistant/OllamaChatService.cs
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace Wiseravenshare.Server.Services.AiAssistant;

public record AiChatMessage(string Role, string Content);

public class AiChatRequest
{
    public string Message { get; set; } = string.Empty;
    public List<AiChatMessage>? History { get; set; }
    public string? Model { get; set; }
}

public class AiChatResponse
{
    public bool Success { get; set; }
    public string Reply { get; set; } = string.Empty;
    public string Model { get; set; } = string.Empty;
    public string? Error { get; set; }
}

public interface IOllamaChatService
{
    Task<IReadOnlyList<string>> GetModelsAsync();
    Task<AiChatResponse> ChatAsync(AiChatRequest request);
}

/// <summary>
/// Talks to a local Ollama instance (default http://localhost:11434) using its
/// OpenAI-compatible /api/chat endpoint. Config: Ollama:BaseUrl, Ollama:DefaultModel.
/// </summary>
public class OllamaChatService : IOllamaChatService
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<OllamaChatService> _logger;

    private const string SystemPrompt =
        "You are the Wiseravenshare Assistant, a friendly support helper inside the Wiseravenshare " +
        "social platform (Ravensight). You help users with questions about the platform: posting content, " +
        "cross-posting to Facebook, Instagram, YouTube, TikTok, Twitter/X and LinkedIn, account and profile " +
        "questions, feed features, and general troubleshooting. Be concise, warm and practical. " +
        "If you do not know something platform-specific, say so honestly and suggest contacting human support.";

    public OllamaChatService(HttpClient httpClient, IConfiguration configuration, ILogger<OllamaChatService> logger)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
    }

    private string BaseUrl => (_configuration["Ollama:BaseUrl"] ?? "http://localhost:11434").TrimEnd('/');

    private string DefaultModel => _configuration["Ollama:DefaultModel"] ?? "llama3.2";

    public async Task<IReadOnlyList<string>> GetModelsAsync()
    {
        try
        {
            var response = await _httpClient.GetFromJsonAsync<JsonElement>($"{BaseUrl}/api/tags");
            var models = new List<string>();
            if (response.TryGetProperty("models", out var arr) && arr.ValueKind == JsonValueKind.Array)
            {
                foreach (var m in arr.EnumerateArray())
                {
                    if (m.TryGetProperty("name", out var name))
                    {
                        models.Add(name.GetString() ?? string.Empty);
                    }
                }
            }
            return models;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to list Ollama models at {BaseUrl}.", BaseUrl);
            return [];
        }
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
            model = string.IsNullOrWhiteSpace(request.Model) ? DefaultModel : request.Model.Trim(),
            messages,
            stream = false,
            options = new { temperature = 0.6, num_predict = 600 }
        };

        try
        {
            using var httpResponse = await _httpClient.PostAsJsonAsync($"{BaseUrl}/api/chat", payload);
            var body = await httpResponse.Content.ReadAsStringAsync();

            if (!httpResponse.IsSuccessStatusCode)
            {
                _logger.LogWarning("Ollama chat failed ({Status}): {Body}", (int)httpResponse.StatusCode, body);
                return new AiChatResponse
                {
                    Success = false,
                    Error = $"AI backend returned {(int)httpResponse.StatusCode}. Is Ollama running?"
                };
            }

            using var doc = JsonDocument.Parse(body);
            var reply = doc.RootElement.TryGetProperty("message", out var msgNode)
                && msgNode.TryGetProperty("content", out var contentNode)
                ? contentNode.GetString()
                : null;

            return new AiChatResponse
            {
                Success = true,
                Reply = (reply ?? string.Empty).Trim(),
                Model = payload.model
            };
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Could not reach Ollama at {BaseUrl}.", BaseUrl);
            return new AiChatResponse
            {
                Success = false,
                Error = "The AI assistant is offline right now. Please try again later."
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Ollama chat threw unexpectedly.");
            return new AiChatResponse { Success = false, Error = "Unexpected AI assistant error." };
        }
    }

    private static string Truncate(string? value, int max) =>
        string.IsNullOrEmpty(value) || value.Length <= max ? value ?? string.Empty : value[..max];
}
