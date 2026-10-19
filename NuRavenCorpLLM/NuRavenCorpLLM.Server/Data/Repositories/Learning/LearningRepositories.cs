using Microsoft.EntityFrameworkCore;
using NuRavenCorpLLM.Server.Entities.Learning;

namespace NuRavenCorpLLM.Server.Data.Repositories.Learning;

public interface ILearningSampleRepository : IRepository<LearningSample>
{
    Task<IEnumerable<LearningSample>> GetPendingAsync(int limit = 200, CancellationToken ct = default);
    Task<IEnumerable<LearningSample>> GetApprovedAsync(DateTime? since = null, int limit = 10000, CancellationToken ct = default);
    Task<IEnumerable<LearningSample>> GetByClientAsync(Guid clientSystemId, int limit = 500, CancellationToken ct = default);
    Task<LearningSample?> GetByMessageAsync(Guid messageId, CancellationToken ct = default);
    Task<IEnumerable<LearningSample>> GetHighQualityAsync(int minQuality = 70, int limit = 1000, CancellationToken ct = default);
}

public class LearningSampleRepository : Repository<LearningSample>, ILearningSampleRepository
{
    public LearningSampleRepository(ApplicationDbContext ctx, ILogger<LearningSampleRepository> logger) : base(ctx, logger) { }

    public async Task<IEnumerable<LearningSample>> GetPendingAsync(int limit = 200, CancellationToken ct = default)
        => await _dbSet
            .Where(s => s.Status == NuRavenCorpLLM.Server.Entities.Learning.LearningSampleStatus.Pending)
            .OrderBy(s => s.CreatedAt)
            .Take(limit)
            .ToListAsync(ct);

    public async Task<IEnumerable<LearningSample>> GetApprovedAsync(DateTime? since = null, int limit = 10000, CancellationToken ct = default)
    {
        var q = _dbSet.Where(s => s.Status == NuRavenCorpLLM.Server.Entities.Learning.LearningSampleStatus.Approved);
        if (since.HasValue) q = q.Where(s => s.CreatedAt >= since.Value);
        return await q.OrderByDescending(s => s.CreatedAt).Take(limit).ToListAsync(ct);
    }

    public async Task<IEnumerable<LearningSample>> GetByClientAsync(Guid clientSystemId, int limit = 500, CancellationToken ct = default)
        => await _dbSet
            .Where(s => s.ClientSystemId == clientSystemId)
            .OrderByDescending(s => s.CreatedAt)
            .Take(limit)
            .ToListAsync(ct);

    public async Task<LearningSample?> GetByMessageAsync(Guid messageId, CancellationToken ct = default)
        => await _dbSet.FirstOrDefaultAsync(s => s.MessageId == messageId, ct);

    public async Task<IEnumerable<LearningSample>> GetHighQualityAsync(int minQuality = 70, int limit = 1000, CancellationToken ct = default)
        => await _dbSet
            .Where(s => s.Status == NuRavenCorpLLM.Server.Entities.Learning.LearningSampleStatus.Approved && s.Quality >= minQuality)
            .OrderByDescending(s => s.Quality)
            .Take(limit)
            .ToListAsync(ct);
}

public interface IFeedbackSignalRepository : IRepository<FeedbackSignal>
{
    Task<IEnumerable<FeedbackSignal>> GetByMessageAsync(Guid messageId, CancellationToken ct = default);
    Task<IEnumerable<FeedbackSignal>> GetUnprocessedAsync(int limit = 500, CancellationToken ct = default);
    Task<IEnumerable<FeedbackSignal>> GetByKindAsync(FeedbackKind kind, int limit = 200, CancellationToken ct = default);
}

public class FeedbackSignalRepository : Repository<FeedbackSignal>, IFeedbackSignalRepository
{
    public FeedbackSignalRepository(ApplicationDbContext ctx, ILogger<FeedbackSignalRepository> logger) : base(ctx, logger) { }

    public async Task<IEnumerable<FeedbackSignal>> GetByMessageAsync(Guid messageId, CancellationToken ct = default)
        => await _dbSet
            .Where(f => f.MessageId == messageId)
            .OrderByDescending(f => f.CreatedAt)
            .ToListAsync(ct);

    public async Task<IEnumerable<FeedbackSignal>> GetUnprocessedAsync(int limit = 500, CancellationToken ct = default)
        => await _dbSet
            .Where(f => !f.Processed)
            .OrderBy(f => f.CreatedAt)
            .Take(limit)
            .ToListAsync(ct);

