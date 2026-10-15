using System.Text.Json;
using System.Text.RegularExpressions;
using Wiseravenshare.Server.Models;

namespace Wiseravenshare.Server.Services;

public sealed class GrowthService
{
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<GrowthService> _logger;
    private readonly object _lock = new();
    private GrowthState _state = new();
    private bool _loaded;
    private string? _stateFilePath;

    private static readonly HashSet<string> ActivationEvents = new(StringComparer.OrdinalIgnoreCase)
    {
        "signup_completed", "profile_updated", "first_post_created", "first_follow", "invite_sent"
    };

    public GrowthService(IWebHostEnvironment environment, ILogger<GrowthService> logger)
    {
        _environment = environment;
        _logger = logger;
    }

    public void TrackEvent(string userId, string email, string eventName, IDictionary<string, string>? metadata = null)
    {
        if (string.IsNullOrWhiteSpace(userId) || string.IsNullOrWhiteSpace(eventName))
        {
            return;
        }

        var normalized = eventName.Trim().ToLowerInvariant();
        EnsureLoaded();

        lock (_lock)
        {
            _state.Events.Add(new FunnelEvent
            {
                UserId = userId,
                Email = email.Trim(),
                EventName = normalized,
                CreatedAtUtc = DateTime.UtcNow,
                Metadata = metadata is null
                    ? new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                    : new Dictionary<string, string>(metadata, StringComparer.OrdinalIgnoreCase)
            });

            TrimUnsafe();
            PersistUnsafe();
        }
    }

    public OnboardingState GetOnboardingState(UserRecord user)
    {
        EnsureLoaded();

        lock (_lock)
        {
            var hasEvent = (string name) => _state.Events.Any(e => e.UserId == user.Id && e.EventName == name);

            var profileCompleted = !string.IsNullOrWhiteSpace(user.Bio)
                && (!string.IsNullOrWhiteSpace(user.Avatar) || !string.IsNullOrWhiteSpace(user.Location));

            var state = new OnboardingState
            {
                UserId = user.Id,
                Email = user.Email,
                WelcomeCompleted = hasEvent("signup_completed") || user.CreatedAtUtc != default,
                ProfileCompleted = profileCompleted || hasEvent("profile_updated"),
                FirstPostCompleted = hasEvent("first_post_created"),
                FirstFollowCompleted = hasEvent("first_follow"),
                InviteSentCompleted = hasEvent("invite_sent"),
                TotalSteps = 5
            };

            state.CompletedSteps = new[]
            {
                state.WelcomeCompleted,
                state.ProfileCompleted,
                state.FirstPostCompleted,
                state.FirstFollowCompleted,
                state.InviteSentCompleted
            }.Count(done => done);

            state.ProgressPercent = (int)Math.Round(state.CompletedSteps * 100.0 / state.TotalSteps);
            return state;
        }
    }

    public InviteRecord CreateInvite(string referrerUserId, string referrerEmail, string inviteeEmail, string message)
    {
        EnsureLoaded();

        lock (_lock)
        {
            var hourAgo = DateTime.UtcNow.AddHours(-1);
            var sentInLastHour = _state.Invites.Count(i => i.ReferrerUserId == referrerUserId && i.CreatedAtUtc >= hourAgo);
            if (sentInLastHour >= 15)
            {
                throw new InvalidOperationException("Invite limit reached. Please try again later.");
            }

            var existingPending = _state.Invites.FirstOrDefault(i =>
                i.ReferrerUserId == referrerUserId
                && i.InviteeEmail.Equals(inviteeEmail, StringComparison.OrdinalIgnoreCase)
                && !i.Redeemed);

            if (existingPending is not null)
            {
                return existingPending;
            }

            var code = BuildInviteCode(referrerUserId);
            var invite = new InviteRecord
            {
                ReferrerUserId = referrerUserId,
                ReferrerEmail = referrerEmail.Trim(),
                InviteeEmail = inviteeEmail.Trim(),
                Code = code,
                Message = message.Trim(),
                CreatedAtUtc = DateTime.UtcNow
            };

            _state.Invites.Add(invite);
            _state.Events.Add(new FunnelEvent
            {
                UserId = referrerUserId,
                Email = referrerEmail.Trim(),
                EventName = "invite_sent",
                CreatedAtUtc = DateTime.UtcNow,
                Metadata = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                {
                    ["inviteeEmail"] = invite.InviteeEmail,
                    ["inviteCode"] = invite.Code
                }
            });

            TrimUnsafe();
            PersistUnsafe();
            return invite;
        }
    }

