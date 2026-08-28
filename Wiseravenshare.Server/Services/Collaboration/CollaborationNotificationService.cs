// Wiseravenshare.Server/Services/Collaboration/CollaborationNotificationService.cs
using Microsoft.AspNetCore.SignalR;
using Wiseravenshare.Server.Entities.Collaboration;
using Wiseravenshare.Server.Enums;
using Wiseravenshare.Server.Hubs;
using Hub = Wiseravenshare.Server.Hubs.ProjectCollaborationHub;
using Wiseravenshare.Server.Interfaces.Services;

namespace Wiseravenshare.Server.Services.Collaboration;

/// <summary>
/// Best-effort SignalR notifications for the collaboration feature. Failures are logged
/// and swallowed so a dead hub connection never breaks a collaboration operation.
/// </summary>
public class CollaborationNotificationService : ICollaborationNotificationService
{
    private readonly IHubContext<Hub> _hubContext;
    private readonly ILogger<CollaborationNotificationService> _logger;

    public CollaborationNotificationService(IHubContext<Hub> hubContext, ILogger<CollaborationNotificationService> logger)
    {
        _hubContext = hubContext;
        _logger = logger;
    }

    public Task NotifyMemberAddedAsync(Guid projectId, Guid userId, ProjectRole role)
        => SafeSendAsync(projectId, "memberAdded", new { projectId, userId, role = role.ToString() });

    public Task NotifyContentPublishedAsync(Guid projectId, Guid contentId, SocialPlatform platform)
        => SafeSendAsync(projectId, "contentPublished", new { projectId, contentId, platform = platform.ToString() });

    public Task NotifyProjectUpdatedAsync(Guid projectId, string summary)
        => SafeSendAsync(projectId, "projectUpdated", new { projectId, summary, atUtc = DateTime.UtcNow });

    private async Task SafeSendAsync(Guid projectId, string method, object payload)
    {
        try
        {
            await _hubContext.Clients.Group($"project-{projectId}").SendAsync(method, payload);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Collaboration SignalR notification '{Method}' failed for project {ProjectId}", method, projectId);
        }
    }
}
