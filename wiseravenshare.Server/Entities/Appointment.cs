using System.ComponentModel.DataAnnotations;

namespace Wiseravenshare.Server.Entities;

/// <summary>
/// A calendar appointment belonging to a single user.
/// All times are stored in UTC; the frontend converts to local time.
/// </summary>
public class Appointment : BaseEntity
{
    public Guid UserId { get; set; }
    public virtual User User { get; set; } = null!;

    [MaxLength(255)]
    public string Title { get; set; } = string.Empty;

    public string? Description { get; set; }

    /// <summary>Appointment start time, always UTC.</summary>
    public DateTime StartUtc { get; set; }

    /// <summary>Appointment end time, always UTC.</summary>
    public DateTime EndUtc { get; set; }

    /// <summary>How many minutes before <see cref="StartUtc"/> to fire the alert.</summary>
    public int ReminderMinutesBefore { get; set; } = 15;

    /// <summary>True once the user has dismissed the alert for this appointment.</summary>
    public bool AlertDismissed { get; set; }

    /// <summary>Hex colour used to colour-code the event in FullCalendar (#rrggbb).</summary>
    [MaxLength(20)]
    public string Color { get; set; } = "#3788d8";
}
