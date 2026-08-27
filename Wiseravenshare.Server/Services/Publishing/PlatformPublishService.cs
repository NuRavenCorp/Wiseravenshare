// Wiseravenshare.Server/Services/Publishing/PlatformPublishService.cs
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using Wiseravenshare.Server.DTOs.Collaboration;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Entities.Collaboration;
using Wiseravenshare.Server.Enums;
using Wiseravenshare.Server.Exceptions;
using Wiseravenshare.Server.Interfaces.Repositories;
using Wiseravenshare.Server.Interfaces.Services;
using Wiseravenshare.Server.Services.CrossPlatform;

namespace Wiseravenshare.Server.Services.Publishing;

public class PlatformPublishService : IPlatformPublishService
{
    private const int MaxRetries = 3;

    private readonly IPlatformPublishRepository _publishRepository;
    private readonly IProjectContentRepository _contentRepository;
    private readonly IProjectRepository _projectRepository;
    private readonly IEnumerable<ICrossPlatformPublisher> _publishers;
    private readonly ICollaborationNotificationService _notifications;
    private readonly ILogger<PlatformPublishService> _logger;
    private readonly IMemoryCache _cache;

    public PlatformPublishService(
        IPlatformPublishRepository publishRepository,
        IProjectContentRepository contentRepository,
        IProjectRepository projectRepository,
        IEnumerable<ICrossPlatformPublisher> publishers,
        ICollaborationNotificationService notifications,
        ILogger<PlatformPublishService> logger,
        IMemoryCache cache)
    {
        _publishRepository = publishRepository;
        _contentRepository = contentRepository;
        _projectRepository = projectRepository;
        _publishers = publishers;
        _notifications = notifications;
        _logger = logger;
        _cache = cache;
    }

    public async Task<PlatformPublish> PublishToPlatformAsync(Guid contentId, SocialPlatform platform, Dictionary<string, object>? platformSettings = null)
    {
        var content = await _contentRepository.GetByIdAsync(contentId)
            ?? throw new NotFoundException("Content not found");
        var project = await _projectRepository.GetByIdAsync(content.ProjectId)
            ?? throw new NotFoundException("Project not found");

        var publish = new PlatformPublish
        {
            ProjectId = project.Id,
            ContentId = content.Id,
            Platform = platform,
            Status = PublishStatus.Processing,
            ScheduledAt = DateTime.UtcNow,
            PlatformSettings = ToJson(platformSettings),
            RetryCount = 0
        };
        await _publishRepository.AddAsync(publish);

        try
        {
            var (postId, url, metadata) = await DispatchAsync(platform, content, project);

            publish.Status = PublishStatus.Published;
            publish.PublishedAt = DateTime.UtcNow;
            publish.PlatformPostId = postId;
            publish.PlatformUrl = url;
            publish.PlatformResponse = ToJson(metadata);
            await _publishRepository.UpdateAsync(publish);

            content.IsPublished = true;
            content.PublishedAt ??= DateTime.UtcNow;
            await _contentRepository.UpdateAsync(content);

            await RecordActivityAsync(project.Id, ActivityType.ContentPublished, $"Content '{content.Title}' published to {platform}.");
            await _notifications.NotifyContentPublishedAsync(project.Id, content.Id, platform);

            _logger.LogInformation("Published content {ContentId} to {Platform}", contentId, platform);
            return publish;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to publish content {ContentId} to {Platform}", contentId, platform);
            publish.Status = PublishStatus.Failed;
            publish.ErrorMessage = ex.Message;
            publish.RetryCount++;
            await _publishRepository.UpdateAsync(publish);
            throw;
        }
    }

    public async Task<PlatformPublish> SchedulePublishAsync(Guid contentId, SocialPlatform platform, DateTime scheduledTime, Dictionary<string, object>? platformSettings = null)
    {
        if (scheduledTime <= DateTime.UtcNow)
            throw new BadRequestException("Scheduled time must be in the future");

        var content = await _contentRepository.GetByIdAsync(contentId)
            ?? throw new NotFoundException("Content not found");
        var project = await _projectRepository.GetByIdAsync(content.ProjectId)
            ?? throw new NotFoundException("Project not found");

        var publish = new PlatformPublish
        {
            ProjectId = project.Id,
            ContentId = content.Id,
            Platform = platform,
            Status = PublishStatus.Scheduled,
            ScheduledAt = scheduledTime,
            PlatformSettings = ToJson(platformSettings),
            RetryCount = 0
        };
        await _publishRepository.AddAsync(publish);

        _logger.LogInformation("Scheduled content {ContentId} to {Platform} at {ScheduledTime}", contentId, platform, scheduledTime);
        return publish;
    }

