using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Wiseravenshare.Server.Entities.Communique;
using Wiseravenshare.Server.Services.Communique;

namespace Wiseravenshare.Server.Hubs;

[Authorize]
public class CallHub : Hub
{
    private readonly ICommuniqueCallService _callService;
    private readonly ICallStateManager _stateManager;

    public CallHub(ICommuniqueCallService callService, ICallStateManager stateManager)
    {
        _callService = callService;
        _stateManager = stateManager;
    }

    public override async Task OnConnectedAsync()
    {
        var userId = RequireUserId();
        await Groups.AddToGroupAsync(Context.ConnectionId, $"user_{userId}");
        await base.OnConnectedAsync();
    }

    public async Task InitiateCall(string calleeId, CallType type)
    {
        var callerId = RequireUserId();
        ActiveCallState call;
        try
        {
            call = await _callService.InitiateCall(callerId, calleeId, type);
        }
        catch (InvalidOperationException ex)
        {
            throw new HubException(ex.Message);
        }

        if (!call.IsExternalCall)
        {
            await Clients.Group($"user_{call.CalleeId}").SendAsync("IncomingCall", new
            {
                callId   = call.CallId,
                callerId = callerId,
                type     = type,
                isVideo  = type != CallType.VOIP
            });
        }

        await Clients.Caller.SendAsync("CallInitiated", new
        {
            callId         = call.CallId,
            isExternal     = call.IsExternalCall,
            target         = call.IsExternalCall ? call.ExternalNumber : call.CalleeId,
            providerCallId = call.ProviderCallId,
            providerStatus = call.ProviderStatus
        });
    }

    public async Task AcceptCall(string callId)
    {
        var userId = RequireUserId();
        var success = await _callService.AcceptCall(callId, userId);

        if (success)
        {
            var call = _stateManager.GetActiveCall(callId);
            if (call == null)
            {
                await Clients.Caller.SendAsync("CallEnded", callId);
                return;
            }

            await Clients.Group($"user_{call.CallerId}").SendAsync("CallAccepted", callId);
            await Clients.Caller.SendAsync("CallConnected", callId);
        }
    }

    public async Task RejectCall(string callId)
    {
        var userId = RequireUserId();
        await _callService.RejectCall(callId, userId);

        var call = _stateManager.GetActiveCall(callId);
        if (call != null)
        {
            await Clients.Group($"user_{call.CallerId}").SendAsync("CallRejected", callId);
        }
    }

    public async Task EndCall(string callId)
    {
        var userId = RequireUserId();
        await _callService.EndCall(callId, userId);

        var call = _stateManager.GetActiveCall(callId);
        if (call != null)
        {
            await Clients.Group($"user_{call.CallerId}").SendAsync("CallEnded", callId);
            if (!call.IsExternalCall)
            {
                await Clients.Group($"user_{call.CalleeId}").SendAsync("CallEnded", callId);
            }
        }
    }

    public async Task SendSignal(string callId, string signalData)
    {
        var userId = RequireUserId();
        var call = _stateManager.GetActiveCall(callId);

        if (call != null)
        {
            if (call.IsExternalCall)
            {
                await Clients.Caller.SendAsync("SignalIgnored", callId, "External calls do not use peer signaling.");
                return;
            }

            var targetId = call.CallerId == userId ? call.CalleeId : call.CallerId;
            await Clients.Group($"user_{targetId}").SendAsync("SignalReceived", callId, signalData);
        }
    }

    public async Task UpdateCallerId(string callerIdName)
    {
        var userId = RequireUserId();
        await _callService.UpdateCallerId(userId, callerIdName);
        await Clients.Caller.SendAsync("CallerIdUpdated", callerIdName);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userId = Context.UserIdentifier;
        if (!string.IsNullOrWhiteSpace(userId))
        {
            var activeCalls = _stateManager.GetAllActiveCalls()
                .Where(c => c.CallerId == userId || c.CalleeId == userId);

            foreach (var call in activeCalls)
            {
                await _callService.EndCall(call.CallId, userId);
            }
        }

        await base.OnDisconnectedAsync(exception);
    }

    private string RequireUserId()
    {
        var userId = Context.UserIdentifier;
        if (string.IsNullOrWhiteSpace(userId))
            throw new HubException("Authenticated user identifier is required.");
        return userId;
    }
}
