// Wiseravenshare.Server/Services/CrossPlatform/ICrossPlatformPublisher.cs
using Wiseravenshare.Server.DTOs.Social;

namespace Wiseravenshare.Server.Services.CrossPlatform;

/// <summary>
/// Contract implemented once per external platform. The
/// CrossPlatformPublishService fans a single post out to every registered publisher.
/// </summary>
public interface ICrossPlatformPublisher
{
    /// <summary>Normalized platform key (see <see cref="SocialPlatforms"/>).</summary>
    string Platform { get; }

    /// <summary>True when the required credentials/configuration are present.</summary>
    bool IsConfigured();

    Task<CrossPlatformPublishResultDto> PublishAsync(CrossPlatformPublishRequest request);
}

/// <summary>Shared helpers for platform publishers.</summary>
public static class CrossPlatformPublisherExtensions
{
    public static string Truncate(this string value, int max) =>
        string.IsNullOrEmpty(value) || value.Length <= max ? value : value[..max];
}

/// <summary>Shared result factories for platform publishers.</summary>
public static class CrossPlatformErrors
{
    public static CrossPlatformPublishResultDto NotConfigured(string platform, string settingsKey) =>
        new()
        {
            Platform = platform,
            Success = false,
            Error = $"{platform} is not configured. Set {settingsKey}."
        };

    public static CrossPlatformPublishResultDto Failed(string platform, string error) =>
        new() { Platform = platform, Success = false, Error = error };
}

