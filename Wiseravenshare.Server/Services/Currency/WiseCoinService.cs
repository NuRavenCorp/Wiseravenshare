// Wiseravenshare.Server/Services/Currency/WiseCoinService.cs
using Microsoft.Extensions.Caching.Memory;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Entities.Currency;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Interfaces.Repositories;

namespace Wiseravenshare.Server.Services.Currency;

public interface IWiseCoinService
{
    Task<WiseCoin> GetOrCreateWalletAsync(Guid userId);
    Task<decimal> GetBalanceAsync(Guid userId);
    Task<TransactionResult> EarnWSCAsync(Guid userId, decimal amount, TransactionType type, string? description = null, bool applyMultipliers = true);
    Task<TransactionResult> SpendWSCAsync(Guid userId, decimal amount, TransactionType type, string? description = null);
    Task<TransactionResult> TransferWSCAsync(Guid fromUserId, Guid toUserId, decimal amount, string? message = null);
    Task<TransactionResult> StakeWSCAsync(Guid userId, decimal amount, int durationDays, StakingType type);
    Task<TransactionResult> UnstakeWSCAsync(Guid userId, Guid stakeId);
    Task<decimal> GetWorkHourValueAsync(Guid userId);
    Task<WorkHourValuation> GetCurrentValuationAsync();
    Task<IEnumerable<CoinTransaction>> GetTransactionHistoryAsync(Guid userId, int page, int pageSize);
    Task<bool> BurnWSCAsync(Guid? userId, decimal amount, string? reason = null);
    Task UpdateBadgeMultipliersAsync(Guid userId);
}

public class TransactionResult
{
    public bool Success { get; set; }
    public string? ErrorMessage { get; set; }
    public Guid? TransactionId { get; set; }
    public decimal Amount { get; set; }
    public decimal Fee { get; set; }
    public decimal NewBalance { get; set; }
    public decimal Reward { get; set; }
    public decimal Penalty { get; set; }
    public Guid? StakeId { get; set; }
    public decimal AnnualRate { get; set; }
}

public class WiseCoinService : IWiseCoinService
{
    private readonly IRepository<WiseCoin> _walletRepository;
    private readonly IRepository<CoinTransaction> _transactionRepository;
    private readonly IRepository<CoinStake> _stakeRepository;
    private readonly IRepository<WorkHourValuation> _valuationRepository;
    private readonly IBadgeService _badgeService;
    private readonly IMemoryCache _cache;
    private readonly ILogger<WiseCoinService> _logger;

    private const decimal INITIAL_WSC_PER_HOUR = 10m;
    private const decimal MINIMUM_WAGE_REFERENCE = 15.00m;
    private const decimal MAX_INFLATION_RATE = 0.05m;
    private const decimal STAKING_BASE_RATE = 0.08m;
    private const decimal TRANSACTION_FEE = 0.005m;

    public WiseCoinService(
        IRepository<WiseCoin> walletRepository,
        IRepository<CoinTransaction> transactionRepository,
        IRepository<CoinStake> stakeRepository,
        IRepository<WorkHourValuation> valuationRepository,
        IBadgeService badgeService,
        IMemoryCache cache,
        ILogger<WiseCoinService> logger)
    {
        _walletRepository = walletRepository;
        _transactionRepository = transactionRepository;
        _stakeRepository = stakeRepository;
        _valuationRepository = valuationRepository;
        _badgeService = badgeService;
        _cache = cache;
        _logger = logger;
    }

    public async Task<WiseCoin> GetOrCreateWalletAsync(Guid userId)
    {
        var wallet = (await _walletRepository.FindAsync(w => w.UserId == userId)).FirstOrDefault();
        if (wallet == null)
        {
            wallet = new WiseCoin { UserId = userId };
            await _walletRepository.AddAsync(wallet);
            await _badgeService.AwardWelcomeBadgesAsync(userId);
            await UpdateBadgeMultipliersAsync(userId);
            wallet = (await _walletRepository.FindAsync(w => w.UserId == userId)).First();
            _logger.LogInformation("Created WSC wallet for user {UserId}", userId);
        }
        return wallet;
    }

    public async Task<decimal> GetBalanceAsync(Guid userId)
    {
        var wallet = await GetOrCreateWalletAsync(userId);
        return wallet.GetEffectiveBalance();
    }

