using Microsoft.EntityFrameworkCore;
using NuRavenCorpLLM.Server.Entities.Craft;

namespace NuRavenCorpLLM.Server.Data.Repositories.Craft;

public interface ICraftDomainRepository : IRepository<CraftDomain>
{
    Task<CraftDomain?> GetByKeyAsync(string key, CancellationToken ct = default);
    Task<CraftDomain?> GetWithSkillsAsync(Guid id, CancellationToken ct = default);
    Task<IEnumerable<CraftDomain>> GetActiveOrderedAsync(CancellationToken ct = default);
}

public class CraftDomainRepository : Repository<CraftDomain>, ICraftDomainRepository
{
    public CraftDomainRepository(ApplicationDbContext ctx, ILogger<CraftDomainRepository> logger) : base(ctx, logger) { }

    public async Task<CraftDomain?> GetByKeyAsync(string key, CancellationToken ct = default)
        => await _dbSet.FirstOrDefaultAsync(d => d.Key == key, ct);

    public async Task<CraftDomain?> GetWithSkillsAsync(Guid id, CancellationToken ct = default)
        => await _dbSet
            .Include(d => d.Skills)
            .Include(d => d.Principles)
            .FirstOrDefaultAsync(d => d.Id == id, ct);

    public async Task<IEnumerable<CraftDomain>> GetActiveOrderedAsync(CancellationToken ct = default)
        => await _dbSet
            .Where(d => d.IsActive)
            .OrderBy(d => d.SortOrder)
            .ToListAsync(ct);
}

public interface ICraftSkillRepository : IRepository<CraftSkill>
{
    Task<CraftSkill?> GetByKeyAsync(string key, CancellationToken ct = default);
    Task<IEnumerable<CraftSkill>> GetByDomainAsync(Guid domainId, CancellationToken ct = default);
    Task<CraftSkill> GetOrCreateAsync(Guid domainId, string key, string name, CancellationToken ct = default);
}

public class CraftSkillRepository : Repository<CraftSkill>, ICraftSkillRepository
{
    public CraftSkillRepository(ApplicationDbContext ctx, ILogger<CraftSkillRepository> logger) : base(ctx, logger) { }

    public async Task<CraftSkill?> GetByKeyAsync(string key, CancellationToken ct = default)
        => await _dbSet.FirstOrDefaultAsync(s => s.Key == key, ct);

    public async Task<IEnumerable<CraftSkill>> GetByDomainAsync(Guid domainId, CancellationToken ct = default)
        => await _dbSet
            .Where(s => s.CraftDomainId == domainId)
            .OrderBy(s => s.Name)
            .ToListAsync(ct);

    public async Task<CraftSkill> GetOrCreateAsync(Guid domainId, string key, string name, CancellationToken ct = default)
    {
        var existing = await GetByKeyAsync(key, ct);
        if (existing != null) return existing;

        var skill = new CraftSkill
        {
            CraftDomainId = domainId,
            Key = key,
            Name = name
        };
        return await AddAsync(skill, ct);
    }
}

public interface ICraftPrincipleRepository : IRepository<CraftPrinciple>
{
    Task<IEnumerable<CraftPrinciple>> GetByDomainAsync(Guid domainId, int limit = 100, CancellationToken ct = default);
    Task<IEnumerable<CraftPrinciple>> GetTopAsync(Guid domainId, int limit = 10, CancellationToken ct = default);
    Task<bool> ExistsAsync(Guid domainId, string title, CancellationToken ct = default);
    Task<IReadOnlyList<(CraftPrinciple Principle, double Score)>> SearchByEmbeddingAsync(float[] embedding, string? domainKey, int topK = 8, CancellationToken ct = default);
}

public class CraftPrincipleRepository : Repository<CraftPrinciple>, ICraftPrincipleRepository
{
    public CraftPrincipleRepository(ApplicationDbContext ctx, ILogger<CraftPrincipleRepository> logger) : base(ctx, logger) { }

    public async Task<IEnumerable<CraftPrinciple>> GetByDomainAsync(Guid domainId, int limit = 100, CancellationToken ct = default)
        => await _dbSet
            .Where(p => p.CraftDomainId == domainId)
            .OrderByDescending(p => p.Importance)
            .Take(limit)
            .ToListAsync(ct);

