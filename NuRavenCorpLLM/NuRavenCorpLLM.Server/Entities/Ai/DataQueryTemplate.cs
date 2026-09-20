// Core/Entities/Ai/DataQueryTemplate.cs
using System.Text.Json;
using System.ComponentModel.DataAnnotations;

namespace NuRavenCorpLLM.Entities.Ai;

public class DataQueryTemplate : BaseEntity
{
    [MaxLength(200)]
    public string Title { get; set; } = string.Empty;

    public string Prompt { get; set; } = string.Empty;
    public string? Description { get; set; }

    [MaxLength(50)]
    public string Category { get; set; } = "general";

    public string[]? Sources { get; set; }
    public int SortOrder { get; set; }
}