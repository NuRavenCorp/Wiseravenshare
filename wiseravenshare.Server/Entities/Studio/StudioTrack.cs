namespace Wiseravenshare.Server.Entities.Studio;

public sealed class StudioTrack
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ProjectId { get; set; }
    public StudioProject Project { get; set; } = null!;
    public string Name { get; set; } = "Track";
    public string Type { get; set; } = "audio"; // audio | video | music
    public string? BlobUrl { get; set; }
    public int OrderIndex { get; set; }
    public float Volume { get; set; } = 1f;
    public float Pan { get; set; } = 0f;
    public bool Muted { get; set; }
    public bool Soloed { get; set; }
    public string? FxChainJson { get; set; } // serialized effects settings
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
