namespace Wiseravenshare.Server.Controllers;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.DTOs;
using Wiseravenshare.Server.Services;
using System.Security.Claims;

/// <summary>
/// Podcast Studio Session Management API
/// 
/// Endpoints for creating persistent sessions, registering devices,
/// syncing state across devices, and managing session lifecycle.
/// 
/// Auth: All endpoints require JWT token. Sessions auto-refresh tokens
/// so team members never experience auth interruption.
/// </summary>
[ApiController]
[Route("api/podcast-sessions")]
[Authorize]
public class PodcastSessionsController : ControllerBase
{
    private readonly IPodcastSessionService _sessionService;
    private readonly ILogger<PodcastSessionsController> _logger;

    public PodcastSessionsController(IPodcastSessionService sessionService, ILogger<PodcastSessionsController> logger)
    {
        _sessionService = sessionService;
        _logger = logger;
    }

    private string GetUserId()
    {
        return User.FindFirst(ClaimTypes.NameIdentifier)?.Value 
            ?? throw new UnauthorizedAccessException("User ID not found in token");
    }

    /// <summary>
    /// POST /api/podcast-sessions/create
    /// Create a new Podcast Studio session for a team.
    /// Only one active session per team; creating a new one closes the previous.
    /// </summary>
    [HttpPost("create")]
    public async Task<ActionResult<PodcastSessionDto>> CreateSession([FromBody] CreatePodcastSessionRequest request)
    {
        try
        {
            var userId = GetUserId();
            
            // Validate request
            if (string.IsNullOrWhiteSpace(request.TeamId))
                return BadRequest("TeamId is required");

            if (request.AccessScope == "device-restricted" && string.IsNullOrWhiteSpace(request.AllowedUserIds))
                return BadRequest("AllowedUserIds is required for device-restricted sessions");

            var session = await _sessionService.CreateSessionAsync(
                request.TeamId, 
                userId, 
                request.AccessScope, 
                request.AllowedUserIds);

            _logger.LogInformation($"User {userId} created session {session.Id} for team {request.TeamId}");

            return Ok(MapToDto(session));
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error creating session: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// POST /api/podcast-sessions/register-device
    /// Register a device in an active session.
    /// If device already registered, this refreshes its token.
    /// </summary>
    [HttpPost("register-device")]
    public async Task<ActionResult<PodcastSessionDeviceDto>> RegisterDevice([FromBody] RegisterDeviceRequest request)
    {
        try
        {
            var userId = GetUserId();

            if (string.IsNullOrWhiteSpace(request.SessionId))
                return BadRequest("SessionId is required");

            if (string.IsNullOrWhiteSpace(request.DeviceId))
                return BadRequest("DeviceId is required");

            if (string.IsNullOrWhiteSpace(request.DeviceName))
                return BadRequest("DeviceName is required");

            var device = await _sessionService.RegisterOrRefreshDeviceAsync(
                request.SessionId,
                userId,
                request.DeviceId,
                request.DeviceName,
                request.DeviceType);

            _logger.LogInformation($"Device {request.DeviceId} registered for user {userId} in session {request.SessionId}");

            return Ok(MapToDto(device));
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { error = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error registering device: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// POST /api/podcast-sessions/sync
    /// Sync session state: upload local device state, download shared session state.
    /// Devices send local changes, server merges into shared state, returns full state to all devices.
    /// </summary>
    [HttpPost("sync")]
    public async Task<ActionResult<SyncStateResponse>> SyncState([FromBody] SyncStateRequest request)
    {
        try
        {
            var userId = GetUserId();

            if (string.IsNullOrWhiteSpace(request.SessionId))
                return BadRequest("SessionId is required");

            if (string.IsNullOrWhiteSpace(request.DeviceId))
                return BadRequest("DeviceId is required");

            var result = await _sessionService.SyncSessionStateAsync(
                request.SessionId,
                userId,
                request.DeviceId,
                request.LocalStateJson);

            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error syncing state: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// POST /api/podcast-sessions/heartbeat
    /// Send heartbeat from a device to keep it marked as active.
    /// Clients should ping every 30 seconds. If no heartbeat for 60 seconds, device is marked stale.
    /// </summary>
    [HttpPost("heartbeat")]
    public async Task<ActionResult<object>> SendHeartbeat([FromBody] HeartbeatRequest request)
    {
        try
        {
            var userId = GetUserId();

            if (string.IsNullOrWhiteSpace(request.SessionId))
                return BadRequest("SessionId is required");

            if (string.IsNullOrWhiteSpace(request.DeviceId))
                return BadRequest("DeviceId is required");

            var success = await _sessionService.SendHeartbeatAsync(
                request.SessionId,
                userId,
                request.DeviceId);

            if (!success)
                return NotFound(new { error = "Device or session not found" });

            return Ok(new { success = true });
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error sending heartbeat: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// POST /api/podcast-sessions/{sessionId}/close
    /// Close a session. Only session initiator can close.
    /// After closure, all devices lose access immediately.
    /// </summary>
    [HttpPost("{sessionId}/close")]
    public async Task<ActionResult<object>> CloseSession(string sessionId)
    {
        try
        {
            var userId = GetUserId();

            if (string.IsNullOrWhiteSpace(sessionId))
                return BadRequest("SessionId is required");

            var success = await _sessionService.CloseSessionAsync(sessionId, userId);

            if (!success)
                return NotFound(new { error = "Session not found or already closed" });

            _logger.LogInformation($"Session {sessionId} closed by user {userId}");
            return Ok(new { success = true, message = "Session closed successfully" });
        }
        catch (UnauthorizedAccessException ex)
        {
            return Forbid();
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error closing session: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// GET /api/podcast-sessions/team/{teamId}/active
    /// Get the active session for a team (if one exists).
    /// </summary>
    [HttpGet("team/{teamId}/active")]
    public async Task<ActionResult<PodcastSessionDto>> GetActiveSessionForTeam(string teamId)
    {
        try
        {
            var session = await _sessionService.GetActiveSessionAsync(teamId);

            if (session == null)
                return NotFound(new { error = "No active session for this team" });

            return Ok(MapToDto(session));
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error getting active session: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// GET /api/podcast-sessions/{sessionId}/devices
    /// Get all active devices in a session.
    /// </summary>
    [HttpGet("{sessionId}/devices")]
    public async Task<ActionResult<List<PodcastSessionDeviceDto>>> GetActiveDevices(string sessionId)
    {
        try
        {
            var devices = await _sessionService.GetActiveDevicesAsync(sessionId);
            return Ok(devices.Select(MapToDto).ToList());
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error getting active devices: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    // ──────────────────────── Mapping Helpers ────────────────────────

    private static PodcastSessionDto MapToDto(Entities.PodcastSession session)
    {
        return new PodcastSessionDto
        {
            Id = session.Id,
            TeamId = session.TeamId,
            Status = session.Status,
            AccessScope = session.AccessScope,
            CreatedAt = session.CreatedAt,
            ClosedAt = session.ClosedAt,
            StateVersion = session.StateVersion,
            Devices = session.Devices.Select(MapToDto).ToList()
        };
    }

    private static PodcastSessionDeviceDto MapToDto(Entities.PodcastSessionDevice device)
    {
        var expiresIn = (device.TokenExpiresAt - DateTime.UtcNow)?.TotalSeconds ?? 0;
        return new PodcastSessionDeviceDto
        {
            Id = device.Id,
            UserId = device.UserId,
            DeviceName = device.DeviceName,
            DeviceType = device.DeviceType,
            JoinedAt = device.JoinedAt,
            LastHeartbeatAt = device.LastHeartbeatAt,
            TokenExpiresInSeconds = expiresIn,
            IsActive = device.IsActive
        };
    }
}
