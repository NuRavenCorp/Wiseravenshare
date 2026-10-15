using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.Authorization;

namespace Wiseravenshare.Server.Hubs;

[Authorize]
public class NotificationHub : Hub
{
	public Task JoinUserChannel(string userId)
	{
		var normalized = NormalizeId(userId);
		if (string.IsNullOrWhiteSpace(normalized))
		{
			return Task.CompletedTask;
		}

		return Groups.AddToGroupAsync(Context.ConnectionId, BuildUserGroup(normalized));
	}

	public Task LeaveUserChannel(string userId)
	{
		var normalized = NormalizeId(userId);
		if (string.IsNullOrWhiteSpace(normalized))
		{
			return Task.CompletedTask;
		}

		return Groups.RemoveFromGroupAsync(Context.ConnectionId, BuildUserGroup(normalized));
	}

	public static string BuildUserGroup(string userId)
	{
		return $"user:{NormalizeId(userId)}";
	}

	private static string NormalizeId(string? value)
	{
		return (value ?? string.Empty).Trim().ToLowerInvariant();
	}
}
