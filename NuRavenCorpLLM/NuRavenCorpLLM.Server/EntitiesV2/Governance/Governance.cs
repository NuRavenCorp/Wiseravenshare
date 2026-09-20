using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using NuRavenCorpLLM.Server.Entities;

namespace NuRavenCorpLLM.Server.Entities.Governance;

public class SafetyPolicy : BaseEntity
{
    [MaxLength(80)]
    public string Key { get; set; } = string.Empty;

    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string? Description { get; set; }

    public bool IsActive { get; set; } = true;
    public int Priority { get; set; } = 100;
    public JsonDocument? Rules { get; set; }
    public JsonDocument? Config { get; set; }
    public PolicyAction DefaultAction { get; set; } = PolicyAction.Block;
}

public enum PolicyAction { Allow, Block, Warn, Redact, RequireApproval }

public class SafetyIncident : BaseEntity
{
    public Guid? ClientSystemId { get; set; }
    public Guid? MessageId { get; set; }
    public Guid? ConversationId { get; set; }
    public Guid? PolicyId { get; set; }

    [MaxLength(80)]
    public string IncidentKind { get; set; } = string.Empty;

    public IncidentSeverity Severity { get; set; } = IncidentSeverity.Medium;

    [MaxLength(2000)]
    public string Description { get; set; } = string.Empty;

    public string? OffendingText { get; set; }
    public JsonDocument? Detector { get; set; }
    public JsonDocument? Evidence { get; set; }
    public bool Resolved { get; set; }
    public DateTime? ResolvedAt { get; set; }
    public Guid? ResolvedBy { get; set; }

    [MaxLength(2000)]
    public string? ResolutionNotes { get; set; }

    public DateTime OccurredAt { get; set; } = DateTime.UtcNow;
}

public enum IncidentSeverity { Info, Low, Medium, High, Critical }

public class AuditLog : BaseEntity
{
    public Guid? ClientSystemId { get; set; }
    public Guid? UserId { get; set; }

    [MaxLength(80)]
    public string Action { get; set; } = string.Empty;

    [MaxLength(80)]
    public string ResourceKind { get; set; } = string.Empty;

    public Guid? ResourceId { get; set; }

    [MaxLength(45)]
    public string? IpAddress { get; set; }

    [MaxLength(500)]
    public string? UserAgent { get; set; }

    public bool Success { get; set; } = true;

    [MaxLength(2000)]
    public string? FailureReason { get; set; }

    public JsonDocument? Details { get; set; }
}

public class ComplianceRule : BaseEntity
{
    [MaxLength(80)]
    public string Key { get; set; } = string.Empty;

    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string? Description { get; set; }

    [MaxLength(80)]
    public string? Framework { get; set; }

    public bool IsActive { get; set; } = true;
    public JsonDocument? Requirements { get; set; }
    public JsonDocument? Controls { get; set; }
}

public class DataRetentionPolicy : BaseEntity
{
    [MaxLength(80)]
    public string EntityKind { get; set; } = string.Empty;

    public int RetentionDays { get; set; } = 365;
    public bool AutoDeleteEnabled { get; set; }
    public bool AnonymizeBeforeDelete { get; set; } = true;
    public bool ArchiveBeforeDelete { get; set; }

    [MaxLength(500)]
    public string? ArchiveLocation { get; set; }

    public DateTime? LastRunAt { get; set; }
    public int ItemsDeletedLastRun { get; set; }
}