    public bool TryRedeemInvite(string code, string redeemedByUserId)
    {
        EnsureLoaded();

        lock (_lock)
        {
            var invite = _state.Invites.FirstOrDefault(i => i.Code.Equals(code.Trim(), StringComparison.OrdinalIgnoreCase));
            if (invite is null || invite.Redeemed)
            {
                return false;
            }

            invite.Redeemed = true;
            invite.RedeemedByUserId = redeemedByUserId;
            invite.RedeemedAtUtc = DateTime.UtcNow;

            _state.Events.Add(new FunnelEvent
            {
                UserId = invite.ReferrerUserId,
                Email = invite.ReferrerEmail,
                EventName = "invite_redeemed",
                CreatedAtUtc = DateTime.UtcNow,
                Metadata = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                {
                    ["inviteCode"] = invite.Code,
                    ["redeemedByUserId"] = redeemedByUserId
                }
            });

            PersistUnsafe();
            return true;
        }
    }

    public object GetReferralStats(string userId)
    {
        EnsureLoaded();

        lock (_lock)
        {
            var invites = _state.Invites
                .Where(i => i.ReferrerUserId == userId)
                .OrderByDescending(i => i.CreatedAtUtc)
                .Take(25)
                .ToList();

            return new
            {
                totalInvites = invites.Count,
                redeemedInvites = invites.Count(i => i.Redeemed),
                pendingInvites = invites.Count(i => !i.Redeemed),
                recentInvites = invites
            };
        }
    }

    public FunnelSummary GetFunnelSummary(int days)
    {
        EnsureLoaded();

        var safeDays = Math.Clamp(days, 1, 90);
        var cutoff = DateTime.UtcNow.AddDays(-safeDays);

        lock (_lock)
        {
            var events = _state.Events.Where(e => e.CreatedAtUtc >= cutoff).ToList();
            var uniqueUsers = events.Select(e => e.UserId).Distinct(StringComparer.Ordinal).ToList();
            var signedUpUsers = events.Where(e => e.EventName == "signup_completed").Select(e => e.UserId).Distinct(StringComparer.Ordinal).Count();

            var activatedUsers = uniqueUsers.Count(userId =>
            {
                var names = events.Where(e => e.UserId == userId).Select(e => e.EventName).Distinct(StringComparer.OrdinalIgnoreCase);
                return names.Count(name => ActivationEvents.Contains(name)) >= 2;
            });

            var retainedUsers = uniqueUsers.Count(userId =>
                events.Where(e => e.UserId == userId).Select(e => e.CreatedAtUtc.Date).Distinct().Count() >= 2);

            var inviteCount = _state.Invites.Count(i => i.CreatedAtUtc >= cutoff);
            var inviteRedemptions = _state.Invites.Count(i => i.Redeemed && i.RedeemedAtUtc >= cutoff);

            return new FunnelSummary
            {
                Days = safeDays,
                UniqueVisitors = uniqueUsers.Count,
                SignedUpUsers = signedUpUsers,
                ActivatedUsers = activatedUsers,
                RetainedUsers = retainedUsers,
                InviteCount = inviteCount,
                InviteRedemptions = inviteRedemptions,
                ActivationRate = signedUpUsers == 0 ? 0 : Math.Round(activatedUsers * 100.0 / signedUpUsers, 2),
                RetentionRate = activatedUsers == 0 ? 0 : Math.Round(retainedUsers * 100.0 / activatedUsers, 2)
            };
        }
    }