    public async Task<TransactionResult> EarnWSCAsync(Guid userId, decimal amount, TransactionType type, string? description = null, bool applyMultipliers = true)
    {
        if (amount <= 0) return new TransactionResult { Success = false, ErrorMessage = "Amount must be positive" };

        var wallet = await GetOrCreateWalletAsync(userId);
        var rewardAmount = applyMultipliers ? await CalculateRewardAsync(userId, amount, type) : amount;

        var transaction = new CoinTransaction
        {
            UserId = userId,
            Type = type,
            Amount = rewardAmount,
            Fee = 0,
            NetAmount = rewardAmount,
            Description = description,
            Status = TransactionStatus.Completed,
            CompletedAt = DateTime.UtcNow,
            WorkHoursValue = wallet.CurrentValuePerHour > 0 ? rewardAmount / wallet.CurrentValuePerHour : 0,
            WorkHourRate = wallet.CurrentValuePerHour
        };

        wallet.Balance += rewardAmount;
        wallet.TotalEarned += rewardAmount;

        await _transactionRepository.AddAsync(transaction);
        await _walletRepository.UpdateAsync(wallet);

        // Badge-first: check milestone badges after every earn
        await _badgeService.CheckAndAwardMilestoneBadgesAsync(userId);

        _cache.Remove($"wallet_balance_{userId}");
        return new TransactionResult { Success = true, TransactionId = transaction.Id, Amount = rewardAmount, NewBalance = wallet.Balance };
    }

    public async Task<TransactionResult> SpendWSCAsync(Guid userId, decimal amount, TransactionType type, string? description = null)
    {
        if (amount <= 0) return new TransactionResult { Success = false, ErrorMessage = "Amount must be positive" };

        var wallet = await GetOrCreateWalletAsync(userId);
        if (wallet.Balance < amount)
            return new TransactionResult { Success = false, ErrorMessage = "Insufficient balance" };

        var fee = Math.Round(amount * TRANSACTION_FEE, 2);
        var transaction = new CoinTransaction
        {
            UserId = userId,
            Type = type,
            Amount = amount,
            Fee = fee,
            NetAmount = amount - fee,
            Description = description,
            Status = TransactionStatus.Completed,
            CompletedAt = DateTime.UtcNow,
            WorkHoursValue = wallet.CurrentValuePerHour > 0 ? amount / wallet.CurrentValuePerHour : 0,
            WorkHourRate = wallet.CurrentValuePerHour
        };

        wallet.Balance -= amount;
        wallet.TotalSpent += amount;

        await _transactionRepository.AddAsync(transaction);
        await _walletRepository.UpdateAsync(wallet);

        // Deflationary burn of the fee
        if (fee > 0)
            await BurnWSCAsync(null, fee, "Transaction fee burn");

        _cache.Remove($"wallet_balance_{userId}");
        return new TransactionResult { Success = true, TransactionId = transaction.Id, Amount = amount, Fee = fee, NewBalance = wallet.Balance };
    }

    public async Task<TransactionResult> TransferWSCAsync(Guid fromUserId, Guid toUserId, decimal amount, string? message = null)
    {
        if (fromUserId == toUserId)
            return new TransactionResult { Success = false, ErrorMessage = "Cannot transfer to yourself" };
        if (amount <= 0)
            return new TransactionResult { Success = false, ErrorMessage = "Amount must be positive" };

        var fromWallet = await GetOrCreateWalletAsync(fromUserId);
        var toWallet = await GetOrCreateWalletAsync(toUserId);

        if (fromWallet.Balance < amount)
            return new TransactionResult { Success = false, ErrorMessage = "Insufficient balance" };

        var fee = Math.Round(amount * TRANSACTION_FEE, 2);
        var netAmount = amount - fee;

        fromWallet.Balance -= amount;
        toWallet.Balance += netAmount;

        await _transactionRepository.AddRangeAsync(new[]
        {
            new CoinTransaction
            {
                UserId = fromUserId, TargetUserId = toUserId, Type = TransactionType.Transfer,
                Amount = amount, Fee = fee, NetAmount = netAmount,
                Description = message ?? "Transfer", Status = TransactionStatus.Completed,
                CompletedAt = DateTime.UtcNow, WorkHourRate = fromWallet.CurrentValuePerHour
            },
            new CoinTransaction
            {
                UserId = toUserId, TargetUserId = fromUserId, Type = TransactionType.Transfer,
                Amount = netAmount, Fee = 0, NetAmount = netAmount,
                Description = $"Received transfer", Status = TransactionStatus.Completed,
                CompletedAt = DateTime.UtcNow, WorkHourRate = toWallet.CurrentValuePerHour
            }
        });
        await _walletRepository.UpdateAsync(fromWallet);
        await _walletRepository.UpdateAsync(toWallet);

        _cache.Remove($"wallet_balance_{fromUserId}");
        _cache.Remove($"wallet_balance_{toUserId}");
        return new TransactionResult { Success = true, Amount = amount, Fee = fee, NewBalance = fromWallet.Balance };
    }

