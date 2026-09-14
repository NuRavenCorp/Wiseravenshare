// Wiseravenshare.Server/Services/Currency/WiseCoinRolloutService.cs
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Entities.Currency;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Interfaces.Repositories;

namespace Wiseravenshare.Server.Services.Currency;

public interface IWiseCoinRolloutService
{
    /// <summary>Performs the initial allocation for a user (one-time, 100 WSC).</summary>
    Task<bool> AllocateInitialWSCAsync(Guid userId);
    
    /// <summary>Batch allocate to all users who haven't received initial allocation.</summary>
    Task<RolloutResult> AllocateAllAsync(decimal amountPerUser = 100m);
    
    /// <summary>Get rollout status (how many users allocated, total distributed).</summary>
    Task<RolloutStatus> GetRolloutStatusAsync();
    
    /// <summary>Calculate engagement multiplier for a post (0.5x to 2.0x).</summary>
    Task<decimal> CalculatePostEngagementMultiplierAsync(Guid userId, Guid postId);
    
    /// <summary>Scale reward based on user reputation and engagement metrics.</summary>
    Task<decimal> CalculateScaledRewardAsync(Guid userId, decimal baseReward, TransactionType type);
}

public class WiseCoinRolloutService : IWiseCoinRolloutService
{
    private readonly AppDbContext _db;
    private readonly IWiseCoinService _wiseCoinService;
    private readonly IRepository<User> _userRepository;
    private readonly IRepository<WiseCoin> _walletRepository;
    private readonly IRepository<Post> _postRepository;
    private readonly ILogger<WiseCoinRolloutService> _logger;

    private const decimal INITIAL_ALLOCATION_AMOUNT = 100m;

    public WiseCoinRolloutService(
        AppDbContext db,
        IWiseCoinService wiseCoinService,
        IRepository<User> userRepository,
        IRepository<WiseCoin> walletRepository,
        IRepository<Post> postRepository,
        ILogger<WiseCoinRolloutService> logger)
    {
        _db = db;
        _wiseCoinService = wiseCoinService;
        _userRepository = userRepository;
        _walletRepository = walletRepository;
        _postRepository = postRepository;
        _logger = logger;
    }

    public async Task<bool> AllocateInitialWSCAsync(Guid userId)
    {
        var wallet = await _wiseCoinService.GetOrCreateWalletAsync(userId);
        
        if (wallet.HasReceivedInitialAllocation)
        {
            _logger.LogWarning("User {UserId} already received initial allocation", userId);
            return false;
        }

        // Award the initial allocation
        var result = await _wiseCoinService.EarnWSCAsync(
            userId,
            INITIAL_ALLOCATION_AMOUNT,
            TransactionType.CommunityBonus,
            "WiseCoin rollout initial allocation",
            applyMultipliers: false);

        if (!result.Success)
        {
            _logger.LogError("Failed to allocate initial WSC to user {UserId}: {Error}", userId, result.ErrorMessage);
            return false;
        }

        // Mark wallet as having received allocation
        wallet.HasReceivedInitialAllocation = true;
        wallet.InitialAllocationDate = DateTime.UtcNow;
        wallet.InitialAllocationAmount = INITIAL_ALLOCATION_AMOUNT;

        await _walletRepository.UpdateAsync(wallet);
        _logger.LogInformation("Allocated {Amount} WSC to user {UserId}", INITIAL_ALLOCATION_AMOUNT, userId);

        return true;
    }

