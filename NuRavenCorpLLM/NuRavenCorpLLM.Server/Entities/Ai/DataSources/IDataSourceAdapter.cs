// Application/Services/Ai/DataSources/IDataSourceAdapter.cs
using System.Text.Json;

namespace NuRavenCorpLLM.Entities.Ai.DataSources;

public interface IDataSourceAdapter
{
    string Key { get; }
    string DisplayName { get; }
    string[] Capabilities { get; }
    string[] Metrics { get; }
    string[] Dimensions { get; }

    Task<DataResult> QueryAsync(DataQuerySpec spec, CancellationToken ct = default);
}

public class DataQuerySpec
{
    public string Intent { get; set; } = "count";          // count | top | trend | time_series | compare | distribution | latest | aggregate
    public Guid? UserId { get; set; }
    public DateTime? From { get; set; }
    public DateTime? To { get; set; }
    public string? Dimension { get; set; }                  // "day" | "user" | "category" | "platform" | "region"
    public string? Metric { get; set; }
    public int Limit { get; set; } = 20;
    public JsonDocument? Filters { get; set; }
    public string? FreeText { get; set; }
}

public class DataResult
{
    public string SourceKey { get; set; } = string.Empty;
    public string? Metric { get; set; }
    public string? Dimension { get; set; }
    public decimal? Total { get; set; }
    public List<DataPoint> Points { get; set; } = new();
    public List<Dictionary<string, object>> Rows { get; set; } = new();
    public string? Summary { get; set; }
    public int RowsReturned { get; set; }
    public TimeSpan Elapsed { get; set; }
}

public record DataPoint(string Label, decimal Value, string? Extra = null);