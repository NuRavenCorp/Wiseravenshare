using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Interfaces.Repositories;

namespace Wiseravenshare.Server.Infrastructure.Data.Repositories;

public sealed class WorkspacePageRepository : IWorkspacePageRepository
{
    private readonly AppDbContext _dbContext;

    public WorkspacePageRepository(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task AddAsync(WorkspacePage page)
    {
        await _dbContext.WorkspacePages.AddAsync(page);
    }

    public Task<WorkspacePage?> GetByIdAsync(string pageId, bool includeArchived = false)
    {
        var query = _dbContext.WorkspacePages.AsQueryable();
        if (!includeArchived)
        {
            query = query.Where(page => !page.IsArchived);
        }

        return query.FirstOrDefaultAsync(page => page.Id == pageId);
    }

    public async Task<IReadOnlyList<WorkspacePage>> GetSessionPagesAsync(string sessionId)
    {
        return await _dbContext.WorkspacePages
            .AsNoTracking()
            .Where(page => page.SessionId == sessionId && !page.IsArchived)
            .OrderByDescending(page => page.UpdatedAt)
            .ToListAsync();
    }

    public async Task<IReadOnlyList<WorkspacePage>> GetPagesByTypeAsync(string sessionId, string pageType)
    {
        return await _dbContext.WorkspacePages
            .AsNoTracking()
            .Where(page => page.SessionId == sessionId && page.PageType == pageType && !page.IsArchived)
            .OrderByDescending(page => page.UpdatedAt)
            .ToListAsync();
    }

    public async Task<IReadOnlyList<WorkspacePage>> SearchPagesAsync(string sessionId, string query)
    {
        var normalizedQuery = query.Trim().ToLowerInvariant();

        return await _dbContext.WorkspacePages
            .AsNoTracking()
            .Where(page => page.SessionId == sessionId && !page.IsArchived &&
                (page.Title.ToLower().Contains(normalizedQuery) ||
                 page.Content.ToLower().Contains(normalizedQuery) ||
                 (page.Tags != null && page.Tags.ToLower().Contains(normalizedQuery))))
            .OrderByDescending(page => page.UpdatedAt)
            .ToListAsync();
    }

    public Task SaveChangesAsync()
    {
        return _dbContext.SaveChangesAsync();
    }

    public void Remove(WorkspacePage page)
    {
        _dbContext.WorkspacePages.Remove(page);
    }
}

public sealed class WorkspaceSessionRepository : IWorkspaceSessionRepository
{
    private readonly AppDbContext _dbContext;

    public WorkspaceSessionRepository(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public Task<PodcastSession?> GetOpenSessionAsync(string sessionId)
    {
        return _dbContext.PodcastSessions
            .AsNoTracking()
            .FirstOrDefaultAsync(session => session.Id == sessionId && session.Status != "closed");
    }
}
