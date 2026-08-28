using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Wiseravenshare.Server.Enums;
using System.Text.Json;
using Wiseravenshare.Server.Entities;

namespace Wiseravenshare.Server.Entities.Collaboration;

public class ProjectMember : BaseEntity
{
    public Guid ProjectId { get; set; }
    public Guid UserId { get; set; }
    public ProjectRole Role { get; set; } = ProjectRole.Contributor;
    public ProjectRoleLevel Level { get; set; } = ProjectRoleLevel.Junior;
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LeftAt { get; set; }
    public bool IsActive { get; set; } = true;

    [Column(TypeName = "numeric(5,2)")]
    public decimal RevenueSharePercentage { get; set; }

    public JsonDocument? Permissions { get; set; }
    public JsonDocument? Metadata { get; set; }

    public virtual Project Project { get; set; } = null!;
    public virtual User User { get; set; } = null!;
}

public class CollaborationInvite : BaseEntity
{
    public Guid ProjectId { get; set; }
    public Guid InviterId { get; set; }

    [MaxLength(255)]
    public string InviteeEmail { get; set; } = string.Empty;

    public ProjectRole Role { get; set; } = ProjectRole.Contributor;
    public ProjectRoleLevel Level { get; set; } = ProjectRoleLevel.Junior;

    [MaxLength(2000)]
    public string? Message { get; set; }

    public InviteStatus Status { get; set; } = InviteStatus.Pending;
    public DateTime? ExpiresAt { get; set; }
    public DateTime? RespondedAt { get; set; }

    public virtual Project Project { get; set; } = null!;
    public virtual User Inviter { get; set; } = null!;
}

public class ProjectComment : BaseEntity
{
    public Guid ProjectId { get; set; }
    public Guid? ContentId { get; set; }
    public Guid UserId { get; set; }
    public Guid? ParentCommentId { get; set; }

    [MaxLength(5000)]
    public string Text { get; set; } = string.Empty;

    public virtual Project Project { get; set; } = null!;
    public virtual ProjectContent? Content { get; set; }
    public virtual User User { get; set; } = null!;
    public virtual ProjectComment? ParentComment { get; set; }
    public virtual ICollection<ProjectComment> Replies { get; set; } = new List<ProjectComment>();
}

public class ProjectActivity : BaseEntity
{
    public Guid ProjectId { get; set; }
    public Guid? ActorUserId { get; set; }
    public ActivityType Type { get; set; }

    [MaxLength(1000)]
    public string Summary { get; set; } = string.Empty;

    public System.Text.Json.JsonDocument? Data { get; set; }

    public virtual Project Project { get; set; } = null!;
    public virtual User? ActorUser { get; set; }
}
