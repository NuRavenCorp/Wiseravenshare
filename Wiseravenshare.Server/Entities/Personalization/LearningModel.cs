using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Wiseravenshare.Server.Entities;

namespace Wiseravenshare.Server.Entities.Personalization;

public class LearningModel : BaseEntity
{
    [MaxLength(255)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    public ModelType Type { get; set; }
    public ModelStatus Status { get; set; } = ModelStatus.Training;
    public string Version { get; set; } = "1.0.0";
    public JsonDocument? Configuration { get; set; }
    public JsonDocument? Weights { get; set; }
    public JsonDocument? Architecture { get; set; }
    public JsonDocument? Metrics { get; set; }
    public int TrainingIterations { get; set; }
    public int TrainingDataSize { get; set; }
    public decimal Accuracy { get; set; }
    public decimal Precision { get; set; }
    public decimal Recall { get; set; }
    public decimal F1Score { get; set; }
    public DateTime? TrainedAt { get; set; }
    public DateTime? LastUsedAt { get; set; }
    public int UsageCount { get; set; }

    // Navigation Properties
    public virtual ICollection<ModelPrediction> Predictions { get; set; } = new List<ModelPrediction>();
}

public enum ModelType
{
    CollaborativeFiltering,
    ContentBased,
    Hybrid,
    NeuralNetwork,
    Transformer,
    RandomForest,
    GradientBoosting,
    Reinforcement
}

public enum ModelStatus
{
    Training,
    Evaluating,
    Deployed,
    Deprecated,
    Failed
}

public class ModelPrediction : BaseEntity
{
    public Guid ModelId { get; set; }
    public Guid UserId { get; set; }
    public string TargetType { get; set; } = string.Empty;
    public Guid TargetId { get; set; }
    public decimal Score { get; set; }
    public decimal Confidence { get; set; }
    public string? Reason { get; set; }
    public JsonDocument? Features { get; set; }
    public bool IsAccepted { get; set; }
    public DateTime PredictedAt { get; set; }
    public DateTime? AcceptedAt { get; set; }
    public DateTime? ExpiresAt { get; set; }

    // Navigation Properties
    public virtual LearningModel Model { get; set; } = null!;
    public virtual User User { get; set; } = null!;
}
