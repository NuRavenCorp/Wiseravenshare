// Wiseravenshare.Server/Entities/Collaboration/PlatformPublish.cs
using System.Text.Json;
using Wiseravenshare.Server.Entities;

namespace Wiseravenshare.Server.Entities.Collaboration;

public class PlatformPublish : BaseEntity
{
    public Guid ProjectId { get; set; }
    public Guid ContentId { get; set; }
    public SocialPlatform Platform { get; set; }
    public PublishStatus Status { get; set; } = PublishStatus.Pending;
    public DateTime ScheduledAt { get; set; }
    public DateTime? PublishedAt { get; set; }
    public string? PlatformPostId { get; set; }
    public string? PlatformUrl { get; set; }
    public JsonDocument? PlatformMetadata { get; set; }
    public JsonDocument? PlatformResponse { get; set; }
    public int RetryCount { get; set; }
    public string? ErrorMessage { get; set; }
    public JsonDocument? Analytics { get; set; }

    // Platform-specific content
    public string? PlatformTitle { get; set; }
    public string? PlatformDescription { get; set; }
    public string[]? PlatformTags { get; set; }
    public string? ThumbnailUrl { get; set; }
    public JsonDocument? PlatformSettings { get; set; }

    // Performance metrics
    public int Views { get; set; }
    public int Likes { get; set; }
    public int Comments { get; set; }
    public int Shares { get; set; }
    public int Engagement { get; set; }
    public JsonDocument? PerformanceMetrics { get; set; }

    // Navigation Properties
    public virtual Project Project { get; set; } = null!;
    public virtual ProjectContent Content { get; set; } = null!;
}