    public async Task<TransactionResult> StakeWSCAsync(Guid userId, decimal amount, int durationDays, StakingType type)
    {
        if (amount <= 0) return new TransactionResult { Success = false, ErrorMessage = "Amount must be positive" };
        if (durationDays < 7 || durationDays > 365)
            return new TransactionResult { Success = false, ErrorMessage = "Duration must be between 7 and 365 days" };

        var wallet = await GetOrCreateWalletAsync(userId);
        if (wallet.Balance < amount)
            return new TransactionResult { Success = false, ErrorMessage = "Insufficient balance" };

        var rewardMultiplier = type switch
        {
            StakingType.Flexible => 1.0m,
            StakingType.Locked => 1.5m,
            StakingType.WorkBacked => 2.0m,
            _ => 1.0m
        };

        var annualRate = STAKING_BASE_RATE * rewardMultiplier + await _badgeService.GetStakingBonusAsync(userId);

        var stake = new CoinStake
        {
            UserId = userId,
            Amount = amount,
            WorkHourValue = wallet.CurrentValuePerHour > 0 ? amount / wallet.CurrentValuePerHour : 0,
            DurationDays = durationDays,
            StartDate = DateTime.UtcNow,
            EndDate = DateTime.UtcNow.AddDays(durationDays),
            StakingRewardRate = annualRate,
            IsActive = true,
            Type = type
        };

        wallet.Balance -= amount;
        wallet.LockedBalance += amount;

        await _stakeRepository.AddAsync(stake);
        await _walletRepository.UpdateAsync(wallet);
        _cache.Remove($"wallet_balance_{userId}");

        return new TransactionResult { Success = true, Amount = amount, NewBalance = wallet.Balance, StakeId = stake.Id, AnnualRate = annualRate };
    }

    public async Task<TransactionResult> UnstakeWSCAsync(Guid userId, Guid stakeId)
    {
        var stake = (await _stakeRepository.FindAsync(s => s.Id == stakeId && s.UserId == userId && s.IsActive)).FirstOrDefault();
        if (stake == null)
            return new TransactionResult { Success = false, ErrorMessage = "Active stake not found" };

        var wallet = await GetOrCreateWalletAsync(userId);

        var daysStaked = (decimal)(DateTime.UtcNow - stake.StartDate).TotalDays;
        var reward = Math.Round(stake.Amount * (stake.StakingRewardRate / 365m) * daysStaked, 2);

        var penalty = 0m;
        if (stake.Type == StakingType.Locked && daysStaked < stake.DurationDays)
            penalty = Math.Round(reward * 0.3m, 2);

        var netReward = reward - penalty;

        stake.IsActive = false;
        stake.EndDate = DateTime.UtcNow;
        stake.CurrentReward = netReward;

        wallet.LockedBalance -= stake.Amount;
        wallet.Balance += stake.Amount + netReward;

        await _stakeRepository.UpdateAsync(stake);
        await _walletRepository.UpdateAsync(wallet);
        _cache.Remove($"wallet_balance_{userId}");

        return new TransactionResult { Success = true, Amount = stake.Amount, Reward = netReward, Penalty = penalty, NewBalance = wallet.Balance };
    }

    public async Task<decimal> GetWorkHourValueAsync(Guid userId)
    {
        var wallet = await GetOrCreateWalletAsync(userId);
        var valuation = await GetCurrentValuationAsync();
        var multiplier = wallet.TotalMultiplier * (1 + await _badgeService.GetSkillBonusAsync(userId));
        return valuation.WSCPerHour * multiplier;
    }

    public async Task<WorkHourValuation> GetCurrentValuationAsync()
    {
        if (_cache.TryGetValue("current_valuation", out WorkHourValuation? cached) && cached != null)
            return cached;

        var latest = (await _valuationRepository.FindAsync(
            v => !v.IsDeleted))
            .OrderByDescending(v => v.Date)
            .FirstOrDefault();

        if (latest != null && latest.Date >= DateTime.UtcNow.AddHours(-24))
        {
            _cache.Set("current_valuation", latest, TimeSpan.FromHours(6));
            return latest;
        }

        var allWallets = await _walletRepository.GetAllAsync();
        var totalWSC = allWallets.Sum(w => w.Balance + w.LockedBalance);
        var totalWorkHours = allWallets.Sum(w => w.WorkHoursContributed);
        var activeUsers = allWallets.Count(w => w.Balance > 0 || w.LockedBalance > 0);

        var valuation = new WorkHourValuation
        {
            Date = DateTime.UtcNow,
            WSCPerHour = CalculateCurrentRate(totalWSC, totalWorkHours),
            TotalWorkHours = totalWorkHours,
            TotalWSCInCirculation = totalWSC,
            ActiveUsers = activeUsers,
            AverageWSCPerUser = activeUsers > 0 ? totalWSC / activeUsers : 0,
            InflationRate = MAX_INFLATION_RATE / 10,
            BurnRate = 0.01m,
            MinimumWageReference = MINIMUM_WAGE_REFERENCE,
            FreelancerRateReference = MINIMUM_WAGE_REFERENCE * 1.5m,
            ExpertRateReference = MINIMUM_WAGE_REFERENCE * 2.5m
        };

        await _valuationRepository.AddAsync(valuation);
        _cache.Set("current_valuation", valuation, TimeSpan.FromHours(6));
        return valuation;
    }

