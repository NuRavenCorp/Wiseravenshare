using NuRavenCorpLLM.Entities.Ai;

namespace NuRavenCorpLLM.Application.Services.Ai.Repositories;

public interface IDataSourceRegistryRepository
{
    Task<IReadOnlyList<DataSourceRegistry>> GetEnabledAsync(CancellationToken ct = default);
    Task AddRangeAsync(IEnumerable<DataSourceRegistry> items, CancellationToken ct = default);
}
