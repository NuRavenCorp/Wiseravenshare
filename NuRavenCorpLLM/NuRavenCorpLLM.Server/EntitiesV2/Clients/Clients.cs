using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using System.Text.Json.Serialization;
using NuRavenCorpLLM.Server.Entities;

namespace NuRavenCorpLLM.Server.Entities.Clients;

public class ClientSystem : BaseEntity
{
    [MaxLength(80)]
    public string Key { get; set; } = string.Empty;

    [MaxLength(200)]
    public string DisplayName { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string? Description { get; set; }

    [MaxLength(100)]
    public string ContactEmail { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? WebsiteUrl { get; set; }

    public ClientTier Tier { get; set; } = ClientTier.Free;
    public ClientStatus Status { get; set; } = ClientStatus.Active;
    public bool IsActive { get; set; } = true;

    [MaxLength(2000)]
    public string? SystemPromptOverride { get; set; }

    public string[]? AllowedModels { get; set; }
    public string[]? BlockedModels { get; set; }
    public string[]? AllowedIps { get; set; }

    public int DailyRequestLimit { get; set; } = 10000;
    public int DailyTokenLimit { get; set; } = 5_000_000;

    public DateTime? SuspendedAt { get; set; }

    [MaxLength(500)]
    public string? SuspensionReason { get; set; }

    public DateTime? LastUsedAt { get; set; }
    public long TotalRequests { get; set; }
    public long TotalTokens { get; set; }
    public decimal TotalCostUsd { get; set; }

    public virtual ICollection<ClientApiKey> ApiKeys { get; set; } = new List<ClientApiKey>();
    public virtual ICollection<ClientScope> Scopes { get; set; } = new List<ClientScope>();
    public virtual ICollection<ClientEvent> Events { get; set; } = new List<ClientEvent>();
    public virtual ICollection<ClientWebhook> Webhooks { get; set; } = new List<ClientWebhook>();
    public virtual ClientRateLimit? RateLimit { get; set; }
}

public enum ClientTier { Free, Standard, Pro, Enterprise, Internal }
public enum ClientStatus { Active, Suspended, Archived, Pending }

public class ClientApiKey : BaseEntity
{
    public Guid ClientSystemId { get; set; }

    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(64)]
    public string KeyPrefix { get; set; } = string.Empty;

    [JsonIgnore]
    [MaxLength(128)]
    public string KeyHash { get; set; } = string.Empty;

    public string[]? Scopes { get; set; }
    public string[]? AllowedIps { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime? ExpiresAt { get; set; }
    public DateTime? LastUsedAt { get; set; }
    public DateTime? RevokedAt { get; set; }

    [MaxLength(500)]
    public string? RevocationReason { get; set; }

    public long TotalUses { get; set; }
    public virtual ClientSystem ClientSystem { get; set; } = null!;
}

public class ClientScope : BaseEntity
{
    public Guid ClientSystemId { get; set; }

    [MaxLength(80)]
    public string ScopeKey { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    public bool IsGranted { get; set; } = true;
    public DateTime? GrantedAt { get; set; } = DateTime.UtcNow;
    public virtual ClientSystem ClientSystem { get; set; } = null!;
}

public class ClientEvent : BaseEntity
{
    public Guid ClientSystemId { get; set; }

    [MaxLength(100)]
    public string EventType { get; set; } = string.Empty;

    [MaxLength(200)]
    public string? EventCategory { get; set; }

    [MaxLength(200)]
    public string? ExternalId { get; set; }

    [MaxLength(200)]
    public string? ExternalUserId { get; set; }

    public DateTime OccurredAt { get; set; } = DateTime.UtcNow;
    public JsonDocument? Payload { get; set; }
    public JsonDocument? Metadata { get; set; }
    public bool Processed { get; set; }
    public DateTime? ProcessedAt { get; set; }
    public int ProcessingAttempts { get; set; }

    [MaxLength(1000)]
    public string? ProcessingError { get; set; }

    public virtual ClientSystem ClientSystem { get; set; } = null!;
}

public class ClientSnapshot : BaseEntity
{
    public Guid ClientSystemId { get; set; }

    [MaxLength(100)]
    public string SnapshotType { get; set; } = string.Empty;

    public JsonDocument? Data { get; set; }
    public JsonDocument? Statistics { get; set; }
    public DateTime CapturedAt { get; set; } = DateTime.UtcNow;
    public virtual ClientSystem ClientSystem { get; set; } = null!;
}

public class ClientWebhook : BaseEntity
{
    public Guid ClientSystemId { get; set; }

    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string Url { get; set; } = string.Empty;

    [MaxLength(128)]
    public string? Secret { get; set; }

    public string[]? SubscribedEvents { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime? LastTriggeredAt { get; set; }
    public DateTime? LastSuccessAt { get; set; }
    public DateTime? LastFailureAt { get; set; }
    public int ConsecutiveFailures { get; set; }
    public long TotalDeliveries { get; set; }
    public long SuccessfulDeliveries { get; set; }

    public virtual ClientSystem ClientSystem { get; set; } = null!;
}

public class ClientRateLimit : BaseEntity
{
    public Guid ClientSystemId { get; set; }
    public int RequestsPerMinute { get; set; } = 60;
    public int RequestsPerHour { get; set; } = 2000;
    public int RequestsPerDay { get; set; } = 20000;
    public int ConcurrentRequests { get; set; } = 10;
    public int MaxRequestBytes { get; set; } = 10 * 1024 * 1024;
    public int MaxResponseTokens { get; set; } = 8000;
    public int BurstAllowance { get; set; } = 20;
    public virtual ClientSystem ClientSystem { get; set; } = null!;
}
