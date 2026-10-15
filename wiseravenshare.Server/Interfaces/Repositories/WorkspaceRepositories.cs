using Wiseravenshare.Server.Entities;

namespace Wiseravenshare.Server.Interfaces.Repositories;

public interface IWorkspacePageRepository
{
    Task AddAsync(WorkspacePage page);
    Task<WorkspacePage?> GetByIdAsync(string pageId, bool includeArchived = false);
    Task<IReadOnlyList<WorkspacePage>> GetSessionPagesAsync(string sessionId);
    Task<IReadOnlyList<WorkspacePage>> GetPagesByTypeAsync(string sessionId, string pageType);
    Task<IReadOnlyList<WorkspacePage>> SearchPagesAsync(string sessionId, string query);
    Task SaveChangesAsync();
    void Remove(WorkspacePage page);
}

public interface IWorkspaceSessionRepository
{
    Task<PodcastSession?> GetOpenSessionAsync(string sessionId);
}
