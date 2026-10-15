using System.Collections.Concurrent;
using Wiseravenshare.Server.Entities.Communique;

namespace Wiseravenshare.Server.Services.Communique;

// ── Call service interface ────────────────────────────────────────────────────

public interface ICommuniqueCallService
{
    Task<ActiveCallState> InitiateCall(string callerId, string calleeId, CallType type);
    Task<bool> AcceptCall(string callId, string userId);
    Task<bool> RejectCall(string callId, string userId);
    Task<bool> EndCall(string callId, string userId);
    Task<ActiveCallState?> GetCallDetails(string callId);
    Task<List<CallLog>> GetCallHistory(string userId, int limit = 50);
    Task<bool> ForwardCall(string callId, string forwardToNumber);
    Task<bool> ScreenCall(string callerId, string calleeId);
    Task<bool> UpdateCallerId(string userId, string callerIdName);
    Task<Dictionary<string, object>> GetCallStatistics(string userId);
}

// ── In-memory call state manager ─────────────────────────────────────────────

public interface ICallStateManager
{
    void AddActiveCall(string callId, ActiveCallState call);
    ActiveCallState? GetActiveCall(string callId);
    void RemoveActiveCall(string callId);
    List<ActiveCallState> GetAllActiveCalls();
    bool IsUserInCall(string userId);
}

public class CallStateManager : ICallStateManager
{
    private readonly ConcurrentDictionary<string, ActiveCallState> _activeCalls = new();

    public void AddActiveCall(string callId, ActiveCallState call) =>
        _activeCalls.TryAdd(callId, call);

    public ActiveCallState? GetActiveCall(string callId)
    {
        _activeCalls.TryGetValue(callId, out var call);
        return call;
    }

    public void RemoveActiveCall(string callId) =>
        _activeCalls.TryRemove(callId, out _);

    public List<ActiveCallState> GetAllActiveCalls() =>
        _activeCalls.Values.ToList();

    public bool IsUserInCall(string userId) =>
        _activeCalls.Values.Any(c => c.CallerId == userId || c.CalleeId == userId);
}

// ── External call gateway interface ──────────────────────────────────────────

public interface IExternalCallGateway
{
    Task<ExternalCallStartResult> StartOutboundCallAsync(
        string internalCallId,
        string callerId,
        string destinationNumber,
        CancellationToken cancellationToken = default);
}
