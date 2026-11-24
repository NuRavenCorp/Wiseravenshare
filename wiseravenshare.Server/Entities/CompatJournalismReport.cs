namespace Wiseravenshare.Server.Entities;

public sealed class CompatJournalismReport
{
    public string Id { get; set; } = string.Empty;
    public string CreatedById { get; set; } = string.Empty;
    public string? PostId { get; set; }
    public string Headline { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Region { get; set; }
    public string? ImageUrl { get; set; }
    public string? SourceUrl { get; set; }
    /// <summary>under_review | verified | rejected</summary>
    public string VerificationStatus { get; set; } = "under_review";
    public bool IsBlocked { get; set; } = true;
    /// <summary>pending_review | queued_for_consumption | rejected</summary>
    public string QueueStatus { get; set; } = "pending_review";
    public bool IsImmediatelyAvailable { get; set; }
    public DateTime? ApprovedAtUtc { get; set; }
    public string? ApprovedBy { get; set; }
    public DateTime CreatedDate { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedDate { get; set; } = DateTime.UtcNow;
}
