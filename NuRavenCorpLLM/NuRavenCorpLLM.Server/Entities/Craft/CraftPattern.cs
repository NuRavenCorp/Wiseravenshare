using System.ComponentModel.DataAnnotations;

namespace NuRavenCorpLLM.Entities.Craft;

public class CraftPattern : BaseEntity
{
    [MaxLength(100)]
    public string DomainKey { get; set; } = string.Empty;

    [MaxLength(300)]
    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;
    public string? Evidence { get; set; }
    public string? Example { get; set; }
    public string? CounterExample { get; set; }
    public decimal Confidence { get; set; } = 0.5m;
    public int SampleSize { get; set; }
}