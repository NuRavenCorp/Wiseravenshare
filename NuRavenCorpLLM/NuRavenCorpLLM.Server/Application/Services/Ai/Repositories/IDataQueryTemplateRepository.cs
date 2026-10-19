using NuRavenCorpLLM.Entities.Ai;

namespace NuRavenCorpLLM.Application.Services.Ai.Repositories;

public interface IDataQueryTemplateRepository
{
    Task<IReadOnlyList<DataQueryTemplate>> GetAllOrderedAsync(CancellationToken ct = default);
    Task AddRangeAsync(IEnumerable<DataQueryTemplate> templates, CancellationToken ct = default);
}
