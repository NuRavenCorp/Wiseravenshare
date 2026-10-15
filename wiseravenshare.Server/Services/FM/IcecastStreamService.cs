using System.Text.RegularExpressions;
using Microsoft.Extensions.Configuration;

namespace Wiseravenshare.Server.Services.FM;

public interface IIcecastStreamService
{
    Task<IcecastStreamProvisioningResult> ProvisionAsync(string stationName, Guid stationId, string? existingStreamKey = null, CancellationToken cancellationToken = default);
}

public sealed record IcecastStreamProvisioningResult(
    string MountPoint,
    string ListenerUrl,
    string StreamKey,
    string SourceUrl,
    bool IsEnabled);

public sealed class IcecastStreamService : IIcecastStreamService
{
    private readonly IConfiguration _configuration;

    public IcecastStreamService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public Task<IcecastStreamProvisioningResult> ProvisionAsync(string stationName, Guid stationId, string? existingStreamKey = null, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var enabled = _configuration.GetValue<bool>("Streaming:Icecast:Enabled");
        var publicBase = NormalizeBaseUrl(_configuration["Streaming:Icecast:PublicUrl"] ?? _configuration["Streaming:Icecast:BaseUrl"] ?? "https://wiseravenshare.com");
        var baseHost = NormalizeBaseUrl(_configuration["Streaming:Icecast:BaseUrl"] ?? publicBase);
        var mountPrefix = (_configuration["Streaming:Icecast:MountPrefix"] ?? "radio").Trim('/');

        var slug = MakeSlug(stationName, stationId);
        var mountPoint = string.IsNullOrWhiteSpace(mountPrefix)
            ? $"/{slug}"
            : $"/{mountPrefix}/{slug}";

        var streamKey = string.IsNullOrWhiteSpace(existingStreamKey)
            ? $"wr-{Guid.NewGuid():N}"[..16]
            : existingStreamKey;

        var listenerUrl = $"{publicBase}{mountPoint}";
        if (!enabled && !string.IsNullOrWhiteSpace(baseHost))
        {
            listenerUrl = $"{publicBase}/radio/{slug}";
        }

        var sourceUrl = string.IsNullOrWhiteSpace(baseHost)
            ? $"{publicBase}{mountPoint}"
            : $"{baseHost}{mountPoint}";

        if (enabled)
        {
            var sourceUser = _configuration["Streaming:Icecast:SourceUsername"] ?? "source";
            var configuredHost = _configuration["Streaming:Icecast:SourceHost"];
            var sourceHost = string.IsNullOrWhiteSpace(configuredHost) || configuredHost.Equals("localhost", StringComparison.OrdinalIgnoreCase)
                ? publicBase.Replace("https://", string.Empty).Replace("http://", string.Empty).Split('/')[0]
                : configuredHost.Trim();
            var sourcePort = _configuration["Streaming:Icecast:SourcePort"] ?? "8001";
            var sourcePass = _configuration["Streaming:Icecast:SourcePassword"];
            var automaticSourcePassword = string.IsNullOrWhiteSpace(sourcePass) || sourcePass.Equals("change-me", StringComparison.OrdinalIgnoreCase) || sourcePass.Equals("hackme", StringComparison.OrdinalIgnoreCase)
                ? streamKey
                : sourcePass;
            sourceUrl = $"source://{sourceUser}:{automaticSourcePassword}@{sourceHost}:{sourcePort}{mountPoint}";
        }

        return Task.FromResult(new IcecastStreamProvisioningResult(
            MountPoint: mountPoint,
            ListenerUrl: listenerUrl,
            StreamKey: streamKey,
            SourceUrl: sourceUrl,
            IsEnabled: enabled));
    }

    private static string NormalizeBaseUrl(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return "https://wiseravenshare.com";
        }

        var trimmed = value.Trim();
        if (!trimmed.StartsWith("http://", StringComparison.OrdinalIgnoreCase) && !trimmed.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            trimmed = $"https://{trimmed}";
        }

        return trimmed.TrimEnd('/');
    }

    private static string MakeSlug(string stationName, Guid stationId)
    {
        var slug = Regex.Replace((stationName ?? string.Empty).Trim(), "[^a-zA-Z0-9]+", "-").Trim('-');
        if (string.IsNullOrWhiteSpace(slug))
        {
            slug = $"station-{stationId:N}";
        }

        return $"{slug}-{stationId:N}"[..Math.Min(64, $"{slug}-{stationId:N}".Length)];
    }
}
