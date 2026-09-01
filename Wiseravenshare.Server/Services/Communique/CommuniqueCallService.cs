using System.Text;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities.Communique;
using Wiseravenshare.Server.Infrastructure.Data;

namespace Wiseravenshare.Server.Services.Communique;

public class CommuniqueCallService : ICommuniqueCallService
{
    private readonly AppDbContext _context;
    private readonly ICallStateManager _stateManager;
    private readonly IExternalCallGateway _externalCallGateway;
    private readonly ILogger<CommuniqueCallService> _logger;

    public CommuniqueCallService(
        AppDbContext context,
        ICallStateManager stateManager,
        IExternalCallGateway externalCallGateway,
        ILogger<CommuniqueCallService> logger)
    {
        _context = context;
        _stateManager = stateManager;
        _externalCallGateway = externalCallGateway;
        _logger = logger;
    }

    public async Task<ActiveCallState> InitiateCall(string callerId, string calleeId, CallType type)
    {
        var normalizedTarget = (calleeId ?? string.Empty).Trim();
        var isExternalCall = TryNormalizeExternalNumber(normalizedTarget, out var externalNumber);

        var call = new ActiveCallState
        {
            CallerId = callerId,
            CalleeId = isExternalCall ? $"pstn:{externalNumber}" : normalizedTarget,
            Type = type,
            Status = CallStatus.Initiating,
            StartTime = DateTime.UtcNow,
            IsVideoEnabled = type == CallType.VideoCall || type == CallType.FaceTime,
            IsExternalCall = isExternalCall,
            ExternalNumber = isExternalCall ? externalNumber : null
        };

        _stateManager.AddActiveCall(call.CallId, call);

        try
        {
            if (!isExternalCall)
            {
                // Check if callee exists; forwarding fields are not present on the User entity,
                // so we skip forwarding logic and simply leave the call as Initiating/Ringing.
                if (Guid.TryParse(normalizedTarget, out var calleeGuid))
                {
                    var callee = await _context.Users.FindAsync(calleeGuid);
                    if (callee != null)
                    {
                        call.Status = CallStatus.Ringing;
                    }
                }
                else
                {
                    call.Status = CallStatus.Ringing;
                }
            }
            else
            {
                call.Status = CallStatus.Ringing;

                var startResult = await _externalCallGateway.StartOutboundCallAsync(
                    call.CallId,
                    callerId,
                    externalNumber,
                    default);

                if (!startResult.IsSuccess)
                {
                    _stateManager.RemoveActiveCall(call.CallId);
                    throw new InvalidOperationException(startResult.ErrorMessage);
                }

                call.ProviderCallId = startResult.ProviderCallId;
                call.ProviderStatus = startResult.ProviderStatus;
                if (!string.IsNullOrWhiteSpace(startResult.ProviderCallId))
                {
                    call.SignalingData = "externalProviderCallId:" + startResult.ProviderCallId;
                }
            }

            var callLog = new CallLog
            {
                CallId = call.CallId,
                UserId = callerId,
                ContactId = isExternalCall ? string.Empty : normalizedTarget,
                ContactNumber = isExternalCall ? externalNumber : null,
                Type = type,
                Direction = CallDirection.Outgoing,
                Status = call.Status,
                Timestamp = DateTime.UtcNow
            };

            await _context.CallLogs.AddAsync(callLog);
            await _context.SaveChangesAsync();
        }
        catch (InvalidOperationException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(
                ex,
                "Call {CallId} initiated in memory but database persistence failed for caller {CallerId} -> callee {CalleeId}.",
                call.CallId,
                callerId,
                calleeId);
        }

        return call;
    }

    public async Task<bool> AcceptCall(string callId, string userId)
    {
        var call = _stateManager.GetActiveCall(callId);
        if (call == null || call.CalleeId != userId)
            return false;

        call.Status = CallStatus.Connected;
        call.StartTime = DateTime.UtcNow;

        var callLog = await _context.CallLogs
            .FirstOrDefaultAsync(l => l.CallId == callId && l.Direction == CallDirection.Incoming);
        if (callLog != null)
        {
            callLog.Status = CallStatus.Connected;
            await _context.SaveChangesAsync();
        }

        return true;
    }

