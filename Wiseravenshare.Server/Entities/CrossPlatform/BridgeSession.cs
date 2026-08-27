// Wiseravenshare.Server/Entities/CrossPlatform/BridgeSession.cs
namespace Wiseravenshare.Server.Entities.CrossPlatform;

/// <summary>In-memory cross-platform bridge session (persisted via bridge_sessions table bootstrap).</summary>
public class BridgeSession
{
    public string SessionId { get; set; } = string.Empty;
    public string Platform { get; set; } = string.Empty;
    public string ExternalUserId { get; set; } = string.Empty;
    public string? SessionDataJson { get; set; }
    public string? Status { get; set; } = "active";
    public DateTime CreatedAt { get; set; }
    public DateTime LastActivity { get; set; }
    public bool IsActive { get; set; } = true;
}
