using Microsoft.Extensions.Hosting;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Services;

public sealed class RavensightMediaRetentionCleanupService : BackgroundService
{
    private const int DefaultRejectedReportRetentionDays = 30;
    private const int DefaultVerifiedReportRetentionDays = 180;
    private const int DefaultLiveStreamTombstoneRetentionDays = 3;

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<RavensightMediaRetentionCleanupService> _logger;
    private readonly IConfiguration _configuration;

    public RavensightMediaRetentionCleanupService(
        IServiceScopeFactory scopeFactory,
        IConfiguration configuration,
        ILogger<RavensightMediaRetentionCleanupService> logger)
    {
        _scopeFactory = scopeFactory;
        _configuration = configuration;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Run once at startup, then periodically.
        await RunCleanupCycleAsync(stoppingToken);

        var timer = new PeriodicTimer(TimeSpan.FromHours(1));
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                await RunCleanupCycleAsync(stoppingToken);
            }
        }
        catch (OperationCanceledException)
        {
            // Graceful shutdown.
        }
        finally
        {
            timer.Dispose();
        }
    }

    private async Task RunCleanupCycleAsync(CancellationToken cancellationToken)
    {
        if (!IsCleanupEnabled())
        {
            return;
        }

        try
        {
            using var scope = _scopeFactory.CreateScope();
            var catalogStore = scope.ServiceProvider.GetRequiredService<RavensightMediaCatalogStore>();

            var expired = await catalogStore.GetExpiredAssetsAsync(DateTime.UtcNow, 200, cancellationToken);
            if (expired.Count == 0)
            {
                return;
            }

            var deletedCount = 0;
            foreach (var asset in expired)
            {
                try
                {
                    if (!string.IsNullOrWhiteSpace(asset.AbsolutePath) && File.Exists(asset.AbsolutePath))
                    {
                        File.Delete(asset.AbsolutePath);
                    }

                    await catalogStore.MarkAssetDeletedAsync(asset.Id, DateTime.UtcNow, cancellationToken);
                    deletedCount++;
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to delete expired Ravensight media asset {AssetId} ({FileName})", asset.Id, asset.FileName);
                }
            }

            if (deletedCount > 0)
            {
                _logger.LogInformation("Ravensight retention cleanup removed {DeletedCount} expired media assets", deletedCount);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Ravensight retention cleanup cycle failed");
        }

        // Also process any saved media items due for scheduled publishing.
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var savedMediaService = scope.ServiceProvider.GetRequiredService<ISavedMediaService>();
            await savedMediaService.CleanupScheduledPublishesAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Saved media scheduled-publish cleanup cycle failed");
        }

        await CleanupStaleJournalismAsync(cancellationToken);
        await CleanupStaleLiveStreamTombstonesAsync(cancellationToken);
    }

    private bool IsCleanupEnabled()
    {
        var configured = (_configuration["Retention:SelfSanitizeEnabled"] ?? "true").Trim();
        return bool.TryParse(configured, out var enabled) ? enabled : true;
    }

    private async Task CleanupStaleJournalismAsync(CancellationToken cancellationToken)
    {
        var rejectedDays = ReadPositiveInt("Retention:JournalismRejectedDays", DefaultRejectedReportRetentionDays);
        var verifiedDays = ReadPositiveInt("Retention:JournalismVerifiedDays", DefaultVerifiedReportRetentionDays);
        var rejectedCutoff = DateTime.UtcNow.AddDays(-rejectedDays);
        var verifiedCutoff = DateTime.UtcNow.AddDays(-verifiedDays);

        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            var staleRejected = await db.CompatJournalismReports
                .Where(r => r.VerificationStatus == "rejected" && r.UpdatedDate <= rejectedCutoff)
                .ToListAsync(cancellationToken);

            var staleVerified = await db.CompatJournalismReports
                .Where(r => r.VerificationStatus == "verified" && r.UpdatedDate <= verifiedCutoff)
                .ToListAsync(cancellationToken);

            if (staleRejected.Count == 0 && staleVerified.Count == 0)
            {
                return;
            }

            var stale = staleRejected.Concat(staleVerified).ToList();
            var stalePostIds = stale
                .Select(r => r.PostId)
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .Select(id => Guid.TryParse(id, out var parsed) ? parsed : Guid.Empty)
                .Where(id => id != Guid.Empty)
                .Distinct()
                .ToList();

            if (stalePostIds.Count > 0)
            {
                var posts = await db.Posts
                    .Where(p => stalePostIds.Contains(p.Id) && !p.IsPinned)
                    .ToListAsync(cancellationToken);
                foreach (var post in posts)
                {
                    post.IsDeleted = true;
                    post.DeletedAt ??= DateTime.UtcNow;
                    post.UpdatedAt = DateTime.UtcNow;
                }
            }

            db.CompatJournalismReports.RemoveRange(stale);
            await db.SaveChangesAsync(cancellationToken);

            _logger.LogInformation(
                "Self-sanitized stale journalism content: removed {ReportCount} report rows and archived linked stale posts.",
                stale.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to self-sanitize stale journalism content.");
        }
    }

    private async Task CleanupStaleLiveStreamTombstonesAsync(CancellationToken cancellationToken)
    {
        var tombstoneDays = ReadPositiveInt("Retention:LiveStreamTombstoneDays", DefaultLiveStreamTombstoneRetentionDays);
        var cutoff = DateTime.UtcNow.AddDays(-tombstoneDays);

        try
        {
            using var scope = _scopeFactory.CreateScope();
            var liveStreamStateStore = scope.ServiceProvider.GetRequiredService<LiveStreamStateStore>();

            var staleIds = liveStreamStateStore.GetAll()
                .Where(stream =>
                    !stream.kept_permanently &&
                    stream.deleted_at.HasValue &&
                    stream.deleted_at.Value <= cutoff)
                .Select(stream => stream.id)
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            foreach (var id in staleIds)
            {
                liveStreamStateStore.Remove(id);
            }

            if (staleIds.Count > 0)
            {
                _logger.LogInformation(
                    "Self-sanitized stale go-live clutter: removed {Count} expired live stream tombstones.",
                    staleIds.Count);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to self-sanitize stale go-live records.");
        }
    }

    private int ReadPositiveInt(string key, int fallback)
    {
        var raw = (_configuration[key] ?? string.Empty).Trim();
        if (int.TryParse(raw, out var parsed) && parsed > 0)
        {
            return parsed;
        }

        return fallback;
    }
}
