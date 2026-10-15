// Wiseravenshare.Server/Services/Collaboration/ProjectService.cs
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.DTOs.Collaboration;
using Wiseravenshare.Server.Entities.Collaboration;
using Wiseravenshare.Server.Enums;
using Wiseravenshare.Server.Exceptions;
using Wiseravenshare.Server.Interfaces.Repositories;
using Wiseravenshare.Server.Interfaces.Services;

namespace Wiseravenshare.Server.Services.Collaboration;

public class ProjectService : IProjectService
{
    private readonly IProjectRepository _projectRepository;
    private readonly IProjectMemberRepository _memberRepository;
    private readonly IProjectContentRepository _contentRepository;
    private readonly ICollaborationInviteRepository _inviteRepository;
    private readonly IUserRepository _userRepository;
    private readonly IRepository<ProjectActivity> _activityRepository;
    private readonly IRepository<ProjectComment> _commentRepository;
    private readonly ICollaborationNotificationService _notifications;
    private readonly ILogger<ProjectService> _logger;

    public ProjectService(
        IProjectRepository projectRepository,
        IProjectMemberRepository memberRepository,
        IProjectContentRepository contentRepository,
        ICollaborationInviteRepository inviteRepository,
        IUserRepository userRepository,
        IRepository<ProjectActivity> activityRepository,
        IRepository<ProjectComment> commentRepository,
        ICollaborationNotificationService notifications,
        ILogger<ProjectService> logger)
    {
        _projectRepository = projectRepository;
        _memberRepository = memberRepository;
        _contentRepository = contentRepository;
        _inviteRepository = inviteRepository;
        _userRepository = userRepository;
        _activityRepository = activityRepository;
        _commentRepository = commentRepository;
        _notifications = notifications;
        _logger = logger;
    }

    public async Task<ProjectDto> CreateProjectAsync(CreateProjectDto dto, Guid userId)
    {
        var project = new Project
        {
            Title = dto.Title,
            Description = dto.Description ?? string.Empty,
            Type = ParseEnum<ProjectType>(dto.Type, ProjectType.Podcast),
            Visibility = ParseEnum<ProjectVisibility>(dto.Visibility, ProjectVisibility.Private),
            OwnerId = userId,
            Status = ProjectStatus.Draft,
            AllowComments = dto.AllowComments,
            AllowSharing = dto.AllowSharing,
            RequireApproval = dto.RequireApproval,
            MaxCollaborators = dto.MaxCollaborators ?? 10,
            RevenueShareModel = ParseEnum<RevenueShareModel>(dto.RevenueShareModel, RevenueShareModel.Equal),
            StartDate = dto.StartDate,
            EndDate = dto.EndDate,
            CoverImageUrl = dto.CoverImageUrl
        };

        await _projectRepository.AddAsync(project);

        var ownerMember = new ProjectMember
        {
            ProjectId = project.Id,
            UserId = userId,
            Role = ProjectRole.Owner,
            Level = ProjectRoleLevel.Core,
            JoinedAt = DateTime.UtcNow,
            IsActive = true,
            RevenueSharePercentage = 100
        };
        await _memberRepository.AddAsync(ownerMember);

        await RecordActivityAsync(project.Id, userId, ActivityType.Created, $"Project '{project.Title}' created.");

        _logger.LogInformation("Project created: {Title} by user {UserId}", project.Title, userId);

        return await MapToProjectDtoAsync(project);
    }

    public async Task<ProjectDto> GetProjectAsync(Guid projectId, Guid userId)
    {
        var project = await _projectRepository.GetByIdAsync(projectId)
            ?? throw new NotFoundException("Project not found");

        var isMember = await _projectRepository.IsUserMemberAsync(projectId, userId);
        if (!isMember && project.Visibility != ProjectVisibility.Public)
            throw new UnauthorizedException("You don't have access to this project");

        return await MapToProjectDtoAsync(project);
    }

