namespace Wiseravenshare.Server.Services;

using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.DTOs;
using Wiseravenshare.Server.Interfaces.Repositories;
using Task = System.Threading.Tasks.Task;

/// <summary>
/// Manages persistent workspace pages: unlimited pages for scripts, props, references, etc.
/// Pages survive session closure and are accessible by all team members.
/// </summary>
public interface IWorkspacePageService
{
    /// <summary>Create a new workspace page in a session</summary>
    Task<WorkspacePageDto> CreatePageAsync(string sessionId, string userId, CreateOrUpdateWorkspacePageRequest req);

    /// <summary>Update an existing page</summary>
    Task<WorkspacePageDto> UpdatePageAsync(string pageId, string userId, CreateOrUpdateWorkspacePageRequest req);

    /// <summary>Get all active pages in a session</summary>
    Task<List<WorkspacePageDto>> GetSessionPagesAsync(string sessionId);

    /// <summary>Get all pages by type (e.g., "script", "props") in a session</summary>
    Task<List<WorkspacePageDto>> GetPagesByTypeAsync(string sessionId, string pageType);

    /// <summary>Get a single page by ID</summary>
    Task<WorkspacePageDto?> GetPageAsync(string pageId);

    /// <summary>Archive (soft delete) a page</summary>
    Task<bool> ArchivePageAsync(string pageId, string userId);

    /// <summary>Permanently delete an archived page</summary>
    Task<bool> DeletePageAsync(string pageId);

    /// <summary>Search pages by title or content</summary>
    Task<List<WorkspacePageDto>> SearchPagesAsync(string sessionId, string query);
}

public class WorkspacePageService : IWorkspacePageService
{
    private readonly IWorkspacePageRepository _workspacePageRepository;
    private readonly IWorkspaceSessionRepository _workspaceSessionRepository;
    private readonly ILogger<WorkspacePageService> _logger;

    public WorkspacePageService(
        IWorkspacePageRepository workspacePageRepository,
        IWorkspaceSessionRepository workspaceSessionRepository,
        ILogger<WorkspacePageService> logger)
    {
        _workspacePageRepository = workspacePageRepository;
        _workspaceSessionRepository = workspaceSessionRepository;
        _logger = logger;
    }

    /// <summary>Create a new workspace page in a session</summary>
    public async Task<WorkspacePageDto> CreatePageAsync(string sessionId, string userId, CreateOrUpdateWorkspacePageRequest req)
    {
        var session = await _workspaceSessionRepository.GetOpenSessionAsync(sessionId);
        if (session == null)
            throw new InvalidOperationException($"Session {sessionId} not found or closed");

        var page = new WorkspacePage
        {
            Id = GeneratePageId(),
            SessionId = sessionId,
            TeamId = session.TeamId,
            CreatedByUserId = userId,
            LastEditedByUserId = userId,
            PageType = req.PageType,
            Title = req.Title,
            Description = req.Description,
            Content = req.Content,
            Tags = req.Tags,
            MetadataJson = req.MetadataJson,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            Version = 1
        };

        await _workspacePageRepository.AddAsync(page);
        await _workspacePageRepository.SaveChangesAsync();

        _logger.LogInformation($"Created workspace page {page.Id} ({page.PageType}) in session {sessionId} by user {userId}");
        return MapToDto(page);
    }

    /// <summary>Update an existing page</summary>
    public async Task<WorkspacePageDto> UpdatePageAsync(string pageId, string userId, CreateOrUpdateWorkspacePageRequest req)
    {
        var page = await _workspacePageRepository.GetByIdAsync(pageId);
        if (page == null)
            throw new InvalidOperationException($"Page {pageId} not found or archived");

        page.Title = req.Title;
        page.Description = req.Description;
        page.Content = req.Content;
        page.Tags = req.Tags;
        page.PageType = req.PageType;
        page.MetadataJson = req.MetadataJson;
        page.LastEditedByUserId = userId;
        page.UpdatedAt = DateTime.UtcNow;
        page.Version++;

        await _workspacePageRepository.SaveChangesAsync();

        _logger.LogInformation($"Updated workspace page {pageId} version {page.Version} by user {userId}");
        return MapToDto(page);
    }

    /// <summary>Get all active pages in a session</summary>
    public async Task<List<WorkspacePageDto>> GetSessionPagesAsync(string sessionId)
    {
        var pages = await _workspacePageRepository.GetSessionPagesAsync(sessionId);
        return pages.Select(MapToDto).ToList();
    }

    /// <summary>Get all pages by type in a session</summary>
    public async Task<List<WorkspacePageDto>> GetPagesByTypeAsync(string sessionId, string pageType)
    {
        var pages = await _workspacePageRepository.GetPagesByTypeAsync(sessionId, pageType);
        return pages.Select(MapToDto).ToList();
    }

    /// <summary>Get a single page by ID</summary>
    public async Task<WorkspacePageDto?> GetPageAsync(string pageId)
    {
        var page = await _workspacePageRepository.GetByIdAsync(pageId);
        return page != null ? MapToDto(page) : null;
    }

    /// <summary>Archive (soft delete) a page</summary>
    public async Task<bool> ArchivePageAsync(string pageId, string userId)
    {
        var page = await _workspacePageRepository.GetByIdAsync(pageId, includeArchived: true);
        if (page == null)
            return false;

        page.IsArchived = true;
        page.ArchivedAt = DateTime.UtcNow;
        page.LastEditedByUserId = userId;
        page.UpdatedAt = DateTime.UtcNow;
        page.Version++;

        await _workspacePageRepository.SaveChangesAsync();

        _logger.LogInformation($"Archived workspace page {pageId} by user {userId}");
        return true;
    }

    /// <summary>Permanently delete an archived page</summary>
    public async Task<bool> DeletePageAsync(string pageId)
    {
        var page = await _workspacePageRepository.GetByIdAsync(pageId, includeArchived: true);
        if (page == null)
            return false;

        var deletedAtUtc = DateTime.UtcNow;
        page.IsArchived = true;
        page.ArchivedAt ??= deletedAtUtc;
        page.UpdatedAt = deletedAtUtc;
        page.Version++;

        _workspacePageRepository.Remove(page);
        await _workspacePageRepository.SaveChangesAsync();

        _logger.LogInformation($"Permanently deleted workspace page {pageId}");
        return true;
    }

    /// <summary>Search pages by title or content</summary>
    public async Task<List<WorkspacePageDto>> SearchPagesAsync(string sessionId, string query)
    {
        var pages = await _workspacePageRepository.SearchPagesAsync(sessionId, query);
        return pages.Select(MapToDto).ToList();
    }

    private static WorkspacePageDto MapToDto(WorkspacePage page)
    {
        return new WorkspacePageDto
        {
            Id = page.Id,
            SessionId = page.SessionId,
            TeamId = page.TeamId,
            PageType = page.PageType,
            Title = page.Title,
            Description = page.Description,
            Content = page.Content,
            Version = page.Version,
            Tags = page.Tags,
            CreatedAt = page.CreatedAt,
            UpdatedAt = page.UpdatedAt,
            LastEditedByUserId = page.LastEditedByUserId,
            IsArchived = page.IsArchived
        };
    }

    private static string GeneratePageId() => $"wpage_{Guid.NewGuid():N}".Substring(0, 50);
}