    public async Task<bool> RejectCall(string callId, string userId)
    {
        var call = _stateManager.GetActiveCall(callId);
        if (call == null) return false;

        call.Status = CallStatus.Rejected;
        _stateManager.RemoveActiveCall(callId);

        var callLog = await _context.CallLogs
            .FirstOrDefaultAsync(l => l.CallId == callId);
        if (callLog != null)
        {
            callLog.Status = CallStatus.Rejected;
            await _context.SaveChangesAsync();
        }

        return true;
    }

    public async Task<bool> EndCall(string callId, string userId)
    {
        var call = _stateManager.GetActiveCall(callId);
        if (call == null) return false;

        call.Status = CallStatus.Ended;
        call.EndTime = DateTime.UtcNow;
        call.DurationSeconds = (int)(call.EndTime.Value - call.StartTime).TotalSeconds;

        _stateManager.RemoveActiveCall(callId);

        var callLog = await _context.CallLogs
            .FirstOrDefaultAsync(l => l.CallId == callId);
        if (callLog != null)
        {
            callLog.Status = CallStatus.Ended;
            callLog.DurationSeconds = call.DurationSeconds;
            await _context.SaveChangesAsync();
        }

        return true;
    }

    public Task<ActiveCallState?> GetCallDetails(string callId) =>
        Task.FromResult(_stateManager.GetActiveCall(callId));

    public async Task<List<CallLog>> GetCallHistory(string userId, int limit = 50) =>
        await _context.CallLogs
            .Where(l => l.UserId == userId)
            .OrderByDescending(l => l.Timestamp)
            .Take(limit)
            .ToListAsync();

    public async Task<bool> ForwardCall(string callId, string forwardToNumber)
    {
        var call = _stateManager.GetActiveCall(callId);
        if (call == null) return false;

        var forwardLog = new CallLog
        {
            CallId = callId,
            UserId = call.CalleeId,
            ContactNumber = forwardToNumber,
            Type = call.Type,
            Direction = CallDirection.Incoming,
            Status = CallStatus.Ended,
            ScreeningResult = "Forwarded",
            Timestamp = DateTime.UtcNow
        };

        await _context.CallLogs.AddAsync(forwardLog);
        await _context.SaveChangesAsync();
        return true;
    }

    public Task<bool> ScreenCall(string callerId, string calleeId)
    {
        // Screening fields (ScreeningEnabled, WhitelistMode, WhitelistedNumbers) do not exist
        // on the Wiseravenshare User entity yet. Allow all calls through.
        return Task.FromResult(true);
    }

    public async Task<bool> UpdateCallerId(string userId, string callerIdName)
    {
        // CallerIdName is not a field on the Wiseravenshare User entity.
        // Accept the call gracefully as a no-op until the field is added.
        await Task.CompletedTask;
        _logger.LogDebug("UpdateCallerId no-op for user {UserId} (field not present on User entity).", userId);
        return true;
    }

    public async Task<Dictionary<string, object>> GetCallStatistics(string userId)
    {
        var stats = new Dictionary<string, object>();
        var thirtyDaysAgo = DateTime.UtcNow.AddDays(-30);

        var recentCalls = await _context.CallLogs
            .Where(l => l.UserId == userId && l.Timestamp >= thirtyDaysAgo)
            .ToListAsync();

        stats["TotalCalls"] = recentCalls.Count;
        stats["IncomingCalls"] = recentCalls.Count(c => c.Direction == CallDirection.Incoming);
        stats["OutgoingCalls"] = recentCalls.Count(c => c.Direction == CallDirection.Outgoing);
        stats["VideoCalls"] = recentCalls.Count(c => c.Type == CallType.VideoCall);
        stats["TotalDurationMinutes"] = recentCalls.Sum(c => c.DurationSeconds) / 60;
        stats["MissedCalls"] = recentCalls.Count(c => c.Status == CallStatus.Missed);

        return stats;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static bool TryNormalizeExternalNumber(string target, out string normalized)
    {
        normalized = string.Empty;
        if (string.IsNullOrWhiteSpace(target))
            return false;

        foreach (var ch in target)
        {
            var isFormatting = ch == '+' || ch == '-' || ch == ' ' || ch == '(' || ch == ')';
            if (!char.IsDigit(ch) && !isFormatting)
                return false;
        }

        var digits = new StringBuilder(target.Length);
        foreach (var ch in target)
        {
            if (char.IsDigit(ch))
                digits.Append(ch);
        }

        if (digits.Length < 7)
            return false;

        normalized = target.StartsWith('+') ? $"+{digits}" : digits.ToString();
        return true;
    }
}