    public async Task<ProjectDto> UpdateProjectAsync(Guid projectId, UpdateProjectDto dto, Guid userId)
    {
        var project = await _projectRepository.GetByIdAsync(projectId)
            ?? throw new NotFoundException("Project not found");

        var userRole = await _projectRepository.GetUserProjectRoleAsync(projectId, userId);
        if (project.OwnerId != userId && userRole is not (ProjectRole.Owner or ProjectRole.CoOwner))
            throw new UnauthorizedException("You don't have permission to update this project");

        if (!string.IsNullOrWhiteSpace(dto.Title)) project.Title = dto.Title;
        if (!string.IsNullOrWhiteSpace(dto.Description)) project.Description = dto.Description;
        if (!string.IsNullOrWhiteSpace(dto.Type)) project.Type = ParseEnum<ProjectType>(dto.Type, project.Type);
        if (!string.IsNullOrWhiteSpace(dto.Visibility)) project.Visibility = ParseEnum<ProjectVisibility>(dto.Visibility, project.Visibility);
        if (dto.Status.HasValue) project.Status = dto.Status.Value;
        if (dto.AllowComments.HasValue) project.AllowComments = dto.AllowComments.Value;
        if (dto.AllowSharing.HasValue) project.AllowSharing = dto.AllowSharing.Value;
        if (dto.RequireApproval.HasValue) project.RequireApproval = dto.RequireApproval.Value;
        if (dto.MaxCollaborators.HasValue) project.MaxCollaborators = dto.MaxCollaborators.Value;
        if (dto.StartDate.HasValue) project.StartDate = dto.StartDate;
        if (dto.EndDate.HasValue) project.EndDate = dto.EndDate;
        if (!string.IsNullOrWhiteSpace(dto.CoverImageUrl)) project.CoverImageUrl = dto.CoverImageUrl;
        if (!string.IsNullOrWhiteSpace(dto.BannerImageUrl)) project.BannerImageUrl = dto.BannerImageUrl;

        await _projectRepository.UpdateAsync(project);
        await RecordActivityAsync(projectId, userId, ActivityType.Updated, $"Project '{project.Title}' updated.");
        await _notifications.NotifyProjectUpdatedAsync(projectId, $"Project '{project.Title}' was updated.");

        return await MapToProjectDtoAsync(project);
    }

    public async Task<bool> DeleteProjectAsync(Guid projectId, Guid userId)
    {
        var project = await _projectRepository.GetByIdAsync(projectId)
            ?? throw new NotFoundException("Project not found");

        if (project.OwnerId != userId)
            throw new UnauthorizedException("Only the project owner can delete the project");

        project.IsDeleted = true;
        project.DeletedAt = DateTime.UtcNow;
        await _projectRepository.UpdateAsync(project);

        _logger.LogInformation("Project deleted: {Title}", project.Title);
        return true;
    }

    public async Task<IEnumerable<ProjectDto>> GetUserProjectsAsync(Guid userId, int page = 1, int pageSize = 50)
    {
        var projects = await _projectRepository.GetProjectsForUserAsync(userId, page, pageSize);
        var result = new List<ProjectDto>();
        foreach (var project in projects)
            result.Add(await MapToProjectDtoAsync(project));
        return result;
    }

    public async Task<ProjectMemberDto> AddMemberAsync(Guid projectId, AddMemberDto dto, Guid userId)
    {
        var project = await _projectRepository.GetByIdAsync(projectId)
            ?? throw new NotFoundException("Project not found");

        var userRole = await _projectRepository.GetUserProjectRoleAsync(projectId, userId);
        if (userRole is not (ProjectRole.Owner or ProjectRole.CoOwner))
            throw new UnauthorizedException("You don't have permission to add members");

        var existing = await _memberRepository.GetMemberAsync(projectId, dto.UserId);
        if (existing is { IsActive: true })
            throw new InvalidOperationException("User is already an active member of this project");

        var currentMembers = await _memberRepository.GetActiveMembersAsync(projectId);
        if (currentMembers.Count() >= project.MaxCollaborators)
            throw new InvalidOperationException("Project has reached maximum collaborators");

        ProjectMember member;
        if (existing is not null)
        {
            existing.Role = ParseEnum<ProjectRole>(dto.Role, ProjectRole.Contributor);
            existing.Level = ParseEnum<ProjectRoleLevel>(dto.Level, ProjectRoleLevel.Junior);
            existing.IsActive = true;
            existing.LeftAt = null;
            existing.JoinedAt = DateTime.UtcNow;
            if (dto.RevenueSharePercentage.HasValue) existing.RevenueSharePercentage = dto.RevenueSharePercentage.Value;
            await _memberRepository.UpdateAsync(existing);
            member = existing;
        }
        else
        {
            member = new ProjectMember
            {
                ProjectId = projectId,
                UserId = dto.UserId,
                Role = ParseEnum<ProjectRole>(dto.Role, ProjectRole.Contributor),
                Level = ParseEnum<ProjectRoleLevel>(dto.Level, ProjectRoleLevel.Junior),
                JoinedAt = DateTime.UtcNow,
                IsActive = true,
                RevenueSharePercentage = dto.RevenueSharePercentage ?? 0
            };
            await _memberRepository.AddAsync(member);
        }

        await RecordActivityAsync(projectId, userId, ActivityType.MemberAdded, $"New member added with role {member.Role}.");
        await _notifications.NotifyMemberAddedAsync(projectId, dto.UserId, member.Role);

        return await MapToMemberDtoAsync(member);
    }