    public async Task<IEnumerable<CraftPrinciple>> GetTopAsync(Guid domainId, int limit = 10, CancellationToken ct = default)
        => await _dbSet
            .Where(p => p.CraftDomainId == domainId)
            .OrderByDescending(p => p.Importance)
            .Take(limit)
            .ToListAsync(ct);

    public async Task<bool> ExistsAsync(Guid domainId, string title, CancellationToken ct = default)
        => await _dbSet.AnyAsync(p => p.CraftDomainId == domainId && p.Title == title, ct);

    public async Task<IReadOnlyList<(CraftPrinciple Principle, double Score)>> SearchByEmbeddingAsync(float[] embedding, string? domainKey, int topK = 8, CancellationToken ct = default)
    {
        var vec = "[" + string.Join(',', embedding.Select(f => f.ToString("R", System.Globalization.CultureInfo.InvariantCulture))) + "]";

        var sql = """
            SELECT p.id, 1 - (p.embedding <=> @vec::vector) AS score
            FROM craft_principles p
            JOIN craft_domains d ON d.id = p.craft_domain_id
            WHERE p.embedding IS NOT NULL
              AND (@domainKey IS NULL OR d.key = @domainKey)
            ORDER BY p.embedding <=> @vec::vector
            LIMIT @topK;
            """;

        var ids = new List<(Guid Id, double Score)>();
        using var cmd = _context.Database.GetDbConnection().CreateCommand();
        cmd.CommandText = sql;

        var pVec = cmd.CreateParameter(); pVec.ParameterName = "@vec"; pVec.Value = vec; cmd.Parameters.Add(pVec);
        var pKey = cmd.CreateParameter(); pKey.ParameterName = "@domainKey"; pKey.Value = (object?)domainKey ?? DBNull.Value; cmd.Parameters.Add(pKey);
        var pTop = cmd.CreateParameter(); pTop.ParameterName = "@topK"; pTop.Value = topK; cmd.Parameters.Add(pTop);

        await _context.Database.OpenConnectionAsync(ct);
        try
        {
            using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
                ids.Add((reader.GetGuid(0), reader.GetDouble(1)));
        }
        finally
        {
            await _context.Database.CloseConnectionAsync();
        }

        if (ids.Count == 0) return Array.Empty<(CraftPrinciple, double)>();

        var idList = ids.Select(i => i.Id).ToList();
        var principles = await _dbSet.Where(p => idList.Contains(p.Id)).ToListAsync(ct);
        var lookup = ids.ToDictionary(i => i.Id, i => i.Score);

        return principles
            .Select(p => (p, lookup[p.Id]))
            .OrderByDescending(r => r.Item2)
            .ToList();
    }
}

public interface ICraftInsightRepository : IRepository<CraftInsight>
{
    Task<IEnumerable<CraftInsight>> GetBySourceAsync(Guid sourceId, CancellationToken ct = default);
    Task<IEnumerable<CraftInsight>> GetHighQualityAsync(int minQuality = 60, int limit = 200, CancellationToken ct = default);
    Task<int> PruneLowQualityAsync(int threshold, int olderThanDays, CancellationToken ct = default);
    Task<IReadOnlyList<(CraftInsight Insight, double Score)>> SearchByEmbeddingAsync(float[] embedding, int topK = 8, CancellationToken ct = default);
}

public class CraftInsightRepository : Repository<CraftInsight>, ICraftInsightRepository
{
    public CraftInsightRepository(ApplicationDbContext ctx, ILogger<CraftInsightRepository> logger) : base(ctx, logger) { }

    public async Task<IEnumerable<CraftInsight>> GetBySourceAsync(Guid sourceId, CancellationToken ct = default)
        => await _dbSet
            .Where(i => i.SourceId == sourceId)
            .OrderByDescending(i => i.Quality)
            .ToListAsync(ct);

    public async Task<IEnumerable<CraftInsight>> GetHighQualityAsync(int minQuality = 60, int limit = 200, CancellationToken ct = default)
        => await _dbSet
            .Where(i => i.Quality >= minQuality)
            .OrderByDescending(i => i.Quality)
            .Take(limit)
            .ToListAsync(ct);

