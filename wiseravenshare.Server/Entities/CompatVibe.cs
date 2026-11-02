namespace Wiseravenshare.Server.Entities;

public sealed class CompatVibe
{
    public string Id { get; set; } = string.Empty;
    public string CreatedById { get; set; } = string.Empty;
    public string Mood { get; set; } = string.Empty;
    public string? Note { get; set; }
    public DateTime CreatedDate { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedDate { get; set; } = DateTime.UtcNow;
}
