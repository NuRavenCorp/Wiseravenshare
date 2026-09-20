// Wiseravenshare.Server/Entities/CrossPlatform/BridgeSession.cs
namespace Wiseravenshare.Server.Entities.CrossPlatform;

/// <summary>Cross-platform bridge session persisted in app_data.bridge_sessions.</summary>
public class BridgeSession
{
    public Guid Id { get; set; }
    public string SessionId { get; set; } = string.Empty;
    public string Platform { get; set; } = string.Empty;
    public string ExternalUserId { get; set; } = string.Empty;
    public string? SessionDataJson { get; set; }
    public string? Status { get; set; } = "active";
    public DateTime CreatedAt { get; set; }
    public DateTime LastActivity { get; set; }
    public bool IsActive { get; set; } = true;
    public string? MetadataJson { get; set; }
}

public class CollaborationRoom
{
    public Guid Id { get; set; }
    public string RoomId { get; set; } = string.Empty;
    public string RoomName { get; set; } = string.Empty;
    public Guid? OwnerId { get; set; }
    public string? Platform { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public string? MetadataJson { get; set; }
}

public class RoomParticipant
{
    public Guid Id { get; set; }
    public string RoomId { get; set; } = string.Empty;
    public Guid? UserId { get; set; }
    public string? ExternalUserId { get; set; }
    public string? Platform { get; set; }
    public DateTime JoinedAt { get; set; }
    public DateTime? LeftAt { get; set; }
    public bool IsActive { get; set; } = true;
    public string? MetadataJson { get; set; }
}

public class BridgeMessage
{
    public Guid Id { get; set; }
    public string SessionId { get; set; } = string.Empty;
    public string Source { get; set; } = string.Empty;
    public string Target { get; set; } = string.Empty;
    public string MessageType { get; set; } = string.Empty;
    public string? Content { get; set; }
    public string? MetadataJson { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? ProcessedAt { get; set; }
    public bool IsProcessed { get; set; }
}

public class FileTransfer
{
    public Guid Id { get; set; }
    public string TransferId { get; set; } = string.Empty;
    public string RoomId { get; set; } = string.Empty;
    public Guid? UserId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public long FileSize { get; set; }
    public string FileType { get; set; } = string.Empty;
    public string? FileUrl { get; set; }
    public string Status { get; set; } = "pending";
    public int? ChunkCount { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public string? MetadataJson { get; set; }
}
