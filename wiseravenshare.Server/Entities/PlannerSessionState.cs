namespace Wiseravenshare.Server.Entities;

/// <summary>
/// Stores per-user planner UI state so the session survives navigation and re-login.
/// </summary>
public sealed class PlannerSessionState : BaseEntity
{
    public Guid UserId { get; set; }

    /// <summary>FullCalendar view id, e.g. timeGridDay / timeGridWeek / dayGridMonth.</summary>
    public string CurrentView { get; set; } = "timeGridDay";

    /// <summary>Calendar focus date in UTC.</summary>
    public DateTime? FocusDateUtc { get; set; }

    /// <summary>Serialized draft payload for unsaved planner modal state.</summary>
    public string? DraftJson { get; set; }

    /// <summary>Whether the draft modal was open when state was last saved.</summary>
    public bool ModalOpen { get; set; }

    public User? User { get; set; }
}
