namespace Wiseravenshare.Server.Services;

public static class VideoRetentionPolicy
{
    public const int TemporaryRetentionDays = 30;

    /// <summary>
    /// The single source of truth for how long a record is retained.
    ///
    /// Permanent overrides temporary: an explicit permanent request (either the
    /// isPermanent flag or a stored "permanent" mode) is honoured unconditionally,
    /// including for accounts without an active subscription. Anything else is
    /// temporary.
    ///
    /// Every other member derives from this. Do not reintroduce a second
    /// interpretation of `isPermanent` — see GetStorageStatus for the
    /// divergence that caused (it read the raw flag and disagreed with this
    /// method for the same arguments).
    /// </summary>
    public static string ResolveStorageMode(string? storageMode, bool isPermanent, bool hasActiveSubscription)
    {
        var requestedPermanent = isPermanent
            || string.Equals(storageMode, "permanent", StringComparison.OrdinalIgnoreCase);

        return requestedPermanent ? "permanent" : "temporary";
    }

    public static string NormalizeStorageMode(string? storageMode, bool isPermanent)
    {
        return ResolveStorageMode(storageMode, isPermanent, hasActiveSubscription: false);
    }

    /// <summary>
    /// Whether the record is retained permanently. Delegates to
    /// ResolveStorageMode so there is exactly one interpretation of retention.
    /// </summary>
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

    /// <summary>
    /// Retention status derived from the same retention decision as storage
    /// mode. The raw `isPermanent` flag is deliberately NOT consulted directly:
    /// doing so previously made this return "active" for a non-subscriber whose
    /// storage mode was computed as "temporary".
    /// </summary>
    public static string GetStorageStatus(DateTime createdAtUtc, bool isPermanent, DateTime? nowUtc = null, bool hasActiveSubscription = false)
    {
        if (IsPermanent(null, isPermanent, hasActiveSubscription))
        {
            return "active";
        }

        var referenceTime = nowUtc ?? DateTime.UtcNow;
        return referenceTime >= createdAtUtc.AddDays(TemporaryRetentionDays) ? "expired" : "active";
    }
}
