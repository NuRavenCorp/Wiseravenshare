// Wiseravenshare.Server/Services/EngagementNotificationService.cs
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Interfaces.Repositories;
using Microsoft.Extensions.Logging;

namespace Wiseravenshare.Server.Services.Communication;

/// <summary>
/// Service for sending engagement notifications (likes, comments, shares, mentions)
/// </summary>
public interface IEngagementNotificationService
{
    /// <summary>
    /// Notify a user that their post was liked
    /// </summary>
    Task NotifyPostLikedAsync(Guid userId, Guid postId, string likerName, string postTitle);

    /// <summary>
    /// Notify a user that their post was commented on
    /// </summary>
    Task NotifyPostCommentedAsync(Guid userId, Guid postId, string commenterName, string postTitle);

    /// <summary>
    /// Notify a user that their post was shared/reposted
    /// </summary>
    Task NotifyPostSharedAsync(Guid userId, Guid postId, string sharedByName, string postTitle);

    /// <summary>
    /// Notify a user that they were mentioned in a post
    /// </summary>
    Task NotifyUserMentionedAsync(Guid userId, Guid postId, string mentionerName, string postTitle);

    /// <summary>
    /// Notify a user about collaboration request
    /// </summary>
    Task NotifyCollaborationRequestAsync(Guid userId, string collaboratorName, string projectTitle);
}

public class EngagementNotificationService : IEngagementNotificationService
{
    private readonly ICommunicationService _communicationService;
    private readonly IUserRepository _userRepository;
    private readonly ILogger<EngagementNotificationService> _logger;

    public EngagementNotificationService(
        ICommunicationService communicationService,
        IUserRepository userRepository,
        ILogger<EngagementNotificationService> logger)
    {
        _communicationService = communicationService;
        _userRepository = userRepository;
        _logger = logger;
    }

    public async Task NotifyPostLikedAsync(Guid userId, Guid postId, string likerName, string postTitle)
    {
        try
        {
            var user = await _userRepository.GetByIdAsync(userId);
            if (user == null)
            {
                _logger.LogWarning("User {UserId} not found for like notification", userId);
                return;
            }

            var message = $"{likerName} liked your post: \"{postTitle}\"";
            await _communicationService.NotifyEngagementAsync(
                user.Id.ToString(),
                postTitle,
                "like"
            );

            _logger.LogInformation(
                "Sent like notification to user {UserId} for post {PostId}",
                userId,
                postId
            );
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex,
                "Error sending like notification to user {UserId} for post {PostId}",
                userId,
                postId
            );
            // Don't throw - engagement notifications should be fire-and-forget
        }
    }

    public async Task NotifyPostCommentedAsync(Guid userId, Guid postId, string commenterName, string postTitle)
    {
        try
        {
            var user = await _userRepository.GetByIdAsync(userId);
            if (user == null)
            {
                _logger.LogWarning("User {UserId} not found for comment notification", userId);
                return;
            }

            await _communicationService.NotifyEngagementAsync(
                user.Id.ToString(),
                postTitle,
                "comment"
            );

            _logger.LogInformation(
                "Sent comment notification to user {UserId} for post {PostId}",
                userId,
                postId
            );
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex,
                "Error sending comment notification to user {UserId} for post {PostId}",
                userId,
                postId
            );
        }
    }

    public async Task NotifyPostSharedAsync(Guid userId, Guid postId, string sharedByName, string postTitle)
    {
        try
        {
            var user = await _userRepository.GetByIdAsync(userId);
            if (user == null)
            {
                _logger.LogWarning("User {UserId} not found for share notification", userId);
                return;
            }

            await _communicationService.NotifyEngagementAsync(
                user.Id.ToString(),
                postTitle,
                "share"
            );

            _logger.LogInformation(
                "Sent share notification to user {UserId} for post {PostId}",
                userId,
                postId
            );
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex,
                "Error sending share notification to user {UserId} for post {PostId}",
                userId,
                postId
            );
        }
    }

    public async Task NotifyUserMentionedAsync(Guid userId, Guid postId, string mentionerName, string postTitle)
    {
        try
        {
            var user = await _userRepository.GetByIdAsync(userId);
            if (user == null)
            {
                _logger.LogWarning("User {UserId} not found for mention notification", userId);
                return;
            }

            await _communicationService.NotifyEngagementAsync(
                user.Id.ToString(),
                postTitle,
                "mention"
            );

            _logger.LogInformation(
                "Sent mention notification to user {UserId} for post {PostId}",
                userId,
                postId
            );
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex,
                "Error sending mention notification to user {UserId} for post {PostId}",
                userId,
                postId
            );
        }
    }

    public async Task NotifyCollaborationRequestAsync(Guid userId, string collaboratorName, string projectTitle)
    {
        try
        {
            var user = await _userRepository.GetByIdAsync(userId);
            if (user == null)
            {
                _logger.LogWarning("User {UserId} not found for collaboration notification", userId);
                return;
            }

            await _communicationService.NotifyEngagementAsync(
                user.Id.ToString(),
                projectTitle,
                "collaborate"
            );

            _logger.LogInformation(
                "Sent collaboration notification to user {UserId}",
                userId
            );
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex,
                "Error sending collaboration notification to user {UserId}",
                userId
            );
        }
    }
}