    public async Task<RolloutResult> AllocateAllAsync(decimal amountPerUser = 100m)
    {
        var result = new RolloutResult();
        var usersNeedingAllocation = await _db.Users
            .Join(_db.WiseCoins, u => u.Id, w => w.UserId, (u, w) => new { u, w })
            .Where(uw => !uw.w.HasReceivedInitialAllocation)
            .Select(uw => uw.u.Id)
            .ToListAsync();

        result.TotalUsersEligible = usersNeedingAllocation.Count;

        foreach (var userId in usersNeedingAllocation)
        {
            try
            {
                var success = await AllocateInitialWSCAsync(userId);
                if (success)
                {
                    result.SuccessfulAllocations++;
                    result.TotalDistributed += amountPerUser;
                }
                else
                {
                    result.FailedAllocations++;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Exception allocating to user {UserId}", userId);
                result.FailedAllocations++;
            }
        }

        return result;
    }

    public async Task<RolloutStatus> GetRolloutStatusAsync()
    {
        var allocatedWallets = await _db.WiseCoins
            .Where(w => w.HasReceivedInitialAllocation)
            .ToListAsync();

        var totalUsers = await _db.Users.CountAsync();
        var allocatedUsers = allocatedWallets.Count;
        var totalDistributed = allocatedWallets.Sum(w => w.InitialAllocationAmount);
        var remainingUsers = totalUsers - allocatedUsers;

        return new RolloutStatus
        {
            TotalUsers = totalUsers,
            AllocatedUsers = allocatedUsers,
            RemainingUsers = remainingUsers,
            AllocationPercentage = totalUsers > 0 ? (decimal)allocatedUsers / totalUsers * 100 : 0,
            TotalDistributedWSC = totalDistributed,
            AveragePerUser = allocatedUsers > 0 ? totalDistributed / allocatedUsers : 0
        };
    }

    /// <summary>
    /// Calculate post engagement multiplier based on interactions.
    /// 0.5x minimum, 2.0x maximum.
    /// Formula: base 1.0x + (likes * 0.1) + (comments * 0.15) + (shares * 0.25), capped at 2.0x
    /// </summary>
    public async Task<decimal> CalculatePostEngagementMultiplierAsync(Guid userId, Guid postId)
    {
        var post = await _postRepository.FindAsync(p => p.Id == postId);
        if (!post.Any())
            return 1.0m;

        var p = post.First();
        var multiplier = 1.0m;

        // Engagement metrics based on Post entity properties
        if (p.UserId == userId)
        {
            multiplier += (decimal)p.LikesCount * 0.1m;
            multiplier += (decimal)p.CommentsCount * 0.15m;
            multiplier += (decimal)p.SharesCount * 0.25m;
        }

        // Cap at 2.0x
        return Math.Min(multiplier, 2.0m);
    }

    /// <summary>
    /// Calculate scaled reward based on user reputation and engagement.
    /// Factors:
    /// - User badge multiplier
    /// - Engagement metrics for ContentCreation posts
    /// - Account age bonus (older accounts get small bonus)
    /// </summary>
    public async Task<decimal> CalculateScaledRewardAsync(Guid userId, decimal baseReward, TransactionType type)
    {
        var wallet = await _wiseCoinService.GetOrCreateWalletAsync(userId);
        var user = await _userRepository.FindAsync(u => u.Id == userId);

        if (!user.Any())
            return baseReward;

        var u = user.First();
        var scaledReward = baseReward * wallet.TotalMultiplier;

        // Account age bonus: +5% per year (max 15%)
        var accountAgeMonths = (decimal)(DateTime.UtcNow - u.CreatedAt).TotalDays / 30;
        var ageBonus = Math.Min(accountAgeMonths / 12 * 0.05m, 0.15m);
        scaledReward *= (1 + ageBonus);

        // Engagement type bonuses
        scaledReward *= type switch
        {
            TransactionType.ContentCreation => 1.0m,   // baseline
            TransactionType.Verification => 1.5m,       // more valuable
            TransactionType.BadgeReward => 1.2m,        // badge-backed
            TransactionType.SkillValidation => 2.0m,    // high-value skill work
            TransactionType.CommunityBonus => 0.5m,     // already reduced for community
            _ => 1.0m
        };

        return decimal.Round(scaledReward, 2);
    }
}

public class RolloutResult
{
    public int TotalUsersEligible { get; set; }
    public int SuccessfulAllocations { get; set; }
    public int FailedAllocations { get; set; }
    public decimal TotalDistributed { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}

public class RolloutStatus
{
    public int TotalUsers { get; set; }
    public int AllocatedUsers { get; set; }
    public int RemainingUsers { get; set; }
    public decimal AllocationPercentage { get; set; }
    public decimal TotalDistributedWSC { get; set; }
    public decimal AveragePerUser { get; set; }
}