    public async Task<bool> RemoveMemberAsync(Guid projectId, Guid memberId, Guid userId)
    {
        var userRole = await _projectRepository.GetUserProjectRoleAsync(projectId, userId);
        if (userRole is not (ProjectRole.Owner or ProjectRole.CoOwner))
            throw new UnauthorizedException("You don't have permission to remove members");

        var member = await _memberRepository.GetByIdAsync(memberId)
            ?? throw new NotFoundException("Member not found");
        if (member.ProjectId != projectId)
            throw new NotFoundException("Member not found");
        if (member.Role == ProjectRole.Owner)
            throw new InvalidOperationException("The project owner cannot be removed");

        member.IsActive = false;
        member.LeftAt = DateTime.UtcNow;
        await _memberRepository.UpdateAsync(member);

        await RecordActivityAsync(projectId, userId, ActivityType.MemberRemoved, "A member was removed from the project.");
        return true;
    }

    public async Task<ProjectMemberDto> UpdateMemberRoleAsync(Guid projectId, Guid memberId, ProjectRole role, Guid userId)
    {
        var userRole = await _projectRepository.GetUserProjectRoleAsync(projectId, userId);
        if (userRole != ProjectRole.Owner)
            throw new UnauthorizedException("Only the project owner can update member roles");

        var member = await _memberRepository.GetByIdAsync(memberId)
            ?? throw new NotFoundException("Member not found");
        if (member.ProjectId != projectId)
            throw new NotFoundException("Member not found");

        member.Role = role;
        await _memberRepository.UpdateAsync(member);
        await RecordActivityAsync(projectId, userId, ActivityType.Updated, $"Member role changed to {role}.");

        return await MapToMemberDtoAsync(member);
    }

    public async Task<InviteDto> InviteCollaboratorAsync(Guid projectId, InviteCollaboratorDto dto, Guid userId)
    {
        var project = await _projectRepository.GetByIdAsync(projectId)
            ?? throw new NotFoundException("Project not found");

        var userRole = await _projectRepository.GetUserProjectRoleAsync(projectId, userId);
        if (userRole is not (ProjectRole.Owner or ProjectRole.CoOwner))
            throw new UnauthorizedException("You don't have permission to invite collaborators");

        var email = dto.Email.Trim().ToLowerInvariant();
        var existingInvite = await _inviteRepository.GetActiveInviteAsync(projectId, email);
        if (existingInvite is not null)
            throw new InvalidOperationException("User already invited to this project");

        var invite = new CollaborationInvite
        {
            ProjectId = projectId,
            InviterId = userId,
            InviteeEmail = email,
            Role = ParseEnum<ProjectRole>(dto.Role, ProjectRole.Contributor),
            Level = ParseEnum<ProjectRoleLevel>(dto.Level, ProjectRoleLevel.Junior),
            Message = dto.Message,
            Status = InviteStatus.Pending,
            ExpiresAt = DateTime.UtcNow.AddDays(7)
        };
        await _inviteRepository.AddAsync(invite);

        await RecordActivityAsync(projectId, userId, ActivityType.Invited, $"{email} was invited to collaborate.");

        return new InviteDto
        {
            Id = invite.Id,
            ProjectId = projectId,
            ProjectTitle = project.Title,
            InviteeEmail = invite.InviteeEmail,
            Role = invite.Role.ToString(),
            Level = invite.Level.ToString(),
            Status = invite.Status.ToString(),
            ExpiresAt = invite.ExpiresAt
        };
    }