    public ModerationCheckResult EvaluateContent(string content)
    {
        var text = (content ?? string.Empty).Trim();
        var reasons = new List<string>();
        var risk = 0;

        if (text.Length == 0)
        {
            return new ModerationCheckResult { Allowed = true, Flagged = false, RiskScore = 0 };
        }

        if (text.Length > 1500)
        {
            risk += 25;
            reasons.Add("Message is unusually long.");
        }

        var urls = Regex.Matches(text, @"https?://", RegexOptions.IgnoreCase).Count;
        if (urls >= 3)
        {
            risk += 35;
            reasons.Add("Contains many external links.");
        }

        if (Regex.IsMatch(text, @"(.)\1{6,}"))
        {
            risk += 20;
            reasons.Add("Contains repeated characters typical of spam.");
        }

        var uppercaseRatio = text.Count(char.IsUpper) / (double)Math.Max(text.Count(char.IsLetter), 1);
        if (uppercaseRatio > 0.7 && text.Count(char.IsLetter) > 12)
        {
            risk += 20;
            reasons.Add("Contains excessive uppercase text.");
        }

        var spamTerms = new[] { "free money", "click here", "guaranteed", "100% profit", "dm now", "airdrop", "crypto giveaway" };
        if (spamTerms.Any(term => text.Contains(term, StringComparison.OrdinalIgnoreCase)))
        {
            risk += 35;
            reasons.Add("Contains phrases commonly associated with spam.");
        }

        var blocked = risk >= 80;
        return new ModerationCheckResult
        {
            Allowed = !blocked,
            Flagged = risk >= 45,
            RiskScore = Math.Min(risk, 100),
            Reasons = reasons
        };
    }

    public ModerationReport SubmitReport(string reporterUserId, string reporterEmail, string targetType, string targetId, string reason, string details)
    {
        EnsureLoaded();

        lock (_lock)
        {
            var hourAgo = DateTime.UtcNow.AddHours(-1);
            var reportCount = _state.Reports.Count(r => r.ReporterUserId == reporterUserId && r.CreatedAtUtc >= hourAgo);
            if (reportCount >= 20)
            {
                throw new InvalidOperationException("Report limit reached. Please try again later.");
            }

            var report = new ModerationReport
            {
                ReporterUserId = reporterUserId,
                ReporterEmail = reporterEmail.Trim(),
                TargetType = targetType.Trim(),
                TargetId = targetId.Trim(),
                Reason = reason.Trim(),
                Details = details.Trim(),
                CreatedAtUtc = DateTime.UtcNow,
                Status = "open"
            };

            _state.Reports.Add(report);
            PersistUnsafe();
            return report;
        }
    }

    public ModerationQueueSummary GetModerationQueue(string? status, string? targetType, int page, int pageSize, bool includeResolved)
    {
        EnsureLoaded();

        var safePage = Math.Max(page, 1);
        var safePageSize = Math.Clamp(pageSize, 1, 100);
        var normalizedStatus = NormalizeStatusFilter(status, includeResolved);
        var normalizedTargetType = NormalizeTargetTypeFilter(targetType);

        lock (_lock)
        {
            var baseQuery = _state.Reports
                .OrderByDescending(r => r.CreatedAtUtc)
                .AsEnumerable();

            var filtered = ApplyTargetTypeFilter(ApplyStatusFilter(baseQuery, normalizedStatus), normalizedTargetType).ToList();
            var totalCount = filtered.Count;
            var totalPages = totalCount == 0 ? 1 : (int)Math.Ceiling(totalCount / (double)safePageSize);
            var boundedPage = Math.Min(safePage, totalPages);
            var skip = (boundedPage - 1) * safePageSize;

            return new ModerationQueueSummary
            {
                OpenReports = _state.Reports.Count(IsReportOpen),
                ResolvedReports = _state.Reports.Count(r => IsStatus(r, "resolved")),
                DismissedReports = _state.Reports.Count(r => IsStatus(r, "dismissed")),
                TotalCount = totalCount,
                Page = boundedPage,
                PageSize = safePageSize,
                TotalPages = totalPages,
                StatusFilter = normalizedStatus,
                TargetTypeFilter = normalizedTargetType,
                Reports = filtered.Skip(skip).Take(safePageSize).ToList()
            };
        }
    }

