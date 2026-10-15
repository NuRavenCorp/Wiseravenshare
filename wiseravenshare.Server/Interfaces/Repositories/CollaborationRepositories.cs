// Wiseravenshare.Server/Interfaces/Repositories/CollaborationRepositories.cs
using Wiseravenshare.Server.Entities.Collaboration;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Entities.Roles;
using Wiseravenshare.Server.Enums;
using UserRole = Wiseravenshare.Server.Entities.Roles.UserRole;

namespace Wiseravenshare.Server.Interfaces.Repositories;

public interface IProjectRepository : IRepository<Project>
{
    Task<IEnumerable<Project>> GetProjectsForUserAsync(Guid userId, int page = 1, int pageSize = 50);
    Task<IEnumerable<Project>> GetPublicProjectsAsync(int page = 1, int pageSize = 50);
    Task<bool> IsUserMemberAsync(Guid projectId, Guid userId);
    Task<ProjectRole?> GetUserProjectRoleAsync(Guid projectId, Guid userId);
}

public interface IProjectMemberRepository : IRepository<ProjectMember>
{
    Task<IEnumerable<ProjectMember>> GetActiveMembersAsync(Guid projectId);
    Task<ProjectMember?> GetMemberAsync(Guid projectId, Guid userId);
}

public interface IProjectContentRepository : IRepository<ProjectContent>
{
    Task<IEnumerable<ProjectContent>> GetProjectContentAsync(Guid projectId, bool includeDeleted = false);
    Task<int> GetNextVersionNumberAsync(Guid contentId);
    Task<IEnumerable<ProjectContentVersion>> GetVersionsAsync(Guid contentId);
    Task<ProjectContentVersion> AddVersionAsync(ProjectContentVersion version);
}

public interface ICollaborationInviteRepository : IRepository<CollaborationInvite>
{
    Task<IEnumerable<CollaborationInvite>> GetPendingInvitesForUserAsync(string email);
    Task<CollaborationInvite?> GetActiveInviteAsync(Guid projectId, string email);
}

public interface IPlatformPublishRepository : IRepository<PlatformPublish>
{
    Task<IEnumerable<PlatformPublish>> GetByContentAsync(Guid contentId);
    Task<IEnumerable<PlatformPublish>> GetDueScheduledAsync(DateTime utcNow, int max = 100);
    Task<PlatformPublish?> GetLatestForPlatformAsync(Guid contentId, SocialPlatform platform);
}

public interface IUserRoleRepository : IRepository<UserRole>
{
    Task<IEnumerable<UserRole>> GetRolesForUserAsync(Guid userId, Guid? projectId = null);
    Task<UserRole?> GetByNameAsync(string name);
    Task<bool> UserHasPermissionAsync(Guid userId, string resourceType, PermissionAction action, Guid? projectId = null);
}
