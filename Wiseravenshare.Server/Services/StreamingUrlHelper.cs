namespace Wiseravenshare.Server.Services;

/// <summary>
/// Builds streaming URLs that work correctly behind DigitalOcean App Platform's reverse proxy,
/// where Request.Host may still resolve to the internal container address (localhost:10000).
/// Uses the public blob CDN URL when available; otherwise falls back to a relative path
/// that resolves correctly for any browser origin.
/// </summary>
public static class StreamingUrlHelper
{
    /// <summary>
    /// Returns a usable media URL. Prefers the public blob CDN URL; falls back to a
    /// relative streaming path so the browser resolves it against its own origin.
    /// </summary>
    public static string ResolveMediaUrl(string? publicBlobUrl, string relativeStreamPath) =>
        !string.IsNullOrWhiteSpace(publicBlobUrl) ? publicBlobUrl : relativeStreamPath;

    /// <summary>
    /// Builds a relative URL for streaming a media file by name, e.g.
    /// <c>/api/videostreaming/stream?fileName=abc.mp4</c>
    /// </summary>
    public static string StreamByFileName(string fileName) =>
        $"/api/videostreaming/stream?fileName={Uri.EscapeDataString(Path.GetFileName(fileName))}";

    /// <summary>
    /// Builds a relative URL for streaming a media file via its blob object key, e.g.
    /// <c>/api/videostreaming/blob/wiseravenshare/ravensight/video/abc.mp4</c>
    /// </summary>
    public static string StreamByBlobPath(string? relativePath)
    {
        var normalized = (relativePath ?? string.Empty).Replace('\\', '/').Trim('/');
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return string.Empty;
        }

        var encodedPath = string.Join('/',
            normalized
                .Split('/', StringSplitOptions.RemoveEmptyEntries)
                .Select(Uri.EscapeDataString));

        return $"/api/videostreaming/blob/{encodedPath}";
    }
}
