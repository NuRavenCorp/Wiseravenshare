namespace Wiseravenshare.Server.Models;

public sealed class OnboardingState
{
    public string UserId { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public bool WelcomeCompleted { get; set; }
    public bool ProfileCompleted { get; set; }
    public bool FirstPostCompleted { get; set; }
    public bool FirstFollowCompleted { get; set; }
    public bool InviteSentCompleted { get; set; }
    public int CompletedSteps { get; set; }
    public int TotalSteps { get; set; } = 5;
    public int ProgressPercent { get; set; }
}

public sealed class FunnelEvent
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string UserId { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string EventName { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public Dictionary<string, string> Metadata { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}

public sealed class InviteRecord
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string ReferrerUserId { get; set; } = string.Empty;
    public string ReferrerEmail { get; set; } = string.Empty;
    public string InviteeEmail { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public bool Redeemed { get; set; }
    public string RedeemedByUserId { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? RedeemedAtUtc { get; set; }
}

public sealed class ModerationReport
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string ReporterUserId { get; set; } = string.Empty;
    public string ReporterEmail { get; set; } = string.Empty;
    public string TargetType { get; set; } = string.Empty;
    public string TargetId { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
    public string Details { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public string Status { get; set; } = "open";
    public string ReviewedByUserId { get; set; } = string.Empty;
    public string ReviewedByEmail { get; set; } = string.Empty;
    public DateTime? ReviewedAtUtc { get; set; }
    public string ResolutionNotes { get; set; } = string.Empty;
}

public sealed class ModerationQueueSummary
{
    public int OpenReports { get; set; }
    public int ResolvedReports { get; set; }
    public int DismissedReports { get; set; }
    public int TotalCount { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
    public int TotalPages { get; set; }
    public string StatusFilter { get; set; } = "open";
    public string TargetTypeFilter { get; set; } = "all";
    public List<ModerationReport> Reports { get; set; } = [];
}

public sealed class FunnelSummary
{
    public int Days { get; set; }
    public int UniqueVisitors { get; set; }
    public int SignedUpUsers { get; set; }
    public int ActivatedUsers { get; set; }
    public int RetainedUsers { get; set; }
    public int InviteCount { get; set; }
    public int InviteRedemptions { get; set; }
    public double ActivationRate { get; set; }
    public double RetentionRate { get; set; }
}

public sealed class ModerationCheckResult
{
    public bool Allowed { get; set; }
    public bool Flagged { get; set; }
    public int RiskScore { get; set; }
    public List<string> Reasons { get; set; } = [];
}

public sealed class RevenueAgentPlan
{
    public string UserId { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Name { get; set; } = "Revenue Agent";
    public string Objective { get; set; } = "Generate $10,000 per week within 8 weeks using verifiable increments.";
    public decimal TargetWeeklyRevenue { get; set; } = 10000m;
    public int DeadlineWeeks { get; set; } = 8;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime CycleStartAtUtc { get; set; } = DateTime.UtcNow.Date;
    public bool IsActive { get; set; } = true;
    public List<RevenueMilestone> Milestones { get; set; } = [];
    public List<RevenueExecutionFunction> Functions { get; set; } = [];
    public List<RevenueActionItem> ActionItems { get; set; } = [];
    public List<RevenueEvidenceEntry> Evidence { get; set; } = [];
}

public sealed class RevenueMilestone
{
    public int WeekNumber { get; set; }
    public decimal TargetRevenue { get; set; }
    public int MinLeads { get; set; }
    public int MinOffers { get; set; }
    public int MinConversions { get; set; }
    public bool RequiresVerification { get; set; } = true;
}

public sealed class RevenueExecutionFunction
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string VerificationMetric { get; set; } = string.Empty;
}

public sealed class RevenueActionItem
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public int WeekNumber { get; set; }
    public string FunctionCode { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public DateTime DueAtUtc { get; set; }
    public string Status { get; set; } = "open";
    public DateTime? CompletedAtUtc { get; set; }
}

public sealed class RevenueEvidenceEntry
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public int WeekNumber { get; set; }
    public DateTime OccurredAtUtc { get; set; } = DateTime.UtcNow;
    public decimal AmountUsd { get; set; }
    public string SourceType { get; set; } = string.Empty;
    public string SourceReference { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;
    public bool Verified { get; set; }
    public string VerifiedByUserId { get; set; } = string.Empty;
    public string VerifiedByEmail { get; set; } = string.Empty;
    public DateTime? VerifiedAtUtc { get; set; }
}

public sealed class RevenueAgentSummary
{
    public string UserId { get; set; } = string.Empty;
    public decimal TargetWeeklyRevenue { get; set; }
    public int DeadlineWeeks { get; set; }
    public int CurrentWeek { get; set; }
    public decimal CurrentWeekVerifiedRevenue { get; set; }
    public decimal CurrentWeekUnverifiedRevenue { get; set; }
    public decimal ProgressToWeeklyTargetPercent { get; set; }
    public decimal TotalVerifiedRevenue { get; set; }
    public decimal TotalUnverifiedRevenue { get; set; }
    public int CompletedActions { get; set; }
    public int TotalActions { get; set; }
    public decimal ActionCompletionPercent { get; set; }
    public bool OnTrackForDeadline { get; set; }
    public RevenueMilestone? ActiveMilestone { get; set; }
}
