using System.Collections.Concurrent;
using NuRavenCorpLLM.Entities.Ai;

namespace NuRavenCorpLLM.Application.Services.Ai.Repositories;

public class InMemoryDataQueryRepository : IDataQueryRepository
{
    private readonly ConcurrentBag<DataQuery> _store = new();

    public Task AddAsync(DataQuery query, CancellationToken ct = default)
    {
        query.UpdatedAt = DateTime.UtcNow;
        _store.Add(query);
        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<DataQuery>> GetByUserAsync(Guid userId, int limit = 50, CancellationToken ct = default)
    {
        var list = _store
            .Where(x => x.UserId == userId)
            .OrderByDescending(x => x.CreatedAt)
            .Take(Math.Clamp(limit, 1, 200))
            .ToList();

        return Task.FromResult<IReadOnlyList<DataQuery>>(list);
    }
}

public class InMemoryDataSourceRegistryRepository : IDataSourceRegistryRepository
{
    private readonly List<DataSourceRegistry> _items = new();
    private readonly object _gate = new();

    public Task<IReadOnlyList<DataSourceRegistry>> GetEnabledAsync(CancellationToken ct = default)
    {
        lock (_gate)
        {
            return Task.FromResult<IReadOnlyList<DataSourceRegistry>>(
                _items.Where(x => x.IsEnabled).OrderBy(x => x.Name).ToList());
        }
    }

    public Task AddRangeAsync(IEnumerable<DataSourceRegistry> items, CancellationToken ct = default)
    {
        lock (_gate)
        {
            foreach (var item in items)
            {
                if (_items.Any(x => x.Key == item.Key))
                {
                    continue;
                }

                _items.Add(item);
            }
        }

        return Task.CompletedTask;
    }
}

public class InMemoryDataQueryTemplateRepository : IDataQueryTemplateRepository
{
    private readonly List<DataQueryTemplate> _items = new();
    private readonly object _gate = new();

    public Task<IReadOnlyList<DataQueryTemplate>> GetAllOrderedAsync(CancellationToken ct = default)
    {
        lock (_gate)
        {
            return Task.FromResult<IReadOnlyList<DataQueryTemplate>>(
                _items.OrderBy(x => x.SortOrder).ThenBy(x => x.Title).ToList());
        }
    }

    public Task AddRangeAsync(IEnumerable<DataQueryTemplate> templates, CancellationToken ct = default)
    {
        lock (_gate)
        {
            foreach (var template in templates)
            {
                if (_items.Any(x => string.Equals(x.Title, template.Title, StringComparison.OrdinalIgnoreCase)))
                {
                    continue;
                }

                _items.Add(template);
            }
        }

        return Task.CompletedTask;
    }
}
