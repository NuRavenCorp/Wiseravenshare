// Application/Services/Assistant/LlmGateway.cs
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using NuRavenCorpLLM.Infrastructure.External;

namespace NuRavenCorpLLM.Services;

public interface ILlmGateway
{
    Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct = default);
    IAsyncEnumerable<LlmStreamChunk> StreamAsync(LlmRequest request, CancellationToken ct = default);
    Task<float[]> EmbedAsync(string text, CancellationToken ct = default);
}

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