    public async Task<int> PruneLowQualityAsync(int threshold, int olderThanDays, CancellationToken ct = default)
    {
        var cutoff = DateTime.UtcNow.AddDays(-olderThanDays);
        var victims = await _dbSet
            .Where(i => i.Quality < threshold && i.CreatedAt < cutoff)
            .ToListAsync(ct);

        if (victims.Count == 0) return 0;

        _dbSet.RemoveRange(victims);
        await _context.SaveChangesAsync(ct);
        return victims.Count;
    }

    public async Task<IReadOnlyList<(CraftInsight Insight, double Score)>> SearchByEmbeddingAsync(float[] embedding, int topK = 8, CancellationToken ct = default)
    {
        var vec = "[" + string.Join(',', embedding.Select(f => f.ToString("R", System.Globalization.CultureInfo.InvariantCulture))) + "]";

        var sql = """
            SELECT i.id, 1 - (i.embedding <=> @vec::vector) AS score
            FROM craft_insights i
            WHERE i.embedding IS NOT NULL
            ORDER BY i.embedding <=> @vec::vector
            LIMIT @topK;
            """;

        var ids = new List<(Guid Id, double Score)>();
        using var cmd = _context.Database.GetDbConnection().CreateCommand();
        cmd.CommandText = sql;

        var pVec = cmd.CreateParameter(); pVec.ParameterName = "@vec"; pVec.Value = vec; cmd.Parameters.Add(pVec);
        var pTop = cmd.CreateParameter(); pTop.ParameterName = "@topK"; pTop.Value = topK; cmd.Parameters.Add(pTop);

        await _context.Database.OpenConnectionAsync(ct);
        try
        {
            using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
                ids.Add((reader.GetGuid(0), reader.GetDouble(1)));
        }
        finally
        {
            await _context.Database.CloseConnectionAsync();
        }

        if (ids.Count == 0) return Array.Empty<(CraftInsight, double)>();

        var idList = ids.Select(i => i.Id).ToList();
        var insights = await _dbSet.Where(i => idList.Contains(i.Id)).ToListAsync(ct);
        var lookup = ids.ToDictionary(i => i.Id, i => i.Score);

        return insights
            .Select(i => (i, lookup[i.Id]))
            .OrderByDescending(r => r.Item2)
            .ToList();
    }
}

public interface ICraftPatternRepository : IRepository<CraftPattern>
{
    Task<IEnumerable<CraftPattern>> GetByDomainAsync(string domainKey, int limit = 50, CancellationToken ct = default);
    Task<IEnumerable<CraftPattern>> GetConfidentAsync(string domainKey, decimal minConfidence = 0.7m, int limit = 20, CancellationToken ct = default);
}

public class CraftPatternRepository : Repository<CraftPattern>, ICraftPatternRepository
{
    public CraftPatternRepository(ApplicationDbContext ctx, ILogger<CraftPatternRepository> logger) : base(ctx, logger) { }

    public async Task<IEnumerable<CraftPattern>> GetByDomainAsync(string domainKey, int limit = 50, CancellationToken ct = default)
        => await _dbSet
            .Where(p => p.DomainKey == domainKey)
            .OrderByDescending(p => p.Confidence)
            .ThenByDescending(p => p.SampleSize)
            .Take(limit)
            .ToListAsync(ct);

    public async Task<IEnumerable<CraftPattern>> GetConfidentAsync(string domainKey, decimal minConfidence = 0.7m, int limit = 20, CancellationToken ct = default)
        => await _dbSet
            .Where(p => p.DomainKey == domainKey && p.Confidence >= minConfidence)
            .OrderByDescending(p => p.Confidence)
            .Take(limit)
            .ToListAsync(ct);
}

public interface ICraftSourceRepository : IRepository<CraftSource>
{
    Task<IEnumerable<CraftSource>> GetQueuedAsync(int limit = 20, CancellationToken ct = default);
    Task<IEnumerable<CraftSource>> GetByDomainAsync(Guid domainId, int limit = 100, CancellationToken ct = default);
}

public class CraftSourceRepository : Repository<CraftSource>, ICraftSourceRepository
{
    public CraftSourceRepository(ApplicationDbContext ctx, ILogger<CraftSourceRepository> logger) : base(ctx, logger) { }

    public async Task<IEnumerable<CraftSource>> GetQueuedAsync(int limit = 20, CancellationToken ct = default)
        => await _dbSet
            .Where(s => s.Status == SourceStatus.Queued)
            .OrderBy(s => s.CreatedAt)
            .Take(limit)
            .ToListAsync(ct);

