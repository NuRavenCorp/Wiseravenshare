using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using NuRavenCorpLLM.Server.Entities;

namespace NuRavenCorpLLM.Server.Entities.Models;

public class ModelProvider : BaseEntity
{
    [MaxLength(80)]
    public string Key { get; set; } = string.Empty;

    [MaxLength(200)]
    public string DisplayName { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string? Description { get; set; }

    [MaxLength(500)]
    public string? BaseUrl { get; set; }

    [MaxLength(500)]
    public string? ApiKeyRef { get; set; }

    public bool IsActive { get; set; } = true;
    public int Priority { get; set; } = 100;
    public int TimeoutSeconds { get; set; } = 120;
    public JsonDocument? DefaultHeaders { get; set; }
    public JsonDocument? ExtraConfig { get; set; }
    public virtual ICollection<ModelDefinition> Models { get; set; } = new List<ModelDefinition>();
}

public class ModelDefinition : BaseEntity
{
    public Guid ProviderId { get; set; }

    [MaxLength(100)]
    public string Key { get; set; } = string.Empty;

    [MaxLength(200)]
    public string DisplayName { get; set; } = string.Empty;

    public ModelKind Kind { get; set; } = ModelKind.Chat;

    [MaxLength(100)]
    public string? ProviderModelId { get; set; }

    public int? ContextWindowTokens { get; set; }
    public int? MaxOutputTokens { get; set; }
    public int? EmbeddingDimensions { get; set; }
    public decimal InputCostPer1K { get; set; }
    public decimal OutputCostPer1K { get; set; }
    public bool SupportsStreaming { get; set; } = true;
    public bool SupportsTools { get; set; }
    public bool SupportsVision { get; set; }
    public bool SupportsJsonMode { get; set; }
    public bool IsAvailable { get; set; } = true;
    public int Priority { get; set; } = 100;
    public string[]? Capabilities { get; set; }

    public virtual ModelProvider Provider { get; set; } = null!;
}

public enum ModelKind { Chat, Completion, Embedding, Vision, Audio, Moderation, Rerank }

public class ModelRoute : BaseEntity
{
    [MaxLength(100)]
    public string RouteKey { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    public Guid? PreferredModelId { get; set; }
    public Guid? FallbackModelId { get; set; }
    public string[]? CandidateModelIds { get; set; }
    public int Priority { get; set; } = 100;
    public bool IsActive { get; set; } = true;
    public decimal MaxCostPer1K { get; set; }
    public int MaxTokens { get; set; } = 4000;
    public JsonDocument? SelectionCriteria { get; set; }
}

public class ModelInvocation : BaseEntity
{
    public Guid? ClientSystemId { get; set; }
    public Guid? ConversationId { get; set; }
    public Guid? MessageId { get; set; }
    public Guid? ModelId { get; set; }

    [MaxLength(100)]
    public string? ModelKey { get; set; }

    [MaxLength(80)]
    public string? ProviderKey { get; set; }

    [MaxLength(100)]
    public string? RouteKey { get; set; }

    public InvocationStatus Status { get; set; } = InvocationStatus.Pending;
    public int PromptTokens { get; set; }
    public int CompletionTokens { get; set; }
    public int TotalTokens { get; set; }
    public int LatencyMs { get; set; }
    public int? FirstTokenLatencyMs { get; set; }
    public decimal EstimatedCostUsd { get; set; }

    [MaxLength(50)]
    public string? FinishReason { get; set; }

    [MaxLength(2000)]
    public string? ErrorMessage { get; set; }

    public bool WasStreaming { get; set; }
    public bool WasFallback { get; set; }
    public int RetryCount { get; set; }
    public JsonDocument? RequestMetadata { get; set; }
    public JsonDocument? ResponseMetadata { get; set; }
}

public enum InvocationStatus { Pending, Streaming, Succeeded, Failed, Cancelled, RateLimited }

public class EmbeddingModel : BaseEntity
{
    public Guid ProviderId { get; set; }

    [MaxLength(100)]
    public string Key { get; set; } = string.Empty;

    [MaxLength(200)]
    public string DisplayName { get; set; } = string.Empty;

    public int Dimensions { get; set; }
    public decimal CostPer1K { get; set; }
    public int MaxInputTokens { get; set; } = 8192;
    public bool IsDefault { get; set; }
    public bool IsAvailable { get; set; } = true;

    [MaxLength(100)]
    public string? NormalizationKind { get; set; }
}

public class TokenBudget : BaseEntity
{
    public Guid? ClientSystemId { get; set; }
    public BudgetPeriodKind PeriodKind { get; set; } = BudgetPeriodKind.Daily;
    public DateTime PeriodStart { get; set; }
    public DateTime PeriodEnd { get; set; }
    public long AllowedTokens { get; set; }
    public long UsedTokens { get; set; }
    public long ReservedTokens { get; set; }
    public int AllowedRequests { get; set; }
    public int UsedRequests { get; set; }
    public decimal AllowedCostUsd { get; set; }
    public decimal UsedCostUsd { get; set; }
    public bool IsExhausted => UsedTokens >= AllowedTokens || UsedRequests >= AllowedRequests;
    public bool IsWarning => UsedTokens >= AllowedTokens * 0.8;
}

public enum BudgetPeriodKind { Hourly, Daily, Weekly, Monthly, Yearly }
