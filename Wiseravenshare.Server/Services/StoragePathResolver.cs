using System.Text.RegularExpressions;

namespace Wiseravenshare.Server.Services;

public static class StoragePathResolver
{
    public static string ResolveProjectFolder(IConfiguration configuration, string? contentRootPath = null, string fallbackProjectFolder = "wiseravenshare")
    {
        var configured = configuration["Storage:Blob:ProjectFolder"]?.Trim();
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return NormalizeFolderPath(configured);
        }

        var explicitSiteName = configuration["Storage:Blob:SiteName"]?.Trim();
        if (!string.IsNullOrWhiteSpace(explicitSiteName))
        {
            return NormalizeFolderPath(explicitSiteName);
        }

        if (!string.IsNullOrWhiteSpace(contentRootPath))
        {
            var siteSlug = InferSiteSlugFromPath(contentRootPath);
            if (!string.IsNullOrWhiteSpace(siteSlug))
            {
                return NormalizeFolderPath(siteSlug);
            }
        }

        var appName = configuration["App:SiteName"]?.Trim();
        if (!string.IsNullOrWhiteSpace(appName))
        {
            return NormalizeFolderPath(appName);
        }

        return NormalizeFolderPath(fallbackProjectFolder);
    }

    public static string ResolveDefaultVideoDestination(IConfiguration configuration, string? contentRootPath = null, string fallbackProjectFolder = "wiseravenshare")
    {
        var configured = configuration["Storage:Video:DefaultFolder"]?.Trim();
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return NormalizeFolderPath(configured);
        }

        var projectFolder = ResolveProjectFolder(configuration, contentRootPath, fallbackProjectFolder);
        return NormalizeFolderPath($"{projectFolder}/ravensight/video");
    }

    public static string NormalizeFolderPath(string? value, string fallbackValue = "wiseravenshare")
    {
        var normalized = (value ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            normalized = fallbackValue;
        }

        normalized = normalized.Replace('\\', '/').Trim('/');
        normalized = Regex.Replace(normalized, @"[^a-zA-Z0-9._-]+", "-");
        normalized = normalized.Trim('-');
        return string.IsNullOrWhiteSpace(normalized) ? fallbackValue : normalized;
    }

    private static string? InferSiteSlugFromPath(string contentRootPath)
    {
        if (string.IsNullOrWhiteSpace(contentRootPath))
        {
            return null;
        }

        var path = contentRootPath.Replace('\\', '/');
        var segments = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
        foreach (var segment in segments.Reverse())
        {
            var candidate = segment.Trim();
            if (string.IsNullOrWhiteSpace(candidate))
            {
                continue;
            }

            if (candidate.Equals("Wiseravenshare.Server", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var knownSlug = MapKnownSiteSlug(candidate);
            if (!string.IsNullOrWhiteSpace(knownSlug))
            {
                return knownSlug;
            }

            var cleaned = Regex.Replace(candidate, @"[^a-zA-Z0-9._-]+", "-").Trim('-');
            if (!string.IsNullOrWhiteSpace(cleaned) && !cleaned.Equals("wwwroot", StringComparison.OrdinalIgnoreCase))
            {
                return cleaned;
            }
        }

        return null;
    }

    private static string? MapKnownSiteSlug(string candidate)
    {
        if (string.IsNullOrWhiteSpace(candidate))
        {
            return null;
        }

        var normalized = candidate.Replace('\\', '/').Trim().ToLowerInvariant();
        return normalized switch
        {
            "voter-alliance" or "voteralliance" => "voter-alliance",
            "wiseravenshare" => "wiseravenshare",
            "wiseravenstream" or "wiseravenstreaming" or "wiseraven-stream" => "wiseravenstream",
            "ravenmarket" or "raven-market" => "ravenmarket",
            _ => null
        };
    }
}
