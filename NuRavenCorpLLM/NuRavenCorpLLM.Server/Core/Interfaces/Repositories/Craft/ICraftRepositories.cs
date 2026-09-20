using NuRavenCorpLLM.Core.Interfaces;
using NuRavenCorpLLM.Entities.Craft;

namespace NuRavenCorpLLM.Core.Interfaces.Repositories.Craft;

public interface ICraftDomainRepository : IRepository<CraftDomain>
{
    Task<CraftDomain?> GetByKeyAsync(string key, CancellationToken ct = default);
}

public interface ICraftSkillRepository : IRepository<CraftSkill>
{
    Task<CraftSkill?> GetByKeyAsync(string key, CancellationToken ct = default);
}

public interface ICraftPrincipleRepository : IRepository<CraftPrinciple>
{
    Task<bool> ExistsAsync(Guid domainId, string title, CancellationToken ct = default);
}

public interface ICraftObservationRepository : IRepository<CraftObservation>
{
    Task<List<CraftObservation>> GetRecentByDomainAsync(string domain, int batchSize, CancellationToken ct = default);
}

public interface ICraftSourceRepository : IRepository<CraftSource>
{
    Task<List<CraftSource>> GetQueuedAsync(int batchSize = 10, CancellationToken ct = default);
}

public interface ICraftInsightRepository : IRepository<CraftInsight>
{
}

public interface IUserCraftSkillRepository
{
    Task AdjustScoreAsync(Guid userId, string skillKey, decimal delta, CancellationToken ct = default);
}

public interface IPostRepository
{
    Task<dynamic?> GetByIdAsync(Guid id, CancellationToken ct = default);
}

public interface ICommentRepository
{
    Task<dynamic?> GetByIdAsync(Guid id, CancellationToken ct = default);
}

public interface IVideoRepository
{
    Task<dynamic?> GetByIdAsync(Guid id, CancellationToken ct = default);
}

public interface IPostAnalyticsRepository
{
    Task<dynamic?> GetByContentAsync(Guid contentId, CancellationToken ct = default);
}

public interface ICraftPatternRepository : IRepository<CraftPattern>
{
    Task<List<CraftPattern>> GetRecentByDomainAsync(string domain, int batchSize, CancellationToken ct = default);
}