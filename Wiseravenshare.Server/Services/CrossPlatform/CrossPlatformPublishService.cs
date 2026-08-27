// Wiseravenshare.Server/Services/CrossPlatform/CrossPlatformPublishService.cs
using Wiseravenshare.Server.DTOs.Social;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Infrastructure.Data.Repositories;
using Wiseravenshare.Server.Interfaces.Repositories;

namespace Wiseravenshare.Server.Services.CrossPlatform;

public interface ICrossPlatformPublishService
{
    /// <summary>
    /// Fans a single post out to the requested platforms (all configured
    /// platforms when none are specified) and records each attempt.
    /// </summary>
    Task<CrossPlatformPublishResponse> PublishAsync(Guid userId, CrossPlatformPublishRequest request);

    /// <summary>Status of every recorded cross-post for a post.</summary>
    Task<CrossPostStatusDto> GetStatusAsync(Guid postId);
}

public class CrossPlatformPublishService : ICrossPlatformPublishService
{
    private readonly IEnumerable<ICrossPlatformPublisher> _publishers;
    private readonly ISocialCrossPostRepository _crossPostRepository;
    private readonly ILogger<CrossPlatformPublishService> _logger;

    public CrossPlatformPublishService(
        IEnumerable<ICrossPlatformPublisher> publishers,
        ISocialCrossPostRepository crossPostRepository,
        ILogger<CrossPlatformPublishService> logger)
    {
        _publishers = publishers;
        _crossPostRepository = crossPostRepository;
        _logger = logger;
    }

    public async Task<CrossPlatformPublishResponse> PublishAsync(Guid userId, CrossPlatformPublishRequest request)
    {
        var response = new CrossPlatformPublishResponse { PostId = request.PostId };
        var requested = (request.Platforms is { Count: > 0 })
            ? request.Platforms
                .Select(p => p.Trim().ToLowerInvariant())
                .Where(SocialPlatforms.IsValid)
                .Distinct()
                .ToList()
            : SocialPlatforms.All.ToList();

        foreach (var platformKey in requested)
        {
            var publisher = _publishers.FirstOrDefault(p =>
                string.Equals(p.Platform, platformKey, StringComparison.OrdinalIgnoreCase));

            if (publisher is null)
            {
                response.Results.Add(new CrossPlatformPublishResultDto
                {
                    Platform = platformKey,
                    Success = false,
                    Error = $"No publisher registered for platform '{platformKey}'."
                });
                continue;
            }

            if (!publisher.IsConfigured())
            {
                response.Results.Add(new CrossPlatformPublishResultDto
                {
                    Platform = platformKey,
                    Success = false,
                    Skipped = true,
                    SkipReason = $"{platformKey} credentials are not configured."
                });
                await RecordAsync(request.PostId, userId, platformKey, "Failed", null, null, "Not configured");
                continue;
            }

            CrossPlatformPublishResultDto result;
            try
            {
                result = await publisher.PublishAsync(request);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "{Platform} publisher threw for post {PostId}", platformKey, request.PostId);
                result = CrossPlatformErrors.Failed(platformKey, ex.Message);
            }

            response.Results.Add(result);

            await RecordAsync(
                request.PostId,
                userId,
                platformKey,
                result.Success ? "Published" : "Failed",
                result.ExternalPostId,
                result.ExternalPostUrl,
                result.Error);
        }

        _logger.LogInformation(
            "Cross-platform publish for post {PostId}: {Succeeded}/{Total} succeeded.",
            request.PostId,
            response.Results.Count(r => r.Success),
            response.Results.Count);

        return response;
    }

    public async Task<CrossPostStatusDto> GetStatusAsync(Guid postId)
    {
        var records = await _crossPostRepository.GetByPostIdAsync(postId);
        return new CrossPostStatusDto
        {
            PostId = postId,
            Platforms = records.Select(Map).ToList()
        };
    }

    private async Task RecordAsync(
        Guid postId,
        Guid userId,
        string platform,
        string status,
        string? externalPostId,
        string? externalPostUrl,
        string? error)
    {
        try
        {
            await _crossPostRepository.UpsertAsync(new SocialCrossPost
            {
                PostId = postId,
                UserId = userId,
                Platform = platform,
                Status = status,
                ExternalPostId = externalPostId,
                ExternalPostUrl = externalPostUrl,
                ErrorMessage = error,
                PublishedAt = status == "Published" ? DateTimeOffset.UtcNow : null
            });
        }
        catch (Exception ex)
        {
            // Recording failures must never break publishing itself.
            _logger.LogWarning(ex, "Failed to record cross-post for post {PostId} to {Platform}", postId, platform);
        }
    }

    private  SocialCrossPostDto Map(SocialCrossPost c) => new()
    {
        Id = c.Id,
        Platform = c.Platform,
        Status = c.Status,
        ExternalPostId = c.ExternalPostId,
        ExternalPostUrl = c.ExternalPostUrl,
        ErrorMessage = c.ErrorMessage,
        PublishedAt = c.PublishedAt
    };
}