    public ModerationReport ResolveReport(string reportId, string reviewerUserId, string reviewerEmail, string outcome, string notes)
    {
        EnsureLoaded();

        var normalizedOutcome = (outcome ?? string.Empty).Trim().ToLowerInvariant();
        if (normalizedOutcome is not ("resolved" or "dismissed"))
        {
            throw new ArgumentException("Outcome must be either 'resolved' or 'dismissed'.", nameof(outcome));
        }

        lock (_lock)
        {
            var report = _state.Reports.FirstOrDefault(r => string.Equals(r.Id, reportId, StringComparison.OrdinalIgnoreCase));
            if (report is null)
            {
                throw new KeyNotFoundException("Report not found.");
            }

            report.Status = normalizedOutcome;
            report.ReviewedByUserId = reviewerUserId.Trim();
            report.ReviewedByEmail = reviewerEmail.Trim();
            report.ReviewedAtUtc = DateTime.UtcNow;
            report.ResolutionNotes = (notes ?? string.Empty).Trim();

            PersistUnsafe();
            return report;
        }
    }

    public RevenueAgentPlan GetOrCreateRevenueAgent(string userId, string email)
    {
        EnsureLoaded();

        lock (_lock)
        {
            var existing = _state.RevenueAgents.FirstOrDefault(agent => string.Equals(agent.UserId, userId, StringComparison.Ordinal));
            if (existing is not null)
            {
                return existing;
            }

            var created = BuildDefaultRevenueAgent(userId, email);
            _state.RevenueAgents.Add(created);
            PersistUnsafe();
            return created;
        }
    }

    public RevenueAgentSummary GetRevenueSummary(string userId, string email)
    {
        EnsureLoaded();

        lock (_lock)
        {
            var plan = GetOrCreateRevenueAgentUnsafe(userId, email);
            var currentWeek = ResolveCurrentWeek(plan);

            var currentWeekEvidence = plan.Evidence.Where(item => item.WeekNumber == currentWeek).ToList();
            var currentWeekVerified = currentWeekEvidence.Where(item => item.Verified).Sum(item => item.AmountUsd);
            var currentWeekUnverified = currentWeekEvidence.Where(item => !item.Verified).Sum(item => item.AmountUsd);

            var totalVerified = plan.Evidence.Where(item => item.Verified).Sum(item => item.AmountUsd);
            var totalUnverified = plan.Evidence.Where(item => !item.Verified).Sum(item => item.AmountUsd);

            var completedActions = plan.ActionItems.Count(item => IsCompletedAction(item));
            var totalActions = plan.ActionItems.Count;

            var activeMilestone = plan.Milestones.FirstOrDefault(item => item.WeekNumber == currentWeek)
                ?? plan.Milestones.OrderBy(item => item.WeekNumber).LastOrDefault();

            return new RevenueAgentSummary
            {
                UserId = userId,
                TargetWeeklyRevenue = plan.TargetWeeklyRevenue,
                DeadlineWeeks = plan.DeadlineWeeks,
                CurrentWeek = currentWeek,
                CurrentWeekVerifiedRevenue = Math.Round(currentWeekVerified, 2),
                CurrentWeekUnverifiedRevenue = Math.Round(currentWeekUnverified, 2),
                ProgressToWeeklyTargetPercent = plan.TargetWeeklyRevenue <= 0
                    ? 0
                    : Math.Round(Math.Min(100m, (currentWeekVerified / plan.TargetWeeklyRevenue) * 100m), 2),
                TotalVerifiedRevenue = Math.Round(totalVerified, 2),
                TotalUnverifiedRevenue = Math.Round(totalUnverified, 2),
                CompletedActions = completedActions,
                TotalActions = totalActions,
                ActionCompletionPercent = totalActions == 0
                    ? 0
                    : Math.Round((completedActions / (decimal)totalActions) * 100m, 2),
                OnTrackForDeadline = IsOnTrack(plan, currentWeek, currentWeekVerified),
                ActiveMilestone = activeMilestone
            };
        }
    }

    public IReadOnlyList<RevenueActionItem> GetRevenueActions(string userId, string email, int? weekNumber, string? status)
    {
        EnsureLoaded();

        lock (_lock)
        {
            var plan = GetOrCreateRevenueAgentUnsafe(userId, email);
            var normalizedStatus = (status ?? string.Empty).Trim().ToLowerInvariant();

            IEnumerable<RevenueActionItem> actions = plan.ActionItems;

            if (weekNumber.HasValue)
            {
                actions = actions.Where(item => item.WeekNumber == weekNumber.Value);
            }

            if (!string.IsNullOrWhiteSpace(normalizedStatus) && normalizedStatus != "all")
            {
                actions = actions.Where(item => string.Equals(item.Status?.Trim(), normalizedStatus, StringComparison.OrdinalIgnoreCase));
            }

            return actions.OrderBy(item => item.DueAtUtc).ToList();
        }
    }

