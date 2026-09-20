using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using NuRavenCorpLLM.Server.Entities;

namespace NuRavenCorpLLM.Server.Entities.Learning;

public class LearningSample : BaseEntity
{
    public Guid? ClientSystemId { get; set; }
    public LearningSampleSource Source { get; set; }
    public LearningSampleStatus Status { get; set; } = LearningSampleStatus.Pending;
    public Guid? MessageId { get; set; }
    public Guid? ConversationId { get; set; }
    public string UserPrompt { get; set; } = string.Empty;
    public string? AssistantResponse { get; set; }
    public string? IdealResponse { get; set; }
    public string? Context { get; set; }

    [MaxLength(128)]
    public string? ContentHash { get; set; }

    public int Quality { get; set; } = 50;
    public decimal? Reward { get; set; }
    public string? RewardNotes { get; set; }
    public string[]? Tags { get; set; }
    public JsonDocument? Metadata { get; set; }
    public Guid? SourceUserId { get; set; }
    public string? Language { get; set; } = "en";
    public DateTime? UsedInTrainingAt { get; set; }
    public string? TrainingBatchId { get; set; }
    public virtual ICollection<FeedbackSignal> Feedbacks { get; set; } = new List<FeedbackSignal>();
}

public enum LearningSampleSource { UserFeedback, ChatterObservation, WebContent, ManualSeed, AutoCurated, ClientEvent, CraftSession }
public enum LearningSampleStatus { Pending, Approved, Rejected, UsedInTraining, Deprecated }

public class LearningBatch : BaseEntity
{
    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    public LearningBatchStatus Status { get; set; } = LearningBatchStatus.Draft;
    public int SampleCount { get; set; }
    public int ApprovedCount { get; set; }
    public int RejectedCount { get; set; }
    public decimal? AverageQuality { get; set; }
    public DateTime? FrozenAt { get; set; }
    public DateTime? TrainingStartedAt { get; set; }
    public DateTime? TrainingCompletedAt { get; set; }

    [MaxLength(500)]
    public string? ExportPath { get; set; }

    public JsonDocument? Statistics { get; set; }
    public Guid? FineTuneJobId { get; set; }
}

public enum LearningBatchStatus { Draft, Frozen, Training, Completed, Failed, Cancelled }

public class FeedbackSignal : BaseEntity
{
    public Guid? ClientSystemId { get; set; }
    public Guid? MessageId { get; set; }
    public Guid? ConversationId { get; set; }
    public Guid? LearningSampleId { get; set; }
    public FeedbackKind Kind { get; set; }
    public int? Rating { get; set; }
    public string? Comment { get; set; }
    public string? CorrectedResponse { get; set; }
    public string? ExternalUserId { get; set; }
    public bool Processed { get; set; }
    public DateTime? ProcessedAt { get; set; }
    public JsonDocument? Metadata { get; set; }
    public virtual LearningSample? LearningSample { get; set; }
}

public enum FeedbackKind { ThumbUp, ThumbDown, Rating, Correction, Flag, Regeneration }

public class PreferencePair : BaseEntity
{
    public string Prompt { get; set; } = string.Empty;
    public string ChosenResponse { get; set; } = string.Empty;
    public string RejectedResponse { get; set; } = string.Empty;
    public PreferencePairStatus Status { get; set; } = PreferencePairStatus.Draft;
    public Guid? ChosenMessageId { get; set; }
    public Guid? RejectedMessageId { get; set; }
    public string? Rationale { get; set; }
    public decimal? Confidence { get; set; }
    public string? Source { get; set; }
    public JsonDocument? Metadata { get; set; }
}

public enum PreferencePairStatus { Draft, Ready, UsedInTraining, Rejected }

public class FineTuneJob : BaseEntity
{
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(100)]
    public string BaseModelId { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? ResultModelId { get; set; }

    public Guid? LearningBatchId { get; set; }
    public Guid? ProviderId { get; set; }
    public FineTuneStatus Status { get; set; } = FineTuneStatus.Queued;
    public string? ExternalJobId { get; set; }
    public int TrainingSampleCount { get; set; }
    public int ValidationSampleCount { get; set; }
    public int Epochs { get; set; } = 3;
    public decimal LearningRate { get; set; } = 0.0001m;
    public int? BatchSize { get; set; }
    public decimal? Loss { get; set; }
    public decimal? ValidationLoss { get; set; }
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }

    [MaxLength(2000)]
    public string? ErrorMessage { get; set; }

    public JsonDocument? Hyperparameters { get; set; }
    public JsonDocument? Results { get; set; }
    public decimal? EstimatedCostUsd { get; set; }
}

public enum FineTuneStatus { Queued, PreparingData, Running, Validating, Completed, Failed, Cancelled }

public class EvaluationRun : BaseEntity
{
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    public Guid? ModelId { get; set; }

    [MaxLength(100)]
    public string? ModelKey { get; set; }

    [MaxLength(100)]
    public string? BenchmarkName { get; set; }

    public EvaluationStatus Status { get; set; } = EvaluationStatus.Pending;
    public int TotalCases { get; set; }
    public int PassedCases { get; set; }
    public int FailedCases { get; set; }
    public decimal? OverallScore { get; set; }
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }

    [MaxLength(2000)]
    public string? Notes { get; set; }

    public JsonDocument? Configuration { get; set; }
    public virtual ICollection<EvaluationMetric> Metrics { get; set; } = new List<EvaluationMetric>();
}

public enum EvaluationStatus { Pending, Running, Completed, Failed, Cancelled }

public class EvaluationMetric : BaseEntity
{
    public Guid EvaluationRunId { get; set; }

    [MaxLength(100)]
    public string MetricKey { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? Category { get; set; }

    public decimal Value { get; set; }
    public decimal? Baseline { get; set; }
    public decimal? Delta { get; set; }

    [MaxLength(50)]
    public string? Unit { get; set; }

    [MaxLength(500)]
    public string? Notes { get; set; }

    public virtual EvaluationRun EvaluationRun { get; set; } = null!;
}
