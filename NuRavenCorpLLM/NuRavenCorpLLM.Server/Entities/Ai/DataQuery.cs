// Core/Entities/Ai/DataQuery.cs
using System.Text.Json;

namespace NuRavenCorpLLM.Entities.Ai;

public class DataQuery : BaseEntity
{
    public Guid UserId { get; set; }
    public Guid? ConversationId { get; set; }

    public string Prompt { get; set; } = string.Empty;
    public string Intent { get; set; } = "unknown";

    // Sources the LLM decided to consult
    public string[]? Sources { get; set; }

    // Extracted filters
    public JsonDocument? Filters { get; set; }

    // Full results
    public JsonDocument? Result { get; set; }

    // Organized output
    public JsonDocument? OutputBlocks { get; set; }   // metrics | chart | table | timeline | cards | text

    public int LatencyMs { get; set; }
    public int TokenUsage { get; set; }
    public int RowsReturned { get; set; }
    public DataQueryStatus Status { get; set; } = DataQueryStatus.Complete;
}

public enum DataQueryStatus { Complete, Partial, Failed, Timeout }