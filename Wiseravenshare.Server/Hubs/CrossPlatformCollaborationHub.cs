// Wiseravenshare.Server/Hubs/CrossPlatformCollaborationHub.cs
//
// Cross-platform real-time collaboration hub. Knitted into the existing
// Wiseravenshare.Server namespace and auth model: users are resolved from the
// JWT (same ClaimsPrincipalExtensions.GetUserId used by ProjectCollaborationHub),
// rooms are backed by IPlatformBridgeService, and platform detection mirrors
// the frontend's src/utils/platformDetector.js.
using System.Collections.Concurrent;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Wiseravenshare.Server.Interfaces.Services;
using Wiseravenshare.Server.Interfaces.Services.CrossPlatform;
using Wiseravenshare.Server.Shared;

namespace Wiseravenshare.Server.Hubs;

[Authorize]
public class CrossPlatformCollaborationHub : Hub
{
    private static readonly ConcurrentDictionary<string, Guid> UserConnections = new();
    private static readonly ConcurrentDictionary<Guid, HashSet<string>> RoomUsers = new();
    private static readonly ConcurrentDictionary<string, string> TransferRooms = new();

    private readonly IPlatformBridgeService _bridgeService;
    private readonly ILogger<CrossPlatformCollaborationHub> _logger;

    public CrossPlatformCollaborationHub(
        IPlatformBridgeService bridgeService,
        ILogger<CrossPlatformCollaborationHub> logger)
    {
        _bridgeService = bridgeService;
        _logger = logger;
    }

    private Guid UserId
    {
        get
        {
            var id = Context.User?.GetUserId()
                ?? throw new HubException("Unauthenticated hub connection");
            if (id == Guid.Empty) throw new HubException("Unauthenticated hub connection");
            return id;
        }
    }

    public override async Task OnConnectedAsync()
    {
        var userId = UserId;
        var platform = GetPlatform();
        UserConnections[userId] = Context.ConnectionId;

        _logger.LogInformation("User {UserId} connected from {Platform} ({ConnectionId})",
            userId, platform, Context.ConnectionId);

        await Groups.AddToGroupAsync(Context.ConnectionId, "online");
        await Clients.All.SendAsync("UserConnected", new
        {
            userId = userId.ToString(),
            platform,
            timestamp = DateTime.UtcNow
        });

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userId = Context.User?.GetUserId() ?? Guid.Empty;
        if (userId != Guid.Empty)
        {
            UserConnections.TryRemove(userId, out _);

            foreach (var roomId in RoomUsers.Keys.Where(r =>
                RoomUsers[r].Contains(userId)).ToList())
            {
                await LeaveRoom(roomId);
            }

            await Clients.All.SendAsync("UserDisconnected", new
            {
                userId = userId.ToString(),
                timestamp = DateTime.UtcNow
            });
        }

        await base.OnDisconnectedAsync(exception);
    }

    public async Task<string> CreateRoom(string roomName, string? platform = null)
    {
        var userId = UserId;
        var roomId = Guid.NewGuid().ToString();

        RoomUsers[roomId] = new HashSet<string> { userId };
        await Groups.AddToGroupAsync(Context.ConnectionId, roomId);

        await _bridgeService.CreateBridgeSessionAsync(
            platform ?? GetPlatform(), userId.ToString(),
            System.Text.Json.JsonSerializer.Serialize(new { roomId, roomName }));

        _logger.LogInformation("Room {RoomId} created by user {UserId}", roomId, userId);
        return roomId;
    }

    public async Task<bool> JoinRoom(string roomId)
    {
        var userId = UserId;
        var users = RoomUsers.GetOrAdd(roomId, _ => new HashSet<string>());

        lock (users)
        {
            if (!users.Add(userId)) return true;
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, roomId);

        await Clients.Group(roomId).SendAsync("UserJoined", new
        {
            userId = userId.ToString(),
            timestamp = DateTime.UtcNow,
            roomId
        });

        string[] memberIds;
        lock (users) memberIds = users.Select(u => u.ToString()).ToArray();
        await Clients.Caller.SendAsync("RoomJoined", new { roomId, users = memberIds });

        _logger.LogInformation("User {UserId} joined room {RoomId}", userId, roomId);
        return true;
    }

