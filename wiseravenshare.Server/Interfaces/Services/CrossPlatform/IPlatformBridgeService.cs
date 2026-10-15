// Wiseravenshare.Server/Interfaces/Services/CrossPlatform/IPlatformBridgeService.cs
using Wiseravenshare.Server.Entities.CrossPlatform;

namespace Wiseravenshare.Server.Interfaces.Services.CrossPlatform;

/// <summary>
/// Bridges collaboration sessions to external platforms (TikTok, Facebook,
/// Instagram, Twitter) and tracks active bridge sessions.
/// </summary>
public interface IPlatformBridgeService
{
    Task<BridgeSession> CreateBridgeSessionAsync(string platform, string externalUserId, string sessionData);
    Task<BridgeSession?> GetBridgeSessionAsync(string sessionId);
    /// <summary>Returns an existing active session for the platform+user pair, or creates one.</summary>
    Task<string> EnsureBridgeSessionAsync(string platform, string externalUserId);
    Task<bool> BridgeMessageAsync(string sessionId, string message, string source);
    Task<bool> SyncPresenceAsync(string sessionId, string status);
    Task<IEnumerable<BridgeSession>> GetActiveSessionsAsync();
    Task<bool> TerminateSessionAsync(string sessionId);
}
