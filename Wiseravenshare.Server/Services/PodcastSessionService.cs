namespace Wiseravenshare.Server.Services;

using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

/// <summary>
/// Manages Podcast Studio sessions: creation, device registration, state sync,
/// token refresh, and graceful session closure.
/// 
/// Key responsibilities:
/// - Create persistent team sessions
/// - Register devices (laptops, phones, studio room PCs)
/// - Sync session state across devices without auth interruption
/// - Auto-refresh auth tokens per device
/// - Close sessions gracefully (all devices get notification)
/// </summary>
public interface IPodcastSessionService
{
    /// <summary>Create a new Podcast Studio session for a team</summary>
    Task<PodcastSession> CreateSessionAsync(string teamId, string userId, string accessScope = "team", string? allowedUserIds = null);

    /// <summary>Register a device in an active session and get/refresh its auth token</summary>
    Task<PodcastSessionDevice> RegisterOrRefreshDeviceAsync(string sessionId, string userId, string deviceId, string deviceName, string deviceType);

    /// <summary>Sync session state: get current shared state and broadcast device changes</summary>
    Task<object> SyncSessionStateAsync(string sessionId, string userId, string deviceId, string? localStateJson = null);

    /// <summary>Send heartbeat to keep device active (prevents stale timeout)</summary>
    Task<bool> SendHeartbeatAsync(string sessionId, string userId, string deviceId);

    /// <summary>Close session: all devices lose access, can still refresh token during grace period</summary>
    Task<bool> CloseSessionAsync(string sessionId, string userId);

    /// <summary>Get active session for a team</summary>
    Task<PodcastSession?> GetActiveSessionAsync(string teamId);

    /// <summary>Get device in a session</summary>
    Task<PodcastSessionDevice?> GetDeviceAsync(string sessionId, string deviceId);

    /// <summary>Get all active devices in a session</summary>
    Task<List<PodcastSessionDevice>> GetActiveDevicesAsync(string sessionId);
}

public class PodcastSessionService : IPodcastSessionService
{
    private readonly AppDbContext _db;
    private readonly ILogger<PodcastSessionService> _logger;
    private const int DeviceHeartbeatTimeoutSeconds = 60;
    private const int TokenRefreshGracePeriodSeconds = 300;

    public PodcastSessionService(AppDbContext db, ILogger<PodcastSessionService> logger)
    {
        _db = db;
        _logger = logger;
    }

    /// <summary>Create a new Podcast Studio session for a team</summary>
    public async Task<PodcastSession> CreateSessionAsync(string teamId, string userId, string accessScope = "team", string? allowedUserIds = null)
    {
        var session = new PodcastSession
        {
            Id = GenerateSessionId(),
            TeamId = teamId,
            InitiatedByUserId = userId,
            Status = "active",
            AccessScope = accessScope,
            AllowedUserIds = allowedUserIds,
            CreatedAt = DateTime.UtcNow,
            StateJson = JsonSerializer.Serialize(new { createdAt = DateTime.UtcNow, initiatedBy = userId }),
            StateVersion = 0
        };

        _db.PodcastSessions.Add(session);
        await _db.SaveChangesAsync();

        _logger.LogInformation($"Created PodcastSession {session.Id} for team {teamId} by user {userId}");
        return session;
    }

    /// <summary>Register a device in an active session and get/refresh its auth token</summary>
    public async Task<PodcastSessionDevice> RegisterOrRefreshDeviceAsync(string sessionId, string userId, string deviceId, string deviceName, string deviceType)
    {
        var session = await _db.PodcastSessions
            .Include(s => s.Devices)
            .FirstOrDefaultAsync(s => s.Id == sessionId && s.Status == "active");

        if (session == null)
            throw new InvalidOperationException($"Session {sessionId} not found or not active");

        // Check access: user must be in allowed list (if restricted) or in the team
        if (session.AccessScope == "device-restricted" && session.AllowedUserIds != null)
        {
            var allowedIds = session.AllowedUserIds.Split(',').Select(id => id.Trim()).ToList();
            if (!allowedIds.Contains(userId))
                throw new UnauthorizedAccessException($"User {userId} not in allowed list for this session");
        }

        var device = session.Devices.FirstOrDefault(d => d.Id == deviceId);

        if (device == null)
        {
            // Register new device
            device = new PodcastSessionDevice
            {
                Id = deviceId,
                SessionId = sessionId,
                UserId = userId,
                DeviceName = deviceName,
                DeviceType = deviceType,
                JoinedAt = DateTime.UtcNow,
                IsActive = true,
                TokenExpiresAt = DateTime.UtcNow.AddHours(1)
            };
            session.Devices.Add(device);
            _logger.LogInformation($"Registered device {deviceId} ({deviceName}) in session {sessionId} for user {userId}");
        }
        else
        {
            // Refresh existing device: update heartbeat and token expiry
            device.LastHeartbeatAt = DateTime.UtcNow;
            device.TokenExpiresAt = DateTime.UtcNow.AddHours(1);
            device.IsActive = true;
            _logger.LogInformation($"Refreshed device {deviceId} in session {sessionId}");
        }

        await _db.SaveChangesAsync();
        return device;
    }

