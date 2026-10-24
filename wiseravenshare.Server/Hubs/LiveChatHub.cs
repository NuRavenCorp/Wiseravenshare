using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Wiseravenshare.Server.Hubs;

[AllowAnonymous]
public sealed class LiveChatHub : Hub
{
    public async Task JoinRoom(string roomId)
    {
        var normalizedRoomId = NormalizeRoomId(roomId);
        await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(normalizedRoomId));
    }

    public async Task LeaveRoom(string roomId)
    {
        var normalizedRoomId = NormalizeRoomId(roomId);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, GroupName(normalizedRoomId));
    }

    public async Task SendMessage(string roomId, string user, string message)
    {
        var normalizedRoomId = NormalizeRoomId(roomId);
        var sender = string.IsNullOrWhiteSpace(user) ? "Guest" : user.Trim();
        var body = string.IsNullOrWhiteSpace(message)
            ? throw new HubException("Message is required.")
            : message.Trim();

        if (body.Length > 1000)
        {
            throw new HubException("Message is too long.");
        }

        await Clients.Group(GroupName(normalizedRoomId))
            .SendAsync("ReceiveMessage", sender, body, DateTimeOffset.UtcNow);
    }

    private static string NormalizeRoomId(string roomId)
    {
        var normalized = (roomId ?? string.Empty).Trim().ToUpperInvariant();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            throw new HubException("Room id is required.");
        }

        return normalized;
    }

    private static string GroupName(string roomId) => $"livechat:{roomId}";
}