    public async Task<IEnumerable<FeedbackSignal>> GetByKindAsync(FeedbackKind kind, int limit = 200, CancellationToken ct = default)
        => await _dbSet
            .Where(f => f.Kind == kind)
            .OrderByDescending(f => f.CreatedAt)
            .Take(limit)
            .ToListAsync(ct);
}

public interface IPreferencePairRepository : IRepository<PreferencePair>
{
    Task<IEnumerable<PreferencePair>> GetReadyAsync(int limit = 5000, CancellationToken ct = default);
    Task<int> CountReadyAsync(CancellationToken ct = default);
}

public class PreferencePairRepository : Repository<PreferencePair>, IPreferencePairRepository
{
    public PreferencePairRepository(ApplicationDbContext ctx, ILogger<PreferencePairRepository> logger) : base(ctx, logger) { }

    public async Task<IEnumerable<PreferencePair>> GetReadyAsync(int limit = 5000, CancellationToken ct = default)
        => await _dbSet
            .Where(p => p.Status == NuRavenCorpLLM.Server.Entities.Learning.PreferencePairStatus.Ready)
            .OrderByDescending(p => p.CreatedAt)
            .Take(limit)
            .ToListAsync(ct);

    public async Task<int> CountReadyAsync(CancellationToken ct = default)
        => await _dbSet.CountAsync(p => p.Status == NuRavenCorpLLM.Server.Entities.Learning.PreferencePairStatus.Ready, ct);
}

public interface IFineTuneJobRepository : IRepository<FineTuneJob>
{
    Task<IEnumerable<FineTuneJob>> GetActiveAsync(CancellationToken ct = default);
    Task<IEnumerable<FineTuneJob>> GetRecentAsync(int limit = 50, CancellationToken ct = default);
    Task<FineTuneJob?> GetLatestForBaseAsync(string baseModelId, CancellationToken ct = default);
}

public class FineTuneJobRepository : Repository<FineTuneJob>, IFineTuneJobRepository
{
    public FineTuneJobRepository(ApplicationDbContext ctx, ILogger<FineTuneJobRepository> logger) : base(ctx, logger) { }

    public async Task<IEnumerable<FineTuneJob>> GetActiveAsync(CancellationToken ct = default)
        => await _dbSet
            .Where(j => j.Status == NuRavenCorpLLM.Server.Entities.Learning.FineTuneStatus.Queued || j.Status == NuRavenCorpLLM.Server.Entities.Learning.FineTuneStatus.Running)
            .OrderBy(j => j.CreatedAt)
            .ToListAsync(ct);

    public async Task<IEnumerable<FineTuneJob>> GetRecentAsync(int limit = 50, CancellationToken ct = default)
        => await _dbSet
            .OrderByDescending(j => j.CreatedAt)
            .Take(limit)
            .ToListAsync(ct);

    public async Task<FineTuneJob?> GetLatestForBaseAsync(string baseModelId, CancellationToken ct = default)
        => await _dbSet
            .Where(j => j.BaseModelId == baseModelId)
            .OrderByDescending(j => j.CreatedAt)
            .FirstOrDefaultAsync(ct);
}

public interface IEvaluationRunRepository : IRepository<EvaluationRun>
{
    Task<EvaluationRun?> GetWithMetricsAsync(Guid id, CancellationToken ct = default);
    Task<IEnumerable<EvaluationRun>> GetByModelAsync(Guid modelId, int limit = 50, CancellationToken ct = default);
    Task<IEnumerable<EvaluationRun>> GetRecentAsync(int limit = 50, CancellationToken ct = default);
}

public class EvaluationRunRepository : Repository<EvaluationRun>, IEvaluationRunRepository
{
    public EvaluationRunRepository(ApplicationDbContext ctx, ILogger<EvaluationRunRepository> logger) : base(ctx, logger) { }

    public async Task<EvaluationRun?> GetWithMetricsAsync(Guid id, CancellationToken ct = default)
        => await _dbSet
            .Include(r => r.Metrics)
            .FirstOrDefaultAsync(r => r.Id == id, ct);

    public async Task<IEnumerable<EvaluationRun>> GetByModelAsync(Guid modelId, int limit = 50, CancellationToken ct = default)
        => await _dbSet
            .Where(r => r.ModelId == modelId)
            .OrderByDescending(r => r.CreatedAt)
            .Take(limit)
            .ToListAsync(ct);

    public async Task<IEnumerable<EvaluationRun>> GetRecentAsync(int limit = 50, CancellationToken ct = default)
        => await _dbSet
            .OrderByDescending(r => r.CreatedAt)
            .Take(limit)
            .ToListAsync(ct);
}
