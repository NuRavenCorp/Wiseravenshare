using Wiseravenshare.Server.Entities;

namespace Wiseravenshare.Server.Interfaces.Repositories;

public static class RepositoryCompatibilityExtensions
{
    // Compatibility shims for services that still use legacy sync-shaped repository calls.
    public static IQueryable<T> GetAll<T>(this IRepository<T> repository) where T : BaseEntity
    {
        var rows = repository.GetAllAsync().GetAwaiter().GetResult();
        return rows.AsQueryable();
    }

    public static void Update<T>(this IRepository<T> repository, T entity) where T : BaseEntity
    {
        repository.UpdateAsync(entity).GetAwaiter().GetResult();
    }

    public static Task SaveChangesAsync<T>(this IRepository<T> repository) where T : BaseEntity
    {
        return Task.CompletedTask;
    }
}