    public async Task<IEnumerable<CraftSource>> GetByDomainAsync(Guid domainId, int limit = 100, CancellationToken ct = default)
        => await _dbSet
            .Where(s => s.CraftDomainId == domainId)
            .OrderByDescending(s => s.CreatedAt)
            .Take(limit)
            .ToListAsync(ct);
}

public interface ICraftObservationRepository : IRepository<CraftObservation>
{
    Task<IEnumerable<CraftObservation>> GetRecentByDomainAsync(string domainKey, int limit = 200, CancellationToken ct = default);
    Task<IEnumerable<CraftObservation>> GetByUserAsync(Guid userId, int limit = 200, CancellationToken ct = default);
}

public class CraftObservationRepository : Repository<CraftObservation>, ICraftObservationRepository
{
    public CraftObservationRepository(ApplicationDbContext ctx, ILogger<CraftObservationRepository> logger) : base(ctx, logger) { }

    public async Task<IEnumerable<CraftObservation>> GetRecentByDomainAsync(string domainKey, int limit = 200, CancellationToken ct = default)
        => await _dbSet
            .Where(o => o.DomainKey == domainKey)
            .OrderByDescending(o => o.CreatedAt)
            .Take(limit)
            .ToListAsync(ct);

    public async Task<IEnumerable<CraftObservation>> GetByUserAsync(Guid userId, int limit = 200, CancellationToken ct = default)
        => await _dbSet
            .Where(o => o.UserId == userId)
            .OrderByDescending(o => o.CreatedAt)
            .Take(limit)
            .ToListAsync(ct);
}

public interface IUserCraftProfileRepository : IRepository<UserCraftProfile>
{
    Task<UserCraftProfile?> GetByUserAsync(Guid userId, CancellationToken ct = default);
    Task<UserCraftProfile> GetOrCreateAsync(Guid userId, CancellationToken ct = default);
}

public class UserCraftProfileRepository : Repository<UserCraftProfile>, IUserCraftProfileRepository
{
    public UserCraftProfileRepository(ApplicationDbContext ctx, ILogger<UserCraftProfileRepository> logger) : base(ctx, logger) { }

    public async Task<UserCraftProfile?> GetByUserAsync(Guid userId, CancellationToken ct = default)
        => await _dbSet
            .Include(p => p.SkillScores)
            .FirstOrDefaultAsync(p => p.UserId == userId, ct);

    public async Task<UserCraftProfile> GetOrCreateAsync(Guid userId, CancellationToken ct = default)
    {
        var existing = await GetByUserAsync(userId, ct);
        if (existing != null) return existing;
        var profile = new UserCraftProfile { UserId = userId };
        return await AddAsync(profile, ct);
    }
}

public interface IUserCraftSkillRepository : IRepository<UserCraftSkillScore>
{
    Task<IEnumerable<UserCraftSkillScore>> GetByUserAsync(Guid userId, CancellationToken ct = default);
    Task<UserCraftSkillScore?> GetAsync(Guid userId, Guid skillId, CancellationToken ct = default);
    Task AdjustScoreAsync(Guid userId, string skillKey, decimal delta, CancellationToken ct = default);
}

public class UserCraftSkillRepository : Repository<UserCraftSkillScore>, IUserCraftSkillRepository
{
    private readonly ICraftSkillRepository _skills;

    public UserCraftSkillRepository(ApplicationDbContext ctx, ILogger<UserCraftSkillRepository> logger, ICraftSkillRepository skills)
        : base(ctx, logger)
    {
        _skills = skills;
    }

    public async Task<IEnumerable<UserCraftSkillScore>> GetByUserAsync(Guid userId, CancellationToken ct = default)
        => await _dbSet.Where(s => s.UserId == userId).ToListAsync(ct);

    public async Task<UserCraftSkillScore?> GetAsync(Guid userId, Guid skillId, CancellationToken ct = default)
        => await _dbSet.FirstOrDefaultAsync(s => s.UserId == userId && s.SkillId == skillId, ct);

