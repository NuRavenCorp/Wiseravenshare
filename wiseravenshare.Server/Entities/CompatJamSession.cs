namespace Wiseravenshare.Server.Entities;

public sealed class CompatJamSession
{
    public string Id { get; set; } = string.Empty;
    public string CreatedById { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Title { get; set; } = string.Empty;
    public string ParticipantsJson { get; set; } = "[]";
    public string SignupIdsJson { get; set; } = "[]";
    public string? ScheduledDateRaw { get; set; }
    public string? StartedAtRaw { get; set; }
    public int Bpm { get; set; } = 120;
    public string Status { get; set; } = "active";
    public int? MaxParticipants { get; set; }
    public string TrackUrisJson { get; set; } = "[]";
    public DateTime CreatedDate { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedDate { get; set; } = DateTime.UtcNow;
}
