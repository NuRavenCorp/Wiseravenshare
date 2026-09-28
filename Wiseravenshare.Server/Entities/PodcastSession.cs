namespace Wiseravenshare.Server.Entities;

/// <summary>
/// Represents a Podcast Studio session shared across team members and devices.
/// Sessions are persistent: they remain active until explicitly closed by a team owner,
/// and all devices connected to the session share state without auth interruption.
/// </summary>
public class PodcastSession
{
    /// <summary>Session ID (ULID format for sortability and uniqueness)</summary>
    public string Id { get; set; } = null!;

    /// <summary>Team this session belongs to</summary>
    public string TeamId { get; set; } = null!;

    /// <summary>User who initiated this session</summary>
    public string InitiatedByUserId { get; set; } = null!;

    /// <summary>
    /// Session status: "active", "closing", "closed"
    /// "active" = working. "closing" = grace period for token refresh.
    /// "closed" = session ended, no more access.
    /// </summary>
    public string Status { get; set; } = "active";

    /// <summary>
    /// Access scope: "team" (all team members) or "device-restricted" (specific members + devices)
    /// </summary>
    public string AccessScope { get; set; } = "team";

    /// <summary>Timestamp when session was created</summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Timestamp when session was closed. NULL = session still active.
    /// Used for audit and cleanup queries.
    /// </summary>
    public DateTime? ClosedAt { get; set; }

    /// <summary>
    /// Session-level state (JSON): active recording, shared script references, etc.
    /// Synced to all connected devices. Clients append device-specific changes.
    /// </summary>
    public string? StateJson { get; set; }

    /// <summary>Version counter for optimistic concurrency on StateJson</summary>
    public int StateVersion { get; set; } = 0;

    /// <summary>Comma-delimited list of user IDs allowed in this session (if access_scope = "device-restricted")</summary>
    public string? AllowedUserIds { get; set; }

    /// <summary>Navigation: Connected devices in this session</summary>
    public virtual List<PodcastSessionDevice> Devices { get; set; } = new();
}