    public async Task AdjustScoreAsync(Guid userId, string skillKey, decimal delta, CancellationToken ct = default)
    {
        var skill = await _skills.GetByKeyAsync(skillKey, ct);
        if (skill == null) return;

        var score = await GetAsync(userId, skill.Id, ct);
        if (score == null)
        {
            score = new UserCraftSkillScore
            {
                UserId = userId,
                SkillId = skill.Id,
                Score = Math.Clamp(50m + delta, 0m, 100m),
                SampleSize = 1,
                Confidence = 0.1m,
                LastUpdated = DateTime.UtcNow
            };
            await AddAsync(score, ct);
        }
        else
        {
            score.Score = Math.Clamp(score.Score + delta, 0m, 100m);
            score.SampleSize += 1;
            score.Confidence = Math.Min(1m, score.SampleSize / 20m);
            score.LastUpdated = DateTime.UtcNow;
            await UpdateAsync(score, ct);
        }
    }
}

public interface ICraftCoachingRepository : IRepository<CraftCoachingSession>
{
    Task<IEnumerable<CraftCoachingSession>> GetRecentForUserAsync(Guid userId, int limit = 10, CancellationToken ct = default);
    Task<CraftCoachingSession?> GetWithSuggestionsAsync(Guid id, CancellationToken ct = default);
    Task<IEnumerable<CraftCoachingSession>> GetByDomainAsync(string domainKey, int limit = 100, CancellationToken ct = default);
}

public class CraftCoachingRepository : Repository<CraftCoachingSession>, ICraftCoachingRepository
{
    public CraftCoachingRepository(ApplicationDbContext ctx, ILogger<CraftCoachingRepository> logger) : base(ctx, logger) { }

    public async Task<IEnumerable<CraftCoachingSession>> GetRecentForUserAsync(Guid userId, int limit = 10, CancellationToken ct = default)
        => await _dbSet
            .Where(s => s.UserId == userId)
            .OrderByDescending(s => s.CreatedAt)
            .Take(limit)
            .ToListAsync(ct);

    public async Task<CraftCoachingSession?> GetWithSuggestionsAsync(Guid id, CancellationToken ct = default)
        => await _dbSet
            .Include(s => s.Suggestions)
            .FirstOrDefaultAsync(s => s.Id == id, ct);

    public async Task<IEnumerable<CraftCoachingSession>> GetByDomainAsync(string domainKey, int limit = 100, CancellationToken ct = default)
        => await _dbSet
            .Where(s => s.DomainKey == domainKey)
            .OrderByDescending(s => s.CreatedAt)
            .Take(limit)
            .ToListAsync(ct);
}

public interface ICraftSuggestionRepository : IRepository<CraftCoachingSuggestion>
{
    Task<IEnumerable<CraftCoachingSuggestion>> GetBySessionAsync(Guid sessionId, CancellationToken ct = default);
    Task<IEnumerable<CraftCoachingSuggestion>> GetBySkillAsync(string skillKey, int limit = 100, CancellationToken ct = default);
    Task MarkAcceptedAsync(Guid suggestionId, CancellationToken ct = default);
    Task MarkDismissedAsync(Guid suggestionId, CancellationToken ct = default);
}

public class CraftSuggestionRepository : Repository<CraftCoachingSuggestion>, ICraftSuggestionRepository
{
    public CraftSuggestionRepository(ApplicationDbContext ctx, ILogger<CraftSuggestionRepository> logger) : base(ctx, logger) { }

    public async Task<IEnumerable<CraftCoachingSuggestion>> GetBySessionAsync(Guid sessionId, CancellationToken ct = default)
        => await _dbSet
            .Where(s => s.SessionId == sessionId)
            .OrderByDescending(s => s.Priority)
            .ToListAsync(ct);

    public async Task<IEnumerable<CraftCoachingSuggestion>> GetBySkillAsync(string skillKey, int limit = 100, CancellationToken ct = default)
        => await _dbSet
            .Where(s => s.SkillKey == skillKey)
            .OrderByDescending(s => s.CreatedAt)
            .Take(limit)
            .ToListAsync(ct);

    public async Task MarkAcceptedAsync(Guid suggestionId, CancellationToken ct = default)
    {
        var s = await GetByIdAsync(suggestionId, ct);
        if (s == null) return;
        s.Accepted = true;
        await UpdateAsync(s, ct);
    }

    public async Task MarkDismissedAsync(Guid suggestionId, CancellationToken ct = default)
    {
        var s = await GetByIdAsync(suggestionId, ct);
        if (s == null) return;
        s.Dismissed = true;
        await UpdateAsync(s, ct);
    }
}
