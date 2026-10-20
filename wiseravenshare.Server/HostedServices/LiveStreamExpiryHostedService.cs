using Microsoft.Extensions.DependencyInjection;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.HostedServices;

public sealed class LiveStreamExpiryHostedService : BackgroundService
{
    private static readonly TimeSpan WorkerInterval = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan ExpiryDuration = TimeSpan.FromHours(72);
    private static readonly TimeSpan ReminderWindow = TimeSpan.FromHours(24);

    private readonly LiveStreamStateStore _liveStreamStateStore;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<LiveStreamExpiryHostedService> _logger;

    public LiveStreamExpiryHostedService(
        LiveStreamStateStore liveStreamStateStore,
        IServiceScopeFactory scopeFactory,
        ILogger<LiveStreamExpiryHostedService> logger)
    {
        _liveStreamStateStore = liveStreamStateStore;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ProcessExpirationsAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Live stream expiry pass failed.");
            }

            try
            {
                await Task.Delay(WorkerInterval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task ProcessExpirationsAsync(CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var allStreams = _liveStreamStateStore.GetAll();

        foreach (var stream in allStreams)
        {
            if (!stream.ended_at.HasValue || stream.kept_permanently)
            {
                continue;
            }

            var streamId = stream.id;
            var expiresAt = stream.expires_at ?? stream.ended_at.Value.Add(ExpiryDuration);
            if (!stream.expires_at.HasValue)
            {
                _liveStreamStateStore.Update(streamId, s => s.expires_at = expiresAt);
            }

            if (!stream.expiry_reminder_sent_at.HasValue
                && expiresAt > now
                && expiresAt - now <= ReminderWindow)
            {
                _liveStreamStateStore.Update(streamId, s => s.expiry_reminder_sent_at = DateTime.UtcNow);
            }

            if (expiresAt > now && !stream.deleted_at.HasValue)
            {
                continue;
            }

            if (!stream.deleted_at.HasValue)
            {
                _liveStreamStateStore.Update(streamId, s =>
                {
                    s.deleted_at = DateTime.UtcNow;
                    s.status = "deleted";
                });
            }

            var refreshed = _liveStreamStateStore.Update(streamId, _ => { });
            if (refreshed is null)
            {
                continue;
            }

            var deleted = await TryDeleteSavedRecordingAsync(refreshed, cancellationToken);
            if (!deleted)
            {
                continue;
            }

            await TryDeleteStreamBlobsAsync(refreshed, cancellationToken);
            _liveStreamStateStore.Remove(streamId);
        }
    }

    private async Task<bool> TryDeleteSavedRecordingAsync(LiveStreamState stream, CancellationToken cancellationToken)
    {
        var videoId = (stream.final_video_id ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(videoId))
        {
            return true;
        }

        var userId = (stream.created_by_id ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(userId))
        {
            _logger.LogWarning("Could not delete live recording {VideoId}; missing owner id.", videoId);
            return false;
        }

        try
        {
            using var scope = _scopeFactory.CreateScope();
            var videoStore = scope.ServiceProvider.GetRequiredService<VideoLibraryStore>();
            await videoStore.DeleteVideoAsync(videoId, userId, cancellationToken);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not delete expired live recording {VideoId}.", videoId);
            return false;
        }
    }

    private async Task TryDeleteStreamBlobsAsync(LiveStreamState stream, CancellationToken cancellationToken)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var blobStorage = scope.ServiceProvider.GetRequiredService<IBlobStorageService>();

            var keys = _liveStreamStateStore.GetSegments(stream.id)
                .Select(x => x.storage_key)
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .ToList();
            if (!string.IsNullOrWhiteSpace(stream.final_recording_key))
            {
                keys.Add(stream.final_recording_key);
            }

            foreach (var key in keys.Distinct(StringComparer.OrdinalIgnoreCase))
            {
                await blobStorage.DeleteAsync(key, cancellationToken);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not clean up blob keys for expired stream {StreamId}.", stream.id);
        }
    }
}