    public async Task<bool> UpdatePublishStatusAsync(Guid publishId, PublishStatus status, string? errorMessage = null)
    {
        var publish = await _publishRepository.GetByIdAsync(publishId);
        if (publish is null) return false;

        publish.Status = status;
        if (status == PublishStatus.Published) publish.PublishedAt = DateTime.UtcNow;
        if (!string.IsNullOrEmpty(errorMessage)) publish.ErrorMessage = errorMessage;

        await _publishRepository.UpdateAsync(publish);
        return true;
    }

    public async Task<PlatformPublish> GetPublishStatusAsync(Guid publishId)
        => await _publishRepository.GetByIdAsync(publishId)
            ?? throw new NotFoundException("Publish record not found");

    public Task<IEnumerable<PlatformPublish>> GetPlatformPublishesAsync(Guid contentId)
        => _publishRepository.GetByContentAsync(contentId);

    public async Task<Dictionary<SocialPlatform, PublishStatus>> GetPublishStatusForAllPlatformsAsync(Guid contentId)
    {
        var publishes = await GetPlatformPublishesAsync(contentId);
        return publishes.ToDictionary(p => p.Platform, p => p.Status);
    }

    public async Task<bool> RetryPublishAsync(Guid publishId)
    {
        var publish = await _publishRepository.GetByIdAsync(publishId);
        if (publish is null || publish.Status != PublishStatus.Failed) return false;
        if (publish.RetryCount >= MaxRetries)
            throw new InvalidOperationException("Maximum retry attempts exceeded");

        var content = await _contentRepository.GetByIdAsync(publish.ContentId)
            ?? throw new NotFoundException("Content not found");
        var project = await _projectRepository.GetByIdAsync(publish.ProjectId)
            ?? throw new NotFoundException("Project not found");

        publish.Status = PublishStatus.Retrying;
        publish.RetryCount++;
        await _publishRepository.UpdateAsync(publish);

        try
        {
            var (postId, url, metadata) = await DispatchAsync(publish.Platform, content, project);

            publish.Status = PublishStatus.Published;
            publish.PublishedAt = DateTime.UtcNow;
            publish.PlatformPostId = postId;
            publish.PlatformUrl = url;
            publish.PlatformResponse = ToJson(metadata);
            publish.ErrorMessage = null;
            await _publishRepository.UpdateAsync(publish);
            return true;
        }
        catch (Exception ex)
        {
            publish.Status = PublishStatus.Failed;
            publish.ErrorMessage = ex.Message;
            await _publishRepository.UpdateAsync(publish);
            throw;
        }
    }

    public async Task<bool> CancelPublishAsync(Guid publishId)
    {
        var publish = await _publishRepository.GetByIdAsync(publishId);
        if (publish is null || publish.Status == PublishStatus.Published) return false;

        publish.Status = PublishStatus.Cancelled;
        await _publishRepository.UpdateAsync(publish);
        return true;
    }

    public async Task<CrossPlatformAnalytics> GetCrossPlatformAnalyticsAsync(Guid contentId)
    {
        var publishes = await GetPlatformPublishesAsync(contentId);
        var analytics = new CrossPlatformAnalytics
        {
            ContentId = contentId,
            TotalViews = publishes.Sum(p => p.Views),
            TotalLikes = publishes.Sum(p => p.Likes),
            TotalComments = publishes.Sum(p => p.Comments),
            TotalShares = publishes.Sum(p => p.Shares),
            TotalEngagement = publishes.Sum(p => p.Engagement)
        };

        foreach (var publish in publishes)
        {
            analytics.Platforms.Add(publish.Platform.ToString(), new PlatformAnalytics
            {
                Platform = publish.Platform.ToString(),
                Views = publish.Views,
                Likes = publish.Likes,
                Comments = publish.Comments,
                Shares = publish.Shares,
                Engagement = publish.Engagement,
                PublishedAt = publish.PublishedAt,
                PlatformUrl = publish.PlatformUrl
            });
        }
        return analytics;
    }

    /// <summary>Background worker entry point: publishes everything that is due.</summary>
    public async Task<int> ProcessScheduledPublishesAsync(CancellationToken cancellationToken = default)
    {
        var due = await _publishRepository.GetDueScheduledAsync(DateTime.UtcNow);
        var processed = 0;

        foreach (var publish in due)
        {
            if (cancellationToken.IsCancellationRequested) break;

            try
            {
                publish.Status = PublishStatus.Processing;
                await _publishRepository.UpdateAsync(publish);

                var content = await _contentRepository.GetByIdAsync(publish.ContentId);
                var project = await _projectRepository.GetByIdAsync(publish.ProjectId);
                if (content is null || project is null)
                {
                    publish.Status = PublishStatus.Failed;
                    publish.ErrorMessage = "Content or project no longer exists";
                    await _publishRepository.UpdateAsync(publish);
                    continue;
                }

                var (postId, url, metadata) = await DispatchAsync(publish.Platform, content, project);

                publish.Status = PublishStatus.Published;
                publish.PublishedAt = DateTime.UtcNow;
                publish.PlatformPostId = postId;
                publish.PlatformUrl = url;
                publish.PlatformResponse = ToJson(metadata);
                await _publishRepository.UpdateAsync(publish);

                content.IsPublished = true;
                content.PublishedAt ??= DateTime.UtcNow;
                await _contentRepository.UpdateAsync(content);
                processed++;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Scheduled publish {PublishId} failed", publish.Id);
                publish.Status = publish.RetryCount < MaxRetries ? PublishStatus.Scheduled : PublishStatus.Failed;
                publish.ErrorMessage = ex.Message;
                publish.RetryCount++;
                publish.ScheduledAt = DateTime.UtcNow.AddMinutes(5 * publish.RetryCount);
                await _publishRepository.UpdateAsync(publish);
            }
        }
        return processed;
    }

