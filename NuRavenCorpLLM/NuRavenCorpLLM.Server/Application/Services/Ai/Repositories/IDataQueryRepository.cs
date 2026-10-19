using NuRavenCorpLLM.Entities.Ai;

namespace NuRavenCorpLLM.Application.Services.Ai.Repositories;

public interface IDataQueryRepository
{
    Task AddAsync(DataQuery query, CancellationToken ct = default);
    Task<IReadOnlyList<DataQuery>> GetByUserAsync(Guid userId, int limit = 50, CancellationToken ct = default);
}