    public async Task<bool> AcceptInviteAsync(Guid inviteId, Guid userId)
    {
        var invite = await _inviteRepository.GetByIdAsync(inviteId)
            ?? throw new NotFoundException("Invite not found");

        if (invite.Status != InviteStatus.Pending)
            throw new InvalidOperationException("Invite is no longer pending");

        if (invite.ExpiresAt is { } expiry && expiry < DateTime.UtcNow)
        {
            invite.Status = InviteStatus.Expired;
            await _inviteRepository.UpdateAsync(invite);
            throw new InvalidOperationException("Invite has expired");
        }

        var user = await _userRepository.GetByIdAsync(userId)
            ?? throw new NotFoundException("User not found");
        if (!string.Equals(user.Email?.Trim().ToLowerInvariant(), invite.InviteeEmail, StringComparison.Ordinal))
            throw new UnauthorizedException("This invite is for a different user");

        var existing = await _memberRepository.GetMemberAsync(invite.ProjectId, userId);
        if (existing is { IsActive: true })
            throw new InvalidOperationException("User is already a member of this project");

        if (existing is not null)
        {
            existing.Role = invite.Role;
            existing.Level = invite.Level;
            existing.IsActive = true;
            existing.JoinedAt = DateTime.UtcNow;
            existing.LeftAt = null;
            await _memberRepository.UpdateAsync(existing);
        }
        else
        {
            await _memberRepository.AddAsync(new ProjectMember
            {
                ProjectId = invite.ProjectId,
                UserId = userId,
                Role = invite.Role,
                Level = invite.Level,
                JoinedAt = DateTime.UtcNow,
                IsActive = true,
                RevenueSharePercentage = 0
            });
        }

        invite.Status = InviteStatus.Accepted;
        invite.RespondedAt = DateTime.UtcNow;
        await _inviteRepository.UpdateAsync(invite);

        await RecordActivityAsync(invite.ProjectId, userId, ActivityType.MemberAdded, $"{user.DisplayName} joined the project.");
        await _notifications.NotifyMemberAddedAsync(invite.ProjectId, userId, invite.Role);
        return true;
    }

    public async Task<bool> DeclineInviteAsync(Guid inviteId, Guid userId)
    {
        var invite = await _inviteRepository.GetByIdAsync(inviteId)
            ?? throw new NotFoundException("Invite not found");

        if (invite.Status != InviteStatus.Pending)
            throw new InvalidOperationException("Invite is no longer pending");

        var user = await _userRepository.GetByIdAsync(userId);
        if (user is not null && !string.Equals(user.Email?.Trim().ToLowerInvariant(), invite.InviteeEmail, StringComparison.Ordinal))
            throw new UnauthorizedException("This invite is for a different user");

        invite.Status = InviteStatus.Declined;
        invite.RespondedAt = DateTime.UtcNow;
        await _inviteRepository.UpdateAsync(invite);
        return true;
    }

    public async Task<IEnumerable<ProjectMemberDto>> GetProjectMembersAsync(Guid projectId)
    {
        var members = await _memberRepository.GetActiveMembersAsync(projectId);
        var result = new List<ProjectMemberDto>();
        foreach (var member in members)
            result.Add(await MapToMemberDtoAsync(member));
        return result;
    }

    public async Task<ProjectContentDto> AddContentAsync(Guid projectId, AddContentDto dto, Guid userId)
    {
        var project = await _projectRepository.GetByIdAsync(projectId)
            ?? throw new NotFoundException("Project not found");

        if (!await _projectRepository.IsUserMemberAsync(projectId, userId))
            throw new UnauthorizedException("You must be a project member to add content");

        var content = new ProjectContent
        {
            ProjectId = projectId,
            CreatedById = userId,
            Type = ParseEnum<ContentType>(dto.Type, ContentType.Article),
            Title = dto.Title,
            Content = dto.Content,
            MediaUrls = dto.MediaUrls,
            Status = ContentStatus.Draft,
            Version = 1
        };
        await _contentRepository.AddAsync(content);

        await RecordActivityAsync(projectId, userId, ActivityType.ContentAdded, $"Content '{content.Title}' added.");
        return await MapToContentDtoAsync(content);
    }

