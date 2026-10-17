using System.Collections.Concurrent;
using Wiseravenshare.Server.DTOs.Social;

namespace Wiseravenshare.Server.Services.SocialPublishing;

public enum SocialPublishJobState
{
    Queued,
    Running,
    Completed,
    Failed
}

public sealed class SocialPublishJobSnapshot
{
    public Guid JobId { get; init; }
    public Guid UserId { get; init; }
    public SocialPublishJobState State { get; set; } = SocialPublishJobState.Queued;
    public Dictionary<string, object?> Results { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public string? Error { get; set; }
    public DateTimeOffset CreatedUtc { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? CompletedUtc { get; set; }
}

public sealed class SocialPublishQueueItem
{
    public Guid JobId { get; init; }
    public Guid UserId { get; init; }
    public required PublishSocialContentRequest Request { get; init; }
    public required List<string> Platforms { get; init; }
}

public interface ISocialPublishQueue
{
    SocialPublishJobSnapshot Enqueue(Guid userId, PublishSocialContentRequest request, IEnumerable<string> platforms);
    SocialPublishJobSnapshot? Get(Guid jobId, Guid userId);
}

/// <summary>
/// In-process queued social publisher so large/resumable uploads do not hold the request open.
/// </summary>
public sealed class SocialPublishQueueService : BackgroundService, ISocialPublishQueue
{
    private static readonly TimeSpan Retention = TimeSpan.FromHours(1);
    private const int MaxSnapshots = 4000;

    private readonly ConcurrentQueue<SocialPublishQueueItem> _queue = new();
    private readonly ConcurrentDictionary<Guid, SocialPublishJobSnapshot> _jobs = new();
    private readonly SemaphoreSlim _slots = new(2, 2);
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<SocialPublishQueueService> _logger;

    public SocialPublishQueueService(IServiceScopeFactory scopeFactory, ILogger<SocialPublishQueueService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public SocialPublishJobSnapshot Enqueue(Guid userId, PublishSocialContentRequest request, IEnumerable<string> platforms)
    {
        var jobId = Guid.NewGuid();
        var platformList = platforms
            .Where(p => !string.IsNullOrWhiteSpace(p))
            .Select(p => p.Trim().ToLowerInvariant())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var snapshot = new SocialPublishJobSnapshot
        {
            JobId = jobId,
            UserId = userId,
            State = SocialPublishJobState.Queued,
            Results = platformList.ToDictionary(
                key => key,
                _ => (object?)new { queued = true },
                StringComparer.OrdinalIgnoreCase)
        };

        _jobs[jobId] = snapshot;
        _queue.Enqueue(new SocialPublishQueueItem
        {
            JobId = jobId,
            UserId = userId,
            Request = request,
            Platforms = platformList
        });
        return snapshot;
    }

    public SocialPublishJobSnapshot? Get(Guid jobId, Guid userId)
    {
        if (!_jobs.TryGetValue(jobId, out var snapshot))
        {
            return null;
        }

        if (snapshot.UserId != userId)
        {
            return null;
        }

        return snapshot;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Social publish queue worker started.");

        while (!stoppingToken.IsCancellationRequested)
        {
            await _slots.WaitAsync(stoppingToken);

            if (!_queue.TryDequeue(out var item))
            {
                _slots.Release();
                Prune();
                await Task.Delay(250, stoppingToken);
                continue;
            }

            _ = ProcessAsync(item);
        }
    }

    private async Task ProcessAsync(SocialPublishQueueItem item)
    {
        try
        {
            if (!_jobs.TryGetValue(item.JobId, out var snapshot))
            {
                return;
            }

            snapshot.State = SocialPublishJobState.Running;

            using var scope = _scopeFactory.CreateScope();
            var social = scope.ServiceProvider.GetRequiredService<ISocialPlatformService>();
            var result = await social.PublishAsync(item.UserId, item.Request);

            var mapped = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
            foreach (var platform in item.Platforms)
            {
                mapped[platform] = new { queued = false, running = false, pending = true };
            }

            foreach (var itemResult in result.Results)
            {
                mapped[itemResult.Platform] = itemResult.Success
                    ? new { success = true, post_id = itemResult.ExternalPostId, url = itemResult.ExternalPostUrl }
                    : new { error = itemResult.Error ?? "failed" };
            }

            snapshot.Results = mapped;
            snapshot.State = SocialPublishJobState.Completed;
            snapshot.CompletedUtc = DateTimeOffset.UtcNow;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Queued social publish {JobId} failed.", item.JobId);
            if (_jobs.TryGetValue(item.JobId, out var snapshot))
            {
                snapshot.State = SocialPublishJobState.Failed;
                snapshot.Error = ex.Message;
                snapshot.CompletedUtc = DateTimeOffset.UtcNow;
            }
        }
        finally
        {
            _slots.Release();
        }
    }

    private void Prune()
    {
        if (_jobs.Count <= MaxSnapshots)
        {
            return;
        }

        var cutoff = DateTimeOffset.UtcNow - Retention;
        foreach (var (jobId, snapshot) in _jobs)
        {
            if (snapshot.CompletedUtc is { } completed
                && completed < cutoff
                && snapshot.State is SocialPublishJobState.Completed or SocialPublishJobState.Failed)
            {
                _jobs.TryRemove(jobId, out _);
            }
        }
    }
}
