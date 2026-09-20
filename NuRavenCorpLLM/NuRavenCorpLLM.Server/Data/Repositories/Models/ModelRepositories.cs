using Microsoft.EntityFrameworkCore;
using NuRavenCorpLLM.Server.Entities.Models;

namespace NuRavenCorpLLM.Server.Data.Repositories.Models;

public interface IModelProviderRepository : IRepository<ModelProvider>
{
    Task<ModelProvider?> GetByKeyAsync(string key, CancellationToken ct = default);
    Task<ModelProvider?> GetWithModelsAsync(Guid id, CancellationToken ct = default);
    Task<IEnumerable<ModelProvider>> GetActiveAsync(CancellationToken ct = default);
}

public class ModelProviderRepository : Repository<ModelProvider>, IModelProviderRepository
{
    public ModelProviderRepository(ApplicationDbContext ctx, ILogger<ModelProviderRepository> logger) : base(ctx, logger) { }

    public async Task<ModelProvider?> GetByKeyAsync(string key, CancellationToken ct = default)
        => await _dbSet.FirstOrDefaultAsync(p => p.Key == key, ct);

    public async Task<ModelProvider?> GetWithModelsAsync(Guid id, CancellationToken ct = default)
        => await _dbSet
            .Include(p => p.Models)
            .FirstOrDefaultAsync(p => p.Id == id, ct);

    public async Task<IEnumerable<ModelProvider>> GetActiveAsync(CancellationToken ct = default)
        => await _dbSet.Where(p => p.IsActive).ToListAsync(ct);
}

public interface IModelDefinitionRepository : IRepository<ModelDefinition>
{
    Task<ModelDefinition?> GetByKeyAsync(string key, CancellationToken ct = default);
    Task<IEnumerable<ModelDefinition>> GetByKindAsync(ModelKind kind, CancellationToken ct = default);
    Task<IEnumerable<ModelDefinition>> GetAvailableAsync(CancellationToken ct = default);
    Task<IEnumerable<ModelDefinition>> GetByProviderAsync(Guid providerId, CancellationToken ct = default);
}

public class ModelDefinitionRepository : Repository<ModelDefinition>, IModelDefinitionRepository
{
    public ModelDefinitionRepository(ApplicationDbContext ctx, ILogger<ModelDefinitionRepository> logger) : base(ctx, logger) { }

    public async Task<ModelDefinition?> GetByKeyAsync(string key, CancellationToken ct = default)
        => await _dbSet.FirstOrDefaultAsync(m => m.Key == key, ct);

    public async Task<IEnumerable<ModelDefinition>> GetByKindAsync(ModelKind kind, CancellationToken ct = default)
        => await _dbSet.Where(m => m.Kind == kind).ToListAsync(ct);

    public async Task<IEnumerable<ModelDefinition>> GetAvailableAsync(CancellationToken ct = default)
        => await _dbSet.Where(m => m.IsAvailable).ToListAsync(ct);

    public async Task<IEnumerable<ModelDefinition>> GetByProviderAsync(Guid providerId, CancellationToken ct = default)
        => await _dbSet.Where(m => m.ProviderId == providerId).ToListAsync(ct);
}

public interface IModelRouteRepository : IRepository<ModelRoute>
{
    Task<ModelRoute?> GetByKeyAsync(string routeKey, CancellationToken ct = default);
    Task<IEnumerable<ModelRoute>> GetActiveOrderedAsync(CancellationToken ct = default);
}

public class ModelRouteRepository : Repository<ModelRoute>, IModelRouteRepository
{
    public ModelRouteRepository(ApplicationDbContext ctx, ILogger<ModelRouteRepository> logger) : base(ctx, logger) { }

    public async Task<ModelRoute?> GetByKeyAsync(string routeKey, CancellationToken ct = default)
        => await _dbSet.FirstOrDefaultAsync(r => r.RouteKey == routeKey, ct);

    public async Task<IEnumerable<ModelRoute>> GetActiveOrderedAsync(CancellationToken ct = default)
        => await _dbSet
            .Where(r => r.IsActive)
            .OrderByDescending(r => r.Priority)
            .ToListAsync(ct);
}

public interface IModelInvocationRepository : IRepository<ModelInvocation>
{
    Task<IEnumerable<ModelInvocation>> GetByClientAsync(Guid clientSystemId, DateTime? from, DateTime? to, int limit = 500, CancellationToken ct = default);
    Task<int> CountAsync(Guid clientSystemId, DateTime from, CancellationToken ct = default);
    Task<long> SumTokensAsync(Guid clientSystemId, DateTime from, CancellationToken ct = default);
    Task<decimal> SumCostAsync(Guid clientSystemId, DateTime from, CancellationToken ct = default);
    Task<IEnumerable<ModelInvocation>> GetRecentAsync(int limit = 100, CancellationToken ct = default);
}

public class ModelInvocationRepository : Repository<ModelInvocation>, IModelInvocationRepository
{
    public ModelInvocationRepository(ApplicationDbContext ctx, ILogger<ModelInvocationRepository> logger) : base(ctx, logger) { }

    public async Task<IEnumerable<ModelInvocation>> GetByClientAsync(Guid clientSystemId, DateTime? from, DateTime? to, int limit = 500, CancellationToken ct = default)
    {
        var q = _dbSet.Where(i => i.ClientSystemId == clientSystemId);
        if (from.HasValue) q = q.Where(i => i.CreatedAt >= from.Value);
        if (to.HasValue) q = q.Where(i => i.CreatedAt <= to.Value);
        return await q.OrderByDescending(i => i.CreatedAt).Take(limit).ToListAsync(ct);
    }

    public async Task<int> CountAsync(Guid clientSystemId, DateTime from, CancellationToken ct = default)
        => await _dbSet.CountAsync(i => i.ClientSystemId == clientSystemId && i.CreatedAt >= from, ct);

    public async Task<long> SumTokensAsync(Guid clientSystemId, DateTime from, CancellationToken ct = default)
    {
        var sum = await _dbSet
            .Where(i => i.ClientSystemId == clientSystemId && i.CreatedAt >= from)
            .SumAsync(i => (long?)(i.PromptTokens + i.CompletionTokens), ct);
        return sum ?? 0;
    }

    public async Task<decimal> SumCostAsync(Guid clientSystemId, DateTime from, CancellationToken ct = default)
    {
        var sum = await _dbSet
            .Where(i => i.ClientSystemId == clientSystemId && i.CreatedAt >= from)
            .SumAsync(i => (decimal?)i.EstimatedCostUsd, ct);
        return sum ?? 0m;
    }

    public async Task<IEnumerable<ModelInvocation>> GetRecentAsync(int limit = 100, CancellationToken ct = default)
        => await _dbSet
            .OrderByDescending(i => i.CreatedAt)
            .Take(limit)
            .ToListAsync(ct);
}