    public async Task<ProjectContentDto> UpdateContentAsync(Guid contentId, UpdateContentDto dto, Guid userId)
    {
        var content = await _contentRepository.GetByIdAsync(contentId)
            ?? throw new NotFoundException("Content not found");

        if (!await _projectRepository.IsUserMemberAsync(content.ProjectId, userId))
            throw new UnauthorizedException("You don't have permission to update this content");

        // Snapshot previous version for history
        await _contentRepository.AddVersionAsync(new ProjectContentVersion
        {
            ContentId = content.Id,
            VersionNumber = content.Version,
            Title = content.Title,
            Content = content.Content,
            MediaUrls = content.MediaUrls,
            EditedById = userId,
            ChangeNotes = "Snapshot before update"
        });

        var changed = false;
        if (!string.IsNullOrWhiteSpace(dto.Title)) { content.Title = dto.Title; changed = true; }
        if (dto.Content is not null) { content.Content = dto.Content; changed = true; }
        if (dto.MediaUrls is not null) { content.MediaUrls = dto.MediaUrls; changed = true; }
        if (!string.IsNullOrWhiteSpace(dto.ReviewNotes)) content.ReviewNotes = dto.ReviewNotes;

        if (!string.IsNullOrWhiteSpace(dto.Status))
        {
            content.Status = ParseEnum<ContentStatus>(dto.Status, content.Status);
            if (content.Status == ContentStatus.Approved)
            {
                content.ReviewedAt = DateTime.UtcNow;
                content.ReviewedById = userId;
            }
        }

        if (changed) content.Version++;
        await _contentRepository.UpdateAsync(content);

        await RecordActivityAsync(content.ProjectId, userId, ActivityType.ContentUpdated, $"Content '{content.Title}' updated (v{content.Version}).");
        return await MapToContentDtoAsync(content);
    }

    public async Task<bool> DeleteContentAsync(Guid contentId, Guid userId)
    {
        var content = await _contentRepository.GetByIdAsync(contentId)
            ?? throw new NotFoundException("Content not found");

        if (!await _projectRepository.IsUserMemberAsync(content.ProjectId, userId))
            throw new UnauthorizedException("You don't have permission to delete this content");

        content.IsDeleted = true;
        content.DeletedAt = DateTime.UtcNow;
        await _contentRepository.UpdateAsync(content);

        await RecordActivityAsync(content.ProjectId, userId, ActivityType.ContentUpdated, $"Content '{content.Title}' deleted.");
        return true;
    }

    public async Task<IEnumerable<ProjectContentDto>> GetProjectContentAsync(Guid projectId)
    {
        var content = await _contentRepository.GetProjectContentAsync(projectId);
        var result = new List<ProjectContentDto>();
        foreach (var item in content)
            result.Add(await MapToContentDtoAsync(item));
        return result;
    }

    public async Task<ProjectCommentDto> AddCommentAsync(Guid projectId, AddCommentDto dto, Guid userId)
    {
        var project = await _projectRepository.GetByIdAsync(projectId)
            ?? throw new NotFoundException("Project not found");
        if (!project.AllowComments)
            throw new InvalidOperationException("Comments are disabled for this project");

        var comment = new ProjectComment
        {
            ProjectId = projectId,
            ContentId = dto.ContentId,
            UserId = userId,
            ParentCommentId = dto.ParentCommentId,
            Text = dto.Text
        };
        await _commentRepository.AddAsync(comment);

        if (dto.ContentId.HasValue)
        {
            var content = await _contentRepository.GetByIdAsync(dto.ContentId.Value);
            if (content is not null)
            {
                content.CommentsCount++;
                await _contentRepository.UpdateAsync(content);
            }
        }

        await RecordActivityAsync(projectId, userId, ActivityType.CommentAdded, "New comment added.");
        return await MapToCommentDtoAsync(comment);
    }

    public async Task<IEnumerable<ProjectActivityDto>> GetProjectActivityAsync(Guid projectId, int page = 1, int pageSize = 50)
    {
        var activities = await _activityRepository.GetPagedAsync(page, pageSize,
            predicate: a => a.ProjectId == projectId,
            orderBy: q => q.OrderByDescending(a => a.CreatedAt));

        var result = new List<ProjectActivityDto>();
        foreach (var activity in activities)
        {
            var actor = activity.ActorUserId.HasValue
                ? await _userRepository.GetByIdAsync(activity.ActorUserId.Value)
                : null;
            result.Add(new ProjectActivityDto
            {
                Id = activity.Id,
                ProjectId = activity.ProjectId,
                ActorUserId = activity.ActorUserId,
                ActorName = actor?.DisplayName ?? "System",
                Type = activity.Type.ToString(),
                Summary = activity.Summary,
                CreatedAt = activity.CreatedAt
            });
        }
        return result;
    }

