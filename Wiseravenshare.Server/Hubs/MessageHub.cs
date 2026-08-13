using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Wiseravenshare.Server.Hubs;

[Authorize]
public class MessageHub : Hub
{
    public Task JoinDirectChannel(string userId)
    {
        var normalized = NormalizeId(userId);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return Task.CompletedTask;
        }

        return Groups.AddToGroupAsync(Context.ConnectionId, BuildUserGroup(normalized));
    }

    public async Task SendDirectMessage(DirectMessageRequest request)
    {
        var senderUserId = ResolveCallerUserId(request.SenderUserId);
        var recipientUserId = NormalizeId(request.RecipientUserId);
        var text = (request.Text ?? string.Empty).Trim();

        if (string.IsNullOrWhiteSpace(senderUserId)
            || string.IsNullOrWhiteSpace(recipientUserId)
            || string.IsNullOrWhiteSpace(text))
        {
            return;
        }

        var payload = new
        {
            id = Guid.NewGuid().ToString("N"),
            senderUserId,
            recipientUserId,
            text,
            sentAtUtc = DateTime.UtcNow,
            fromPersonnel = false
        };

        await Clients.Group(BuildUserGroup(senderUserId)).SendAsync("DirectMessageReceived", payload);

        if (!string.Equals(senderUserId, recipientUserId, StringComparison.OrdinalIgnoreCase))
        {
            await Clients.Group(BuildUserGroup(recipientUserId)).SendAsync("DirectMessageReceived", payload);
        }
    }

    public static string BuildUserGroup(string userId)
    {
        return $"user:{NormalizeId(userId)}";
    }

    private string ResolveCallerUserId(string? fallbackUserId)
    {
        var fromClaims = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? Context.User?.FindFirstValue("sub")
            ?? Context.User?.FindFirstValue("userId");

        var normalizedClaim = NormalizeId(fromClaims);
        if (!string.IsNullOrWhiteSpace(normalizedClaim))
        {
            return normalizedClaim;
        }

        return NormalizeId(fallbackUserId);
    }

    private static string NormalizeId(string? value)
    {
        return (value ?? string.Empty).Trim().ToLowerInvariant();
    }

    public sealed class DirectMessageRequest
    {
        public string SenderUserId { get; set; } = string.Empty;
        public string RecipientUserId { get; set; } = string.Empty;
        public string Text { get; set; } = string.Empty;
    }
}
