using System.Collections.Concurrent;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Wiseravenshare.Server.Hubs;

/// <summary>
/// Real-time hub for Go Live: viewer counts, live chat, floating reactions,
/// host moderation (pin/delete/ban/slow mode), and co-hosting signaling.
/// </summary>
[AllowAnonymous]
public sealed class GoLiveHub : Hub
{
    private static readonly ConcurrentDictionary<string, int> ViewerCounts = new(StringComparer.OrdinalIgnoreCase);
    private static readonly ConcurrentDictionary<string, HashSet<string>> ConnectionRooms = new(StringComparer.OrdinalIgnoreCase);
    private static readonly ConcurrentDictionary<string, (int Peak, int Comments, int Reactions)> RoomStats = new(StringComparer.OrdinalIgnoreCase);
    private static readonly ConcurrentDictionary<string, HashSet<string>> BannedUsers = new(StringComparer.OrdinalIgnoreCase);
    private static readonly ConcurrentDictionary<string, int> SlowModeSeconds = new(StringComparer.OrdinalIgnoreCase);
    private static readonly ConcurrentDictionary<string, DateTime> LastMessageTime = new(StringComparer.OrdinalIgnoreCase);

    public async Task JoinRoom(string roomId) => await HandleJoinAsync(roomId);
    public async Task JoinStream(string streamId) => await HandleJoinAsync(streamId);

    private async Task HandleJoinAsync(string id)
    {
        var room = Normalize(id);
        var rooms = ConnectionRooms.GetOrAdd(Context.ConnectionId, _ => new HashSet<string>(StringComparer.OrdinalIgnoreCase));
        var wasAdded = false;
        lock (rooms)
        {
            wasAdded = rooms.Add(room);
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, Group(room));
        var count = wasAdded
            ? ViewerCounts.AddOrUpdate(room, 1, (_, c) => c + 1)
            : GetCurrentViewerCount(room);

        RecordViewerPeak(room, count);

        await Clients.Group(Group(room)).SendAsync("ViewerCount", count);
        await Clients.Group(Group(room)).SendAsync("ViewerCountUpdated", count);
    }

    public async Task LeaveRoom(string roomId) => await HandleLeaveAsync(roomId);
    public async Task LeaveStream(string streamId) => await HandleLeaveAsync(streamId);

    private async Task HandleLeaveAsync(string id)
    {
        var room = Normalize(id);
        if (ConnectionRooms.TryGetValue(Context.ConnectionId, out var rooms))
        {
            lock (rooms)
            {
                rooms.Remove(room);
            }
        }

        await Groups.RemoveFromGroupAsync(Context.ConnectionId, Group(room));
        var count = ViewerCounts.AddOrUpdate(room, 0, (_, c) => Math.Max(0, c - 1));

        await Clients.Group(Group(room)).SendAsync("ViewerCount", count);
        await Clients.Group(Group(room)).SendAsync("ViewerCountUpdated", count);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (ConnectionRooms.TryRemove(Context.ConnectionId, out var rooms))
        {
            foreach (var room in rooms)
            {
                var count = ViewerCounts.AddOrUpdate(room, 0, (_, c) => Math.Max(0, c - 1));
                await Clients.Group(Group(room)).SendAsync("ViewerCount", count);
                await Clients.Group(Group(room)).SendAsync("ViewerCountUpdated", count);
            }
        }

        await base.OnDisconnectedAsync(exception);
    }

    public async Task SendReaction(string roomId, string emoji)
    {
        var room = Normalize(roomId);
        var allowed = new HashSet<string> { "👍", "❤️", "🔥", "😂", "🎉", "🎤", "🎶", "⭐", "like", "heart", "fire" };
        var cleanEmoji = (emoji ?? "❤️").Trim();
        if (!allowed.Contains(cleanEmoji))
        {
            cleanEmoji = "❤️";
        }

        IncrementReaction(room);
        var sender = ResolveName();
        var reactionPayload = new
        {
            Id = Guid.NewGuid().ToString("N"),
            Type = cleanEmoji,
            Emoji = cleanEmoji,
            Sender = sender,
            Timestamp = DateTime.UtcNow
        };

        await Clients.Group(Group(room)).SendAsync("ReceiveReaction", sender, cleanEmoji);
        await Clients.Group(Group(room)).SendAsync("ReceiveReactionObject", reactionPayload);
    }

    public async Task SendComment(string roomId, string message) => await HandleSendMessageAsync(roomId, message);
    public async Task SendMessage(string roomId, string message) => await HandleSendMessageAsync(roomId, message);

