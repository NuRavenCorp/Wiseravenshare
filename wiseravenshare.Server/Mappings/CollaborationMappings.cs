// Wiseravenshare.Server/Mappings/CollaborationMappings.cs
using Wiseravenshare.Server.DTOs.Collaboration;
using Wiseravenshare.Server.Entities.Collaboration;

namespace Wiseravenshare.Server.Mappings;

/// <summary>
/// Static, dependency-free entity → DTO projections used where a full async mapping
/// service (with user lookups) is unnecessary. The rich user-enriched mappings live in
/// ProjectService; these cover lightweight list/summary scenarios.
/// </summary>
public static class CollaborationMappings
{
    public static ProjectMemberDto ToDto(this ProjectMember member) => new()
    {
        Id = member.Id,
        ProjectId = member.ProjectId,
        UserId = member.UserId,
        Role = member.Role.ToString(),
        Level = member.Level.ToString(),
        JoinedAt = member.JoinedAt,
        IsActive = member.IsActive,
        RevenueSharePercentage = member.RevenueSharePercentage
    };

    public static ProjectActivityDto ToDto(this ProjectActivity activity, string actorName = "System") => new()
    {
        Id = activity.Id,
        ProjectId = activity.ProjectId,
        ActorUserId = activity.ActorUserId,
        ActorName = actorName,
        Type = activity.Type.ToString(),
        Summary = activity.Summary,
        CreatedAt = activity.CreatedAt
    };

    public static InviteDto ToDto(this CollaborationInvite invite, string projectTitle = "") => new()
    {
        Id = invite.Id,
        ProjectId = invite.ProjectId,
        ProjectTitle = projectTitle,
        InviteeEmail = invite.InviteeEmail,
        Role = invite.Role.ToString(),
        Level = invite.Level.ToString(),
        Status = invite.Status.ToString(),
        ExpiresAt = invite.ExpiresAt
    };

    public static ProjectCommentDto ToDto(this ProjectComment comment, string userName = "Unknown", string? avatar = null) => new()
    {
        Id = comment.Id,
        ProjectId = comment.ProjectId,
        ContentId = comment.ContentId,
        UserId = comment.UserId,
        UserName = userName,
        UserAvatar = avatar,
        ParentCommentId = comment.ParentCommentId,
        Text = comment.Text,
        CreatedAt = comment.CreatedAt
    };

    public static PlatformAnalyticsDto ToDto(this Entities.Collaboration.PlatformPublish publish) => new()
    {
        Platform = publish.Platform.ToString(),
        Views = publish.Views,
        Likes = publish.Likes,
        Comments = publish.Comments,
        Shares = publish.Shares,
        Engagement = publish.Engagement,
        PublishedAt = publish.PublishedAt,
        PlatformUrl = publish.PlatformUrl
    };
}
