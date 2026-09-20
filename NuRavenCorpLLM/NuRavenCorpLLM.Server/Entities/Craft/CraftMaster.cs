// Core/Entities/Craft/CraftMaster.cs
using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace NuRavenCorpLLM.Entities.Craft;

public class CraftMaster : BaseEntity
{
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    public string[]? Domains { get; set; }                        // journalism, podcast, etc.

    [MaxLength(500)]
    public string? Bio { get; set; }

    [MaxLength(2000)]
    public string? SignatureStyle { get; set; }

    public string[]? NotableWorks { get; set; }
    public string[]? Techniques { get; set; }

    public JsonDocument? Analysis { get; set; }
    public float[]? StyleEmbedding { get; set; }
}