    private async Task<(string PostId, string Url, Dictionary<string, object> Metadata)> DispatchAsync(
        SocialPlatform platform, ProjectContent content, Project project)
    {
        var platformKey = NormalizePlatformKey(platform);
        var publisher = _publishers.FirstOrDefault(p =>
            string.Equals(p.Platform, platformKey, StringComparison.OrdinalIgnoreCase));

        if (publisher is null)
            throw new NotSupportedException($"Platform {platform} has no registered publisher");
        if (!publisher.IsConfigured())
            throw new InvalidOperationException($"{platformKey} is not configured. Add credentials in appsettings.");

        var request = BuildRequest(content, project, platformKey);
        var result = await publisher.PublishAsync(request);

        if (!result.Success)
            throw new InvalidOperationException(result.Error ?? $"{platformKey} publish failed");

        var metadata = new Dictionary<string, object>();
        if (!string.IsNullOrEmpty(result.ExternalPostId)) metadata["externalPostId"] = result.ExternalPostId;

        return (result.ExternalPostId ?? string.Empty, result.ExternalPostUrl ?? string.Empty, metadata);
    }

    private CrossPlatformPublishRequest BuildRequest(ProjectContent content, Project project, string platformKey)
    {
        var bodyLimit = platformKey.ToLowerInvariant() switch
        {
            "twitter" => 280,
            "tiktok" => 2200,
            "instagram" => 2200,
            "youtube" => 5000,
            _ => 5000
        };

        var message = content.Content is null
            ? content.Title
            : $"{content.Title}\n\n{content.Content}";

        return new CrossPlatformPublishRequest
        {
            PostId = content.Id,
            Message = Truncate(message, bodyLimit),
            MediaUrl = content.MediaUrls?.FirstOrDefault(),
            MediaType = InferMediaType(content.Type),
            Platforms = new List<string> { platformKey }
        };
    }

    private static string NormalizePlatformKey(SocialPlatform platform) => platform switch
    {
        SocialPlatform.YouTube => "youtube",
        SocialPlatform.TikTok => "tiktok",
        SocialPlatform.Facebook => "facebook",
        SocialPlatform.Instagram => "instagram",
        SocialPlatform.Twitter => "twitter",
        SocialPlatform.LinkedIn => "linkedin",
        _ => platform.ToString().ToLowerInvariant()
    };

    private static string Truncate(string? text, int maxLength)
    {
        if (string.IsNullOrEmpty(text)) return string.Empty;
        return text.Length <= maxLength ? text : text[..(maxLength - 3)] + "...";
    }

    private static string InferMediaType(ContentType type) => type switch
    {
        ContentType.Video => "video",
        ContentType.Image => "photo",
        ContentType.Audio or ContentType.Podcast => "photo",
        _ => "auto"
    };

    private static JsonDocument? ToJson(Dictionary<string, object>? data)
        => data is null || data.Count == 0
            ? null
            : JsonDocument.Parse(JsonSerializer.Serialize(data));

    private async Task RecordActivityAsync(Guid projectId, ActivityType type, string summary)
    {
        // Activity feed best-effort: publishing must not fail over activity logging.
        try
        {
            await _notifications.NotifyProjectUpdatedAsync(projectId, summary);
        }
        catch
        {
            // ignored
        }
    }
}

public class CrossPlatformAnalytics
{
    public Guid ContentId { get; set; }
    public int TotalViews { get; set; }
    public int TotalLikes { get; set; }
    public int TotalComments { get; set; }
    public int TotalShares { get; set; }
    public int TotalEngagement { get; set; }
    public Dictionary<string, PlatformAnalytics> Platforms { get; set; } = new();
}

public class PlatformAnalytics
{
    public string Platform { get; set; } = string.Empty;
    public int Views { get; set; }
    public int Likes { get; set; }
    public int Comments { get; set; }
    public int Shares { get; set; }
    public int Engagement { get; set; }
    public DateTime? PublishedAt { get; set; }
    public string? PlatformUrl { get; set; }
}
