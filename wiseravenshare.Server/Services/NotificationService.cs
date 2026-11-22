using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Hubs;
using Wiseravenshare.Server.Infrastructure.Data;

namespace Wiseravenshare.Server.Services;

public sealed class NotificationService : INotificationService
{
    private readonly AppDbContext _db;
    private readonly IHubContext<NotificationHub> _hub;
    private readonly ILogger<NotificationService> _logger;

    public NotificationService(
        AppDbContext db,
        IHubContext<NotificationHub> hub,
        ILogger<NotificationService> logger)
    {
        _db = db;
        _hub = hub;
        _logger = logger;
    }

    public async Task SendAsync(
        Guid recipientUserId,
        NotificationType type,
        Guid? actorId = null,
        Guid? postId = null,
        Guid? commentId = null,
        string? streamId = null,
        string? content = null,
        CancellationToken cancellationToken = default)
    {
        // Never self-notify
        if (actorId.HasValue && actorId.Value == recipientUserId) return;
        if (recipientUserId == Guid.Empty) return;

        try
        {
            var notification = new Notification
            {
                UserId    = recipientUserId,
                Type      = type,
                ActorId   = actorId,
                PostId    = postId,
                CommentId = commentId,
                StreamId  = streamId,
                Content   = content,
                IsRead    = false
            };

            _db.Notifications.Add(notification);
            await _db.SaveChangesAsync(cancellationToken);

            var link = postId.HasValue
                ? (commentId.HasValue
                    ? $"/social?post={postId.Value}&comment={commentId.Value}"
                    : $"/social?post={postId.Value}")
                : (!string.IsNullOrWhiteSpace(streamId) ? $"/go-live/{streamId}" : "/social");

            var title = type switch
            {
                NotificationType.Follow => "New Follower",
                NotificationType.Comment => "New Comment",
                NotificationType.Like => "New Like",
                NotificationType.Repost => "Post Reposted",
                NotificationType.ViralContent => "🔥 Viral Content Alert!",
                NotificationType.ViralAlert => "🔥 Viral Trending Alert!",
                NotificationType.LiveStream => "Live Stream Started",
                _ => type.ToString()
            };

            // Push real-time event to the recipient's SignalR group
            var group = NotificationHub.BuildUserGroup(recipientUserId.ToString());
            await _hub.Clients.Group(group).SendAsync("NewNotification", new
            {
                id              = notification.Id,
                type            = type.ToString(),
                actorId,
                postId,
                commentId,
                streamId,
                title,
                content,
                link,
                createdAt       = notification.CreatedAt,
                isRead          = false
            }, cancellationToken);
        }
        catch (Exception ex)
        {
            // Notifications are best-effort — never fail the caller
            _logger.LogWarning(ex,
                "Failed to deliver notification type={Type} to user {UserId}", type, recipientUserId);
        }
    }
}
