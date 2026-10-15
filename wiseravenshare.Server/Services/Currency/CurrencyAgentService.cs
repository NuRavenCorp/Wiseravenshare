// Wiseravenshare.Server/Services/Currency/CurrencyAgentService.cs
using System.Text.Json;
using Microsoft.Extensions.Hosting;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Entities.Currency;
using Wiseravenshare.Server.Interfaces.Repositories;

namespace Wiseravenshare.Server.Services.Currency;

public class WorkHourSubmission
{
    public decimal Hours { get; set; }
    public string Category { get; set; } = "General";
    public string Description { get; set; } = string.Empty;
    public string? ProofReference { get; set; }
    public string? Source { get; set; }
}


public class WorkHourSubmissionResult
{
    public bool Success { get; set; }
    public string? Error { get; set; }
    public Guid? SubmissionId { get; set; }
    public string? Message { get; set; }
    public bool RequiresVerification { get; set; }
}

public class VerificationResult
{
    public bool Success { get; set; }
    public bool Approved { get; set; }
    public string? Error { get; set; }
    public string? Message { get; set; }
    public decimal HoursVerified { get; set; }
    public decimal WSCAwarded { get; set; }
}

public class Anomaly
{
    public string Type { get; set; } = string.Empty;
    public string Severity { get; set; } = "Low";
    public string Description { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}

public class AnomalyReport
{
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public List<Anomaly> Anomalies { get; set; } = new();
    public bool HasAnomalies => Anomalies.Count > 0;
    public int AnomalyCount => Anomalies.Count;
}

public class DashboardSummary
{
    public decimal Balance { get; set; }
    public decimal LockedBalance { get; set; }
    public decimal EffectiveBalance { get; set; }
    public decimal WorkHoursContributed { get; set; }
    public decimal VerifiedWorkHours { get; set; }
    public int PendingVerifications { get; set; }
    public decimal CurrentValueUSD { get; set; }
    public decimal TotalEarned { get; set; }
    public decimal TotalStaked { get; set; }
    public decimal PendingStakingRewards { get; set; }
    public decimal EarnedThisMonth { get; set; }
    public decimal CurrentWSCPerHour { get; set; }
    public decimal TotalMultiplier { get; set; }
    public int BadgeCount { get; set; }
}

public class CurrencyHealthReport
{
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public decimal TotalWSCInCirculation { get; set; }
    public decimal TotalStaked { get; set; }
    public decimal TotalWorkHoursLogged { get; set; }
    public int ActiveUsers { get; set; }
    public decimal AverageWSCPerUser { get; set; }
    public decimal MarketCapUSD { get; set; }
    public decimal InflationRate { get; set; }
    public decimal BurnRate { get; set; }
    public decimal CurrentWSCPerHour { get; set; }
    public int TransactionCount24h { get; set; }
    public int AnomalyCount { get; set; }
    public decimal HealthScore { get; set; }
}


public interface ICurrencyAgentService
{
    Task<WorkHourSubmissionResult> SubmitWorkHoursAsync(Guid userId, WorkHourSubmission submission);
    Task<VerificationResult> VerifyWorkHoursAsync(Guid submissionId, Guid verifierId, bool approved, string? notes = null);
    Task<CurrencyHealthReport> GetCurrencyHealthAsync();
    Task<AnomalyReport> DetectAnomaliesAsync();
    Task<DashboardSummary> GetUserCurrencySummaryAsync(Guid userId);
    Task<string> ProcessConversationalCommandAsync(Guid userId, string command);
}

/// <summary>
/// Currency Agent: work-hour submission/verification gateway (WSC is only minted
/// after human verification), scheduled valuation snapshots, anomaly detection,
/// health reporting and a conversational command interface.
/// Runs as an IHostedService for background scheduling.
/// </summary>
public class CurrencyAgentService : ICurrencyAgentService, IHostedService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<CurrencyAgentService> _logger;
    private Timer? _valuationTimer;
    private Timer? _anomalyTimer;

    private const int MIN_HOURS_PER_SUBMISSION = 1;
    private const int MAX_HOURS_PER_SUBMISSION = 24;
    private const decimal MIN_VERIFIER_TRUTH_SCORE = 70m;

