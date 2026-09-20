namespace Wiseravenshare.Server.DTOs;

public sealed class UpsertInstrumentConnectionRequest
{
    public string DeviceIdentifier { get; set; } = string.Empty;
    public string DeviceName { get; set; } = string.Empty;
    public string Transport { get; set; } = "wired";
    public string? HardwareAddress { get; set; }
    public bool IsPaired { get; set; } = true;
    public bool IsTrusted { get; set; }
    public string? MetadataJson { get; set; }
}

public sealed class RegisterBluetoothPairRequest
{
    public string DeviceIdentifier { get; set; } = string.Empty;
    public string DeviceName { get; set; } = string.Empty;
    public string? HardwareAddress { get; set; }
    public string? MetadataJson { get; set; }
}

public sealed class InstrumentConnectionResponse
{
    public Guid Id { get; set; }
    public string DeviceIdentifier { get; set; } = string.Empty;
    public string DeviceName { get; set; } = string.Empty;
    public string Transport { get; set; } = "wired";
    public string? HardwareAddress { get; set; }
    public bool IsPaired { get; set; }
    public bool IsTrusted { get; set; }
    public bool IsActive { get; set; }
    public DateTime LastSeenAtUtc { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public string? MetadataJson { get; set; }
}
