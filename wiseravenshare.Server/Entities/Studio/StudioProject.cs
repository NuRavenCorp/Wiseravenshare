namespace Wiseravenshare.Server.Entities.Studio;

public sealed class StudioProject
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Type { get; set; } = "podcast"; // podcast | video | music
    public string Status { get; set; } = "draft"; // draft | recording | editing | published
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public List<StudioTrack> Tracks { get; set; } = [];
    public List<StudioEditEvent> EditHistory { get; set; } = [];
}
