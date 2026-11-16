using Wiseravenshare.Server.Entities;

namespace Wiseravenshare.Server.Services;

public interface INotificationService
{
    /// <summary>
    /// Creates a Notification row and pushes a real-time hub event to the recipient.
    /// All parameters except recipientUserId and type are optional.
    /// No-ops when actorId == recipientUserId (no self-notify).
    /// </summary>
    Task SendAsync(
        Guid recipientUserId,
        NotificationType type,
        Guid? actorId = null,
        Guid? postId = null,
        Guid? commentId = null,
        string? streamId = null,
        string? content = null,
        CancellationToken cancellationToken = default);
}
