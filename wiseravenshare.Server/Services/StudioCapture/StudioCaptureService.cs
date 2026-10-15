using System.Security.Cryptography;
using System.Text;
using Wiseravenshare.Server.DTOs;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Interfaces.Repositories;

namespace Wiseravenshare.Server.Services.StudioCapture;

public interface IStudioCaptureService
{
    Task<StudioCaptureRigProfileResponse?> GetRigProfileAsync(Guid userId, CancellationToken cancellationToken = default);
    Task<StudioCaptureRigProfileResponse> UpsertRigProfileAsync(Guid userId, UpsertStudioCaptureRigProfileRequest request, CancellationToken cancellationToken = default);
    Task<StudioCaptureSourceCaptureResponse> RecordSourceCaptureAsync(Guid userId, RecordStudioCaptureSourceRequest request, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<StudioCaptureSourceCaptureResponse>> GetRecentSourceCapturesAsync(Guid userId, int limit, CancellationToken cancellationToken = default);
}

public sealed class StudioCaptureService : IStudioCaptureService
{
    private readonly IStudioCaptureRigProfileRepository _rigProfileRepository;
    private readonly IStudioCaptureSourceCaptureRepository _sourceCaptureRepository;

    public StudioCaptureService(
        IStudioCaptureRigProfileRepository rigProfileRepository,
        IStudioCaptureSourceCaptureRepository sourceCaptureRepository)
    {
        _rigProfileRepository = rigProfileRepository;
        _sourceCaptureRepository = sourceCaptureRepository;
    }

    public async Task<StudioCaptureRigProfileResponse?> GetRigProfileAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var entity = await _rigProfileRepository.GetByUserIdAsync(userId, cancellationToken);
        return entity == null ? null : MapRigProfile(entity);
    }

    public async Task<StudioCaptureRigProfileResponse> UpsertRigProfileAsync(
        Guid userId,
        UpsertStudioCaptureRigProfileRequest request,
        CancellationToken cancellationToken = default)
    {
        var entity = await _rigProfileRepository.GetByUserIdAsync(userId, cancellationToken);
        var now = DateTime.UtcNow;
        if (entity == null)
        {
            entity = new StudioCaptureRigProfile
            {
                UserId = userId
            };
            ApplyProfile(entity, request, now);
            await _rigProfileRepository.AddAsync(entity);
            return MapRigProfile(entity);
        }

        ApplyProfile(entity, request, now);
        await _rigProfileRepository.UpdateAsync(entity);
        return MapRigProfile(entity);
    }

    public async Task<StudioCaptureSourceCaptureResponse> RecordSourceCaptureAsync(
        Guid userId,
        RecordStudioCaptureSourceRequest request,
        CancellationToken cancellationToken = default)
    {
        var capturedAtUtc = request.CapturedAtUtc?.ToUniversalTime() ?? DateTime.UtcNow;
        var sourceType = NormalizeSourceType(request.SourceType);
        var sourceName = string.IsNullOrWhiteSpace(request.SourceName) ? "Unknown Source" : request.SourceName.Trim();
        var deviceIdentifier = string.IsNullOrWhiteSpace(request.DeviceIdentifier) ? "unknown-device" : request.DeviceIdentifier.Trim();
        var durationSeconds = request.DurationSeconds.HasValue && request.DurationSeconds.Value > 0
            ? (decimal?)Math.Round(request.DurationSeconds.Value, 3)
            : null;
        var channelCount = request.ChannelCount.HasValue && request.ChannelCount.Value > 0
            ? request.ChannelCount
            : null;

        var hashInput = string.Join("|",
            userId.ToString("N"),
            request.RigProfileId?.ToString("N") ?? "none",
            sourceType,
            sourceName,
            deviceIdentifier,
            request.FileName?.Trim() ?? string.Empty,
            durationSeconds?.ToString() ?? string.Empty,
            channelCount?.ToString() ?? string.Empty,
            capturedAtUtc.ToString("O"),
            request.MetadataJson?.Trim() ?? string.Empty);

        var entity = new StudioCaptureSourceCapture
        {
            UserId = userId,
            RigProfileId = request.RigProfileId,
            SourceType = sourceType,
            SourceName = sourceName,
            DeviceIdentifier = deviceIdentifier,
            FileName = string.IsNullOrWhiteSpace(request.FileName) ? null : request.FileName.Trim(),
            DurationSeconds = durationSeconds,
            ChannelCount = channelCount,
            CapturedAtUtc = capturedAtUtc,
            FingerprintHash = ComputeSha256(hashInput),
            FingerprintedAtUtc = DateTime.UtcNow,
            MetadataJson = string.IsNullOrWhiteSpace(request.MetadataJson) ? null : request.MetadataJson.Trim()
        };

        await _sourceCaptureRepository.AddAsync(entity);
        return MapCapture(entity);
    }

