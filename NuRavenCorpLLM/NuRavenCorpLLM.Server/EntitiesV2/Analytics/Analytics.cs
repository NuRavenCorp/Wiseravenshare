using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using NuRavenCorpLLM.Server.Entities;

namespace NuRavenCorpLLM.Server.Entities.Analytics;

public class UsageMetric : BaseEntity
{
    public Guid? ClientSystemId { get; set; }

    [MaxLength(100)]
    public string MetricKey { get; set; } = string.Empty;

    public decimal Value { get; set; }

    [MaxLength(50)]
    public string? Unit { get; set; }

    public DateTime RecordedAt { get; set; } = DateTime.UtcNow;
    public DateTime PeriodStart { get; set; }
    public DateTime PeriodEnd { get; set; }

    [MaxLength(80)]
    public string? Category { get; set; }

    [MaxLength(80)]
    public string? ModelKey { get; set; }
}

public class LatencyRecord : BaseEntity
{
    public Guid? ModelInvocationId { get; set; }
    public Guid? ClientSystemId { get; set; }
    public int TotalMs { get; set; }
    public int? FirstTokenMs { get; set; }
    public int? RetrievalMs { get; set; }
    public int? ProviderMs { get; set; }
    public int? PostProcessingMs { get; set; }
    public DateTime RecordedAt { get; set; } = DateTime.UtcNow;
}

public class CostRecord : BaseEntity
{
    public Guid? ClientSystemId { get; set; }
    public Guid? ModelInvocationId { get; set; }

    [MaxLength(100)]
    public string? ModelKey { get; set; }

    public int PromptTokens { get; set; }
    public int CompletionTokens { get; set; }
    public int TotalTokens { get; set; }
    public decimal InputCostUsd { get; set; }
    public decimal OutputCostUsd { get; set; }
    public decimal TotalCostUsd { get; set; }

    [MaxLength(20)]
    public string Currency { get; set; } = "USD";

    public DateTime RecordedAt { get; set; } = DateTime.UtcNow;
}

public class QualityScore : BaseEntity
{
    public Guid? ModelInvocationId { get; set; }
    public Guid? MessageId { get; set; }
    public Guid? ClientSystemId { get; set; }
    public decimal Score { get; set; }
    public decimal? Relevance { get; set; }
    public decimal? Fluency { get; set; }
    public decimal? Groundedness { get; set; }
    public decimal? Safety { get; set; }
    public string? EvaluatorKind { get; set; }
    public DateTime RecordedAt { get; set; } = DateTime.UtcNow;
}

public class AnomalyDetection : BaseEntity
{
    public Guid? ClientSystemId { get; set; }

    [MaxLength(100)]
    public string AnomalyKind { get; set; } = string.Empty;

    public AnomalySeverity Severity { get; set; } = AnomalySeverity.Medium;

    [MaxLength(1000)]
    public string Description { get; set; } = string.Empty;

    public JsonDocument? ObservedValues { get; set; }
    public JsonDocument? Baseline { get; set; }
    public bool Acknowledged { get; set; }
    public DateTime? AcknowledgedAt { get; set; }
    public DateTime DetectedAt { get; set; } = DateTime.UtcNow;
}

public enum AnomalySeverity { Info, Low, Medium, High, Critical }
