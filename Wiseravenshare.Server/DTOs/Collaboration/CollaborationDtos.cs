// Wiseravenshare.Server/DTOs/Collaboration/CollaborationDtos.cs
using System.ComponentModel.DataAnnotations;
using Wiseravenshare.Server.Enums;

namespace Wiseravenshare.Server.DTOs.Collaboration;

public class ProjectDto
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string Visibility { get; set; } = string.Empty;
    public Guid OwnerId { get; set; }
    public string OwnerName { get; set; } = string.Empty;
    public string? CoverImageUrl { get; set; }
    public string? BannerImageUrl { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public DateTime? PublishedAt { get; set; }
    public bool AllowComments { get; set; }
    public bool AllowSharing { get; set; }
    public bool RequireApproval { get; set; }
    public int MaxCollaborators { get; set; }
    public string RevenueShareModel { get; set; } = string.Empty;
    public IEnumerable<ProjectMemberDto> Members { get; set; } = Array.Empty<ProjectMemberDto>();
    public IEnumerable<ProjectContentDto> Content { get; set; } = Array.Empty<ProjectContentDto>();
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class ProjectMemberDto
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public Guid UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string? UserAvatar { get; set; }
    public string Role { get; set; } = string.Empty;
    public string Level { get; set; } = string.Empty;
    public DateTime JoinedAt { get; set; }
    public bool IsActive { get; set; }
    public decimal RevenueSharePercentage { get; set; }
}

public class ProjectContentDto
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public Guid? CreatedById { get; set; }
    public string CreatorName { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string? Content { get; set; }
    public string[]? MediaUrls { get; set; }
    public string Status { get; set; } = string.Empty;
    public int Version { get; set; }
    public DateTime? PublishedAt { get; set; }
    public DateTime? ReviewedAt { get; set; }
    public Guid? ReviewedById { get; set; }
    public string? ReviewNotes { get; set; }
    public bool IsPublished { get; set; }
    public int Views { get; set; }
    public int Likes { get; set; }
    public int Shares { get; set; }
    public int CommentsCount { get; set; }
    public Dictionary<string, PublishStatus> PlatformStatuses { get; set; } = new();
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class InviteDto
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public string ProjectTitle { get; set; } = string.Empty;
    public string InviteeEmail { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public string Level { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public DateTime? ExpiresAt { get; set; }
}

public class ProjectCommentDto
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public Guid? ContentId { get; set; }
    public Guid UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string? UserAvatar { get; set; }
    public Guid? ParentCommentId { get; set; }
    public string Text { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}

public class ProjectActivityDto
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public Guid? ActorUserId { get; set; }
    public string ActorName { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string Summary { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}

public class CreateProjectDto
{
    [Required, MaxLength(255)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string Description { get; set; } = string.Empty;

    [Required]
    public string Type { get; set; } = "Podcast";

    public string Visibility { get; set; } = "Private";
    public bool AllowComments { get; set; } = true;
    public bool AllowSharing { get; set; } = true;
    public bool RequireApproval { get; set; }
    public int? MaxCollaborators { get; set; }
    public string? RevenueShareModel { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public string? CoverImageUrl { get; set; }
}

public class UpdateProjectDto
{
    public string? Title { get; set; }
    public string? Description { get; set; }
    public string? Type { get; set; }
    public string? Visibility { get; set; }
    public ProjectStatus? Status { get; set; }
    public bool? AllowComments { get; set; }
    public bool? AllowSharing { get; set; }
    public bool? RequireApproval { get; set; }
    public int? MaxCollaborators { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public string? CoverImageUrl { get; set; }
    public string? BannerImageUrl { get; set; }
}

public class AddMemberDto
{
    [Required]
    public Guid UserId { get; set; }

    [Required]
    public string Role { get; set; } = "Contributor";

    public string? Level { get; set; }
    public decimal? RevenueSharePercentage { get; set; }
}

public class InviteCollaboratorDto
{
    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required]
    public string Role { get; set; } = "Contributor";

    public string? Level { get; set; }
    public string? Message { get; set; }
}

public class AddContentDto
{
    [Required]
    public string Type { get; set; } = "Article";

    [Required, MaxLength(255)]
    public string Title { get; set; } = string.Empty;

    public string? Content { get; set; }
    public string[]? MediaUrls { get; set; }
}

public class UpdateContentDto
{
    public string? Title { get; set; }
    public string? Content { get; set; }
    public string[]? MediaUrls { get; set; }
    public string? Status { get; set; }
    public string? ReviewNotes { get; set; }
}

public class AddCommentDto
{
    [Required, MaxLength(5000)]
    public string Text { get; set; } = string.Empty;
    public Guid? ContentId { get; set; }
    public Guid? ParentCommentId { get; set; }
}

public class PublishContentDto
{
    [Required]
    public Guid ContentId { get; set; }

    [Required, MinLength(1)]
    public List<SocialPlatform> Platforms { get; set; } = new();

    public Dictionary<string, object>? PlatformSettings { get; set; }
}

public class SchedulePublishDto
{
    public List<ScheduleEntry> Schedules { get; set; } = new();
}

public class ScheduleEntry
{
    public Guid ContentId { get; set; }
    public SocialPlatform Platform { get; set; }
    public DateTime ScheduledTime { get; set; }
    public Dictionary<string, object>? PlatformSettings { get; set; }
}

public class CrossPlatformAnalyticsDto
{
    public int TotalViews { get; set; }
    public int TotalLikes { get; set; }
    public int TotalComments { get; set; }
    public int TotalShares { get; set; }
    public int TotalEngagement { get; set; }
    public Dictionary<string, PlatformAnalyticsDto> Platforms { get; set; } = new();
}

public class PlatformAnalyticsDto
{
    public string Platform { get; set; } = string.Empty;
    public int Views { get; set; }
    public int Likes { get; set; }
    public int Comments { get; set; }
    public int Shares { get; set; }
    public int Engagement { get; set; }
    public DateTime? PublishedAt { get; set; }
    public string? PlatformUrl { get; set; }
}

public class ErrorResponse
{
    public string Error { get; set; } = string.Empty;
    public string? Message { get; set; }
    public string? Details { get; set; }
    public string? CorrelationId { get; set; }
}
