// Core/Entities/Assistant/AssistantMessage.cs
using System.Text.Json;

namespace NuRavenCorpLLM.Entities;

public class AssistantMessage : BaseEntity
{
    public Guid ConversationId { get; set; }
    public Guid? UserId { get; set; }

    public AssistantRole Role { get; set; }
    public string Content { get; set; } = string.Empty;

    public string? AudioUrl { get; set; }
    public int? AudioDurationMs { get; set; }
    public string? Transcript { get; set; }

    public int PromptTokens { get; set; }
    public int CompletionTokens { get; set; }
    public int LatencyMs { get; set; }

    public JsonDocument? Citations { get; set; }        // RAG + web sources
    public JsonDocument? ToolCalls { get; set; }
    public JsonDocument? Metadata { get; set; }

    public AssistantMessageStatus Status { get; set; } = AssistantMessageStatus.Complete;

    // Navigation
    public virtual AssistantConversation Conversation { get; set; } = null!;
    public virtual ICollection<AssistantFeedback> Feedbacks { get; set; } = new List<AssistantFeedback>();
}

public enum AssistantRole { System, User, Assistant, Tool }

public enum AssistantMessageStatus { Streaming, Complete, Failed, Blocked }