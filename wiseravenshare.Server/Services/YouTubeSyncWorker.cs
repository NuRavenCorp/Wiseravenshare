using Google.Apis.Services;
using GoogleYouTubeService = Google.Apis.YouTube.v3.YouTubeService;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Infrastructure.Data;
using UserRoleEnum = Wiseravenshare.Server.Entities.UserRole;

namespace Wiseravenshare.Server.Services;

public sealed class YouTubeSyncWorker : BackgroundService
{
    private static readonly TimeSpan PollInterval = TimeSpan.FromHours(1);
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(55);

    private readonly IServiceProvider _serviceProvider;
    private readonly IConfiguration _configuration;
    private readonly ILogger<YouTubeSyncWorker> _logger;

    public YouTubeSyncWorker(IServiceProvider serviceProvider, IConfiguration configuration, ILogger<YouTubeSyncWorker> logger)
    {
        _serviceProvider = serviceProvider;
        _configuration = configuration;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("YouTubeSyncWorker started. Poll interval: {Interval}", PollInterval);
        while (!stoppingToken.IsCancellationRequested)
        {
            try { await RunSyncPassAsync(stoppingToken); }
            catch (Exception ex) { _logger.LogError(ex, "YouTubeSyncWorker sync pass failed."); }
            try { await Task.Delay(PollInterval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
        _logger.LogInformation("YouTubeSyncWorker stopped.");
    }

    private async Task RunSyncPassAsync(CancellationToken ct)
    {
        var apiKey = _configuration["YouTubeSync:ApiKey"];
        var channelId = _configuration["YouTubeSync:ChannelId"];
        if (string.IsNullOrWhiteSpace(apiKey) || string.IsNullOrWhiteSpace(channelId))
        {
            _logger.LogDebug("YouTubeSync not configured. Skipping sync pass.");
            return;
        }

        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var cache = scope.ServiceProvider.GetRequiredService<IYouTubeCacheEngine>();

        var cacheKey = $"channel:{channelId}:uploads";
        var cached = await cache.GetAsync(cacheKey, ct);
        if (cached is not null) { _logger.LogDebug("YouTubeSyncWorker: cache hit, skipping API call."); return; }

        var yt = new GoogleYouTubeService(new BaseClientService.Initializer { ApiKey = apiKey, ApplicationName = "WiseRavenShare" });

        var channelsReq = yt.Channels.List("contentDetails");
        channelsReq.Id = channelId;
        var channelsResp = await channelsReq.ExecuteAsync(ct);
        var uploadsId = channelsResp.Items?.FirstOrDefault()?.ContentDetails?.RelatedPlaylists?.Uploads;
        if (string.IsNullOrWhiteSpace(uploadsId)) { _logger.LogWarning("Could not resolve uploads playlist for channel {Id}.", channelId); return; }

        var plReq = yt.PlaylistItems.List("snippet");
        plReq.PlaylistId = uploadsId;
        plReq.MaxResults = 25;
        var plResp = await plReq.ExecuteAsync(ct);

        var systemUserId = await db.Users
            .Where(u => u.Role == UserRoleEnum.Admin && !u.IsDeleted)
            .Select(u => u.Id)
            .FirstOrDefaultAsync(ct);

        if (systemUserId == Guid.Empty) { _logger.LogWarning("YouTubeSyncWorker: no admin user found; skipping import."); return; }

        var imported = 0;
        foreach (var item in plResp.Items ?? Enumerable.Empty<Google.Apis.YouTube.v3.Data.PlaylistItem>())
        {
            var vid = item.Snippet?.ResourceId?.VideoId;
            if (string.IsNullOrWhiteSpace(vid)) continue;
            var url = $"https://www.youtube.com/watch?v={vid}";
            if (await db.MediaItems.AnyAsync(m => m.FileUrl == url && !m.IsDeleted, ct)) continue;

            db.MediaItems.Add(new MediaItem
            {
                Title = item.Snippet.Title ?? "Untitled",
                Description = item.Snippet.Description,
                MediaType = MediaType.Video,
                Status = MediaStatus.Ready,
                FileName = $"{vid}.youtube",
                FilePath = url,
                FileUrl = url,
                MimeType = "video/youtube",
                ThumbnailUrl = item.Snippet.Thumbnails?.Medium?.Url,
                Visibility = MediaVisibility.Public,
                UserId = systemUserId,
                CreatedAt = item.Snippet.PublishedAt ?? DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            });
            imported++;
        }

        if (imported > 0) { await db.SaveChangesAsync(ct); _logger.LogInformation("YouTubeSyncWorker: imported {N} videos.", imported); }

        await cache.SetAsync(cacheKey, JsonSerializer.Serialize(plResp), CacheTtl, ct);
    }
}