    public async Task LeaveRoom(string roomId)
    {
        var userId = UserId;
        if (RoomUsers.TryGetValue(roomId, out var users))
        {
            lock (users)
            {
                users.Remove(userId);
                if (users.Count == 0) RoomUsers.TryRemove(roomId, out _);
            }
        }

        await Groups.RemoveFromGroupAsync(Context.ConnectionId, roomId);
        await Clients.Group(roomId).SendAsync("UserLeft", new
        {
            userId = userId.ToString(),
            timestamp = DateTime.UtcNow,
            roomId
        });
    }

    public async Task SendRoomMessage(string roomId, string message, string? messageType = "text")
    {
        var userId = UserId;
        var platform = GetPlatform();

        await Clients.Group(roomId).SendAsync("ReceiveMessage", new
        {
            userId = userId.ToString(),
            message,
            messageType,
            platform,
            timestamp = DateTime.UtcNow
        });
    }

    public async Task StartFileTransfer(string roomId, string fileName, long fileSize, string fileType)
    {
        var userId = UserId;
        var transferId = Guid.NewGuid().ToString();
        TransferRooms[transferId] = roomId;

        await Clients.Group(roomId).SendAsync("FileTransferStarted", new
        {
            transferId,
            fileName,
            fileSize,
            fileType,
            userId = userId.ToString(),
            timestamp = DateTime.UtcNow
        });
    }

    public async Task SendFileChunk(string transferId, string chunkData, int chunkIndex, int totalChunks)
    {
        if (!TransferRooms.TryGetValue(transferId, out var roomId)) return;

        if (chunkIndex >= totalChunks - 1)
        {
            await Clients.Group(roomId).SendAsync("FileTransferComplete", new
            {
                transferId,
                userId = UserId.ToString(),
                timestamp = DateTime.UtcNow
            });
            TransferRooms.TryRemove(transferId, out _);
        }
        else
        {
            await Clients.Caller.SendAsync("FileChunkAcknowledged", new
            {
                transferId,
                chunkIndex,
                progress = ((chunkIndex + 1) / (double)totalChunks) * 100
            });
        }
    }

    public async Task UpdatePresence(string status, string? activity = null)
    {
        await Clients.All.SendAsync("PresenceUpdated", new
        {
            userId = UserId.ToString(),
            status,
            activity,
            platform = GetPlatform(),
            timestamp = DateTime.UtcNow
        });
    }

    public async Task<bool> IsUserOnline(string userId)
        => Guid.TryParse(userId, out var id) && UserConnections.ContainsKey(id);

    public async Task<IEnumerable<string>> GetOnlineUsers()
        => UserConnections.Keys.Select(k => k.ToString());

    public async Task BridgeToExternalPlatform(string platform, string targetUserId, object data)
    {
        var userId = UserId;
        await _bridgeService.BridgeMessageAsync(
            await _bridgeService.EnsureBridgeSessionAsync(platform, targetUserId),
            System.Text.Json.JsonSerializer.Serialize(data), userId.ToString());

        // Forward to the target web user when they have an active connection.
        if (Guid.TryParse(targetUserId, out var targetId)
            && UserConnections.TryGetValue(targetId, out var connectionId))
        {
            await Clients.Client(connectionId).SendAsync("ExternalBridge", new
            {
                source = userId.ToString(),
                data,
                timestamp = DateTime.UtcNow
            });
        }

        _logger.LogInformation("Bridged data from {UserId} to {TargetUserId} on {Platform}",
            userId, targetUserId, platform);
    }

    private string GetPlatform()
    {
        var httpContext = Context.GetHttpContext();
        if (httpContext == null) return "Unknown";

        var userAgent = httpContext.Request.Headers.UserAgent.ToString();
        var referer = httpContext.Request.Headers.Referer.ToString();

        if (userAgent.Contains("TikTok", StringComparison.OrdinalIgnoreCase)) return "TikTok";
        if (userAgent.Contains("FBAN") || userAgent.Contains("Facebook", StringComparison.OrdinalIgnoreCase)) return "Facebook";
        if (userAgent.Contains("Instagram", StringComparison.OrdinalIgnoreCase)) return "Instagram";
        if (userAgent.Contains("Twitter", StringComparison.OrdinalIgnoreCase)) return "Twitter";
        if (userAgent.Contains("Snapchat", StringComparison.OrdinalIgnoreCase)) return "Snapchat";
        if (referer.Contains("tiktok.com", StringComparison.OrdinalIgnoreCase)) return "TikTokWeb";
        if (referer.Contains("facebook.com", StringComparison.OrdinalIgnoreCase)) return "FacebookWeb";
        return "Web";
    }
}
