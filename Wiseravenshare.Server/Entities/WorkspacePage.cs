namespace Wiseravenshare.Server.Entities;

/// <summary>
/// Persistent workspace page: survives session closure.
/// Used for storing scripts, subject matter, props lists, and references.
/// Tied to team and session; accessible by all team members in that session.
/// </summary>
public class WorkspacePage
{
    /// <summary>Page ID (ULID format)</summary>
    public string Id { get; set; } = null!;

    /// <summary>Session this page belongs to</summary>
    public string SessionId { get; set; } = null!;

    /// <summary>Team this page belongs to</summary>
    public string TeamId { get; set; } = null!;

    /// <summary>User who created this page</summary>
    public string CreatedByUserId { get; set; } = null!;

    /// <summary>Page type: "script", "subject-matter", "props", "references", or "custom"</summary>
    public string PageType { get; set; } = "custom";

    /// <summary>Page title (e.g., "Podcast Script - Episode 5")</summary>
    public string Title { get; set; } = null!;

    /// <summary>Page description/summary</summary>
    public string? Description { get; set; }

    /// <summary>Rich text or markdown content</summary>
    public string Content { get; set; } = string.Empty;

    /// <summary>Content version (incremented on each edit)</summary>
    public int Version { get; set; } = 1;

    /// <summary>Comma-delimited list of tag names (e.g., "episode-5,intro,outro")</summary>
    public string? Tags { get; set; }

    /// <summary>When this page was created</summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>When this page was last edited</summary>
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>User who last edited this page</summary>
    public string? LastEditedByUserId { get; set; }

    /// <summary>Is this page archived (soft delete)</summary>
    public bool IsArchived { get; set; }

    /// <summary>When this page was archived (if applicable)</summary>
    public DateTime? ArchivedAt { get; set; }

    /// <summary>JSON metadata (custom fields, formatting hints, etc.)</summary>
    public string? MetadataJson { get; set; }

    /// <summary>Navigation: Session</summary>
    public virtual PodcastSession? Session { get; set; }
}
