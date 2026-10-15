using System.Collections.Concurrent;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Wiseravenshare.Server.Hubs;

[AllowAnonymous]
public sealed class WebRtcSignalingHub : Hub
{
    private sealed record SessionPeer(string PeerId, string Name, string Role, string Device, string ConnectionId);

    private sealed record ConnectionSession(string SessionCode, string PeerId);

    private static readonly ConcurrentDictionary<string, ConcurrentDictionary<string, SessionPeer>> Sessions =
        new(StringComparer.OrdinalIgnoreCase);

    private static readonly ConcurrentDictionary<string, ConnectionSession> ConnectionIndex = new();

    public async Task JoinSession(string sessionCode, string peerId, string name, string role, string? device = null)
    {
        var normalizedSessionCode = NormalizeSessionCode(sessionCode);
        var normalizedPeerId = NormalizePeerId(peerId);
        var displayName = string.IsNullOrWhiteSpace(name) ? "Guest" : name.Trim();
        var normalizedRole = string.IsNullOrWhiteSpace(role) ? "member" : role.Trim().ToLowerInvariant();
        var normalizedDevice = string.IsNullOrWhiteSpace(device) ? string.Empty : device.Trim();

        await RemoveConnectionFromAnySessionAsync(Context.ConnectionId);
        await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(normalizedSessionCode));

        var peers = Sessions.GetOrAdd(
            normalizedSessionCode,
            _ => new ConcurrentDictionary<string, SessionPeer>(StringComparer.OrdinalIgnoreCase));

        peers[normalizedPeerId] = new SessionPeer(normalizedPeerId, displayName, normalizedRole, normalizedDevice, Context.ConnectionId);
        ConnectionIndex[Context.ConnectionId] = new ConnectionSession(normalizedSessionCode, normalizedPeerId);

        await Clients.Group(GroupName(normalizedSessionCode))
            .SendAsync("PeersUpdated", peers.Values.Select(ToClientPeer));
    }

    public async Task LeaveSession(string sessionCode)
    {
        var normalizedSessionCode = NormalizeSessionCode(sessionCode);
        await RemoveConnectionFromSessionAsync(Context.ConnectionId, normalizedSessionCode);
    }

    public async Task SendSignal(string sessionCode, string targetPeerId, string signalType, object? data)
    {
        var normalizedSessionCode = NormalizeSessionCode(sessionCode);
        var normalizedTargetPeerId = NormalizePeerId(targetPeerId);

        if (!ConnectionIndex.TryGetValue(Context.ConnectionId, out var sourceSession)
            || !string.Equals(sourceSession.SessionCode, normalizedSessionCode, StringComparison.OrdinalIgnoreCase))
        {
            throw new HubException("You must join the session before sending signals.");
        }

        if (!Sessions.TryGetValue(normalizedSessionCode, out var peers)
            || !peers.TryGetValue(normalizedTargetPeerId, out var targetPeer))
        {
            throw new HubException("Target peer is not connected.");
        }

        await Clients.Client(targetPeer.ConnectionId)
            .SendAsync("SignalReceived", sourceSession.PeerId, signalType, data);
    }

    public async Task BroadcastSessionEvent(string sessionCode, string eventType, object? payload)
    {
        var normalizedSessionCode = NormalizeSessionCode(sessionCode);
        var normalizedEventType = string.IsNullOrWhiteSpace(eventType)
            ? throw new HubException("Event type is required.")
            : eventType.Trim();

        if (!ConnectionIndex.TryGetValue(Context.ConnectionId, out var sourceSession)
            || !string.Equals(sourceSession.SessionCode, normalizedSessionCode, StringComparison.OrdinalIgnoreCase))
        {
            throw new HubException("You must join the session before broadcasting studio events.");
        }

        await Clients.Group(GroupName(normalizedSessionCode))
            .SendAsync("SessionEventReceived", sourceSession.PeerId, normalizedEventType, payload);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        await RemoveConnectionFromAnySessionAsync(Context.ConnectionId);
        await base.OnDisconnectedAsync(exception);
    }

    private static object ToClientPeer(SessionPeer peer) => new
    {
        id = peer.PeerId,
        name = peer.Name,
        role = peer.Role,
        device = peer.Device
    };

    private async Task RemoveConnectionFromAnySessionAsync(string connectionId)
    {
        if (!ConnectionIndex.TryGetValue(connectionId, out var connectionSession))
        {
            return;
        }

        await RemoveConnectionFromSessionAsync(connectionId, connectionSession.SessionCode);
    }

    private async Task RemoveConnectionFromSessionAsync(string connectionId, string sessionCode)
    {
        if (!ConnectionIndex.TryRemove(connectionId, out var connectionSession))
        {
            await Groups.RemoveFromGroupAsync(connectionId, GroupName(sessionCode));
            return;
        }

        if (Sessions.TryGetValue(connectionSession.SessionCode, out var peers))
        {
            peers.TryRemove(connectionSession.PeerId, out _);
            if (peers.IsEmpty)
            {
                Sessions.TryRemove(connectionSession.SessionCode, out _);
            }
            else
            {
                await Clients.Group(GroupName(connectionSession.SessionCode))
                    .SendAsync("PeersUpdated", peers.Values.Select(ToClientPeer));
            }
        }

        await Groups.RemoveFromGroupAsync(connectionId, GroupName(connectionSession.SessionCode));
    }

    private static string NormalizeSessionCode(string sessionCode)
    {
        var normalized = (sessionCode ?? string.Empty).Trim().ToUpperInvariant();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            throw new HubException("Session code is required.");
        }

        return normalized;
    }

    private static string NormalizePeerId(string peerId)
    {
        var normalized = (peerId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            throw new HubException("Peer id is required.");
        }

        return normalized;
    }

    private static string GroupName(string sessionCode) => $"webrtc:{sessionCode}";
}
