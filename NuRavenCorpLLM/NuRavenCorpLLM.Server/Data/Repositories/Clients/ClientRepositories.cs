using Microsoft.EntityFrameworkCore;
using NuRavenCorpLLM.Server.Entities.Clients;

namespace NuRavenCorpLLM.Server.Data.Repositories.Clients;

public interface IClientSystemRepository : IRepository<ClientSystem>
{
    Task<ClientSystem?> GetByKeyAsync(string key, CancellationToken ct = default);
    Task<ClientSystem?> GetWithKeysAsync(Guid id, CancellationToken ct = default);
    Task<IEnumerable<ClientSystem>> GetActiveAsync(CancellationToken ct = default);
    Task<ClientSystem?> GetByApiKeyHashAsync(string keyHash, CancellationToken ct = default);
}

public class ClientSystemRepository : Repository<ClientSystem>, IClientSystemRepository
{
    public ClientSystemRepository(ApplicationDbContext ctx, ILogger<ClientSystemRepository> logger) : base(ctx, logger) { }

    public async Task<ClientSystem?> GetByKeyAsync(string key, CancellationToken ct = default)
        => await _dbSet.FirstOrDefaultAsync(c => c.Key == key, ct);

    public async Task<ClientSystem?> GetWithKeysAsync(Guid id, CancellationToken ct = default)
        => await _dbSet
            .Include(c => c.ApiKeys)
            .Include(c => c.Scopes)
            .FirstOrDefaultAsync(c => c.Id == id, ct);

    public async Task<IEnumerable<ClientSystem>> GetActiveAsync(CancellationToken ct = default)
        => await _dbSet.Where(c => c.IsActive).ToListAsync(ct);

    public async Task<ClientSystem?> GetByApiKeyHashAsync(string keyHash, CancellationToken ct = default)
        => await _context.ClientApiKeys
            .Include(k => k.ClientSystem)
            .Where(k => k.KeyHash == keyHash && k.IsActive)
            .Select(k => k.ClientSystem)
            .FirstOrDefaultAsync(ct);
}

public interface IClientApiKeyRepository : IRepository<ClientApiKey>
{
    Task<ClientApiKey?> GetByHashAsync(string hash, CancellationToken ct = default);
    Task<IEnumerable<ClientApiKey>> GetByClientAsync(Guid clientSystemId, CancellationToken ct = default);
    Task<IEnumerable<ClientApiKey>> GetExpiringAsync(DateTime within, CancellationToken ct = default);
    Task RevokeAsync(Guid keyId, string reason, CancellationToken ct = default);
}

public class ClientApiKeyRepository : Repository<ClientApiKey>, IClientApiKeyRepository
{
    public ClientApiKeyRepository(ApplicationDbContext ctx, ILogger<ClientApiKeyRepository> logger) : base(ctx, logger) { }

    public async Task<ClientApiKey?> GetByHashAsync(string hash, CancellationToken ct = default)
        => await _dbSet
            .Include(k => k.ClientSystem)
            .FirstOrDefaultAsync(k => k.KeyHash == hash && k.IsActive, ct);

    public async Task<IEnumerable<ClientApiKey>> GetByClientAsync(Guid clientSystemId, CancellationToken ct = default)
        => await _dbSet
            .Where(k => k.ClientSystemId == clientSystemId)
            .OrderByDescending(k => k.CreatedAt)
            .ToListAsync(ct);

    public async Task<IEnumerable<ClientApiKey>> GetExpiringAsync(DateTime within, CancellationToken ct = default)
        => await _dbSet
            .Where(k => k.IsActive && k.ExpiresAt.HasValue && k.ExpiresAt <= within)
            .ToListAsync(ct);

    public async Task RevokeAsync(Guid keyId, string reason, CancellationToken ct = default)
    {
        var key = await GetByIdAsync(keyId, ct);
        if (key == null) return;
        key.IsActive = false;
        key.RevokedAt = DateTime.UtcNow;
        key.RevocationReason = reason;
        await UpdateAsync(key, ct);
    }
}

public interface IClientEventRepository : IRepository<ClientEvent>
{
    Task<IEnumerable<ClientEvent>> GetUnprocessedAsync(int limit = 100, CancellationToken ct = default);
    Task<IEnumerable<ClientEvent>> GetByClientAsync(Guid clientSystemId, DateTime? from, DateTime? to, int limit = 500, CancellationToken ct = default);
    Task MarkProcessedAsync(IEnumerable<Guid> eventIds, CancellationToken ct = default);
    Task<IEnumerable<ClientEvent>> GetByTypeAsync(Guid clientSystemId, string eventType, int limit = 100, CancellationToken ct = default);
}

public class ClientEventRepository : Repository<ClientEvent>, IClientEventRepository
{
    public ClientEventRepository(ApplicationDbContext ctx, ILogger<ClientEventRepository> logger) : base(ctx, logger) { }

    public async Task<IEnumerable<ClientEvent>> GetUnprocessedAsync(int limit = 100, CancellationToken ct = default)
        => await _dbSet
            .Where(e => !e.Processed)
            .OrderBy(e => e.OccurredAt)
            .Take(limit)
            .ToListAsync(ct);

    public async Task<IEnumerable<ClientEvent>> GetByClientAsync(Guid clientSystemId, DateTime? from, DateTime? to, int limit = 500, CancellationToken ct = default)
    {
        var q = _dbSet.Where(e => e.ClientSystemId == clientSystemId);
        if (from.HasValue) q = q.Where(e => e.OccurredAt >= from.Value);
        if (to.HasValue) q = q.Where(e => e.OccurredAt <= to.Value);
        return await q.OrderByDescending(e => e.OccurredAt).Take(limit).ToListAsync(ct);
    }

    public async Task MarkProcessedAsync(IEnumerable<Guid> eventIds, CancellationToken ct = default)
    {
        var ids = eventIds.ToList();
        var events = await _dbSet.Where(e => ids.Contains(e.Id)).ToListAsync(ct);
        foreach (var e in events)
        {
            e.Processed = true;
            e.ProcessedAt = DateTime.UtcNow;
        }
        await _context.SaveChangesAsync(ct);
    }

    public async Task<IEnumerable<ClientEvent>> GetByTypeAsync(Guid clientSystemId, string eventType, int limit = 100, CancellationToken ct = default)
        => await _dbSet
            .Where(e => e.ClientSystemId == clientSystemId && e.EventType == eventType)
            .OrderByDescending(e => e.OccurredAt)
            .Take(limit)
            .ToListAsync(ct);
}
