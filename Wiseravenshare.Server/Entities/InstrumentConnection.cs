using System.ComponentModel.DataAnnotations;

namespace Wiseravenshare.Server.Entities;

public sealed class InstrumentConnection : BaseEntity
{
    public Guid UserId { get; set; }

    [MaxLength(120)]
    public string DeviceIdentifier { get; set; } = string.Empty;

    [MaxLength(255)]
    public string DeviceName { get; set; } = string.Empty;

    [MaxLength(40)]
    public string Transport { get; set; } = "wired";

    [MaxLength(120)]
    public string? HardwareAddress { get; set; }

    public bool IsPaired { get; set; }
    public bool IsTrusted { get; set; }
    public bool IsActive { get; set; }

    public DateTime LastSeenAtUtc { get; set; } = DateTime.UtcNow;

    public string? MetadataJson { get; set; }

    public User User { get; set; } = null!;
}
