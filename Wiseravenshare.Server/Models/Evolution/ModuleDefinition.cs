using System.ComponentModel.DataAnnotations;

namespace Wiseravenshare.Server.Models.Evolution;

public sealed class ModuleDefinition
{
    [Required]
    [MaxLength(100)]
    public string Id { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [Required]
    [MaxLength(50)]
    public string Version { get; set; } = "1.0.0";

    [MaxLength(255)]
    public string EntryPoint { get; set; } = string.Empty;

    [MaxLength(500)]
    public string Description { get; set; } = string.Empty;

    public List<string> Dependencies { get; set; } = new();
    public bool IsEnabled { get; set; } = true;
    public bool IsDeprecated { get; set; }
    public int Priority { get; set; }
}

public sealed class ModuleUpdate
{
    public string ModuleId { get; set; } = string.Empty;
    public string CurrentVersion { get; set; } = string.Empty;
    public string LatestVersion { get; set; } = string.Empty;
    public bool UpdateAvailable { get; set; }
}

public sealed class FeatureFlag
{
    [Required]
    [MaxLength(100)]
    public string Key { get; set; } = string.Empty;

    public bool Enabled { get; set; }
    public string Description { get; set; } = string.Empty;
}

public sealed class MetricValue
{
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public object? Value { get; set; }
}

public sealed class SystemMetric
{
    public string Name { get; set; } = string.Empty;
    public List<MetricValue> Values { get; set; } = new();

    public double Value
    {
        get
        {
            if (Values.Count == 0)
            {
                return 0;
            }

            var latest = Values[^1].Value;
            if (latest is null)
            {
                return 0;
            }

            if (latest is double d)
            {
                return d;
            }

            if (latest is float f)
            {
                return f;
            }

            if (latest is int i)
            {
                return i;
            }

            return double.TryParse(latest.ToString(), out var parsed) ? parsed : 0;
        }
    }
}

public sealed class Recommendation
{
    public string Type { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string Priority { get; set; } = "low";
    public string Description { get; set; } = string.Empty;
}

public sealed class SystemAnalysis
{
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public List<SystemMetric> Metrics { get; set; } = new();
    public List<Recommendation> Recommendations { get; set; } = new();
}

public sealed class OptimizationAction
{
    public string Type { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string Details { get; set; } = string.Empty;
    public bool Success { get; set; }
    public string Error { get; set; } = string.Empty;
    public DateTime StartedAt { get; set; } = DateTime.UtcNow;
    public DateTime CompletedAt { get; set; } = DateTime.UtcNow;
}

public sealed class OptimizationResult
{
    public DateTime StartedAt { get; set; } = DateTime.UtcNow;
    public DateTime CompletedAt { get; set; } = DateTime.UtcNow;
    public bool Success { get; set; }
    public List<OptimizationAction> Optimizations { get; set; } = new();
}

public sealed class SelfHealRequest
{
    public string ModuleId { get; set; } = string.Empty;
    public string ErrorType { get; set; } = string.Empty;
}

public sealed class SelfHealAction
{
    public string Type { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public bool Success { get; set; }
    public string Error { get; set; } = string.Empty;
}

public sealed class SelfHealResult
{
    public string ModuleId { get; set; } = string.Empty;
    public DateTime StartedAt { get; set; } = DateTime.UtcNow;
    public DateTime CompletedAt { get; set; } = DateTime.UtcNow;
    public bool Success { get; set; }
    public string Error { get; set; } = string.Empty;
    public List<SelfHealAction> Actions { get; set; } = new();
}

public sealed class EvolutionRecord
{
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public string Type { get; set; } = string.Empty;
    public string ModuleId { get; set; } = string.Empty;
    public string Result { get; set; } = string.Empty;
    public object? Details { get; set; }
}

public sealed class SystemMetrics
{
    public List<SystemMetric> Metrics { get; set; } = new();
    public List<FeatureFlag> FeatureFlags { get; set; } = new();
    public int EvolutionCount { get; set; }
    public DateTime? LastEvolution { get; set; }
}
