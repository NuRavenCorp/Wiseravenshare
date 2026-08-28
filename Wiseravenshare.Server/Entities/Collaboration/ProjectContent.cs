using System.ComponentModel.DataAnnotations;
using Wiseravenshare.Server.Enums;
using System.Text.Json;
using Wiseravenshare.Server.Entities;

namespace Wiseravenshare.Server.Entities.Collaboration;

public class ProjectContent : BaseEntity
{
    public Guid ProjectId { get; set; }
    public Guid? CreatedById { get; set; }
    public ContentType Type { get; set; }

    [MaxLength(255)]
    public string Title { get; set; } = string.Empty;

    public string? Content { get; set; }
    public string? MediaUrl { get; set; }
    public string[]? MediaUrls { get; set; }
    public JsonDocument? Metadata { get; set; }

    public ContentStatus Status { get; set; } = ContentStatus.Draft;
    public int Version { get; set; } = 1;
    public DateTime? PublishedAt { get; set; }
    public DateTime? ReviewedAt { get; set; }
    public Guid? ReviewedById { get; set; }
    public string? ReviewNotes { get; set; }

    // Publishing tracking
    public bool IsPublished { get; set; }
    public JsonDocument? PublishMetadata { get; set; }

    // Analytics
    public int Views { get; set; }
    public int Likes { get; set; }
    public int Shares { get; set; }
    public int CommentsCount { get; set; }
    public JsonDocument? PlatformAnalytics { get; set; }

    // Navigation Properties
    public virtual Project Project { get; set; } = null!;
    public virtual User? CreatedBy { get; set; }
    public virtual User? ReviewedBy { get; set; }
    public virtual ICollection<PlatformPublish> Publications { get; set; } = new List<PlatformPublish>();
    public virtual ICollection<ProjectContentVersion> Versions { get; set; } = new List<ProjectContentVersion>();
}

/// <summary>Immutable snapshot of a content edit for version history.</summary>
public class ProjectContentVersion : BaseEntity
{
    public Guid ContentId { get; set; }
    public int VersionNumber { get; set; }

    [MaxLength(255)]
    public string Title { get; set; } = string.Empty;

    public string? Content { get; set; }
    public string[]? MediaUrls { get; set; }
    public Guid? EditedById { get; set; }
    public string? ChangeNotes { get; set; }

    public virtual ProjectContent ContentEntity { get; set; } = null!;
    public virtual User? EditedBy { get; set; }
}
