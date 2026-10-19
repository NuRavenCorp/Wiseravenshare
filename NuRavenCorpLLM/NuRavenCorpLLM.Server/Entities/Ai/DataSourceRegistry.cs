// Core/Entities/Ai/DataSourceRegistry.cs
using System.Text.Json;
using System.ComponentModel.DataAnnotations;

namespace NuRavenCorpLLM.Entities.Ai;

public class DataSourceRegistry : BaseEntity
{
    [MaxLength(80)]
    public string Key { get; set; } = string.Empty;      // "posts", "videos", "radio", "podcasts", "planner", "currency", "truth", "collaboration"

    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string? Description { get; set; }

    [MaxLength(100)]
    public string Category { get; set; } = "content";     // content | user | system | analytics | finance

    public string[]? Capabilities { get; set; }            // ["count","trend","top","compare","time_series"]
    public string[]? Metrics { get; set; }
    public string[]? Dimensions { get; set; }

    public JsonDocument? SchemaHint { get; set; }
    public bool IsEnabled { get; set; } = true;
}