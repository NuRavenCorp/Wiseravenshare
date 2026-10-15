namespace Wiseravenshare.Server.Entities.Access;

public enum FeatureScope
{
    Global,
    Compartment,
    Role,
    User
}

public enum FeatureState
{
    Enabled,
    Disabled,
    Hidden,
    Maintenance
}

public enum UserCompartment
{
    Public,
    Guest,
    Member,
    Creator,
    Premium,
    Moderator,
    Admin,
    Ops
}

public enum PresenceState
{
    Offline,
    Online,
    Away,
    Suspended
}

public sealed class UserCompartmentAssignment : BaseEntity
{
    public Guid UserId { get; set; }
    public UserCompartment Compartment { get; set; }
    public bool IsOverride { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime? ExpiresAt { get; set; }
}

public sealed class FeatureFlag : BaseEntity
{
    public string FeatureKey { get; set; } = string.Empty;
    public FeatureScope Scope { get; set; }
    public string? ScopeValue { get; set; }
    public FeatureState State { get; set; } = FeatureState.Enabled;
    public string? Notes { get; set; }
    public DateTime? ExpiresAt { get; set; }
}

public sealed class UserPresence : BaseEntity
{
    public Guid UserId { get; set; }
    public PresenceState State { get; set; } = PresenceState.Offline;
    public DateTime LastSeenUtc { get; set; } = DateTime.UtcNow;
    public DateTime? LastHeartbeatUtc { get; set; }
    public string? DeviceName { get; set; }
    public string? IpAddress { get; set; }
    public bool IsAdminVisible { get; set; }
}

public sealed class FeatureAuditLog : BaseEntity
{
    public Guid? ActorUserId { get; set; }
    public string FeatureKey { get; set; } = string.Empty;
    public FeatureScope Scope { get; set; }
    public string? ScopeValue { get; set; }
    public FeatureState? OldState { get; set; }
    public FeatureState NewState { get; set; }
    public string? Reason { get; set; }
}
