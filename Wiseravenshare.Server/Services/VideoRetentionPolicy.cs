namespace Wiseravenshare.Server.Services;

public static class VideoRetentionPolicy
{
    public const int TemporaryRetentionDays = 30;

    public static string NormalizeStorageMode(string? storageMode, bool isPermanent)
    {
        if (isPermanent)
        {
            return "permanent";
        }

        return string.Equals(storageMode, "permanent", StringComparison.OrdinalIgnoreCase)
            ? "permanent"
            : "temporary";
    }

    public static bool IsPermanent(string? storageMode, bool isPermanent)
    {
        return isPermanent || string.Equals(storageMode, "permanent", StringComparison.OrdinalIgnoreCase);
    }

    public static DateTime GetExpiresAt(DateTime createdAtUtc, bool isPermanent)
    {
        return IsPermanent(null, isPermanent)
            ? DateTime.MaxValue
            : createdAtUtc.AddDays(TemporaryRetentionDays);
    }

    public static string GetStorageStatus(DateTime createdAtUtc, bool isPermanent, DateTime? nowUtc = null)
    {
        if (IsPermanent(null, isPermanent))
        {
            return "active";
        }

        var referenceTime = nowUtc ?? DateTime.UtcNow;
        return referenceTime >= createdAtUtc.AddDays(TemporaryRetentionDays) ? "expired" : "active";
    }
}
