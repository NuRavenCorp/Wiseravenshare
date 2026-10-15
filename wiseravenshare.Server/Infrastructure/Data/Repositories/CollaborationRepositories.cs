// Wiseravenshare.Server/Infrastructure/Data/Repositories/CollaborationRepositories.cs
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities.Collaboration;
using Wiseravenshare.Server.Entities.Roles;
using Wiseravenshare.Server.Enums;
using UserRole = Wiseravenshare.Server.Entities.Roles.UserRole;
using Wiseravenshare.Server.Interfaces.Repositories;

namespace Wiseravenshare.Server.Infrastructure.Data.Repositories;

public class ProjectRepository : Repository<Project>, IProjectRepository
{
    public ProjectRepository(AppDbContext context) : base(context) { }

    public async Task<IEnumerable<Project>> GetProjectsForUserAsync(Guid userId, int page = 1, int pageSize = 50)
    {
        var memberProjectIds = _context.ProjectMembers
            .Where(m => m.UserId == userId && m.IsActive && !m.IsDeleted)
            .Select(m => m.ProjectId);

        return await _dbSet.AsNoTracking()
            .Where(p => !p.IsDeleted &&
                (p.OwnerId == userId ||
                 memberProjectIds.Contains(p.Id) ||
                 p.Visibility == ProjectVisibility.Public))
            .OrderByDescending(p => p.UpdatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();
    }

    public async Task<IEnumerable<Project>> GetPublicProjectsAsync(int page = 1, int pageSize = 50)
        => await _dbSet.AsNoTracking()
            .Where(p => !p.IsDeleted && p.Visibility == ProjectVisibility.Public)
            .OrderByDescending(p => p.PublishedAt ?? p.UpdatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

    public async Task<bool> IsUserMemberAsync(Guid projectId, Guid userId)
        => await _context.ProjectMembers
            .AnyAsync(m => m.ProjectId == projectId && m.UserId == userId && m.IsActive && !m.IsDeleted);

    public async Task<ProjectRole?> GetUserProjectRoleAsync(Guid projectId, Guid userId)
    {
        var member = await _context.ProjectMembers
            .AsNoTracking()
            .FirstOrDefaultAsync(m => m.ProjectId == projectId && m.UserId == userId && m.IsActive && !m.IsDeleted);
        return member?.Role;
    }
}

public class ProjectMemberRepository : Repository<ProjectMember>, IProjectMemberRepository
{
    public ProjectMemberRepository(AppDbContext context) : base(context) { }

    public async Task<IEnumerable<ProjectMember>> GetActiveMembersAsync(Guid projectId)
        => await _dbSet.AsNoTracking()
            .Where(m => m.ProjectId == projectId && m.IsActive && !m.IsDeleted)
            .ToListAsync();

    public async Task<ProjectMember?> GetMemberAsync(Guid projectId, Guid userId)
        => await _dbSet.FirstOrDefaultAsync(m => m.ProjectId == projectId && m.UserId == userId && !m.IsDeleted);
}

public class ProjectContentRepository : Repository<ProjectContent>, IProjectContentRepository
{
    public ProjectContentRepository(AppDbContext context) : base(context) { }

    public async Task<IEnumerable<ProjectContent>> GetProjectContentAsync(Guid projectId, bool includeDeleted = false)
        => await _dbSet.AsNoTracking()
            .Where(c => c.ProjectId == projectId && (includeDeleted || !c.IsDeleted))
            .OrderByDescending(c => c.UpdatedAt)
            .ToListAsync();

    public async Task<int> GetNextVersionNumberAsync(Guid contentId)
    {
        var max = await _context.ProjectContentVersions
            .Where(v => v.ContentId == contentId)
            .Select(v => (int?)v.VersionNumber)
            .MaxAsync();
        return (max ?? 0) + 1;
    }

    public async Task<IEnumerable<ProjectContentVersion>> GetVersionsAsync(Guid contentId)
        => await _context.ProjectContentVersions
            .AsNoTracking()
            .Where(v => v.ContentId == contentId)
            .OrderByDescending(v => v.VersionNumber)
            .ToListAsync();

    public async Task<ProjectContentVersion> AddVersionAsync(ProjectContentVersion version)
    {
        version.CreatedAt = DateTime.UtcNow;
        version.UpdatedAt = DateTime.UtcNow;
        _context.ProjectContentVersions.Add(version);
        await _context.SaveChangesAsync();
        return version;
    }
}

public class CollaborationInviteRepository : Repository<CollaborationInvite>, ICollaborationInviteRepository
{
    public CollaborationInviteRepository(AppDbContext context) : base(context) { }

    public async Task<IEnumerable<CollaborationInvite>> GetPendingInvitesForUserAsync(string email)
        => await _dbSet.AsNoTracking()
            .Where(i => i.InviteeEmail == email.Trim().ToLowerInvariant()
                && i.Status == InviteStatus.Pending && !i.IsDeleted)
            .ToListAsync();

    public async Task<CollaborationInvite?> GetActiveInviteAsync(Guid projectId, string email)
        => await _dbSet.FirstOrDefaultAsync(i => i.ProjectId == projectId
            && i.InviteeEmail == email.Trim().ToLowerInvariant()
            && i.Status == InviteStatus.Pending
            && !i.IsDeleted);
}

public class PlatformPublishRepository : Repository<PlatformPublish>, IPlatformPublishRepository
{
    public PlatformPublishRepository(AppDbContext context) : base(context) { }

    public async Task<IEnumerable<PlatformPublish>> GetByContentAsync(Guid contentId)
        => await _dbSet.AsNoTracking()
            .Where(p => p.ContentId == contentId && !p.IsDeleted)
            .ToListAsync();

    public async Task<IEnumerable<PlatformPublish>> GetDueScheduledAsync(DateTime utcNow, int max = 100)
        => await _dbSet
            .Where(p => p.Status == PublishStatus.Scheduled && p.ScheduledAt <= utcNow && !p.IsDeleted)
            .OrderBy(p => p.ScheduledAt)
            .Take(max)
            .ToListAsync();

    public async Task<PlatformPublish?> GetLatestForPlatformAsync(Guid contentId, SocialPlatform platform)
        => await _dbSet.AsNoTracking()
            .Where(p => p.ContentId == contentId && p.Platform == platform && !p.IsDeleted)
            .OrderByDescending(p => p.CreatedAt)
            .FirstOrDefaultAsync();
}

public class UserRoleRepository : Repository<UserRole>, IUserRoleRepository
{
    public UserRoleRepository(AppDbContext context) : base(context) { }

    public async Task<IEnumerable<UserRole>> GetRolesForUserAsync(Guid userId, Guid? projectId = null)
    {
        var query = _context.UserRoleAssignments
            .Where(a => a.UserId == userId && a.IsActive && !a.IsDeleted);

        if (projectId.HasValue)
            query = query.Where(a => a.ProjectId == projectId.Value || a.ProjectId == null);

        var roleIds = await query.Select(a => a.RoleId).Distinct().ToListAsync();
        return await _dbSet.AsNoTracking()
            .Where(r => roleIds.Contains(r.Id) && r.IsActive && !r.IsDeleted)
            .ToListAsync();
    }

    public async Task<UserRole?> GetByNameAsync(string name)
        => await _dbSet.AsNoTracking().FirstOrDefaultAsync(r => r.Name == name && !r.IsDeleted);

    public async Task<bool> UserHasPermissionAsync(Guid userId, string resourceType, PermissionAction action, Guid? projectId = null)
    {
        var roles = await GetRolesForUserAsync(userId, projectId);
        if (!roles.Any()) return false;

        var roleIds = roles.Select(r => r.Id).ToList();
        return await _context.RolePermissions
            .AnyAsync(p => roleIds.Contains(p.RoleId)
                && p.IsAllowed
                && !p.IsDeleted
                && p.ResourceType == resourceType
                && p.Action == action);
    }
}