    public CurrencyAgentService(IServiceScopeFactory scopeFactory, ILogger<CurrencyAgentService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Currency Agent starting...");
        _valuationTimer = new Timer(async _ => await SafeRunAsync(TakeValuationSnapshotAsync),
            null, TimeSpan.FromMinutes(5), TimeSpan.FromHours(6));
        _anomalyTimer = new Timer(async _ => await SafeRunAsync(RunAnomalyDetectionAsync),
            null, TimeSpan.FromMinutes(10), TimeSpan.FromMinutes(15));
        _logger.LogInformation("Currency Agent started");
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        _valuationTimer?.Dispose();
        _anomalyTimer?.Dispose();
        return Task.CompletedTask;
    }

    private async Task SafeRunAsync(Func<Task> action)
    {
        try { await action(); }
        catch (Exception ex) { _logger.LogError(ex, "Currency Agent background job failed"); }
    }

    private async Task TakeValuationSnapshotAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var wiseCoin = scope.ServiceProvider.GetRequiredService<IWiseCoinService>();
        await wiseCoin.GetCurrentValuationAsync();
        _logger.LogInformation("Valuation snapshot completed");
    }

    private async Task RunAnomalyDetectionAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var agent = scope.ServiceProvider.GetRequiredService<ICurrencyAgentService>();
        var report = await agent.DetectAnomaliesAsync();
        if (report.HasAnomalies)
            _logger.LogWarning("Currency anomalies detected: {Count}", report.AnomalyCount);
    }

    // === Work hour submission & verification ===

    public async Task<WorkHourSubmissionResult> SubmitWorkHoursAsync(Guid userId, WorkHourSubmission submission)
    {
        if (submission.Hours < MIN_HOURS_PER_SUBMISSION || submission.Hours > MAX_HOURS_PER_SUBMISSION)
            return new WorkHourSubmissionResult { Success = false, Error = $"Hours must be between {MIN_HOURS_PER_SUBMISSION} and {MAX_HOURS_PER_SUBMISSION}" };
        if (string.IsNullOrWhiteSpace(submission.Description))
            return new WorkHourSubmissionResult { Success = false, Error = "Description is required" };

        using var scope = _scopeFactory.CreateScope();
        var workHourRepo = scope.ServiceProvider.GetRequiredService<IRepository<WorkHourContribution>>();
        var userRepo = scope.ServiceProvider.GetRequiredService<IUserRepository>();

        if (await userRepo.GetByIdAsync(userId) == null)
            return new WorkHourSubmissionResult { Success = false, Error = "User not found" };

        var contribution = new WorkHourContribution
        {
            UserId = userId,
            Hours = submission.Hours,
            Category = submission.Category ?? "General",
            Description = submission.Description.Trim(),
            ProofReference = submission.ProofReference,
            Metadata = JsonDocument.Parse(JsonSerializer.Serialize(new
            {
                submittedAt = DateTime.UtcNow,
                source = submission.Source ?? "Manual"
            }))
        };

        await workHourRepo.AddAsync(contribution);
        _logger.LogInformation("Work hours submitted: {Id} ({Hours}h) by {User}", contribution.Id, submission.Hours, userId);

        return new WorkHourSubmissionResult
        {
            Success = true,
            SubmissionId = contribution.Id,
            Message = "Work hours submitted. Awaiting verification.",
            RequiresVerification = true
        };
    }

    public async Task<VerificationResult> VerifyWorkHoursAsync(Guid submissionId, Guid verifierId, bool approved, string? notes = null)
    {
        using var scope = _scopeFactory.CreateScope();
        var workHourRepo = scope.ServiceProvider.GetRequiredService<IRepository<WorkHourContribution>>();
        var userRepo = scope.ServiceProvider.GetRequiredService<IUserRepository>();
        var wiseCoin = scope.ServiceProvider.GetRequiredService<IWiseCoinService>();
        var walletRepo = scope.ServiceProvider.GetRequiredService<IRepository<WiseCoin>>();

        var submission = await workHourRepo.GetByIdAsync(submissionId);
        if (submission == null)
            return new VerificationResult { Success = false, Error = "Submission not found" };
        if (submission.IsVerified)
            return new VerificationResult { Success = false, Error = "Submission already verified" };

        var verifier = await userRepo.GetByIdAsync(verifierId);
        if (verifier == null)
            return new VerificationResult { Success = false, Error = "Verifier not found" };
        if (verifier.TruthScore < MIN_VERIFIER_TRUTH_SCORE)
            return new VerificationResult { Success = false, Error = $"Verifier truth score must be above {MIN_VERIFIER_TRUTH_SCORE}" };

        submission.IsVerified = true;
        submission.IsApproved = approved;
        submission.VerifiedBy = verifierId;
        await workHourRepo.UpdateAsync(submission);

        if (!approved)
            return new VerificationResult { Success = true, Approved = false, Message = $"Work hours rejected. Reason: {notes ?? "No reason provided"}" };

        // Mint WSC only after human verification, backed by real work hours
        var valuation = await wiseCoin.GetCurrentValuationAsync();
        var wallet = await wiseCoin.GetOrCreateWalletAsync(submission.UserId);
        var wscAmount = decimal.Round(submission.Hours * valuation.WSCPerHour * wallet.TotalMultiplier, 2);

        var earnResult = await wiseCoin.EarnWSCAsync(submission.UserId, wscAmount, TransactionType.Mining,
            $"Verified work hours: {submission.Hours}h - {submission.Description}", applyMultipliers: false);

        wallet.WorkHoursContributed += submission.Hours;
        submission.WSCGenerated = wscAmount;
        submission.WSCRate = valuation.WSCPerHour;
        await walletRepo.UpdateAsync(wallet);
        await workHourRepo.UpdateAsync(submission);

        _logger.LogInformation("Verified {Hours}h for {User}: awarded {WSC} WSC", submission.Hours, submission.UserId, wscAmount);
        return new VerificationResult
        {
            Success = true, Approved = true,
            Message = $"Work hours verified. {submission.Hours}h credited, {wscAmount:F2} WSC awarded.",
            HoursVerified = submission.Hours, WSCAwarded = wscAmount
        };
    }

    // === Anomaly detection ===

    public async Task<AnomalyReport> DetectAnomaliesAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var transactionRepo = scope.ServiceProvider.GetRequiredService<IRepository<CoinTransaction>>();
        var anomalies = new List<Anomaly>();
        var lastDay = DateTime.UtcNow.AddDays(-1);

        var rapid = await transactionRepo.FindAsync(t =>
            t.Type == TransactionType.Mining && t.CreatedAt >= DateTime.UtcNow.AddHours(-1) && t.Amount > 100);
        if (rapid.Any())
            anomalies.Add(new Anomaly { Type = "RapidEarnings", Severity = "Medium", Description = $"{rapid.Count()} mining transactions over 100 WSC in the last hour" });

        var transfers = await transactionRepo.FindAsync(t =>
            t.Type == TransactionType.Transfer && t.CreatedAt >= lastDay && t.TargetUserId != null);
        foreach (var group in transfers.GroupBy(t => new { t.UserId, t.TargetUserId }).Where(g => g.Count() > 5))
            anomalies.Add(new Anomaly { Type = "SuspiciousTransferLoop", Severity = "High", Description = $"Suspicious transfer loop between {group.Key.UserId} and {group.Key.TargetUserId}" });

        var large = await transactionRepo.FindAsync(t =>
            t.Type == TransactionType.Transfer && t.Amount > 1000 && t.CreatedAt >= lastDay);
        if (large.Any())
            anomalies.Add(new Anomaly { Type = "LargeTransfer", Severity = "Medium", Description = $"{large.Count()} transfers over 1000 WSC in the last 24h" });

        return new AnomalyReport { Anomalies = anomalies };
    }

    // === Dashboard summary ===

    public async Task<DashboardSummary> GetUserCurrencySummaryAsync(Guid userId)
    {
        using var scope = _scopeFactory.CreateScope();
        var wiseCoin = scope.ServiceProvider.GetRequiredService<IWiseCoinService>();
        var walletRepo = scope.ServiceProvider.GetRequiredService<IRepository<WiseCoin>>();
        var transactionRepo = scope.ServiceProvider.GetRequiredService<IRepository<CoinTransaction>>();
        var stakeRepo = scope.ServiceProvider.GetRequiredService<IRepository<CoinStake>>();
        var workHourRepo = scope.ServiceProvider.GetRequiredService<IRepository<WorkHourContribution>>();
        var badgeRepo = scope.ServiceProvider.GetRequiredService<IRepository<UserBadge>>();

        var wallet = await wiseCoin.GetOrCreateWalletAsync(userId);
        var valuation = await wiseCoin.GetCurrentValuationAsync();
        var transactions = await transactionRepo.FindAsync(t => t.UserId == userId && t.Status == TransactionStatus.Completed);
        var staking = await stakeRepo.FindAsync(s => s.UserId == userId && s.IsActive);
        var verifiedHours = await workHourRepo.FindAsync(w => w.UserId == userId && w.IsVerified && w.IsApproved);
        var pendingVerifications = await workHourRepo.FindAsync(w => w.UserId == userId && !w.IsVerified);
        var badgeCount = await badgeRepo.CountAsync(b => b.UserId == userId && b.IsActive);

        return new DashboardSummary
        {
            Balance = wallet.Balance,
            LockedBalance = wallet.LockedBalance,
            EffectiveBalance = wallet.GetEffectiveBalance(),
            WorkHoursContributed = wallet.WorkHoursContributed,
            VerifiedWorkHours = verifiedHours.Sum(w => w.Hours),
            PendingVerifications = pendingVerifications.Count(),
            CurrentValueUSD = decimal.Round(wallet.Balance * valuation.WSCPerHour / 100m, 2),
            TotalEarned = wallet.TotalEarned,
            TotalStaked = staking.Sum(s => s.Amount),
            PendingStakingRewards = decimal.Round(staking.Sum(s => s.Amount * (s.StakingRewardRate / 365m) * (decimal)(DateTime.UtcNow - s.StartDate).TotalDays), 2),
            EarnedThisMonth = transactions.Where(t => t.CreatedAt >= DateTime.UtcNow.AddDays(-30)
                && t.Type is TransactionType.Mining or TransactionType.ContentCreation or TransactionType.Verification or TransactionType.CreativityWork)
                .Sum(t => t.Amount),
            CurrentWSCPerHour = valuation.WSCPerHour,
            TotalMultiplier = wallet.TotalMultiplier,
            BadgeCount = badgeCount
        };
    }

    // === Health ===

    public async Task<CurrencyHealthReport> GetCurrencyHealthAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var walletRepo = scope.ServiceProvider.GetRequiredService<IRepository<WiseCoin>>();
        var transactionRepo = scope.ServiceProvider.GetRequiredService<IRepository<CoinTransaction>>();
        var stakeRepo = scope.ServiceProvider.GetRequiredService<IRepository<CoinStake>>();
        var wiseCoin = scope.ServiceProvider.GetRequiredService<IWiseCoinService>();

        var allWallets = await walletRepo.GetAllAsync();
        var allStakes = await stakeRepo.FindAsync(s => s.IsActive);
        var valuation = await wiseCoin.GetCurrentValuationAsync();
        var anomalies = await DetectAnomaliesAsync();

        var totalWSC = allWallets.Sum(w => w.Balance + w.LockedBalance);
        var totalWorkHours = allWallets.Sum(w => w.WorkHoursContributed);
        var activeUsers = allWallets.Count(w => w.Balance > 0);

        var healthScore = 0m;
        var ratio = totalWorkHours > 0 ? totalWSC / totalWorkHours : 1;
        if (ratio >= 0.8m && ratio <= 1.2m) healthScore += 50m;
        else if (ratio >= 0.5m && ratio <= 1.5m) healthScore += 25m;
        if (valuation.InflationRate < 0.02m) healthScore += 25m;
        else if (valuation.InflationRate < 0.05m) healthScore += 12m;
        if (!anomalies.HasAnomalies) healthScore += 25m;

        return new CurrencyHealthReport
        {
            TotalWSCInCirculation = totalWSC,
            TotalStaked = allStakes.Sum(s => s.Amount),
            TotalWorkHoursLogged = totalWorkHours,
            ActiveUsers = activeUsers,
            AverageWSCPerUser = activeUsers > 0 ? totalWSC / activeUsers : 0,
            MarketCapUSD = decimal.Round(totalWSC * valuation.WSCPerHour / 100m, 2),
            InflationRate = valuation.InflationRate,
            BurnRate = valuation.BurnRate,
            CurrentWSCPerHour = valuation.WSCPerHour,
            TransactionCount24h = (await transactionRepo.FindAsync(t => t.CreatedAt >= DateTime.UtcNow.AddHours(-24))).Count(),
            AnomalyCount = anomalies.AnomalyCount,
            HealthScore = Math.Min(healthScore, 100m)
        };
    }

    // === Conversational interface ===

    public async Task<string> ProcessConversationalCommandAsync(Guid userId, string command)
    {
        var parts = command.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 0) return GetHelpText();
        var cmd = parts[0].ToLowerInvariant();

        try
        {
            switch (cmd)
            {
                case "balance" or "bal":
                    return await HandleBalanceAsync(userId);
                case "stake":
                    return await HandleStakeAsync(userId, parts);
                case "unstake":
                    return await HandleUnstakeAsync(userId);
                case "stats" or "dashboard":
                    return await HandleStatsAsync(userId);
                case "work" or "hours":
                    return await HandleWorkHoursAsync(userId, parts);
                case "help":
                    return GetHelpText();
                default:
                    return "I didn't understand that. Commands: balance, stake [amount] [days], unstake, work [hours] [category] [description], stats, help";
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing currency command: {Command}", command);
            return "I encountered an error processing your request. Please try again later.";
        }
    }

    private async Task<string> HandleBalanceAsync(Guid userId)
    {
        using var scope = _scopeFactory.CreateScope();
        var wiseCoin = scope.ServiceProvider.GetRequiredService<IWiseCoinService>();
        var wallet = await wiseCoin.GetOrCreateWalletAsync(userId);
        var valuation = await wiseCoin.GetCurrentValuationAsync();

        return $"\U0001F4CA Balance: {wallet.Balance:F2} WSC | Staked: {wallet.LockedBalance:F2} WSC | " +
               $"USD \u2248 ${wallet.Balance * valuation.WSCPerHour / 100m:F2} | " +
               $"Rate: {valuation.WSCPerHour:F2} WSC/h | Multiplier: {wallet.TotalMultiplier:F2}x | " +
               $"Work hours: {wallet.WorkHoursContributed:F1}h";
    }

    private async Task<string> HandleStakeAsync(Guid userId, string[] parts)
    {
        if (parts.Length < 3 || !decimal.TryParse(parts[1], out var amount) || !int.TryParse(parts[2], out var days))
            return "Usage: stake [amount] [days] — e.g. stake 100 30";

        using var scope = _scopeFactory.CreateScope();
        var wiseCoin = scope.ServiceProvider.GetRequiredService<IWiseCoinService>();
        var result = await wiseCoin.StakeWSCAsync(userId, amount, days, StakingType.Flexible);
        return result.Success
            ? $"Staked {amount:F2} WSC for {days} days at {result.AnnualRate:P1} APY. New balance: {result.NewBalance:F2} WSC"
            : $"Failed to stake: {result.ErrorMessage}";
    }

    private async Task<string> HandleUnstakeAsync(Guid userId)
    {
        using var scope = _scopeFactory.CreateScope();
        var wiseCoin = scope.ServiceProvider.GetRequiredService<IWiseCoinService>();
        var stakeRepo = scope.ServiceProvider.GetRequiredService<IRepository<CoinStake>>();
        var stakes = await stakeRepo.FindAsync(s => s.UserId == userId && s.IsActive);
        if (!stakes.Any()) return "You have no active stakes.";

        var results = new List<string>();
        foreach (var stake in stakes)
        {
            var result = await wiseCoin.UnstakeWSCAsync(userId, stake.Id);
            results.Add(result.Success
                ? $"Unstaked {result.Amount:F2} WSC (reward {result.Reward:F2}, penalty {result.Penalty:F2}). New balance: {result.NewBalance:F2}"
                : $"Failed: {result.ErrorMessage}");
        }
        return string.Join("\n", results);
    }

    private async Task<string> HandleStatsAsync(Guid userId)
    {
        var s = await GetUserCurrencySummaryAsync(userId);
        return $"Balance: {s.Balance:F2} WSC | Staked: {s.TotalStaked:F2} | Verified hours: {s.VerifiedWorkHours:F1}h | " +
               $"Pending verifications: {s.PendingVerifications} | Earned this month: {s.EarnedThisMonth:F2} WSC | " +
               $"Badges: {s.BadgeCount} | Multiplier: {s.TotalMultiplier:F2}x";
    }

    private async Task<string> HandleWorkHoursAsync(Guid userId, string[] parts)
    {
        if (parts.Length < 4 || !decimal.TryParse(parts[1], out var hours))
            return "Usage: work [hours] [category] [description] — e.g. work 3 coding fixed the truth engine bug";

        var submission = new WorkHourSubmission
        {
            Hours = hours,
            Category = parts[2],
            Description = string.Join(' ', parts.Skip(3)),
            Source = "Conversational"
        };
        var result = await SubmitWorkHoursAsync(userId, submission);
        return result.Success
            ? $"Submitted {hours:F1}h of '{submission.Category}' work for verification (ID: {result.SubmissionId})."
            : $"Failed: {result.Error}";
    }

    private static string GetHelpText() =>
        "Currency Agent commands: balance | stake [amount] [days] | unstake | " +
        "work [hours] [category] [description] | stats | help";
}
