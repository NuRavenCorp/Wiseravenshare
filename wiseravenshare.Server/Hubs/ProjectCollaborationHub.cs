// Wiseravenshare.Server/Hubs/ProjectCollaborationHub.cs
using System.Collections.Concurrent;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Wiseravenshare.Server.DTOs.Collaboration;
using Wiseravenshare.Server.Interfaces.Services;

namespace Wiseravenshare.Server.Hubs;

/// <summary>
/// SignalR hub for real-time project collaboration: presence, live comment feed,
/// and content updates pushed to everyone working on the same project.
/// </summary>
[Authorize]
public class ProjectCollaborationHub : Hub
{
    private static readonly ConcurrentDictionary<string, HashSet<string>> ProjectConnections = new();
    private readonly IProjectService _projectService;
    private readonly ILogger<ProjectCollaborationHub> _logger;

    public ProjectCollaborationHub(IProjectService projectService, ILogger<ProjectCollaborationHub> logger)
    {
        _projectService = projectService;
        _logger = logger;
    }

    private Guid UserId => Context.User?.GetUserId()
        ?? throw new HubException("Unauthenticated hub connection");

    public async Task JoinProject(string projectId)
    {
        if (!Guid.TryParse(projectId, out var pid))
            throw new HubException("Invalid project id");

        // Read access gate — members, owners and public projects only.
        try
        {
            await _projectService.GetProjectAsync(pid, UserId);
        }
        catch (Exception ex) when (ex is Exceptions.NotFoundException or Exceptions.UnauthorizedException)
        {
            throw new HubException("You do not have access to this project");
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(pid));

        var connections = ProjectConnections.GetOrAdd(projectId, _ => new HashSet<string>());
        lock (connections)
        {
            connections.Add(Context.ConnectionId);
            var count = connections.Count;
        }

        await Clients.GroupExcept(GroupName(pid), Context.ConnectionId)
            .SendAsync("UserJoined", new { userId = UserId, connectionId = Context.ConnectionId, joinedAt = DateTime.UtcNow });
    }

    public async Task LeaveProject(string projectId)
    {
        if (!Guid.TryParse(projectId, out var pid)) return;

        await Groups.RemoveFromGroupAsync(Context.ConnectionId, GroupName(pid));

        if (ProjectConnections.TryGetValue(projectId, out var connections))
        {
            lock (connections)
            {
                connections.Remove(Context.ConnectionId);
                if (connections.Count == 0) ProjectConnections.TryRemove(projectId, out _);
            }
        }

        await Clients.Group(GroupName(pid))
            .SendAsync("UserLeft", new { userId = UserId, connectionId = Context.ConnectionId });
    }

    /// <summary>Broadcast a live comment to everyone in the project.</summary>
    public async Task SendComment(string projectId, string text, Guid? contentId = null)
    {
        if (string.IsNullOrWhiteSpace(text) || text.Length > 5000)
            throw new HubException("Comment text must be between 1 and 5000 characters");
        if (!Guid.TryParse(projectId, out var pid))
            throw new HubException("Invalid project id");

        var comment = await _projectService.AddCommentAsync(pid, new AddCommentDto
        {
            ProjectId = pid,
            ContentId = contentId,
            Text = text.Trim()
        }, UserId);

        await Clients.Group(GroupName(pid)).SendAsync("CommentAdded", comment);
    }

    /// <summary>Notify the project group that a piece of content changed (editor lock-free diff push).</summary>
    public async Task ContentUpdated(string projectId, Guid contentId, string changeType)
    {
        if (!Guid.TryParse(projectId, out var pid)) return;

        await Clients.OthersInGroup(GroupName(pid)).SendAsync("ContentUpdated", new
        {
            contentId,
            changeType,
            userId = UserId,
            timestamp = DateTime.UtcNow
        });
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        // Best-effort presence cleanup across all groups this connection joined.
        foreach (var (projectId, connections) in ProjectConnections)
        {
            bool removed;
            lock (connections) removed = connections.Remove(Context.ConnectionId);
            if (removed)
            {
                if (connections.Count == 0) ProjectConnections.TryRemove(projectId, out _);
                await Clients.Group(GroupName(Guid.Parse(projectId)))
                    .SendAsync("UserLeft", new { userId = UserId, connectionId = Context.ConnectionId });
            }
        }
        await base.OnDisconnectedAsync(exception);
    }

    private static string GroupName(Guid projectId) => $"project:{projectId}";
}