    private static decimal CalculateCurrentRate(decimal totalWSC, decimal totalWorkHours)
    {
        if (totalWorkHours == 0) return INITIAL_WSC_PER_HOUR;
        var supplyDemandRatio = totalWSC / totalWorkHours;
        var baseRate = INITIAL_WSC_PER_HOUR * (1 / (supplyDemandRatio + 1));
        return decimal.Round(Math.Max(baseRate, 1m), 2);
    }

    public async Task<IEnumerable<CoinTransaction>> GetTransactionHistoryAsync(Guid userId, int page, int pageSize)
    {
        return await _transactionRepository.GetPagedAsync(page, pageSize,
            predicate: t => t.UserId == userId && !t.IsDeleted,
            orderBy: q => q.OrderByDescending(t => t.CreatedAt));
    }

    public async Task<decimal> CalculateRewardWithMultipliersAsync(Guid userId, decimal baseAmount, TransactionType type)
    {
        return await CalculateRewardAsync(userId, baseAmount, type);
    }

    private async Task<decimal> CalculateRewardAsync(Guid userId, decimal baseAmount, TransactionType type)
    {
        var wallet = await GetOrCreateWalletAsync(userId);
        var multiplier = wallet.TotalMultiplier;
        multiplier += await _badgeService.GetEarningBonusAsync(userId, type);
        multiplier *= (1 + await _badgeService.GetSkillBonusAsync(userId));
        multiplier *= (1 + await _badgeService.GetReputationBonusAsync(userId));
        return baseAmount * multiplier;
    }

    public async Task<bool> BurnWSCAsync(Guid? userId, decimal amount, string? reason = null)
    {
        if (amount <= 0) return false;

        var transaction = new CoinTransaction
        {
            UserId = userId ?? Guid.Empty,
            Type = TransactionType.Burn,
            Amount = amount,
            Fee = 0,
            NetAmount = 0,
            Description = $"Burned {amount} WSC: {reason ?? "No reason"}",
            Status = TransactionStatus.Completed,
            CompletedAt = DateTime.UtcNow
        };

        if (userId.HasValue && userId.Value != Guid.Empty)
        {
            var wallet = await GetOrCreateWalletAsync(userId.Value);
            if (wallet.Balance < amount) return false;
            wallet.Balance -= amount;
            wallet.TotalSpent += amount;
            await _walletRepository.UpdateAsync(wallet);
            _cache.Remove($"wallet_balance_{userId}");
        }

        await _transactionRepository.AddAsync(transaction);
        _logger.LogInformation("Burned {Amount} WSC: {Reason}", amount, reason);
        return true;
    }

    /// <summary>
    /// Recomputes the wallet's badge/skill/reputation multipliers from active badges.
    /// Called after badges are awarded or evolved — badges first, currency second.
    /// </summary>
    public async Task UpdateBadgeMultipliersAsync(Guid userId)
    {
        var wallet = await GetOrCreateWalletAsync(userId);
        var badges = await _badgeService.GetUserBadgesAsync(userId);

        decimal badgeMul = 1m, skillMul = 1m, repMul = 1m;
        foreach (var userBadge in badges)
        {
            var badge = userBadge.Badge;
            if (badge == null) continue;
            switch (badge.Type)
            {
                case BadgeType.Skill:
                    skillMul += (badge.ValueMultiplier - 1m) * 0.25m;
                    break;
                case BadgeType.Reputation:
                    repMul += (badge.ValueMultiplier - 1m) * 0.25m;
                    break;
                default:
                    badgeMul += (badge.ValueMultiplier - 1m) * 0.25m;
                    break;
            }
        }

        wallet.BadgeMultiplier = decimal.Round(badgeMul, 4);
        wallet.SkillMultiplier = decimal.Round(skillMul, 4);
        wallet.ReputationMultiplier = decimal.Round(repMul, 4);
        await _walletRepository.UpdateAsync(wallet);
        _cache.Remove($"wallet_balance_{userId}");
    }
}
