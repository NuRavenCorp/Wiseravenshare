// Wiseravenshare.Server/Services/AiAssistant/DeepSeekChatService.cs
using System.Runtime.CompilerServices;
using System.Text.Json;
using Wiseravenshare.Server.Services.External.DeepSeekService;

namespace Wiseravenshare.Server.Services.AiAssistant;

/// <summary>
/// DeepSeek-powered chat service for the AI Assistant.
/// Implements IOllamaChatService interface to provide drop-in replacement for Ollama.
/// Routes all chat requests to DeepSeek API with conversation history context.
/// </summary>
public class DeepSeekChatService : IOllamaChatService
{
    private readonly IDeepSeekService _deepSeekService;
    private readonly ILogger<DeepSeekChatService> _logger;

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

    public DeepSeekChatService(IDeepSeekService deepSeekService, ILogger<DeepSeekChatService> logger)
    {
        _deepSeekService = deepSeekService;
        _logger = logger;
    }

    /// <summary>
    /// DeepSeek always reports itself as available. Returns single "deepseek-chat" model.
    /// </summary>
    public Task<IReadOnlyList<string>> GetModelsAsync()
    {
        return Task.FromResult<IReadOnlyList<string>>(new[] { "deepseek-chat" });
    }

    /// <summary>
    /// Sends a chat message with optional conversation history to DeepSeek.
    /// Formats messages into a prompt that preserves conversation context.
    /// </summary>
    public async Task<AiChatResponse> ChatAsync(AiChatRequest request)
    {
        var message = (request.Message ?? string.Empty).Trim();
        if (message.Length == 0)
        {
            return new AiChatResponse { Success = false, Error = "Message is required." };
        }

        try
        {
            var prompt = BuildPrompt(message, request.History);
            var response = await _deepSeekService.GenerateAsync(prompt);

            return new AiChatResponse
            {
                Success = true,
                Reply = response,
                Model = "deepseek-chat"
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "DeepSeek chat failed for message: {Message}", message);
            return new AiChatResponse
            {
                Success = false,
                Error = $"DeepSeek chat failed: {ex.Message}"
            };
        }
    }

    /// <summary>
    /// Streams chat response from DeepSeek token-by-token.
    /// Note: DeepSeek API returns full response, so we yield it in chunks.
    /// </summary>
    public async IAsyncEnumerable<string> ChatStreamAsync(AiChatRequest request, [EnumeratorCancellation] CancellationToken ct = default)
    {
        var message = (request.Message ?? string.Empty).Trim();
        if (message.Length == 0)
        {
            yield return JsonSerializer.Serialize(new { error = "Message is required." });
            yield break;
        }

        string? response = null;
        try
        {
            var prompt = BuildPrompt(message, request.History);
            response = await _deepSeekService.GenerateAsync(prompt);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "DeepSeek stream chat failed");
            response = null;
        }

        // If response failed, yield error
        if (string.IsNullOrEmpty(response))
        {
            yield return JsonSerializer.Serialize(new { error = "DeepSeek stream failed" });
            yield break;
        }

        // Split response into reasonable chunks for streaming effect
        const int chunkSize = 50;
        for (int i = 0; i < response.Length; i += chunkSize)
        {
            if (ct.IsCancellationRequested) break;
            
            var chunk = response.Substring(i, Math.Min(chunkSize, response.Length - i));
            yield return chunk;
            
            // Small delay to simulate streaming
            await Task.Delay(10, ct);
        }
    }

    /// <summary>
    /// Builds a prompt that includes conversation history context.
    /// </summary>
    private string BuildPrompt(string message, List<AiChatMessage>? history)
    {
        var promptBuilder = new System.Text.StringBuilder();
        promptBuilder.AppendLine("Assistant Instructions: " + SystemPrompt);
        promptBuilder.AppendLine();

        // Include conversation history for context
        if (history is { Count: > 0 })
        {
            promptBuilder.AppendLine("Conversation History:");
            foreach (var msg in history.TakeLast(10))
            {
                promptBuilder.AppendLine($"{msg.Role.ToUpper()}: {msg.Content}");
            }
            promptBuilder.AppendLine();
        }

        promptBuilder.AppendLine($"USER: {message}");
        promptBuilder.AppendLine("ASSISTANT:");

        return promptBuilder.ToString();
    }
}
