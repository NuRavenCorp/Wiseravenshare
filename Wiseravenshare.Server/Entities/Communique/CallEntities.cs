using System.ComponentModel.DataAnnotations.Schema;

namespace Wiseravenshare.Server.Entities.Communique;

// ── Enums ────────────────────────────────────────────────────────────────────

public enum CallType
{
    VOIP,
    VideoCall,
    FaceTime
}

public enum CallStatus
{
    Initiating,
    Ringing,
    Connected,
    Ended,
    Missed,
    Rejected
}

public enum CallDirection
{
    Incoming,
    Outgoing
}

// ── DB entity ─────────────────────────────────────────────────────────────────

/// <summary>Persisted call log entry. Inherits soft-delete/audit from BaseEntity.</summary>
public class CallLog : BaseEntity
{
    /// <summary>The in-memory call identifier (Guid string from ActiveCallState).</summary>
    public string CallId { get; set; } = string.Empty;

    /// <summary>SignalR / JWT user identifier (Guid as string).</summary>
    public string UserId { get; set; } = string.Empty;

    public string ContactId { get; set; } = string.Empty;
    public string? ContactName { get; set; }
    public string? ContactNumber { get; set; }
    public CallType Type { get; set; }
    public CallDirection Direction { get; set; }
    public CallStatus Status { get; set; }
    public DateTime Timestamp { get; set; }
    public int DurationSeconds { get; set; }
    public string? ScreeningResult { get; set; }
}

// ── In-memory call state (NOT a DB entity) ───────────────────────────────────

/// <summary>Represents an active call held in the singleton CallStateManager dictionary.</summary>
public class ActiveCallState
{
    public string CallId { get; set; } = Guid.NewGuid().ToString();
    public string CallerId { get; set; } = string.Empty;
    public string CalleeId { get; set; } = string.Empty;
    public CallType Type { get; set; }
    public CallStatus Status { get; set; }
    public DateTime StartTime { get; set; } = DateTime.UtcNow;
    public DateTime? EndTime { get; set; }
    public int DurationSeconds { get; set; }
    public string? SignalingData { get; set; }
    public bool IsVideoEnabled { get; set; }
    public bool IsEncrypted { get; set; } = true;
    public bool IsExternalCall { get; set; }
    public string? ExternalNumber { get; set; }
    public string? ProviderCallId { get; set; }
    public string? ProviderStatus { get; set; }
}

// ── Result types ──────────────────────────────────────────────────────────────

public sealed class MessageSendResult
{
    public bool Success { get; init; }
    public string? MessageSid { get; init; }
    public string? ErrorMessage { get; init; }
    public string Channel { get; init; } = "sms";

    public static MessageSendResult Ok(string sid, string channel = "sms") =>
        new() { Success = true, MessageSid = sid, Channel = channel };

    public static MessageSendResult Fail(string error, string channel = "sms") =>
        new() { Success = false, ErrorMessage = error, Channel = channel };
}

public sealed class ExternalCallStartResult
{
    public bool IsSuccess { get; init; }
    public string ProviderCallId { get; init; } = string.Empty;
    public string ProviderStatus { get; init; } = string.Empty;
    public string ErrorMessage { get; init; } = string.Empty;

    public static ExternalCallStartResult Success(string providerCallId, string providerStatus) =>
        new() { IsSuccess = true, ProviderCallId = providerCallId, ProviderStatus = providerStatus };

    public static ExternalCallStartResult Failed(string errorMessage) =>
        new() { IsSuccess = false, ErrorMessage = errorMessage };
}
