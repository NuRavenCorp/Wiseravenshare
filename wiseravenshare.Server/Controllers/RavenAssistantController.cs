// Controllers/RavenAssistantController.cs
// Mirrors the voter-alliance CivicAssistantController pattern:
// Frontend calls POST /api/raven-assistant/chat on this server,
// this server forwards to NuRavenCorpLLM POST /v1/generate (stateless, no DB).
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace WiseRavenShare.Server.API.Controllers;

[ApiController]
[Route("api/raven-assistant")]
[Authorize]
public class RavenAssistantController : ControllerBase
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<RavenAssistantController> _logger;

    public RavenAssistantController(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<RavenAssistantController> logger)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _logger = logger;
    }

    // ── Config helpers ────────────────────────────────────────────────────────

    private string BaseUrl =>
        (_configuration["RavenAssistant:Llm:BaseUrl"] ??
         _configuration["NuRavenCorpLlm:BaseUrl"] ??
         "http://localhost:5011").TrimEnd('/');

    private string ChatPath =>
        (_configuration["RavenAssistant:Llm:ChatCompletionsPath"] ?? "/v1/generate").Trim();

    private string ApiKey =>
        (_configuration["RavenAssistant:Llm:ApiKey"] ??
         _configuration["NuRavenCorpLlm:AccessToken"] ??
         string.Empty).Trim();

    private int TimeoutSeconds =>
        Math.Clamp(_configuration.GetValue<int?>("RavenAssistant:Llm:TimeoutSeconds") ?? 60, 5, 180);

    // ── Prompt builder (identical approach to voter-alliance) ─────────────────

    private static string BuildPrompt(RavenChatRequest request)
    {
        var sb = new StringBuilder();
        sb.AppendLine("System instructions:");
        sb.AppendLine(
            "You are WiseRaven, the in-app AI assistant for WiseRavenShare — " +
            "a comprehensive media, podcast, and social platform for creators, journalists, and teams. " +
            "Be concise, warm, and practical. Use markdown for structure. " +
            "Platform features: Ravensight video studio, Podcast Studio, FM Radio Creator, " +
            "cross-platform syndication (Facebook/Instagram/TikTok/YouTube/X/LinkedIn), " +
            "TruthSeeker fact-checking, WiseCoin engagement currency, Team Launchpad. " +
            "Symbol notation (use often): $ = valuable/excellent. % = partial/incomplete. " +
            "If outside platform scope, suggest support@wiseravenshare.com.");
        sb.AppendLine();
        sb.AppendLine("Conversation:");

        if (request.History is { Count: > 0 })
        {
            foreach (var h in request.History.TakeLast(12))
            {
                var role = string.Equals(h.Role, "assistant", StringComparison.OrdinalIgnoreCase)
                    ? "assistant"
                    : "user";
                if (!string.IsNullOrWhiteSpace(h.Content))
                {
                    sb.Append(role == "assistant" ? "Assistant: " : "User: ");
                    sb.AppendLine(h.Content.Trim());
                }
            }
        }

        sb.Append("User: ");
        sb.AppendLine(request.Message?.Trim());
        sb.Append("Assistant:");
        return sb.ToString();
    }

    // ── Determine endpoint style ──────────────────────────────────────────────

    private static bool IsNuRavenGeneratePath(string path)
    {
        var normalized = "/" + path.Trim().Trim('/');
        return normalized.Equals("/v1/generate", StringComparison.OrdinalIgnoreCase);
    }

    private static string? TryReadNuRavenText(JsonElement result)
    {
        if (result.TryGetProperty("text", out var textElement) &&
            textElement.ValueKind == JsonValueKind.String)
            return textElement.GetString();

        if (result.TryGetProperty("choices", out var choices) &&
            choices.ValueKind == JsonValueKind.Array &&
            choices.GetArrayLength() > 0)
        {
            if (choices[0].TryGetProperty("message", out var msg) &&
                msg.TryGetProperty("content", out var content))
                return content.GetString();
        }

        return null;
    }

    // ── Chat endpoint ─────────────────────────────────────────────────────────

    [HttpPost("chat")]
    public async Task<IActionResult> Chat(
        [FromBody] RavenChatRequest request,
        CancellationToken cancellationToken)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.Message))
            return BadRequest(new { message = "Message is required." });

        var endpoint = $"{BaseUrl}/{ChatPath.TrimStart('/')}";
        var useNuRaven = IsNuRavenGeneratePath(ChatPath);

        var client = _httpClientFactory.CreateClient("RavenAssistant");

        if (!string.IsNullOrWhiteSpace(ApiKey))
        {
            client.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", ApiKey);
        }

        using var timeoutCts =
            CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutCts.CancelAfter(TimeSpan.FromSeconds(TimeoutSeconds));

        try
        {
            HttpResponseMessage httpResponse;

            if (useNuRaven)
            {
                var prompt = BuildPrompt(request);
                var payload = new
                {
                    prompt,
                    max_new_tokens = 600,
                    temperature = 0.3,
                    response_format = "text"
                };
                httpResponse = await client.PostAsJsonAsync(endpoint, payload, timeoutCts.Token);
            }
            else
            {
                // OpenAI-compat: /v1/chat/completions
                var messages = new List<object>
                {
                    new
                    {
                        role = "system",
                        content =
                            "You are WiseRaven, the AI assistant for WiseRavenShare. " +
                            "Be concise, warm, and practical. Use markdown for structure. " +
                            "$ = excellent/valuable. % = partial/incomplete."
                    }
                };

                if (request.History is { Count: > 0 })
                {
                    foreach (var h in request.History.TakeLast(12))
                    {
                        var role = string.Equals(h.Role, "assistant",
                            StringComparison.OrdinalIgnoreCase) ? "assistant" : "user";
                        if (!string.IsNullOrWhiteSpace(h.Content))
                            messages.Add(new { role, content = h.Content.Trim() });
                    }
                }

                messages.Add(new { role = "user", content = request.Message.Trim() });

                var payload = new { model = "nuravencorpllm", messages, temperature = 0.3 };
                httpResponse = await client.PostAsJsonAsync(endpoint, payload, timeoutCts.Token);
            }

            if (!httpResponse.IsSuccessStatusCode)
            {
                var body = await httpResponse.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogWarning(
                    "RavenAssistant LLM returned {Status} for {Endpoint}: {Body}",
                    (int)httpResponse.StatusCode, endpoint, body);
                return Ok(new RavenChatResponse
                {
                    Answer = "RavenChat is warming up. Please try again in a moment.",
                    ConversationId = request.ConversationId ?? Guid.NewGuid().ToString("N")
                });
            }

            var result = await httpResponse.Content
                .ReadFromJsonAsync<JsonElement>(cancellationToken: timeoutCts.Token);

            var answer = useNuRaven
                ? TryReadNuRavenText(result)
                : result.GetProperty("choices")[0]
                    .GetProperty("message")
                    .GetProperty("content")
                    .GetString();

            return Ok(new RavenChatResponse
            {
                Answer = string.IsNullOrWhiteSpace(answer)
                    ? "I didn't get a reply from the assistant. Please try again."
                    : answer.Trim(),
                ConversationId = request.ConversationId ?? Guid.NewGuid().ToString("N")
            });
        }
        catch (OperationCanceledException) when (
            timeoutCts.IsCancellationRequested &&
            !cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning(
                "RavenAssistant timed out after {Seconds}s for {Endpoint}.",
                TimeoutSeconds, endpoint);
            return Ok(new RavenChatResponse
            {
                Answer = "RavenChat is taking longer than expected. Please try a shorter question or retry.",
                ConversationId = request.ConversationId ?? Guid.NewGuid().ToString("N")
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "RavenAssistant chat failed for {Endpoint}.", endpoint);
            return Ok(new RavenChatResponse
            {
                Answer = "I could not reach the assistant service right now. Please try again in a moment.",
                ConversationId = request.ConversationId ?? Guid.NewGuid().ToString("N")
            });
        }
    }

    // ── DTOs ──────────────────────────────────────────────────────────────────

    public record RavenChatRequest(
        string Message,
        string? ConversationId,
        List<RavenChatHistoryEntry>? History);

    public record RavenChatHistoryEntry(string Role, string Content);

    public class RavenChatResponse
    {
        public string Answer { get; set; } = string.Empty;
        public string ConversationId { get; set; } = string.Empty;
    }
}
