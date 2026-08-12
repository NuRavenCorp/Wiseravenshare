namespace Wiseravenshare.Server.Services;

public static class VideoRetentionPolicy
{
    public const int TemporaryRetentionDays = 7;

    public static string NormalizeStorageMode(string? storageMode, bool isPermanent)
    {
        return ResolveStorageMode(storageMode, isPermanent, hasActiveSubscription: false);
    }

    public static string ResolveStorageMode(string? storageMode, bool isPermanent, bool hasActiveSubscription)
    {
        if (isPermanent && hasActiveSubscription)
        {
            return "permanent";
        }

        if (isPermanent && !hasActiveSubscription)
        {
            return "temporary";
        }

        return string.Equals(storageMode, "permanent", StringComparison.OrdinalIgnoreCase) && hasActiveSubscription
            ? "permanent"
            : "temporary";
    }

    public static bool IsPermanent(string? storageMode, bool isPermanent, bool hasActiveSubscription = false)
    {
        return ResolveStorageMode(storageMode, isPermanent, hasActiveSubscription) == "permanent";
    }

    public static DateTime GetExpiresAt(DateTime createdAtUtc, bool isPermanent, bool hasActiveSubscription = false)
    {
        return IsPermanent(null, isPermanent, hasActiveSubscription)
            ? DateTime.MaxValue
            : createdAtUtc.AddDays(TemporaryRetentionDays);
    }

    public static string GetStorageStatus(DateTime createdAtUtc, bool isPermanent, DateTime? nowUtc = null, bool hasActiveSubscription = false)
    {
        if (IsPermanent(null, isPermanent, hasActiveSubscription))
        {
            return "active";
        }

        if (isPermanent && !hasActiveSubscription)
        {
            return "active";
        }

        var referenceTime = nowUtc ?? DateTime.UtcNow;
        return referenceTime >= createdAtUtc.AddDays(TemporaryRetentionDays) ? "expired" : "active";
    }
}
