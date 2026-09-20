using Microsoft.EntityFrameworkCore;
using NuRavenCorpLLM.Server.Entities.Ingestion;

namespace NuRavenCorpLLM.Server.Data.Repositories.Ingestion;

public interface IIngestionJobRepository : IRepository<IngestionJob>
{
    Task<IEnumerable<IngestionJob>> GetPendingAsync(int limit = 20, CancellationToken ct = default);
    Task<IEnumerable<IngestionJob>> GetRecentAsync(int limit = 100, CancellationToken ct = default);
    Task<IngestionJob?> GetWithItemsAsync(Guid id, CancellationToken ct = default);
    Task<IngestionJob?> GetByClientAsync(Guid clientSystemId, CancellationToken ct = default);
}

public class IngestionJobRepository : Repository<IngestionJob>, IIngestionJobRepository
{
    public IngestionJobRepository(ApplicationDbContext ctx, ILogger<IngestionJobRepository> logger) : base(ctx, logger) { }

    public async Task<IEnumerable<IngestionJob>> GetPendingAsync(int limit = 20, CancellationToken ct = default)
        => await _dbSet
            .Where(j => j.Status == IngestionStatus.Pending)
            .OrderBy(j => j.CreatedAt)
            .Take(limit)
            .ToListAsync(ct);

    public async Task<IEnumerable<IngestionJob>> GetRecentAsync(int limit = 100, CancellationToken ct = default)
        => await _dbSet
            .OrderByDescending(j => j.CreatedAt)
            .Take(limit)
            .ToListAsync(ct);

    public async Task<IngestionJob?> GetWithItemsAsync(Guid id, CancellationToken ct = default)
        => await _dbSet
            .Include(j => j.Items)
            .Include(j => j.Errors)
            .FirstOrDefaultAsync(j => j.Id == id, ct);

    public async Task<IngestionJob?> GetByClientAsync(Guid clientSystemId, CancellationToken ct = default)
        => await _dbSet
            .Where(j => j.ClientSystemId == clientSystemId)
            .OrderByDescending(j => j.CreatedAt)
            .FirstOrDefaultAsync(ct);
}

public interface IIngestionSourceRepository : IRepository<IngestionSource>
{
    Task<IngestionSource?> GetByUrlAsync(string url, CancellationToken ct = default);
    Task<IEnumerable<IngestionSource>> GetPendingAsync(int limit = 50, CancellationToken ct = default);
    Task<IEnumerable<IngestionSource>> GetByKindAsync(IngestionKind kind, int limit = 200, CancellationToken ct = default);
}

public class IngestionSourceRepository : Repository<IngestionSource>, IIngestionSourceRepository
{
    public IngestionSourceRepository(ApplicationDbContext ctx, ILogger<IngestionSourceRepository> logger) : base(ctx, logger) { }

    public async Task<IngestionSource?> GetByUrlAsync(string url, CancellationToken ct = default)
        => await _dbSet.FirstOrDefaultAsync(s => s.Url == url, ct);

    public async Task<IEnumerable<IngestionSource>> GetPendingAsync(int limit = 50, CancellationToken ct = default)
        => await _dbSet
            .Where(s => s.Status == IngestionStatus.Pending)
            .OrderBy(s => s.CreatedAt)
            .Take(limit)
            .ToListAsync(ct);

    public async Task<IEnumerable<IngestionSource>> GetByKindAsync(IngestionKind kind, int limit = 200, CancellationToken ct = default)
        => await _dbSet
            .Where(s => s.Kind == kind)
            .OrderByDescending(s => s.CreatedAt)
            .Take(limit)
            .ToListAsync(ct);
}

public interface IIngestionItemRepository : IRepository<IngestionItem>
{
    Task<IEnumerable<IngestionItem>> GetByJobAsync(Guid jobId, int limit = 2000, CancellationToken ct = default);
    Task<IngestionItem?> GetByHashAsync(string contentHash, CancellationToken ct = default);
    Task<IEnumerable<IngestionItem>> GetFailedAsync(int limit = 200, CancellationToken ct = default);
}

public class IngestionItemRepository : Repository<IngestionItem>, IIngestionItemRepository
{
    public IngestionItemRepository(ApplicationDbContext ctx, ILogger<IngestionItemRepository> logger) : base(ctx, logger) { }

    public async Task<IEnumerable<IngestionItem>> GetByJobAsync(Guid jobId, int limit = 2000, CancellationToken ct = default)
        => await _dbSet
            .Where(i => i.JobId == jobId)
            .OrderBy(i => i.CreatedAt)
            .Take(limit)
            .ToListAsync(ct);

    public async Task<IngestionItem?> GetByHashAsync(string contentHash, CancellationToken ct = default)
        => await _dbSet.FirstOrDefaultAsync(i => i.ContentHash == contentHash, ct);

    public async Task<IEnumerable<IngestionItem>> GetFailedAsync(int limit = 200, CancellationToken ct = default)
        => await _dbSet
            .Where(i => i.Status == IngestionStatus.Failed)
            .OrderByDescending(i => i.CreatedAt)
            .Take(limit)
            .ToListAsync(ct);
}