    private async Task HandleSendMessageAsync(string roomId, string message)
    {
        var room = Normalize(roomId);
        var userId = ResolveUserId();
        var sender = ResolveName();

        if (string.IsNullOrWhiteSpace(message)) return;
        var cleanMessage = message.Trim();
        if (cleanMessage.Length > 500) cleanMessage = cleanMessage[..500];

        // 1. Check if user is banned from this live stream
        if (BannedUsers.TryGetValue(room, out var banned) && banned.Contains(userId))
        {
            await Clients.Caller.SendAsync("ModerationNotice", "You have been muted from chatting in this live stream.");
            return;
        }

        // 2. Enforce slow mode cooldown if active
        if (SlowModeSeconds.TryGetValue(room, out var cooldown) && cooldown > 0)
        {
            var key = $"{room}:{userId}";
            var now = DateTime.UtcNow;
            if (LastMessageTime.TryGetValue(key, out var last) && (now - last).TotalSeconds < cooldown)
            {
                var remaining = (int)Math.Ceiling(cooldown - (now - last).TotalSeconds);
                await Clients.Caller.SendAsync("ModerationNotice", $"Slow mode active. Wait {remaining}s before chatting again.");
                return;
            }
            LastMessageTime[key] = now;
        }

        IncrementComment(room);

        var payload = new
        {
            Id = Guid.NewGuid().ToString("N"),
            UserId = userId,
            Username = sender,
            Sender = sender,
            Message = cleanMessage,
            Body = cleanMessage,
            Timestamp = DateTime.UtcNow
        };

        await Clients.Group(Group(room)).SendAsync("ReceiveComment", payload);
        await Clients.Group(Group(room)).SendAsync("ReceiveMessage", sender, cleanMessage, DateTimeOffset.UtcNow);
    }

    // ── Host Moderation Controls ─────────────────────────────────────────────

    public async Task PinComment(string roomId, object commentPayload)
    {
        var room = Normalize(roomId);
        await Clients.Group(Group(room)).SendAsync("CommentPinned", commentPayload);
    }

    public async Task DeleteComment(string roomId, string commentId)
    {
        var room = Normalize(roomId);
        await Clients.Group(Group(room)).SendAsync("CommentDeleted", commentId);
    }

    public async Task BanUserFromStream(string roomId, string targetUserId)
    {
        var room = Normalize(roomId);
        if (string.IsNullOrWhiteSpace(targetUserId)) return;

        var banned = BannedUsers.GetOrAdd(room, _ => new HashSet<string>(StringComparer.OrdinalIgnoreCase));
        lock (banned)
        {
            banned.Add(targetUserId.Trim());
        }

        await Clients.Group(Group(room)).SendAsync("UserBannedFromChat", targetUserId);
    }

    public async Task SetSlowMode(string roomId, int seconds)
    {
        var room = Normalize(roomId);
        var clamped = Math.Clamp(seconds, 0, 60);
        SlowModeSeconds[room] = clamped;
        await Clients.Group(Group(room)).SendAsync("SlowModeUpdated", clamped);
    }

    // ── Co-Host Guest Slot Controls ──────────────────────────────────────────

    public async Task RequestToJoin(string roomId)
    {
        var room = Normalize(roomId);
        var payload = new
        {
            UserId = ResolveUserId(),
            Username = ResolveName(),
            ConnectionId = Context.ConnectionId,
            RequestedAt = DateTime.UtcNow
        };
        await Clients.Group(Group(room)).SendAsync("CoHostRequested", payload);
    }

    public async Task ApproveCoHost(string roomId, string guestConnectionId, string guestStreamKey)
    {
        var room = Normalize(roomId);
        await Clients.Client(guestConnectionId).SendAsync("CoHostApproved", new { GuestStreamKey = guestStreamKey });
        await Clients.Group(Group(room)).SendAsync("CoHostJoined", new { GuestStreamKey = guestStreamKey });
    }

    public async Task RemoveCoHost(string roomId, string guestStreamKey)
    {
        var room = Normalize(roomId);
        await Clients.Group(Group(room)).SendAsync("CoHostLeft", guestStreamKey);
    }

    // ── In-Memory Analytics & Stats Tracking ─────────────────────────────────

    private static void RecordViewerPeak(string room, int count)
    {
        RoomStats.AddOrUpdate(
            room,
            (count, 0, 0),
            (_, existing) => (Math.Max(existing.Peak, count), existing.Comments, existing.Reactions));
    }

    private static void IncrementComment(string room)
    {
        RoomStats.AddOrUpdate(
            room,
            (1, 1, 0),
            (_, existing) => (existing.Peak, existing.Comments + 1, existing.Reactions));
    }

    private static void IncrementReaction(string room)
    {
        RoomStats.AddOrUpdate(
            room,
            (1, 0, 1),
            (_, existing) => (existing.Peak, existing.Comments, existing.Reactions + 1));
    }

    public static (int Peak, int Comments, int Reactions) ConsumeStats(string room)
    {
        var key = room.Trim().ToUpperInvariant();
        return RoomStats.TryRemove(key, out var stats) ? stats : (0, 0, 0);
    }

    public static (int Peak, int Comments, int Reactions) GetStats(string room)
    {
        var key = room.Trim().ToUpperInvariant();
        return RoomStats.TryGetValue(key, out var stats) ? stats : (0, 0, 0);
    }

    public static int GetCurrentViewerCount(string room)
    {
        var key = room.Trim().ToUpperInvariant();
        return ViewerCounts.TryGetValue(key, out var count) ? count : 0;
    }

    private string ResolveUserId() =>
        Context.User?.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? Context.User?.FindFirstValue("sub")
        ?? Context.ConnectionId;

    private string ResolveName() =>
        Context.User?.FindFirstValue("name")
        ?? Context.User?.FindFirstValue(ClaimTypes.Name)
        ?? Context.User?.FindFirstValue(ClaimTypes.Email)
        ?? "Viewer";

    private static string Normalize(string id) =>
        string.IsNullOrWhiteSpace(id) ? "MAIN" : id.Trim().ToUpperInvariant();

    private static string Group(string room) => $"golive:{room}";
}
