using System.Text.Json;

namespace WiseRavenShare.Server.Application.Services.Assistant;

// Request/Response DTOs
public class CreateConversationDto
{
    public string? Title { get; set; }
    public string? Persona { get; set; }
}

public class SendMessageDto
{
    public string Text { get; set; } = string.Empty;
    public bool IsVoice { get; set; }
}

public class SpeakDto
{
    public string Text { get; set; } = string.Empty;
    public string? VoiceId { get; set; }
}

public class FeedbackDto
{
    public string Vote { get; set; } = string.Empty;
    public int? Rating { get; set; }
    public string? Comment { get; set; }
    public string? CorrectedResponse { get; set; }
}

// LLM Gateway Models
public class LlmRequest
{
    public List<LlmMessage> Messages { get; set; } = new();
    public string? Model { get; set; }
    public double Temperature { get; set; } = 0.7;
    public int MaxTokens { get; set; } = 1500;
    public bool JsonMode { get; set; }
    public List<LlmTool>? Tools { get; set; }
    public string? SystemPrompt { get; set; }
}

public record LlmMessage(string Role, string Content);
public record LlmTool(string Name, string Description, JsonDocument Parameters);

public class LlmResponse
{
    public string Content { get; set; } = string.Empty;
    public int PromptTokens { get; set; }
    public int CompletionTokens { get; set; }
    public List<LlmToolCall>? ToolCalls { get; set; }
    public string Model { get; set; } = string.Empty;
}

public record LlmToolCall(string Name, JsonDocument Arguments);
public record LlmStreamChunk(string? Delta, bool Done, int? PromptTokens = null, int? CompletionTokens = null);

// Speech Services
public record SttResult(string Text, string? Language, double? Confidence, int DurationMs);
public record TtsResult(byte[] Audio, string MimeType, int DurationMs);

// RAG / Web Models
public record RagHit(Guid Id, string Title, string Content, string Source, string? SourceUrl, double Score);
public record WebSnippet(string Title, string Url, string Snippet, DateTime? PublishedAt = null);

// Streaming
public record AssistantStreamEvent(string Type, string? Delta, object? Message, string? Error);
