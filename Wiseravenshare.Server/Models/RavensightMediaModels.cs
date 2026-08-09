using Wiseravenshare.Server.Entities;

namespace Wiseravenshare.Server.Models;

public enum RavensightMediaType
{
    Video,
    Photo,
    Music
}

public sealed class RavensightSavedMediaFile
{
    public string FileName { get; init; } = string.Empty;
    public string RelativePath { get; init; } = string.Empty;
    public string AbsolutePath { get; init; } = string.Empty;
    public string DestinationFolder { get; init; } = string.Empty;
    public string ContentType { get; init; } = string.Empty;
    public long SizeBytes { get; init; }
    public DateTime SavedAtUtc { get; init; } = DateTime.UtcNow;
}

public sealed class RavensightSavedVideo
{
    public RavensightSavedMediaFile File { get; init; } = new();
    public Video Video { get; init; } = new();
}
