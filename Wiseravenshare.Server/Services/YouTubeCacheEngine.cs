using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Infrastructure.Data;

namespace Wiseravenshare.Server.Services;

public interface IYouTubeCacheEngine
{
    Task<string?> GetAsync(string cacheKey, CancellationToken ct = default);
    Task SetAsync(string cacheKey, string jsonData, TimeSpan ttl, CancellationToken ct = default);
    Task InvalidateAsync(string cacheKey, CancellationToken ct = default);
}

public sealed class YouTubeCacheEngine : IYouTubeCacheEngine
{
    private readonly AppDbContext _db;
    private readonly ILogger<YouTubeCacheEngine> _logger;

    public YouTubeCacheEngine(AppDbContext db, ILogger<YouTubeCacheEngine> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task<string?> GetAsync(string cacheKey, CancellationToken ct = default)
    {
        var record = await _db.CachedYouTubeRecords
            .AsNoTracking()
            .Where(r => r.CacheKey == cacheKey && !r.IsDeleted && r.AbsoluteExpiration > DateTime.UtcNow)
            .OrderByDescending(r => r.CachedAt)
            .FirstOrDefaultAsync(ct);
        return record?.JsonData;
    }

    public async Task SetAsync(string cacheKey, string jsonData, TimeSpan ttl, CancellationToken ct = default)
    {
        var stale = await _db.CachedYouTubeRecords
            .Where(r => r.CacheKey == cacheKey && !r.IsDeleted)
            .ToListAsync(ct);
        foreach (var s in stale) { s.IsDeleted = true; s.DeletedAt = DateTime.UtcNow; }

        _db.CachedYouTubeRecords.Add(new CachedYouTubeRecord
        {
            CacheKey = cacheKey,
            JsonData = jsonData,
            CachedAt = DateTime.UtcNow,
            AbsoluteExpiration = DateTime.UtcNow.Add(ttl)
        });
        await _db.SaveChangesAsync(ct);
        _logger.LogDebug("YouTube cache set: {Key}, TTL {Ttl}.", cacheKey, ttl);
    }

    public async Task InvalidateAsync(string cacheKey, CancellationToken ct = default)
    {
        var entries = await _db.CachedYouTubeRecords
            .Where(r => r.CacheKey == cacheKey && !r.IsDeleted)
            .ToListAsync(ct);
        foreach (var e in entries) { e.IsDeleted = true; e.DeletedAt = DateTime.UtcNow; }
        if (entries.Count > 0) await _db.SaveChangesAsync(ct);
    }
}
