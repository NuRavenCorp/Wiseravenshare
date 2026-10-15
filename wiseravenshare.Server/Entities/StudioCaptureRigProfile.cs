using System.ComponentModel.DataAnnotations;

namespace Wiseravenshare.Server.Entities;

public sealed class StudioCaptureRigProfile : BaseEntity
{
    public Guid UserId { get; set; }

    [MaxLength(150)]
    public string RigName { get; set; } = "WiseRaven Capture Rig";

    public int AnalogInputChannels { get; set; } = 2;
    public bool HasAnalogPreamps { get; set; } = true;
    public bool HasUsbCConnectivity { get; set; } = true;
    public bool HasBluetoothPairing { get; set; } = true;
    public bool HasMidiInOut { get; set; } = true;
    public bool HasWifi6Streaming { get; set; } = true;
    public bool EnableIpProtection { get; set; } = true;

    [MaxLength(1200)]
    public string? Notes { get; set; }

    public DateTime LastConfiguredAtUtc { get; set; } = DateTime.UtcNow;

    public User User { get; set; } = null!;
}

public sealed class StudioCaptureSourceCapture : BaseEntity
{
    public Guid UserId { get; set; }
    public Guid? RigProfileId { get; set; }

    [MaxLength(30)]
    public string SourceType { get; set; } = "analog";

    [MaxLength(255)]
    public string SourceName { get; set; } = string.Empty;

    [MaxLength(255)]
    public string DeviceIdentifier { get; set; } = string.Empty;

    [MaxLength(255)]
    public string? FileName { get; set; }

    public decimal? DurationSeconds { get; set; }
    public int? ChannelCount { get; set; }
    public DateTime CapturedAtUtc { get; set; } = DateTime.UtcNow;

    [MaxLength(128)]
    public string FingerprintHash { get; set; } = string.Empty;

    public DateTime FingerprintedAtUtc { get; set; } = DateTime.UtcNow;
    public string? MetadataJson { get; set; }

    public User User { get; set; } = null!;
    public StudioCaptureRigProfile? RigProfile { get; set; }
}