    // ── Private helpers ─────────────────────────────────────────────────────────

    private async Task RecordActivityAsync(Guid projectId, Guid? actorUserId, ActivityType type, string summary)
    {
        await _activityRepository.AddAsync(new ProjectActivity
        {
            ProjectId = projectId,
            ActorUserId = actorUserId,
            Type = type,
            Summary = summary
        });
    }

    private async Task<ProjectDto> MapToProjectDtoAsync(Project project)
    {
        var members = await GetProjectMembersAsync(project.Id);
        var content = await GetProjectContentAsync(project.Id);
        var owner = await _userRepository.GetByIdAsync(project.OwnerId);

        return new ProjectDto
        {
            Id = project.Id,
            Title = project.Title,
            Description = project.Description,
            Type = project.Type.ToString(),
            Status = project.Status.ToString(),
            Visibility = project.Visibility.ToString(),
            OwnerId = project.OwnerId,
            OwnerName = owner?.DisplayName ?? "Unknown",
            CoverImageUrl = project.CoverImageUrl,
            BannerImageUrl = project.BannerImageUrl,
            StartDate = project.StartDate,
            EndDate = project.EndDate,
            PublishedAt = project.PublishedAt,
            AllowComments = project.AllowComments,
            AllowSharing = project.AllowSharing,
            RequireApproval = project.RequireApproval,
            MaxCollaborators = project.MaxCollaborators,
            RevenueShareModel = project.RevenueShareModel.ToString(),
            Members = members,
            Content = content,
            CreatedAt = project.CreatedAt,
            UpdatedAt = project.UpdatedAt
        };
    }

    private async Task<ProjectMemberDto> MapToMemberDtoAsync(ProjectMember member)
    {
        var user = await _userRepository.GetByIdAsync(member.UserId);
        return new ProjectMemberDto
        {
            Id = member.Id,
            ProjectId = member.ProjectId,
            UserId = member.UserId,
            UserName = user?.DisplayName ?? "Unknown",
            UserAvatar = user?.AvatarUrl,
            Role = member.Role.ToString(),
            Level = member.Level.ToString(),
            JoinedAt = member.JoinedAt,
            IsActive = member.IsActive,
            RevenueSharePercentage = member.RevenueSharePercentage
        };
    }

    private async Task<ProjectContentDto> MapToContentDtoAsync(ProjectContent content)
    {
        var creator = content.CreatedById.HasValue
            ? await _userRepository.GetByIdAsync(content.CreatedById.Value)
            : null;

        return new ProjectContentDto
        {
            Id = content.Id,
            ProjectId = content.ProjectId,
            CreatedById = content.CreatedById,
            CreatorName = creator?.DisplayName ?? "Unknown",
            Type = content.Type.ToString(),
            Title = content.Title,
            Content = content.Content,
            MediaUrls = content.MediaUrls,
            Status = content.Status.ToString(),
            Version = content.Version,
            PublishedAt = content.PublishedAt,
            ReviewedAt = content.ReviewedAt,
            ReviewedById = content.ReviewedById,
            ReviewNotes = content.ReviewNotes,
            IsPublished = content.IsPublished,
            Views = content.Views,
            Likes = content.Likes,
            Shares = content.Shares,
            CommentsCount = content.CommentsCount,
            CreatedAt = content.CreatedAt,
            UpdatedAt = content.UpdatedAt
        };
    }

    private async Task<ProjectCommentDto> MapToCommentDtoAsync(ProjectComment comment)
    {
        var user = await _userRepository.GetByIdAsync(comment.UserId);
        return new ProjectCommentDto
        {
            Id = comment.Id,
            ProjectId = comment.ProjectId,
            ContentId = comment.ContentId,
            UserId = comment.UserId,
            UserName = user?.DisplayName ?? "Unknown",
            UserAvatar = user?.AvatarUrl,
            ParentCommentId = comment.ParentCommentId,
            Text = comment.Text,
            CreatedAt = comment.CreatedAt
        };
    }

    private static T ParseEnum<T>(string? value, T fallback) where T : struct, Enum
        => Enum.TryParse<T>(value, true, out var parsed) ? parsed : fallback;
}
