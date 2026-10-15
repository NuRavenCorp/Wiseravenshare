// Wiseravenshare.Server/Services/CrossPlatform/PlatformBridgeService.cs
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities.CrossPlatform;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Interfaces.Services.CrossPlatform;

namespace Wiseravenshare.Server.Services.CrossPlatform;

public class PlatformBridgeService : IPlatformBridgeService
{
    private readonly AppDbContext _dbContext;
    private readonly ILogger<PlatformBridgeService> _logger;

    public PlatformBridgeService(AppDbContext dbContext, ILogger<PlatformBridgeService> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task<BridgeSession> CreateBridgeSessionAsync(string platform, string externalUserId, string sessionData)
    {
        var nowUtc = DateTime.UtcNow;
        var session = new BridgeSession
        {
            Id = Guid.NewGuid(),
            SessionId = Guid.NewGuid().ToString(),
            Platform = (platform ?? string.Empty).Trim(),
            ExternalUserId = (externalUserId ?? string.Empty).Trim(),
            SessionDataJson = sessionData,
            Status = "active",
            CreatedAt = nowUtc,
            LastActivity = nowUtc,
            IsActive = true
        };

        _dbContext.BridgeSessions.Add(session);
        await _dbContext.SaveChangesAsync();

        _logger.LogInformation("Bridge session created: {SessionId} for {Platform} user {ExternalUserId}",
            session.SessionId, session.Platform, session.ExternalUserId);

        return session;
    }

    public Task<BridgeSession?> GetBridgeSessionAsync(string sessionId)
        => _dbContext.BridgeSessions
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.SessionId == sessionId);

    public async Task<string> EnsureBridgeSessionAsync(string platform, string externalUserId)
    {
        var safePlatform = (platform ?? string.Empty).Trim();
        var safeExternalUserId = (externalUserId ?? string.Empty).Trim();
        var existing = await _dbContext.BridgeSessions
            .OrderByDescending(s => s.LastActivity)
            .FirstOrDefaultAsync(s =>
                s.IsActive
                && s.Platform == safePlatform
                && s.ExternalUserId == safeExternalUserId);

        if (existing is not null)
        {
            existing.LastActivity = DateTime.UtcNow;
            await _dbContext.SaveChangesAsync();
            return existing.SessionId;
        }

        var created = await CreateBridgeSessionAsync(safePlatform, safeExternalUserId, "{}");
        return created.SessionId;
    }

    public async Task<bool> BridgeMessageAsync(string sessionId, string message, string source)
    {
        var session = await _dbContext.BridgeSessions.FirstOrDefaultAsync(s => s.SessionId == sessionId && s.IsActive);
        if (session is null) return false;

        session.LastActivity = DateTime.UtcNow;
        _dbContext.BridgeMessages.Add(new BridgeMessage
        {
            Id = Guid.NewGuid(),
            SessionId = sessionId,
            Source = source,
            Target = session.Platform,
            MessageType = "message",
            Content = message,
            CreatedAt = DateTime.UtcNow,
            ProcessedAt = DateTime.UtcNow,
            IsProcessed = true
        });
        await ProcessPlatformMessage(session.Platform, session.ExternalUserId, message);
        await _dbContext.SaveChangesAsync();

        _logger.LogInformation("Bridged message from {Source} to {Platform}: {Length} chars",
            source, session.Platform, message.Length);
        return true;
    }

    public async Task<bool> SyncPresenceAsync(string sessionId, string status)
    {
        var session = await _dbContext.BridgeSessions.FirstOrDefaultAsync(s => s.SessionId == sessionId && s.IsActive);
        if (session is null) return false;

        session.Status = status;
        session.LastActivity = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();

        _logger.LogInformation("Syncing presence to {Platform} for {ExternalUserId}: {Status}",
            session.Platform, session.ExternalUserId, status);
        return true;
    }

    public async Task<IEnumerable<BridgeSession>> GetActiveSessionsAsync()
        => await _dbContext.BridgeSessions
            .AsNoTracking()
            .Where(s => s.IsActive && s.LastActivity > DateTime.UtcNow.AddMinutes(-30))
            .ToListAsync();

    public async Task<bool> TerminateSessionAsync(string sessionId)
    {
        var session = await _dbContext.BridgeSessions.FirstOrDefaultAsync(s => s.SessionId == sessionId);
        if (session is null) return false;

        session.IsActive = false;
        session.LastActivity = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();

        _logger.LogInformation("Bridge session terminated: {SessionId}", sessionId);
        return true;
    }

    private async Task ProcessPlatformMessage(string platform, string externalUserId, string message)
    {
        switch (platform.ToLowerInvariant())
        {
            case "tiktok":
            case "facebook":
            case "instagram":
            case "youtube":
            case "linkedin":
            case "twitter":
            case "snapchat":
            case "web":
                // Real webhook/API integrations (Messenger Platform, Instagram Graph API,
                // TikTok Content Posting API, YouTube Data API) plug in here; services already exist in
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
