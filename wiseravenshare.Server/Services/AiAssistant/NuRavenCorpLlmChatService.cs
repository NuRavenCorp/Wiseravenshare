using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace Wiseravenshare.Server.Services.AiAssistant;

/// <summary>
/// Bridges Wiseravenshare AI assistant requests to NuRavenCorpLLM assistant endpoints.
/// Expected upstream API:
///   POST /api/assistant/conversations
///   POST /api/assistant/conversations/{id}/messages
///
/// Config (appsettings or env):
///   NuRavenCorpLlm:BaseUrl            (default http://localhost:5011)
///   NuRavenCorpLlm:AccessToken        (optional bearer token when upstream requires auth)
///   NuRavenCorpLlm:DefaultPersona     (default "Technical")
/// </summary>
public sealed class NuRavenCorpLlmChatService : IOllamaChatService
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<NuRavenCorpLlmChatService> _logger;
    private readonly IAiLearningMetricsService _metrics;

    public NuRavenCorpLlmChatService(
        HttpClient httpClient,
        IConfiguration configuration,
        ILogger<NuRavenCorpLlmChatService> logger,
        IAiLearningMetricsService metrics)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
        _metrics = metrics;
    }

    private string BaseUrl => (_configuration["NuRavenCorpLlm:BaseUrl"] ?? "http://localhost:5011").Trim().TrimEnd('/');

    private string AccessToken => (_configuration["NuRavenCorpLlm:AccessToken"] ?? string.Empty).Trim();

    private string DefaultPersona => (_configuration["NuRavenCorpLlm:DefaultPersona"] ?? "Technical").Trim();

    public Task<IReadOnlyList<string>> GetModelsAsync()
    {
        IReadOnlyList<string> models = ["nuravencorpllm-assistant"];
        return Task.FromResult(models);
    }

    public async Task<AiChatResponse> ChatAsync(AiChatRequest request)
    {
        var startedAt = DateTime.UtcNow;
        var message = (request.Message ?? string.Empty).Trim();
        var wasSuccessful = false;
        string? failure = null;
        if (message.Length == 0)
        {
            return new AiChatResponse { Success = false, Error = "Message is required." };
        }

        try
        {
            var conversationId = await CreateConversationAsync();
            var bridgedPrompt = BuildPromptWithHistory(request);

            using var sendRequest = new HttpRequestMessage(HttpMethod.Post, $"{BaseUrl}/api/assistant/conversations/{conversationId}/messages")
            {
                Content = JsonContent.Create(new
                {
                    text = bridgedPrompt,
                    isVoice = false
                })
            };

            ApplyAuth(sendRequest);

            using var sendResponse = await _httpClient.SendAsync(sendRequest);
            var body = await sendResponse.Content.ReadAsStringAsync();
            if (!sendResponse.IsSuccessStatusCode)
            {
                _logger.LogWarning("NuRavenCorpLLM message post failed ({Status}): {Body}", (int)sendResponse.StatusCode, body);
                failure = $"Message post failed with {(int)sendResponse.StatusCode}";
                return new AiChatResponse
                {
                    Success = false,
                    Error = "NuRavenCorpLLM is unavailable right now."
                };
            }

            var content = TryReadCaseInsensitiveString(body, "content")
                ?? TryReadCaseInsensitiveString(body, "text")
                ?? string.Empty;

            wasSuccessful = true;
            return new AiChatResponse
            {
                Success = true,
                Reply = content.Trim(),
                Model = "nuravencorpllm-assistant"
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "NuRavenCorpLLM chat failed.");
            failure = ex.Message;
            return new AiChatResponse
            {
                Success = false,
                Error = "NuRavenCorpLLM bridge is unreachable right now."
            };
        }
        finally
        {
            // Capture learning/quality signals behind the admin metrics gate.
            var latency = DateTime.UtcNow - startedAt;
            _metrics.Record(
                message,
                success: wasSuccessful,
                latency,
                provider: "nuravencorpllm",
                error: failure);
        }
    }

    public async IAsyncEnumerable<string> ChatStreamAsync(
        AiChatRequest request,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct = default)
    {
        var result = await ChatAsync(request);
        if (!result.Success)
        {
            yield return result.Error ?? "NuRavenCorpLLM streaming is unavailable right now.";
            yield break;
        }

        var reply = result.Reply ?? string.Empty;
        const int chunkSize = 80;
        for (var i = 0; i < reply.Length && !ct.IsCancellationRequested; i += chunkSize)
        {
            yield return reply.Substring(i, Math.Min(chunkSize, reply.Length - i));
        }
    }

    private async Task<Guid> CreateConversationAsync()
    {
        using var createRequest = new HttpRequestMessage(HttpMethod.Post, $"{BaseUrl}/api/assistant/conversations")
        {
            Content = JsonContent.Create(new
            {
                title = "Wiseravenshare Bridge Session",
                persona = string.IsNullOrWhiteSpace(DefaultPersona) ? "Technical" : DefaultPersona
            })
        };

        ApplyAuth(createRequest);

        using var createResponse = await _httpClient.SendAsync(createRequest);
        var body = await createResponse.Content.ReadAsStringAsync();
        if (!createResponse.IsSuccessStatusCode)
        {
            _logger.LogWarning("NuRavenCorpLLM conversation create failed ({Status}): {Body}", (int)createResponse.StatusCode, body);
            throw new HttpRequestException($"NuRavenCorpLLM conversation create failed with {(int)createResponse.StatusCode}.");
        }

        var idText = TryReadCaseInsensitiveString(body, "id");
        if (!Guid.TryParse(idText, out var conversationId))
        {
            throw new InvalidOperationException("NuRavenCorpLLM response did not include a valid conversation id.");
        }

        return conversationId;
    }

    private void ApplyAuth(HttpRequestMessage request)
    {
        if (!string.IsNullOrWhiteSpace(AccessToken))
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", AccessToken);
        }
    }

    private static string BuildPromptWithHistory(AiChatRequest request)
    {
        var sb = new StringBuilder();

        if (request.History is { Count: > 0 })
        {
            sb.AppendLine("Conversation history:");
            foreach (var item in request.History.TakeLast(12))
            {
                var role = string.Equals(item.Role, "assistant", StringComparison.OrdinalIgnoreCase)
                    ? "assistant"
                    : "user";
                sb.AppendLine($"{role}: {item.Content}");
            }
            sb.AppendLine();
        }

        sb.AppendLine("User message:");
        sb.AppendLine(request.Message ?? string.Empty);
        return sb.ToString();
    }

    private static string? TryReadCaseInsensitiveString(string json, string propertyName)
    {
        if (string.IsNullOrWhiteSpace(json) || string.IsNullOrWhiteSpace(propertyName))
        {
            return null;
        }

        using var doc = JsonDocument.Parse(json);
        if (doc.RootElement.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        foreach (var property in doc.RootElement.EnumerateObject())
        {
            if (string.Equals(property.Name, propertyName, StringComparison.OrdinalIgnoreCase))
            {
                return property.Value.ValueKind switch
                {
                    JsonValueKind.String => property.Value.GetString(),
                    JsonValueKind.Number => property.Value.ToString(),
                    _ => null
                };
            }
        }

        return null;
    }
}