    public RevenueActionItem UpdateRevenueActionStatus(string userId, string email, string actionId, string status)
    {
        EnsureLoaded();

        var normalizedStatus = (status ?? string.Empty).Trim().ToLowerInvariant();
        if (normalizedStatus is not ("open" or "in_progress" or "completed" or "blocked"))
        {
            throw new ArgumentException("status must be one of: open, in_progress, completed, blocked.", nameof(status));
        }

        lock (_lock)
        {
            var plan = GetOrCreateRevenueAgentUnsafe(userId, email);
            var action = plan.ActionItems.FirstOrDefault(item => string.Equals(item.Id, actionId, StringComparison.OrdinalIgnoreCase));
            if (action is null)
            {
                throw new KeyNotFoundException("Revenue action not found.");
            }

            action.Status = normalizedStatus;
            action.CompletedAtUtc = normalizedStatus == "completed" ? DateTime.UtcNow : null;

            PersistUnsafe();
            return action;
        }
    }

    public RevenueEvidenceEntry AddRevenueEvidence(
        string userId,
        string email,
        int? weekNumber,
        decimal amountUsd,
        string sourceType,
        string sourceReference,
        string notes)
    {
        EnsureLoaded();

        if (amountUsd <= 0)
        {
            throw new ArgumentException("amountUsd must be greater than 0.", nameof(amountUsd));
        }

        if (string.IsNullOrWhiteSpace(sourceType) || string.IsNullOrWhiteSpace(sourceReference))
        {
            throw new ArgumentException("sourceType and sourceReference are required.");
        }

        lock (_lock)
        {
            var plan = GetOrCreateRevenueAgentUnsafe(userId, email);
            var resolvedWeek = weekNumber ?? ResolveCurrentWeek(plan);
            if (resolvedWeek < 1 || resolvedWeek > plan.DeadlineWeeks)
            {
                throw new ArgumentException($"weekNumber must be between 1 and {plan.DeadlineWeeks}.", nameof(weekNumber));
            }

            var evidence = new RevenueEvidenceEntry
            {
                WeekNumber = resolvedWeek,
                AmountUsd = Math.Round(amountUsd, 2),
                SourceType = sourceType.Trim(),
                SourceReference = sourceReference.Trim(),
                Notes = (notes ?? string.Empty).Trim(),
                OccurredAtUtc = DateTime.UtcNow,
                Verified = false
            };

            plan.Evidence.Add(evidence);
            TrimUnsafe();
            PersistUnsafe();
            return evidence;
        }
    }

    public RevenueEvidenceEntry VerifyRevenueEvidence(
        string userId,
        string email,
        string evidenceId,
        bool verified,
        string reviewerUserId,
        string reviewerEmail)
    {
        EnsureLoaded();

        lock (_lock)
        {
            var plan = GetOrCreateRevenueAgentUnsafe(userId, email);
            var evidence = plan.Evidence.FirstOrDefault(item => string.Equals(item.Id, evidenceId, StringComparison.OrdinalIgnoreCase));
            if (evidence is null)
            {
                throw new KeyNotFoundException("Revenue evidence not found.");
            }

            evidence.Verified = verified;
            evidence.VerifiedByUserId = verified ? reviewerUserId.Trim() : string.Empty;
            evidence.VerifiedByEmail = verified ? reviewerEmail.Trim() : string.Empty;
            evidence.VerifiedAtUtc = verified ? DateTime.UtcNow : null;

            PersistUnsafe();
            return evidence;
        }
    }

    public IReadOnlyList<RevenueEvidenceEntry> GetRevenueEvidence(string userId, string email, int? weekNumber, bool? verified)
    {
        EnsureLoaded();

        lock (_lock)
        {
            var plan = GetOrCreateRevenueAgentUnsafe(userId, email);
            IEnumerable<RevenueEvidenceEntry> evidence = plan.Evidence;

            if (weekNumber.HasValue)
            {
                evidence = evidence.Where(item => item.WeekNumber == weekNumber.Value);
            }

            if (verified.HasValue)
            {
                evidence = evidence.Where(item => item.Verified == verified.Value);
            }

            return evidence.OrderByDescending(item => item.OccurredAtUtc).ToList();
        }
    }

