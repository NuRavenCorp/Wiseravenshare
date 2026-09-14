// Wiseravenshare.Server/Hubs/CrossPlatformCollaborationHub.cs
//
// Cross-platform real-time collaboration hub. Knitted into the existing
// Wiseravenshare.Server namespace and auth model: users are resolved from the
// JWT (same ClaimsPrincipalExtensions.GetUserId used by ProjectCollaborationHub),
// rooms are backed by IPlatformBridgeService, and platform detection mirrors
// the frontend's src/utils/platformDetector.js.
using System.Collections.Concurrent;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.SignalR;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Entities.CrossPlatform;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Interfaces.Services;
using Wiseravenshare.Server.Interfaces.Services.CrossPlatform;
using Wiseravenshare.Server.Services;
using Wiseravenshare.Server.Shared;

namespace Wiseravenshare.Server.Hubs;

[Authorize]
public class CrossPlatformCollaborationHub : Hub
{
    private static readonly ConcurrentDictionary<string, string> UserConnections = new();
    private static readonly ConcurrentDictionary<string, HashSet<string>> RoomUsers = new(StringComparer.OrdinalIgnoreCase);
    private static readonly ConcurrentDictionary<string, string> TransferRooms = new();

    private readonly AppDbContext _dbContext;
    private readonly IPlatformBridgeService _bridgeService;
    private readonly PodcastVideoBridgeStateService _podcastBridgeStateService;
    private readonly ILogger<CrossPlatformCollaborationHub> _logger;

    public CrossPlatformCollaborationHub(
        AppDbContext dbContext,
        IPlatformBridgeService bridgeService,
        PodcastVideoBridgeStateService podcastBridgeStateService,
        ILogger<CrossPlatformCollaborationHub> logger)
    {
        _dbContext = dbContext;
        _bridgeService = bridgeService;
        _podcastBridgeStateService = podcastBridgeStateService;
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
        UserConnections[userId.ToString()] = Context.ConnectionId;

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
            var userIdString = userId.ToString();
            UserConnections.TryRemove(userIdString, out _);

            foreach (var (roomId, users) in RoomUsers)
            {
                bool removed;
                lock (users)
                {
                    removed = users.Remove(userIdString);
                    if (users.Count == 0)
                    {
                        RoomUsers.TryRemove(roomId, out _);
                    }
                }

                if (!removed)
                {
                    continue;
                }

                await Clients.Group(roomId).SendAsync("UserLeft", new
                {
                    userId = userIdString,
                    timestamp = DateTime.UtcNow,
                    roomId
                });
            }

            await Clients.All.SendAsync("UserDisconnected", new
            {
                userId = userIdString,
                timestamp = DateTime.UtcNow
            });

            var activeParticipants = await _dbContext.RoomParticipants
                .Where(p => p.UserId == userId && p.IsActive)
                .ToListAsync();
            if (activeParticipants.Count > 0)
            {
                var nowUtc = DateTime.UtcNow;
                foreach (var participant in activeParticipants)
                {
                    participant.IsActive = false;
                    participant.LeftAt = nowUtc;
                }

                await _dbContext.SaveChangesAsync();
            }
        }

