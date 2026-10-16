namespace Wiseravenshare.Server.Entities.Studio;

public sealed class StudioEditEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ProjectId { get; set; }
    public StudioProject Project { get; set; } = null!;
    public string ActionType { get; set; } = string.Empty; // add_track | remove_track | update_track | update_fx | reorder
    public string Description { get; set; } = string.Empty;
    public string? BeforeJson { get; set; }
    public string? AfterJson { get; set; }
    public bool IsUndone { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
