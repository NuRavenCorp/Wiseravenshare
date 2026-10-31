namespace Wiseravenshare.Server.Services.Truth;

/// <summary>
/// Centralised rules for deriving and applying TruthStatus on a Post.
/// All paths that set TruthScore or override verification should call these helpers.
/// </summary>
public static class TruthStatusHelper
{
    // Auto-verify threshold: truth score >= this → "verified"
    public const decimal VerifiedThreshold = 60m;
    // Score below this → "false"
    public const decimal FalseThreshold = 30m;

    /// <summary>
    /// All valid status values; only these are accepted by the API.
    /// </summary>
    public static readonly IReadOnlySet<string> ValidStatuses = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        TruthStatuses.Pending,
        TruthStatuses.Verified,
        TruthStatuses.False,
        TruthStatuses.Opinion,
        TruthStatuses.Disputed,
        TruthStatuses.ExpertVerified,
        TruthStatuses.SourceVerified,
    };

    /// <summary>
    /// Derive the correct status from an AI truth score (0–100 scale).
    /// </summary>
    public static string FromScore(decimal score) =>
        score >= VerifiedThreshold ? TruthStatuses.Verified
        : score < FalseThreshold ? TruthStatuses.False
        : TruthStatuses.Pending;

    /// <summary>
    /// Returns <c>true</c> when the status means the post has been positively verified by any method.
    /// </summary>
    public static bool IsVerifiedStatus(string? status) =>
        string.Equals(status, TruthStatuses.Verified, StringComparison.OrdinalIgnoreCase)
        || string.Equals(status, TruthStatuses.ExpertVerified, StringComparison.OrdinalIgnoreCase)
        || string.Equals(status, TruthStatuses.SourceVerified, StringComparison.OrdinalIgnoreCase);
}

/// <summary>All well-known TruthStatus string constants.</summary>
public static class TruthStatuses
{
    /// <summary>Not yet scored or awaiting review.</summary>
    public const string Pending = "pending";

    /// <summary>Auto-verified: truth score ≥ 60 %.</summary>
    public const string Verified = "verified";

    /// <summary>Scored below the false threshold (< 30 %).</summary>
    public const string False = "false";

    /// <summary>Content is entirely opinion/subjective — truth scoring does not apply.</summary>
    public const string Opinion = "opinion";

    /// <summary>Community or admin has flagged the content as disputed.</summary>
    public const string Disputed = "disputed";

    /// <summary>Manually verified by a TruthGuardian or expert with elevated trust.</summary>
    public const string ExpertVerified = "expert_verified";

    /// <summary>Verified because primary cited sources directly support the claim.</summary>
    public const string SourceVerified = "source_verified";
}