    public async Task<IReadOnlyList<StudioCaptureSourceCaptureResponse>> GetRecentSourceCapturesAsync(
        Guid userId,
        int limit,
        CancellationToken cancellationToken = default)
    {
        var entities = await _sourceCaptureRepository.GetRecentByUserIdAsync(userId, limit, cancellationToken);
        return entities.Select(MapCapture).ToArray();
    }

    private static void ApplyProfile(
        StudioCaptureRigProfile entity,
        UpsertStudioCaptureRigProfileRequest request,
        DateTime nowUtc)
    {
        entity.RigName = string.IsNullOrWhiteSpace(request.RigName)
            ? "WiseRaven Capture Rig"
            : request.RigName.Trim();
        entity.AnalogInputChannels = Math.Clamp(request.AnalogInputChannels, 1, 32);
        entity.HasAnalogPreamps = request.HasAnalogPreamps;
        entity.HasUsbCConnectivity = request.HasUsbCConnectivity;
        entity.HasBluetoothPairing = request.HasBluetoothPairing;
        entity.HasMidiInOut = request.HasMidiInOut;
        entity.HasWifi6Streaming = request.HasWifi6Streaming;
        entity.EnableIpProtection = request.EnableIpProtection;
        entity.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        entity.LastConfiguredAtUtc = nowUtc;
        entity.UpdatedAt = nowUtc;
        entity.IsDeleted = false;
        entity.DeletedAt = null;
    }

    private static string NormalizeSourceType(string? sourceType)
    {
        var normalized = string.IsNullOrWhiteSpace(sourceType)
            ? "analog"
            : sourceType.Trim().ToLowerInvariant();

        return normalized switch
        {
            "analog" => "analog",
            "usb-c" => "usb-c",
            "type-c" => "usb-c",
            "usbc" => "usb-c",
            "micro-usb" => "micro-usb",
            "microusb" => "micro-usb",
            "usb-micro" => "micro-usb",
            "usb" => "usb",
            "bluetooth" => "bluetooth",
            "midi" => "midi",
            "network" => "network",
            "wifi6" => "network",
            _ => "analog"
        };
    }

    private static string ComputeSha256(string input)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private static StudioCaptureRigProfileResponse MapRigProfile(StudioCaptureRigProfile entity)
    {
        return new StudioCaptureRigProfileResponse
        {
            Id = entity.Id,
            RigName = entity.RigName,
            AnalogInputChannels = entity.AnalogInputChannels,
            HasAnalogPreamps = entity.HasAnalogPreamps,
            HasUsbCConnectivity = entity.HasUsbCConnectivity,
            HasBluetoothPairing = entity.HasBluetoothPairing,
            HasMidiInOut = entity.HasMidiInOut,
            HasWifi6Streaming = entity.HasWifi6Streaming,
            EnableIpProtection = entity.EnableIpProtection,
            Notes = entity.Notes,
            LastConfiguredAtUtc = entity.LastConfiguredAtUtc,
            UpdatedAt = entity.UpdatedAt
        };
    }

    private static StudioCaptureSourceCaptureResponse MapCapture(StudioCaptureSourceCapture entity)
    {
        return new StudioCaptureSourceCaptureResponse
        {
            Id = entity.Id,
            RigProfileId = entity.RigProfileId,
            SourceType = entity.SourceType,
            SourceName = entity.SourceName,
            DeviceIdentifier = entity.DeviceIdentifier,
            FileName = entity.FileName,
            DurationSeconds = entity.DurationSeconds,
            ChannelCount = entity.ChannelCount,
            CapturedAtUtc = entity.CapturedAtUtc,
            FingerprintHash = entity.FingerprintHash,
            FingerprintedAtUtc = entity.FingerprintedAtUtc,
            MetadataJson = entity.MetadataJson
        };
    }
}
