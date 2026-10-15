using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Wiseravenshare.Server.Hubs;

[Authorize]
public class SocialHub : Hub
{
    public Task JoinMediaGroup(string mediaContentId)
    {
        var key = BuildMediaGroup(mediaContentId);
        return string.IsNullOrWhiteSpace(key) ? Task.CompletedTask : Groups.AddToGroupAsync(Context.ConnectionId, key);
    }

    public Task LeaveMediaGroup(string mediaContentId)
    {
        var key = BuildMediaGroup(mediaContentId);
        return string.IsNullOrWhiteSpace(key) ? Task.CompletedTask : Groups.RemoveFromGroupAsync(Context.ConnectionId, key);
    }

    public static string BuildMediaGroup(string mediaContentId)
        => string.IsNullOrWhiteSpace(mediaContentId) ? string.Empty : $"media:{mediaContentId.Trim().ToLowerInvariant()}";

    public static string BuildUserGroup(string userId)
        => string.IsNullOrWhiteSpace(userId) ? string.Empty : $"user:{userId.Trim().ToLowerInvariant()}";
}
