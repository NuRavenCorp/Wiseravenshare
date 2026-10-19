using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using NuRavenCorpLLM.Server.Entities;
using NuRavenCorpLLM.Server.Entities.Clients;

namespace NuRavenCorpLLM.Server.Entities.Conversations;

public class Conversation : BaseEntity
{
    public Guid ClientSystemId { get; set; }

    [MaxLength(200)]
    public string? ExternalUserId { get; set; }

    [MaxLength(200)]
    public string? ExternalId { get; set; }

    [MaxLength(255)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string? SystemPromptOverride { get; set; }

    [MaxLength(100)]
    public string? Persona { get; set; }

    public ConversationStatus Status { get; set; } = ConversationStatus.Active;
    public int MessageCount { get; set; }
    public int TotalPromptTokens { get; set; }
    public int TotalCompletionTokens { get; set; }
    public decimal EstimatedCostUsd { get; set; }
    public DateTime LastMessageAt { get; set; } = DateTime.UtcNow;
    public DateTime? ClosedAt { get; set; }
    public JsonDocument? Metadata { get; set; }

    public virtual ClientSystem ClientSystem { get; set; } = null!;
    public virtual ICollection<Message> Messages { get; set; } = new List<Message>();
    public virtual ConversationSummary? Summary { get; set; }
}

public enum ConversationStatus { Active, Closed, Archived, Flagged }

public class Message : BaseEntity
{
    public Guid ConversationId { get; set; }
    public Guid? ParentMessageId { get; set; }
    public MessageRole Role { get; set; }
    public string Content { get; set; } = string.Empty;
    public int SequenceNumber { get; set; }

    [MaxLength(100)]
    public string? ModelKey { get; set; }

    [MaxLength(100)]
    public string? ProviderKey { get; set; }

    public int PromptTokens { get; set; }
    public int CompletionTokens { get; set; }
    public int TotalTokens { get; set; }
    public int LatencyMs { get; set; }
    public decimal EstimatedCostUsd { get; set; }

    [MaxLength(50)]
    public string? FinishReason { get; set; }

    public bool IsStreaming { get; set; }
    public bool IsBlocked { get; set; }

    [MaxLength(500)]
    public string? BlockedReason { get; set; }

    public JsonDocument? ToolCalls { get; set; }
    public JsonDocument? FunctionResults { get; set; }
    public JsonDocument? Metadata { get; set; }

    public virtual Conversation Conversation { get; set; } = null!;
    public virtual Message? ParentMessage { get; set; }
    public virtual ICollection<Message> Replies { get; set; } = new List<Message>();
    public virtual ICollection<MessageCitation> Citations { get; set; } = new List<MessageCitation>();
    public virtual ICollection<MessageAttachment> Attachments { get; set; } = new List<MessageAttachment>();
}

public enum MessageRole { System, User, Assistant, Tool, Function }

public class MessageAttachment : BaseEntity
{
    public Guid MessageId { get; set; }

    [MaxLength(100)]
    public string Kind { get; set; } = string.Empty;

    [MaxLength(500)]
    public string FileName { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? MimeType { get; set; }

    public long SizeBytes { get; set; }

    [MaxLength(2000)]
    public string? StorageUrl { get; set; }

    [MaxLength(128)]
    public string? ContentHash { get; set; }

    public string? ExtractedText { get; set; }
    public JsonDocument? Metadata { get; set; }

    public virtual Message Message { get; set; } = null!;
}

public class MessageCitation : BaseEntity
{
    public Guid MessageId { get; set; }

    [MaxLength(50)]
    public string SourceKind { get; set; } = string.Empty;

    public Guid? SourceId { get; set; }

    [MaxLength(500)]
    public string? SourceTitle { get; set; }

    [MaxLength(2000)]
    public string? SourceUrl { get; set; }

    [MaxLength(500)]
    public string? Snippet { get; set; }

    public decimal? RelevanceScore { get; set; }
    public int OrderIndex { get; set; }
    public virtual Message Message { get; set; } = null!;
}

public class ConversationSummary : BaseEntity
{
    public Guid ConversationId { get; set; }
    public string Summary { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string? KeyPoints { get; set; }

    [MaxLength(1000)]
    public string? UserGoals { get; set; }

    [MaxLength(1000)]
    public string? OpenQuestions { get; set; }

    public int MessagesSummarized { get; set; }
    public int TokensUsed { get; set; }
    public virtual Conversation Conversation { get; set; } = null!;
}
