// Wiseravenshare.Server/Interfaces/Services/CollaborationServices.cs
using Wiseravenshare.Server.DTOs.Collaboration;
using Wiseravenshare.Server.Entities.Collaboration;
using Wiseravenshare.Server.Enums;
using Wiseravenshare.Server.Services.Publishing;

namespace Wiseravenshare.Server.Interfaces.Services;

public interface IProjectService
{
    Task<ProjectDto> CreateProjectAsync(CreateProjectDto dto, Guid userId);
    Task<ProjectDto> GetProjectAsync(Guid projectId, Guid userId);
    Task<ProjectDto> UpdateProjectAsync(Guid projectId, UpdateProjectDto dto, Guid userId);
    Task<bool> DeleteProjectAsync(Guid projectId, Guid userId);
    Task<IEnumerable<ProjectDto>> GetUserProjectsAsync(Guid userId, int page = 1, int pageSize = 50);
    Task<ProjectMemberDto> AddMemberAsync(Guid projectId, AddMemberDto dto, Guid userId);
    Task<bool> RemoveMemberAsync(Guid projectId, Guid memberId, Guid userId);
    Task<ProjectMemberDto> UpdateMemberRoleAsync(Guid projectId, Guid memberId, ProjectRole role, Guid userId);
    Task<InviteDto> InviteCollaboratorAsync(Guid projectId, InviteCollaboratorDto dto, Guid userId);
    Task<bool> AcceptInviteAsync(Guid inviteId, Guid userId);
    Task<bool> DeclineInviteAsync(Guid inviteId, Guid userId);
    Task<IEnumerable<ProjectMemberDto>> GetProjectMembersAsync(Guid projectId);
    Task<ProjectContentDto> AddContentAsync(Guid projectId, AddContentDto dto, Guid userId);
    Task<ProjectContentDto> UpdateContentAsync(Guid contentId, UpdateContentDto dto, Guid userId);
    Task<bool> DeleteContentAsync(Guid contentId, Guid userId);
    Task<IEnumerable<ProjectContentDto>> GetProjectContentAsync(Guid projectId);
    Task<ProjectCommentDto> AddCommentAsync(Guid projectId, AddCommentDto dto, Guid userId);
    Task<IEnumerable<ProjectActivityDto>> GetProjectActivityAsync(Guid projectId, int page = 1, int pageSize = 50);
}

public interface IPlatformPublishService
{
    Task<PlatformPublish> PublishToPlatformAsync(Guid contentId, SocialPlatform platform, Dictionary<string, object>? platformSettings = null);
    Task<PlatformPublish> SchedulePublishAsync(Guid contentId, SocialPlatform platform, DateTime scheduledTime, Dictionary<string, object>? platformSettings = null);
    Task<bool> UpdatePublishStatusAsync(Guid publishId, PublishStatus status, string? errorMessage = null);
    Task<PlatformPublish> GetPublishStatusAsync(Guid publishId);
    Task<IEnumerable<PlatformPublish>> GetPlatformPublishesAsync(Guid contentId);
    Task<Dictionary<SocialPlatform, PublishStatus>> GetPublishStatusForAllPlatformsAsync(Guid contentId);
    Task<bool> RetryPublishAsync(Guid publishId);
    Task<bool> CancelPublishAsync(Guid publishId);
    Task<CrossPlatformAnalytics> GetCrossPlatformAnalyticsAsync(Guid contentId);
    /// <summary>Processes due scheduled publishes. Called by the background worker.</summary>
    Task<int> ProcessScheduledPublishesAsync(CancellationToken cancellationToken = default);
}

public interface ICollaborationNotificationService
{
    Task NotifyMemberAddedAsync(Guid projectId, Guid userId, ProjectRole role);
    Task NotifyContentPublishedAsync(Guid projectId, Guid contentId, SocialPlatform platform);
    Task NotifyProjectUpdatedAsync(Guid projectId, string summary);
}