        await base.OnDisconnectedAsync(exception);
    }

    public async Task<string> CreateRoom(string roomName, string? platform = null)
    {
        var userId = UserId;
        var normalizedName = (roomName ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedName) || normalizedName.Length > 120)
        {
            throw new HubException("Room name must be between 1 and 120 characters.");
        }

        var nowUtc = DateTime.UtcNow;
        var conversation = new Conversation
        {
            IsGroup = true,
            GroupName = normalizedName,
            CreatedBy = userId,
            LastMessageAt = nowUtc,
            CreatedAt = nowUtc,
            UpdatedAt = nowUtc,
            IsDeleted = false
        };

        _dbContext.Conversations.Add(conversation);
        // Legacy schema includes a CreatorId FK column in addition to CreatedBy.
        _dbContext.Entry(conversation).Property("CreatorId").CurrentValue = userId;
        await _dbContext.SaveChangesAsync();

        var participant = new ConversationParticipant
        {
            ConversationId = conversation.Id,
            UserId = userId,
            JoinedAt = nowUtc,
            CreatedAt = nowUtc,
            UpdatedAt = nowUtc,
            IsDeleted = false,
            IsMuted = false
        };
        _dbContext.ConversationParticipants.Add(participant);
        await _dbContext.SaveChangesAsync();

        var roomId = conversation.Id.ToString();

        var persistedRoom = await _dbContext.CollaborationRooms
            .FirstOrDefaultAsync(r => r.RoomId == roomId);
        if (persistedRoom is null)
        {
            _dbContext.CollaborationRooms.Add(new CollaborationRoom
            {
                Id = Guid.NewGuid(),
                RoomId = roomId,
                RoomName = normalizedName,
                OwnerId = userId,
                Platform = platform ?? GetPlatform(),
                IsActive = true,
                CreatedAt = nowUtc,
                UpdatedAt = nowUtc,
                MetadataJson = System.Text.Json.JsonSerializer.Serialize(new { source = "CrossPlatformCollaborationHub" })
            });
        }
        else
        {
            persistedRoom.RoomName = normalizedName;
            persistedRoom.Platform = platform ?? GetPlatform();
            persistedRoom.IsActive = true;
            persistedRoom.UpdatedAt = nowUtc;
        }

        await UpsertRoomParticipantAsync(roomId, userId, nowUtc, platform ?? GetPlatform());
        await _dbContext.SaveChangesAsync();

        AddActiveUser(roomId, userId.ToString());
        await Groups.AddToGroupAsync(Context.ConnectionId, roomId);

        await _bridgeService.CreateBridgeSessionAsync(
            platform ?? GetPlatform(), userId.ToString(),
            System.Text.Json.JsonSerializer.Serialize(new { roomId, roomName = normalizedName }));

        await Clients.Caller.SendAsync("RoomJoined", new
        {
            roomId,
            name = normalizedName,
            users = new[] { userId.ToString() }
        });

        _logger.LogInformation("Room {RoomId} created by user {UserId}", roomId, userId);
        return roomId;
    }

    public async Task<object> JoinRoom(string roomId)
    {
        var userId = UserId;
        var parsedRoomId = ParseRoomId(roomId);

        var room = await _dbContext.Conversations
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == parsedRoomId && c.IsGroup && !c.IsDeleted);
        if (room is null)
        {
            throw new HubException("Room does not exist.");
        }

        var participant = await _dbContext.ConversationParticipants
            .FirstOrDefaultAsync(p => p.ConversationId == parsedRoomId && p.UserId == userId);

        if (participant is null)
        {
            _dbContext.ConversationParticipants.Add(new ConversationParticipant
            {
                ConversationId = parsedRoomId,
                UserId = userId,
                JoinedAt = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                IsDeleted = false,
                IsMuted = false
            });
            await _dbContext.SaveChangesAsync();
        }
        else if (participant.IsDeleted)
        {
            participant.IsDeleted = false;
            participant.DeletedAt = null;
            participant.UpdatedAt = DateTime.UtcNow;
            _dbContext.ConversationParticipants.Update(participant);
            await _dbContext.SaveChangesAsync();
        }

        var nowUtc = DateTime.UtcNow;
        await UpsertRoomParticipantAsync(roomId, userId, nowUtc, GetPlatform());
        var persistedRoom = await _dbContext.CollaborationRooms.FirstOrDefaultAsync(r => r.RoomId == roomId);
        if (persistedRoom is not null)
        {
            persistedRoom.IsActive = true;
            persistedRoom.UpdatedAt = nowUtc;
        }

        await _dbContext.SaveChangesAsync();

        AddActiveUser(roomId, userId.ToString());

        await Groups.AddToGroupAsync(Context.ConnectionId, roomId);

        await Clients.Group(roomId).SendAsync("UserJoined", new
        {
            userId = userId.ToString(),
            timestamp = DateTime.UtcNow,
            roomId
        });

        var joinedPayload = new
        {
            roomId,
            name = room.GroupName,
            users = GetActiveUsers(roomId)
        };

        await Clients.Caller.SendAsync("RoomJoined", joinedPayload);

        _logger.LogInformation("User {UserId} joined room {RoomId}", userId, roomId);
        return joinedPayload;
    }

    public async Task LeaveRoom(string roomId)
    {
        var userId = UserId;
        RemoveActiveUser(roomId, userId.ToString());

        var activeParticipant = await _dbContext.RoomParticipants
            .Where(p => p.RoomId == roomId && p.UserId == userId && p.IsActive)
            .OrderByDescending(p => p.JoinedAt)
            .FirstOrDefaultAsync();
        if (activeParticipant is not null)
        {
            activeParticipant.IsActive = false;
            activeParticipant.LeftAt = DateTime.UtcNow;
            await _dbContext.SaveChangesAsync();
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
        var parsedRoomId = ParseRoomId(roomId);
        await EnsureMembershipAsync(parsedRoomId, userId);

        var text = (message ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(text) || text.Length > 2000)
        {
            throw new HubException("Message must be between 1 and 2000 characters.");
        }

        var nowUtc = DateTime.UtcNow;
        var storedMessage = new Message
        {
            ConversationId = parsedRoomId,
            SenderId = userId,
            Content = text,
            Type = ParseMessageType(messageType),
            CreatedAt = nowUtc,
            UpdatedAt = nowUtc,
            IsDeleted = false,
            IsRead = false
        };

        _dbContext.Messages.Add(storedMessage);
        var room = await _dbContext.Conversations.FirstOrDefaultAsync(c => c.Id == parsedRoomId);
        if (room is not null)
        {
            room.LastMessageAt = nowUtc;
            room.UpdatedAt = nowUtc;
            _dbContext.Conversations.Update(room);
        }
        await _dbContext.SaveChangesAsync();

        var platform = GetPlatform();

        await Clients.Group(roomId).SendAsync("ReceiveMessage", new
        {
            id = storedMessage.Id,
            userId = userId.ToString(),
            message = text,
            messageType,
            platform,
            timestamp = nowUtc
        });
    }

    public async Task<object> StartFileTransfer(string roomId, string fileName, long fileSize, string fileType)
    {
        var userId = UserId;
        var parsedRoomId = ParseRoomId(roomId);
        await EnsureMembershipAsync(parsedRoomId, userId);

        var transferId = Guid.NewGuid().ToString();
        TransferRooms[transferId] = roomId;

        _dbContext.FileTransfers.Add(new FileTransfer
        {
            Id = Guid.NewGuid(),
            TransferId = transferId,
            RoomId = roomId,
            UserId = userId,
            FileName = fileName,
            FileSize = fileSize,
            FileType = fileType,
            Status = "pending",
            ChunkCount = null,
            CreatedAt = DateTime.UtcNow
        });
        await _dbContext.SaveChangesAsync();

        await Clients.Group(roomId).SendAsync("FileTransferStarted", new
        {
            transferId,
            fileName,
            fileSize,
            fileType,
            userId = userId.ToString(),
            timestamp = DateTime.UtcNow
        });

        return new { transferId };
    }

    public async Task SendFileChunk(string transferId, string chunkData, int chunkIndex, int totalChunks)
    {
        if (!TransferRooms.TryGetValue(transferId, out var roomId)) return;
        await EnsureMembershipAsync(ParseRoomId(roomId), UserId);

        if (chunkIndex >= totalChunks - 1)
        {
            var transfer = await _dbContext.FileTransfers.FirstOrDefaultAsync(t => t.TransferId == transferId);
            if (transfer is not null)
            {
                transfer.Status = "completed";
                transfer.ChunkCount = totalChunks;
                transfer.CompletedAt = DateTime.UtcNow;
                await _dbContext.SaveChangesAsync();
            }

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

    public async Task StartTyping(string roomId)
    {
        var userId = UserId;
        await EnsureMembershipAsync(ParseRoomId(roomId), userId);
        await Clients.OthersInGroup(roomId).SendAsync("UserTyping", new
        {
            userId = userId.ToString(),
            isTyping = true,
            timestamp = DateTime.UtcNow
        });
    }

    public async Task StopTyping(string roomId)
    {
        var userId = UserId;
        await EnsureMembershipAsync(ParseRoomId(roomId), userId);
        await Clients.OthersInGroup(roomId).SendAsync("UserTyping", new
        {
            userId = userId.ToString(),
            isTyping = false,
            timestamp = DateTime.UtcNow
        });
    }

    public async Task<bool> IsUserOnline(string userId)
        => Guid.TryParse(userId, out var id) && UserConnections.ContainsKey(id.ToString());

    public async Task<IEnumerable<string>> GetOnlineUsers()
        => UserConnections.Keys.Select(k => k.ToString());

    public async Task<IEnumerable<object>> GetMyRooms(int take = 25)
    {
        var userId = UserId;
        var safeTake = Math.Clamp(take, 1, 100);

        var memberships = await _dbContext.CollaborationRooms
            .AsNoTracking()
            .Where(r => _dbContext.RoomParticipants.Any(p => p.RoomId == r.RoomId && p.UserId == userId))
            .Select(r => new
            {
                r.RoomId,
                r.RoomName,
                r.OwnerId,
                r.CreatedAt,
                RoomUpdatedAt = r.UpdatedAt,
                JoinedAt = _dbContext.RoomParticipants
                    .Where(p => p.RoomId == r.RoomId && p.UserId == userId)
                    .OrderByDescending(p => p.JoinedAt)
                    .Select(p => p.JoinedAt)
                    .FirstOrDefault()
            })
            .OrderByDescending(x => x.RoomUpdatedAt)
            .Take(safeTake)
            .ToListAsync();

        return memberships.Select(x => (object)new
        {
            roomId = x.RoomId,
            name = x.RoomName,
            createdBy = x.OwnerId?.ToString() ?? string.Empty,
            createdAt = x.CreatedAt,
            joinedAt = x.JoinedAt,
            lastActivityAt = x.RoomUpdatedAt,
            isOnline = IsUserActiveInRoom(x.RoomId, userId.ToString())
        });
    }

    public async Task BridgeToExternalPlatform(string platform, string targetUserId, object data)
    {
        var userId = UserId;
        var safeTarget = (targetUserId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(safeTarget))
        {
            safeTarget = userId.ToString();
        }

        await _bridgeService.BridgeMessageAsync(
            await _bridgeService.EnsureBridgeSessionAsync(platform, safeTarget),
            System.Text.Json.JsonSerializer.Serialize(data), userId.ToString());

        // Forward to the target web user when they have an active connection.
        if (Guid.TryParse(safeTarget, out var targetId)
            && UserConnections.TryGetValue(targetId.ToString(), out var connectionId))
        {
            await Clients.Client(connectionId).SendAsync("ExternalBridge", new
            {
                source = userId.ToString(),
                data,
                timestamp = DateTime.UtcNow
            });
        }

        _logger.LogInformation("Bridged data from {UserId} to {TargetUserId} on {Platform}",
            userId, safeTarget, platform);
    }

    public async Task JoinPodcastBridge(string roomKey = "main")
    {
        var normalizedRoomKey = NormalizePodcastRoomKey(roomKey);
        var groupName = BuildPodcastGroupName(normalizedRoomKey);
        var userId = UserId.ToString();

        AddActiveUser(groupName, userId);
        await Groups.AddToGroupAsync(Context.ConnectionId, groupName);

        var snapshot = _podcastBridgeStateService.GetSnapshot(normalizedRoomKey);
        await Clients.Caller.SendAsync("PodcastBridgeSnapshot", snapshot);
        await Clients.Group(groupName).SendAsync("PodcastBridgePresence", new
        {
            roomKey = normalizedRoomKey,
            userId,
            action = "joined",
            timestamp = DateTime.UtcNow
        });
    }

    public async Task LeavePodcastBridge(string roomKey = "main")
    {
        var normalizedRoomKey = NormalizePodcastRoomKey(roomKey);
        var groupName = BuildPodcastGroupName(normalizedRoomKey);
        var userId = UserId.ToString();

        RemoveActiveUser(groupName, userId);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, groupName);
        await Clients.Group(groupName).SendAsync("PodcastBridgePresence", new
        {
            roomKey = normalizedRoomKey,
            userId,
            action = "left",
            timestamp = DateTime.UtcNow
        });
    }

    public async Task PublishPodcastFootageSelection(string roomKey, PodcastBridgeFootageSelection selection)
    {
        if (selection is null || string.IsNullOrWhiteSpace(selection.MediaUrl))
        {
            throw new HubException("A playable media URL is required for podcast footage selection.");
        }

        var normalizedRoomKey = NormalizePodcastRoomKey(roomKey);
        var groupName = BuildPodcastGroupName(normalizedRoomKey);
        var userId = UserId;

        selection.SourceUserId = userId.ToString();
        if (string.IsNullOrWhiteSpace(selection.SourceUserName))
        {
            selection.SourceUserName = Context.User?.Identity?.Name ?? "Videographer";
        }

        var snapshot = _podcastBridgeStateService.UpsertFootage(normalizedRoomKey, selection);
        await Clients.Group(groupName).SendAsync("PodcastFootageSelected", new
        {
            roomKey = normalizedRoomKey,
            footage = snapshot.ActiveFootage,
            updatedAtUtc = snapshot.UpdatedAtUtc
        });
    }

    public async Task IssuePodcastCommand(string roomKey, string command, string? note = null, string? targetUserId = null)
    {
        var safeCommand = (command ?? string.Empty).Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(safeCommand))
        {
            throw new HubException("A command is required.");
        }

        var normalizedRoomKey = NormalizePodcastRoomKey(roomKey);
        var groupName = BuildPodcastGroupName(normalizedRoomKey);
        var userId = UserId;

        var created = _podcastBridgeStateService.AddCommand(normalizedRoomKey, new PodcastBridgeCommandRecord
        {
            Command = safeCommand,
            Note = note ?? string.Empty,
            IssuedByUserId = userId.ToString(),
            IssuedByUserName = Context.User?.Identity?.Name ?? "Podcast Team",
            TargetUserId = targetUserId ?? string.Empty
        });

        await Clients.Group(groupName).SendAsync("PodcastCommandIssued", new
        {
            roomKey = normalizedRoomKey,
            command = created
        });
    }

    public async Task AcknowledgePodcastCommand(string roomKey, string commandId, string responseMessage)
    {
        var normalizedRoomKey = NormalizePodcastRoomKey(roomKey);
        var groupName = BuildPodcastGroupName(normalizedRoomKey);
        var userId = UserId;

        var updatedCommand = _podcastBridgeStateService.AddCommandResponse(normalizedRoomKey, commandId, new PodcastBridgeCommandResponse
        {
            ResponderUserId = userId.ToString(),
            ResponderUserName = Context.User?.Identity?.Name ?? "Operator",
            Message = responseMessage ?? string.Empty
        });

        if (updatedCommand is null)
        {
            throw new HubException("Command not found.");
        }

        await Clients.Group(groupName).SendAsync("PodcastCommandResponse", new
        {
            roomKey = normalizedRoomKey,
            command = updatedCommand
        });
    }

    private static Guid ParseRoomId(string roomId)
    {
        if (!Guid.TryParse(roomId, out var parsedRoomId) || parsedRoomId == Guid.Empty)
        {
            throw new HubException("Invalid room id.");
        }

        return parsedRoomId;
    }

    private static string NormalizePodcastRoomKey(string? roomKey)
    {
        var normalized = (roomKey ?? string.Empty).Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return "main";
        }

        var safe = new string(normalized.Where(ch => char.IsLetterOrDigit(ch) || ch is '-' or '_').ToArray());
        return string.IsNullOrWhiteSpace(safe) ? "main" : safe;
    }

    private static string BuildPodcastGroupName(string roomKey) => $"podcast:{roomKey}";

    private async Task EnsureMembershipAsync(Guid roomId, Guid userId)
    {
        var isMember = await _dbContext.ConversationParticipants.AnyAsync(p =>
            p.ConversationId == roomId
            && p.UserId == userId
            && !p.IsDeleted);

        if (!isMember)
        {
            throw new HubException("You must join the room before using collaboration features.");
        }
    }

    private static MessageType ParseMessageType(string? messageType)
    {
        if (Enum.TryParse<MessageType>(messageType, ignoreCase: true, out var parsedType))
        {
            return parsedType;
        }

        return MessageType.Text;
    }

    private static void AddActiveUser(string roomId, string userId)
    {
        var users = RoomUsers.GetOrAdd(roomId, _ => new HashSet<string>(StringComparer.OrdinalIgnoreCase));
        lock (users)
        {
            users.Add(userId);
        }
    }

    private static void RemoveActiveUser(string roomId, string userId)
    {
        if (!RoomUsers.TryGetValue(roomId, out var users))
        {
            return;
        }

        lock (users)
        {
            users.Remove(userId);
            if (users.Count == 0)
            {
                RoomUsers.TryRemove(roomId, out _);
            }
        }
    }

    private static string[] GetActiveUsers(string roomId)
    {
        if (!RoomUsers.TryGetValue(roomId, out var users))
        {
            return Array.Empty<string>();
        }

        lock (users)
        {
            return users.ToArray();
        }
    }

    private static bool IsUserActiveInRoom(string roomId, string userId)
    {
        if (!RoomUsers.TryGetValue(roomId, out var users))
        {
            return false;
        }

        lock (users)
        {
            return users.Contains(userId);
        }
    }

    private async Task UpsertRoomParticipantAsync(string roomId, Guid userId, DateTime joinedAtUtc, string platform)
    {
        var existing = await _dbContext.RoomParticipants
            .Where(p => p.RoomId == roomId && p.UserId == userId)
            .OrderByDescending(p => p.JoinedAt)
            .FirstOrDefaultAsync();

        if (existing is null)
        {
            _dbContext.RoomParticipants.Add(new RoomParticipant
            {
                Id = Guid.NewGuid(),
                RoomId = roomId,
                UserId = userId,
                Platform = platform,
                JoinedAt = joinedAtUtc,
                IsActive = true,
                LeftAt = null,
                MetadataJson = System.Text.Json.JsonSerializer.Serialize(new { source = "CrossPlatformCollaborationHub" })
            });
            return;
        }

        existing.Platform = platform;
        existing.JoinedAt = joinedAtUtc;
        existing.LeftAt = null;
        existing.IsActive = true;
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
        if (userAgent.Contains("YouTube", StringComparison.OrdinalIgnoreCase)) return "YouTube";
        if (userAgent.Contains("LinkedIn", StringComparison.OrdinalIgnoreCase)) return "LinkedIn";
        if (userAgent.Contains("Twitter", StringComparison.OrdinalIgnoreCase)) return "Twitter";
        if (userAgent.Contains("Snapchat", StringComparison.OrdinalIgnoreCase)) return "Snapchat";
        if (referer.Contains("tiktok.com", StringComparison.OrdinalIgnoreCase)) return "TikTokWeb";
        if (referer.Contains("facebook.com", StringComparison.OrdinalIgnoreCase)) return "FacebookWeb";
        return "Web";
    }
}
