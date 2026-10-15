namespace Wiseravenshare.Server.DTOs;

public sealed class UpsertStudioCaptureRigProfileRequest
{
    public string RigName { get; set; } = "WiseRaven Capture Rig";
    public int AnalogInputChannels { get; set; } = 2;
    public bool HasAnalogPreamps { get; set; } = true;
    public bool HasUsbCConnectivity { get; set; } = true;
    public bool HasBluetoothPairing { get; set; } = true;
    public bool HasMidiInOut { get; set; } = true;
    public bool HasWifi6Streaming { get; set; } = true;
    public bool EnableIpProtection { get; set; } = true;
    public string? Notes { get; set; }
}

public sealed class StudioCaptureRigProfileResponse
{
    public Guid Id { get; set; }
    public string RigName { get; set; } = string.Empty;
    public int AnalogInputChannels { get; set; }
    public bool HasAnalogPreamps { get; set; }
    public bool HasUsbCConnectivity { get; set; }
    public bool HasBluetoothPairing { get; set; }
    public bool HasMidiInOut { get; set; }
    public bool HasWifi6Streaming { get; set; }
    public bool EnableIpProtection { get; set; }
    public string? Notes { get; set; }
    public DateTime LastConfiguredAtUtc { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public sealed class RecordStudioCaptureSourceRequest
{
    public Guid? RigProfileId { get; set; }
    public string SourceType { get; set; } = "analog";
    public string SourceName { get; set; } = string.Empty;
    public string DeviceIdentifier { get; set; } = string.Empty;
    public string? FileName { get; set; }
    public decimal? DurationSeconds { get; set; }
    public int? ChannelCount { get; set; }
    public DateTime? CapturedAtUtc { get; set; }
    public string? MetadataJson { get; set; }
}

public sealed class StudioCaptureSourceCaptureResponse
{
    public Guid Id { get; set; }
    public Guid? RigProfileId { get; set; }
    public string SourceType { get; set; } = "analog";
    public string SourceName { get; set; } = string.Empty;
    public string DeviceIdentifier { get; set; } = string.Empty;
    public string? FileName { get; set; }
    public decimal? DurationSeconds { get; set; }
    public int? ChannelCount { get; set; }
    public DateTime CapturedAtUtc { get; set; }
    public string FingerprintHash { get; set; } = string.Empty;
    public DateTime FingerprintedAtUtc { get; set; }
    public string? MetadataJson { get; set; }
}