    /// <summary>Sync session state: get current shared state and broadcast device changes</summary>
    public async Task<object> SyncSessionStateAsync(string sessionId, string userId, string deviceId, string? localStateJson = null)
    {
        var session = await _db.PodcastSessions
            .Include(s => s.Devices)
            .FirstOrDefaultAsync(s => s.Id == sessionId && s.Status != "closed");

        if (session == null)
            throw new InvalidOperationException($"Session {sessionId} not found or closed");

        var device = session.Devices.FirstOrDefault(d => d.Id == deviceId);
        if (device == null)
            throw new InvalidOperationException($"Device {deviceId} not registered in session");

        // If device sent local state, merge it into session state
        if (!string.IsNullOrEmpty(localStateJson))
        {
            var sessionState = JsonSerializer.Deserialize<Dictionary<string, object>>(session.StateJson ?? "{}") ?? new();
            var deviceState = JsonSerializer.Deserialize<Dictionary<string, object>>(localStateJson) ?? new();

            // Merge: device state wins for device-specific keys, session state for shared keys
            foreach (var kvp in deviceState)
            {
                if (kvp.Key.StartsWith("device_"))
                {
                    // Device-specific state: goes to device local state
                    device.LocalStateJson = localStateJson;
                }
                else
                {
                    // Shared state: merge into session
                    sessionState[kvp.Key] = kvp.Value;
                }
            }

            session.StateJson = JsonSerializer.Serialize(sessionState);
            session.StateVersion++;
        }

        // Get all active devices in session (excluding inactive/stale ones)
        var activeDevices = session.Devices
            .Where(d => d.IsActive && (d.LastHeartbeatAt == null || 
                   (DateTime.UtcNow - d.LastHeartbeatAt).Value.TotalSeconds < DeviceHeartbeatTimeoutSeconds))
            .ToList();

        await _db.SaveChangesAsync();

        return new
        {
            sessionId = session.Id,
            sessionState = JsonSerializer.Deserialize<object>(session.StateJson ?? "{}"),
            stateVersion = session.StateVersion,
            activeDevices = activeDevices.Select(d => new
            {
                deviceId = d.Id,
                deviceName = d.DeviceName,
                userId = d.UserId,
                joinedAt = d.JoinedAt,
                isActive = d.IsActive,
                tokenExpiresIn = (d.TokenExpiresAt - DateTime.UtcNow)?.TotalSeconds ?? 0
            }).ToList()
        };
    }

    /// <summary>Send heartbeat to keep device active (prevents stale timeout)</summary>
    public async Task<bool> SendHeartbeatAsync(string sessionId, string userId, string deviceId)
    {
        var device = await _db.PodcastSessionDevices
            .FirstOrDefaultAsync(d => d.SessionId == sessionId && d.Id == deviceId && d.UserId == userId);

        if (device == null)
            return false;

        device.LastHeartbeatAt = DateTime.UtcNow;
        device.IsActive = true;

        await _db.SaveChangesAsync();
        return true;
    }

    /// <summary>Close session: transitions to "closing" (grace period), then "closed"</summary>
    public async Task<bool> CloseSessionAsync(string sessionId, string userId)
    {
        var session = await _db.PodcastSessions
            .FirstOrDefaultAsync(s => s.Id == sessionId);

        if (session == null || session.Status == "closed")
            return false;

        // Only team owner or session initiator can close
        if (session.InitiatedByUserId != userId)
            throw new UnauthorizedAccessException($"Only session initiator can close session");

        session.Status = "closed";
        session.ClosedAt = DateTime.UtcNow;

        // Mark all devices as inactive
        foreach (var device in session.Devices)
        {
            device.IsActive = false;
        }

        await _db.SaveChangesAsync();
        _logger.LogInformation($"Closed session {sessionId}");
        return true;
    }

    /// <summary>Get active session for a team</summary>
    public async Task<PodcastSession?> GetActiveSessionAsync(string teamId)
    {
        return await _db.PodcastSessions
            .Include(s => s.Devices)
            .FirstOrDefaultAsync(s => s.TeamId == teamId && s.Status == "active");
    }

    /// <summary>Get device in a session</summary>
    public async Task<PodcastSessionDevice?> GetDeviceAsync(string sessionId, string deviceId)
    {
        return await _db.PodcastSessionDevices
            .FirstOrDefaultAsync(d => d.SessionId == sessionId && d.Id == deviceId);
    }

    /// <summary>Get all active devices in a session</summary>
    public async Task<List<PodcastSessionDevice>> GetActiveDevicesAsync(string sessionId)
    {
        return await _db.PodcastSessionDevices
            .Where(d => d.SessionId == sessionId && d.IsActive)
            .ToListAsync();
    }

    private static string GenerateSessionId() => $"psess_{Guid.NewGuid():N}".Substring(0, 50);
}
