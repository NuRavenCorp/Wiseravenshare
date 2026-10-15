using System.ComponentModel.DataAnnotations;
using Wiseravenshare.Server.Enums;
using System.Text.Json;
using Wiseravenshare.Server.Entities;

namespace Wiseravenshare.Server.Entities.Collaboration;

public class Project : BaseEntity
{
    [MaxLength(255)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string Description { get; set; } = string.Empty;

    public ProjectType Type { get; set; }
    public ProjectStatus Status { get; set; } = ProjectStatus.Draft;
    public ProjectVisibility Visibility { get; set; } = ProjectVisibility.Private;

    public Guid OwnerId { get; set; }
    public string? CoverImageUrl { get; set; }
    public string? BannerImageUrl { get; set; }

    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public DateTime? PublishedAt { get; set; }

    // Collaboration settings
    public bool AllowComments { get; set; } = true;
    public bool AllowSharing { get; set; } = true;
    public bool RequireApproval { get; set; }
    public int MaxCollaborators { get; set; } = 10;

    // Revenue sharing
    public RevenueShareModel RevenueShareModel { get; set; } = RevenueShareModel.Equal;
    public JsonDocument? RevenueShareConfig { get; set; }

    // Cross-platform publishing
    public JsonDocument? PublishSettings { get; set; }
    public JsonDocument? PlatformSchedule { get; set; }

    // Navigation Properties
    public virtual User Owner { get; set; } = null!;
    public virtual ICollection<ProjectMember> Members { get; set; } = new List<ProjectMember>();
    public virtual ICollection<ProjectContent> Content { get; set; } = new List<ProjectContent>();
    public virtual ICollection<PlatformPublish> Publications { get; set; } = new List<PlatformPublish>();
    public virtual ICollection<CollaborationInvite> Invites { get; set; } = new List<CollaborationInvite>();
    public virtual ICollection<ProjectComment> Comments { get; set; } = new List<ProjectComment>();
    public virtual ICollection<ProjectActivity> Activities { get; set; } = new List<ProjectActivity>();
}
