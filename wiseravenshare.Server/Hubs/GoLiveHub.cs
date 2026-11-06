using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Wiseravenshare.Server.Hubs;

/// <summary>
/// Real-time hub for Go Live rooms: viewer counts and emoji reactions.
/// </summary>
[Authorize]
public sealed class GoLiveHub : Hub
{
    private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, int> ViewerCounts = new();

    public async Task JoinRoom(string roomId)
    {
        var room = Normalize(roomId);
        await Groups.AddToGroupAsync(Context.ConnectionId, Group(room));
        var count = ViewerCounts.AddOrUpdate(room, 1, (_, c) => c + 1);
        await Clients.Group(Group(room)).SendAsync("ViewerCount", count);
    }

    public async Task LeaveRoom(string roomId)
    {
        var room = Normalize(roomId);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, Group(room));
        var count = ViewerCounts.AddOrUpdate(room, 0, (_, c) => Math.Max(0, c - 1));
        await Clients.Group(Group(room)).SendAsync("ViewerCount", count);
    }

    public async Task SendReaction(string roomId, string emoji)
    {
        var room = Normalize(roomId);
        var allowed = new HashSet<string> { "👍", "❤️", "🔥", "😂", "🎉", "🎤", "🎶", "⭐" };
        if (!allowed.Contains(emoji)) return;
        var sender = ResolveName();
        await Clients.Group(Group(room)).SendAsync("ReceiveReaction", sender, emoji);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        // ViewerCounts are approximate — no per-connection room tracking for simplicity
        await base.OnDisconnectedAsync(exception);
    }

    private string ResolveName() =>
        Context.User?.FindFirstValue("name")
        ?? Context.User?.FindFirstValue(ClaimTypes.Name)
        ?? "Viewer";

    private static string Normalize(string id) =>
        string.IsNullOrWhiteSpace(id) ? throw new HubException("Room id required.") : id.Trim().ToUpperInvariant();

    private static string Group(string room) => $"golive:{room}";
}
