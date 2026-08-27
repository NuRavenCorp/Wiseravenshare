// Wiseravenshare.Server/Services/CrossPlatform/PlatformBridgeService.cs
using System.Collections.Concurrent;
using Wiseravenshare.Server.Entities.CrossPlatform;
using Wiseravenshare.Server.Interfaces.Services.CrossPlatform;

namespace Wiseravenshare.Server.Services.CrossPlatform;

public class PlatformBridgeService : IPlatformBridgeService
{
    private static readonly ConcurrentDictionary<string, BridgeSession> Sessions = new();
    private readonly ILogger<PlatformBridgeService> _logger;

    public PlatformBridgeService(ILogger<PlatformBridgeService> logger)
    {
        _logger = logger;
    }

    public Task<BridgeSession> CreateBridgeSessionAsync(string platform, string externalUserId, string sessionData)
    {
        var session = new BridgeSession
        {
            SessionId = Guid.NewGuid().ToString(),
            Platform = platform,
            ExternalUserId = externalUserId,
            SessionDataJson = sessionData,
            CreatedAt = DateTime.UtcNow,
            LastActivity = DateTime.UtcNow,
            IsActive = true
        };

        Sessions[session.SessionId] = session;
        _logger.LogInformation("Bridge session created: {SessionId} for {Platform} user {ExternalUserId}",
            session.SessionId, platform, externalUserId);

        return Task.FromResult(session);
    }

    public Task<BridgeSession?> GetBridgeSessionAsync(string sessionId)
        => Task.FromResult(Sessions.TryGetValue(sessionId, out var session) ? session : null);

    public Task<string> EnsureBridgeSessionAsync(string platform, string externalUserId)
    {
        var existing = Sessions.Values.FirstOrDefault(s =>
            s.IsActive && s.Platform.Equals(platform, StringComparison.OrdinalIgnoreCase)
            && s.ExternalUserId == externalUserId);

        if (existing is not null)
        {
            existing.LastActivity = DateTime.UtcNow;
            return Task.FromResult(existing.SessionId);
        }

        return CreateBridgeSessionAsync(platform, externalUserId, "{}").ContinueWith(t => t.Result.SessionId);
    }

    public async Task<bool> BridgeMessageAsync(string sessionId, string message, string source)
    {
        if (!Sessions.TryGetValue(sessionId, out var session)) return false;

        session.LastActivity = DateTime.UtcNow;
        await ProcessPlatformMessage(session.Platform, session.ExternalUserId, message);
        _logger.LogInformation("Bridged message from {Source} to {Platform}: {Length} chars",
            source, session.Platform, message.Length);
        return true;
    }

    public Task<bool> SyncPresenceAsync(string sessionId, string status)
    {
        if (!Sessions.TryGetValue(sessionId, out var session)) return Task.FromResult(false);

        session.Status = status;
        session.LastActivity = DateTime.UtcNow;
        _logger.LogInformation("Syncing presence to {Platform} for {ExternalUserId}: {Status}",
            session.Platform, session.ExternalUserId, status);
        return Task.FromResult(true);
    }

    public Task<IEnumerable<BridgeSession>> GetActiveSessionsAsync()
        => Task.FromResult(Sessions.Values.Where(s =>
            s.IsActive && s.LastActivity > DateTime.UtcNow.AddMinutes(-30)));

    public Task<bool> TerminateSessionAsync(string sessionId)
    {
        if (!Sessions.TryGetValue(sessionId, out var session)) return Task.FromResult(false);
        session.IsActive = false;
        _logger.LogInformation("Bridge session terminated: {SessionId}", sessionId);
        return Task.FromResult(true);
    }

    private async Task ProcessPlatformMessage(string platform, string externalUserId, string message)
    {
        switch (platform.ToLowerInvariant())
        {
            case "tiktok":
            case "facebook":
            case "instagram":
            case "twitter":
                // Real webhook/API integrations (Messenger Platform, Instagram Graph API,
                // TikTok Content Posting API) plug in here; services already exist in
                // SocialNetworkPublishers / MetaPlatformPublishers for outbound publishing.
                _logger.LogInformation("Queued {Platform} message for {ExternalUserId}", platform, externalUserId);
                await Task.CompletedTask;
                break;
            default:
                await Task.CompletedTask;
                break;
        }
    }
}