    public IReadOnlyList<AdminPolicyShiftRecord> GetAdminPolicyHistory()
    {
        EnsureLoaded();

        lock (_lock)
        {
            return _state.PolicyHistory
                .OrderByDescending(item => item.EffectiveFromUtc)
                .ThenByDescending(item => item.CreatedAtUtc)
                .ToList();
        }
    }

    public AdminPolicyShiftRecord RecordAdminPolicyShift(string userId, string email, AdminPolicyShiftRequest request)
    {
        EnsureLoaded();

        lock (_lock)
        {
            var record = new AdminPolicyShiftRecord
            {
                PolicyKey = request.PolicyKey.Trim(),
                Title = request.Title.Trim(),
                Summary = request.Summary.Trim(),
                Status = string.IsNullOrWhiteSpace(request.Status) ? "draft" : request.Status.Trim(),
                Notes = request.Notes.Trim(),
                ChangedByUserId = userId.Trim(),
                ChangedByEmail = email.Trim(),
                EffectiveFromUtc = DateTime.UtcNow,
                CreatedAtUtc = DateTime.UtcNow
            };

            _state.PolicyHistory.Add(record);
            TrimUnsafe();
            PersistUnsafe();
            return record;
        }
    }

    private void EnsureLoaded()
    {
        if (_loaded)
        {
            return;
        }

        lock (_lock)
        {
            if (_loaded)
            {
                return;
            }

            var path = GetStateFilePath();
            if (File.Exists(path))
            {
                try
                {
                    var json = File.ReadAllText(path);
                    _state = JsonSerializer.Deserialize<GrowthState>(json) ?? new GrowthState();
                }
                catch
                {
                    _state = new GrowthState();
                }
            }

            EnsureStateCollectionsUnsafe();

            _loaded = true;
        }
    }

    private void EnsureStateCollectionsUnsafe()
    {
        _state ??= new GrowthState();
        _state.Events ??= [];
        _state.Invites ??= [];
        _state.Reports ??= [];
        _state.RevenueAgents ??= [];
        _state.PolicyHistory ??= [];
    }

