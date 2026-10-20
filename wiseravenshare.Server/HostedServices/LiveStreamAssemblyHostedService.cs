using Microsoft.Extensions.DependencyInjection;
using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.HostedServices;

public sealed class LiveStreamAssemblyHostedService : BackgroundService
{
    private static readonly TimeSpan WorkerInterval = TimeSpan.FromSeconds(30);

    private readonly LiveStreamStateStore _liveStreamStateStore;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<LiveStreamAssemblyHostedService> _logger;

    public LiveStreamAssemblyHostedService(
        LiveStreamStateStore liveStreamStateStore,
        IServiceScopeFactory scopeFactory,
        ILogger<LiveStreamAssemblyHostedService> logger)
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
                await AssemblePendingStreamsAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Live stream assembly pass failed.");
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

    private async Task AssemblePendingStreamsAsync(CancellationToken cancellationToken)
    {
        var candidates = _liveStreamStateStore.GetAll()
            .Where(x => x.deleted_at is null)
            .Where(x => x.ended_at.HasValue)
            .Where(x => string.IsNullOrWhiteSpace(x.final_recording_key))
            .Take(20)
            .ToList();

        if (candidates.Count == 0)
        {
            return;
        }

        using var scope = _scopeFactory.CreateScope();
        var blobStorage = scope.ServiceProvider.GetRequiredService<IBlobStorageService>();
        var videoStore = scope.ServiceProvider.GetRequiredService<VideoLibraryStore>();

        foreach (var stream in candidates)
        {
            try
            {
                await AssembleOneAsync(stream, blobStorage, videoStore, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not assemble live stream {StreamId}.", stream.id);
            }
        }
    }

    private async Task AssembleOneAsync(
        LiveStreamState stream,
        IBlobStorageService blobStorage,
        VideoLibraryStore videoStore,
        CancellationToken cancellationToken)
    {
        var segments = _liveStreamStateStore.GetSegments(stream.id)
            .Where(x => string.Equals(x.upload_state, "done", StringComparison.OrdinalIgnoreCase))
            .OrderBy(x => x.segment_index)
            .ToList();
        if (segments.Count == 0)
        {
            return;
        }

        await using var output = new MemoryStream();
        foreach (var segment in segments)
        {
            var segmentStream = await blobStorage.OpenReadAsync(segment.storage_key, cancellationToken);
            if (segmentStream is null)
            {
                continue;
            }

            await using (segmentStream)
            {
                await segmentStream.CopyToAsync(output, cancellationToken);
            }
        }

        if (output.Length <= 0)
        {
            return;
        }

        output.Position = 0;
        var finalKey = $"live/{stream.id}/final.webm";
        var uploaded = await blobStorage.UploadAsync(finalKey, output, "video/webm", cancellationToken);
        var streamPath = StreamingUrlHelper.StreamByBlobPath(uploaded.ObjectKey);
        var mediaUrl = StreamingUrlHelper.ResolveMediaUrl(uploaded.PublicUrl, streamPath);

        if (string.IsNullOrWhiteSpace(stream.created_by_id))
        {
            _logger.LogWarning("Skipping video library insertion for stream {StreamId}; missing owner id.", stream.id);
            return;
        }

        var title = string.IsNullOrWhiteSpace(stream.title) ? "Live recording" : stream.title.Trim();
        var video = await videoStore.CreateVideoAsync(new CreateVideoLibraryEntryRequest
        {
            UserId = stream.created_by_id,
            Title = $"Live: {title}",
            Description = "Auto-saved live recording",
            Tags = new[] { "live", "auto-saved" },
            VideoUrl = mediaUrl,
            Status = "published",
            PrivacyStatus = "unlisted",
            StorageMode = "temporary",
            IsPermanent = true,
        }, cancellationToken);

        var approxDurationMs = segments.Count * 5000L;
        _liveStreamStateStore.Update(stream.id, s =>
        {
            s.final_recording_key = uploaded.ObjectKey;
            s.final_recording_uri = mediaUrl;
            s.final_video_id = video.Id;
            s.total_segments = segments.Count;
            s.recorded_duration_ms = approxDurationMs;
            if (!s.expires_at.HasValue && s.ended_at.HasValue && !s.kept_permanently)
            {
                s.expires_at = s.ended_at.Value.AddHours(72);
            }
        });
    }
}