    private void PersistUnsafe()
    {
        try
        {
            var json = JsonSerializer.Serialize(_state, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(GetStateFilePath(), json);
        }
        catch (Exception ex)
        {
            // Growth analytics should never block auth or core product flows.
            _logger.LogWarning(ex, "Growth state persistence failed; continuing without durable growth analytics write.");
        }
    }

    private string GetStateFilePath()
    {
        if (!string.IsNullOrWhiteSpace(_stateFilePath))
        {
            return _stateFilePath;
        }

        var candidateDirs = new[]
        {
            Path.Combine(_environment.ContentRootPath, "App_Data"),
            Path.Combine(AppContext.BaseDirectory, "App_Data"),
            Path.Combine(Path.GetTempPath(), "Wiseravenshare", "App_Data")
        };

        foreach (var dir in candidateDirs)
        {
            try
            {
                Directory.CreateDirectory(dir);
                _stateFilePath = Path.Combine(dir, "growth.json");
                return _stateFilePath;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Unable to prepare growth state directory: {Directory}", dir);
            }
        }

        // Final fallback: process temp path without pre-creating directory.
        _stateFilePath = Path.Combine(Path.GetTempPath(), "growth.json");
        return _stateFilePath;
    }

    private static string BuildInviteCode(string userId)
    {
        var seed = userId.Length <= 6 ? userId : userId[^6..];
        var random = Convert.ToHexString(Guid.NewGuid().ToByteArray()).ToLowerInvariant()[..6];
        return $"WR-{seed.ToUpperInvariant()}-{random.ToUpperInvariant()}";
    }

    private void TrimUnsafe()
    {
        if (_state.Events.Count > 15000)
        {
            _state.Events = _state.Events
                .OrderByDescending(e => e.CreatedAtUtc)
                .Take(10000)
                .OrderBy(e => e.CreatedAtUtc)
                .ToList();
        }

        if (_state.Reports.Count > 5000)
        {
            _state.Reports = _state.Reports
                .OrderByDescending(r => r.CreatedAtUtc)
                .Take(3000)
                .OrderBy(r => r.CreatedAtUtc)
                .ToList();
        }

        foreach (var agent in _state.RevenueAgents)
        {
            if (agent.Evidence.Count > 5000)
            {
                agent.Evidence = agent.Evidence
                    .OrderByDescending(item => item.OccurredAtUtc)
                    .Take(2500)
                    .OrderBy(item => item.OccurredAtUtc)
                    .ToList();
            }
        }

        if (_state.PolicyHistory.Count > 1000)
        {
            _state.PolicyHistory = _state.PolicyHistory
                .OrderByDescending(item => item.EffectiveFromUtc)
                .Take(750)
                .OrderBy(item => item.EffectiveFromUtc)
                .ToList();
        }
    }

    private RevenueAgentPlan GetOrCreateRevenueAgentUnsafe(string userId, string email)
    {
        var existing = _state.RevenueAgents.FirstOrDefault(agent => string.Equals(agent.UserId, userId, StringComparison.Ordinal));
        if (existing is not null)
        {
            return existing;
        }

        var created = BuildDefaultRevenueAgent(userId, email);
        _state.RevenueAgents.Add(created);
        return created;
    }

    private static RevenueAgentPlan BuildDefaultRevenueAgent(string userId, string email)
    {
        var startAt = DateTime.UtcNow.Date;

        var milestones = new List<RevenueMilestone>
        {
            new() { WeekNumber = 1, TargetRevenue = 1000m, MinLeads = 20, MinOffers = 5, MinConversions = 1 },
            new() { WeekNumber = 2, TargetRevenue = 2000m, MinLeads = 30, MinOffers = 8, MinConversions = 2 },
            new() { WeekNumber = 3, TargetRevenue = 3000m, MinLeads = 40, MinOffers = 10, MinConversions = 3 },
            new() { WeekNumber = 4, TargetRevenue = 4500m, MinLeads = 55, MinOffers = 14, MinConversions = 4 },
            new() { WeekNumber = 5, TargetRevenue = 6000m, MinLeads = 70, MinOffers = 18, MinConversions = 5 },
            new() { WeekNumber = 6, TargetRevenue = 7500m, MinLeads = 85, MinOffers = 22, MinConversions = 6 },
            new() { WeekNumber = 7, TargetRevenue = 9000m, MinLeads = 100, MinOffers = 26, MinConversions = 7 },
            new() { WeekNumber = 8, TargetRevenue = 10000m, MinLeads = 120, MinOffers = 30, MinConversions = 8 }
        };

        var functions = new List<RevenueExecutionFunction>
        {
            new() { Code = "offer_design", Name = "Offer Design", Description = "Create and price productized offers.", VerificationMetric = "Offers published per week" },
            new() { Code = "lead_generation", Name = "Lead Generation", Description = "Generate qualified leads from outbound, inbound, and referrals.", VerificationMetric = "Qualified leads logged" },
            new() { Code = "sales_execution", Name = "Sales Execution", Description = "Run discovery, demos, and closing workflow.", VerificationMetric = "Deals closed and conversion rate" },
            new() { Code = "delivery_system", Name = "Delivery System", Description = "Deliver value fast with repeatable fulfillment.", VerificationMetric = "Delivery cycle time and CSAT" },
            new() { Code = "retention_expansion", Name = "Retention and Expansion", Description = "Upsell, renew, and expand account value.", VerificationMetric = "Expansion revenue and renewals" },
            new() { Code = "financial_verification", Name = "Financial Verification", Description = "Record and verify revenue with source evidence.", VerificationMetric = "Verified revenue entries" }
        };

        var actions = BuildDefaultActions(startAt);

        return new RevenueAgentPlan
        {
            UserId = userId,
            Email = email.Trim(),
            CreatedAtUtc = DateTime.UtcNow,
            CycleStartAtUtc = startAt,
            TargetWeeklyRevenue = 10000m,
            DeadlineWeeks = 8,
            Milestones = milestones,
            Functions = functions,
            ActionItems = actions,
            Evidence = []
        };
    }

    private static List<RevenueActionItem> BuildDefaultActions(DateTime cycleStartAtUtc)
    {
        var actions = new List<RevenueActionItem>();

        for (var week = 1; week <= 8; week++)
        {
            var weekStart = cycleStartAtUtc.AddDays((week - 1) * 7);
            actions.Add(new RevenueActionItem
            {
                WeekNumber = week,
                FunctionCode = "offer_design",
                Title = $"Week {week}: Publish offer update",
                Description = "Publish one priced offer revision with positioning and guarantee.",
                DueAtUtc = weekStart.AddDays(1)
            });
            actions.Add(new RevenueActionItem
            {
                WeekNumber = week,
                FunctionCode = "lead_generation",
                Title = $"Week {week}: Execute lead sprint",
                Description = "Run daily lead generation sprint and log qualified prospects.",
                DueAtUtc = weekStart.AddDays(3)
            });
            actions.Add(new RevenueActionItem
            {
                WeekNumber = week,
                FunctionCode = "sales_execution",
                Title = $"Week {week}: Run closing pipeline",
                Description = "Move prospects through discovery, proposal, and close stages.",
                DueAtUtc = weekStart.AddDays(5)
            });
            actions.Add(new RevenueActionItem
            {
                WeekNumber = week,
                FunctionCode = "financial_verification",
                Title = $"Week {week}: Submit revenue proof",
                Description = "Submit source references for all revenue captured this week.",
                DueAtUtc = weekStart.AddDays(6)
            });
        }

        return actions;
    }

    private static int ResolveCurrentWeek(RevenueAgentPlan plan)
    {
        var elapsedDays = (DateTime.UtcNow.Date - plan.CycleStartAtUtc.Date).Days;
        var computedWeek = (elapsedDays / 7) + 1;
        return Math.Clamp(computedWeek, 1, plan.DeadlineWeeks);
    }

    private static bool IsCompletedAction(RevenueActionItem item)
    {
        return string.Equals(item.Status?.Trim(), "completed", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsOnTrack(RevenueAgentPlan plan, int currentWeek, decimal currentWeekVerifiedRevenue)
    {
        var activeMilestone = plan.Milestones.FirstOrDefault(item => item.WeekNumber == currentWeek);
        if (activeMilestone is null)
        {
            return currentWeekVerifiedRevenue >= plan.TargetWeeklyRevenue;
        }

        return currentWeekVerifiedRevenue >= activeMilestone.TargetRevenue;
    }

    private static bool IsReportOpen(ModerationReport report)
    {
        var status = report.Status?.Trim();
        return !string.Equals(status, "resolved", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(status, "dismissed", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsStatus(ModerationReport report, string status)
    {
        return string.Equals(report.Status?.Trim(), status, StringComparison.OrdinalIgnoreCase);
    }

    private static string NormalizeStatusFilter(string? status, bool includeResolved)
    {
        var normalized = (status ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized is "open" or "resolved" or "dismissed" or "all")
        {
            return normalized;
        }

        return includeResolved ? "all" : "open";
    }

    private static IEnumerable<ModerationReport> ApplyStatusFilter(IEnumerable<ModerationReport> reports, string status)
    {
        return status switch
        {
            "resolved" => reports.Where(r => IsStatus(r, "resolved")),
            "dismissed" => reports.Where(r => IsStatus(r, "dismissed")),
            "all" => reports,
            _ => reports.Where(IsReportOpen)
        };
    }

    private static string NormalizeTargetTypeFilter(string? targetType)
    {
        var normalized = (targetType ?? string.Empty).Trim().ToLowerInvariant();
        return string.IsNullOrWhiteSpace(normalized) ? "all" : normalized;
    }

    private static IEnumerable<ModerationReport> ApplyTargetTypeFilter(IEnumerable<ModerationReport> reports, string targetType)
    {
        if (string.Equals(targetType, "all", StringComparison.OrdinalIgnoreCase))
        {
            return reports;
        }

        return reports.Where(r => string.Equals(r.TargetType?.Trim(), targetType, StringComparison.OrdinalIgnoreCase));
    }

    private sealed class GrowthState
    {
        public List<FunnelEvent> Events { get; set; } = [];
        public List<InviteRecord> Invites { get; set; } = [];
        public List<ModerationReport> Reports { get; set; } = [];
        public List<RevenueAgentPlan> RevenueAgents { get; set; } = [];
        public List<AdminPolicyShiftRecord> PolicyHistory { get; set; } = [];
    }
}
