// Wiseravenshare.Server/Services/Currency/BadgeService.cs
using Microsoft.Extensions.Caching.Memory;
using System.Text.Json;
using Wiseravenshare.Server.Entities.Currency;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Interfaces.Repositories;

namespace Wiseravenshare.Server.Services.Currency;

public interface IBadgeService
{
    Task<Badge> CreateBadgeAsync(Badge badge);
    Task<UserBadge> AwardBadgeAsync(Guid userId, Guid badgeId);
    Task<Badge> EvolveBadgeAsync(Guid userId, Guid sourceBadgeId, Guid targetBadgeId);
    Task<IEnumerable<Badge>> GetAvailableBadgesAsync(Guid userId);
    Task<IEnumerable<UserBadge>> GetUserBadgesAsync(Guid userId);
    Task<Badge?> GetBadgeAsync(Guid badgeId);
    Task<bool> CheckBadgeRequirementsAsync(Guid userId, Guid badgeId);
    Task<decimal> GetEarningBonusAsync(Guid userId, TransactionType type);
    Task<decimal> GetSkillBonusAsync(Guid userId);
    Task<decimal> GetReputationBonusAsync(Guid userId);
    Task<decimal> GetStakingBonusAsync(Guid userId);
    Task CheckAndAwardMilestoneBadgesAsync(Guid userId);
    Task AwardWelcomeBadgesAsync(Guid userId);
    Task SeedDefaultBadgesAsync();
}

public class BadgeService : IBadgeService
{
    private readonly IRepository<Badge> _badgeRepository;
    private readonly IRepository<UserBadge> _userBadgeRepository;
    private readonly IRepository<BadgeEvolution> _evolutionRepository;
    private readonly IWiseCoinService _wiseCoinService;
    private readonly IMemoryCache _cache;
    private readonly ILogger<BadgeService> _logger;

    public BadgeService(
        IRepository<Badge> badgeRepository,
        IRepository<UserBadge> userBadgeRepository,
        IRepository<BadgeEvolution> evolutionRepository,
        IWiseCoinService wiseCoinService,
        IMemoryCache cache,
        ILogger<BadgeService> logger)
    {
        _badgeRepository = badgeRepository;
        _userBadgeRepository = userBadgeRepository;
        _evolutionRepository = evolutionRepository;
        _wiseCoinService = wiseCoinService;
        _cache = cache;
        _logger = logger;
    }

    public async Task<Badge> CreateBadgeAsync(Badge badge)
    {
        badge.TotalSupply = (int)badge.Rarity; // enum values encode supply caps
        await _badgeRepository.AddAsync(badge);
        _cache.Remove("all_badges");
        _logger.LogInformation("Created badge {Name} ({Rarity})", badge.Name, badge.Rarity);
        return badge;
    }

    public async Task<UserBadge> AwardBadgeAsync(Guid userId, Guid badgeId)
    {
        var badge = await _badgeRepository.GetByIdAsync(badgeId)
            ?? throw new InvalidOperationException("Badge not found");

        if (await _userBadgeRepository.ExistsAsync(ub => ub.UserId == userId && ub.BadgeId == badgeId))
            throw new InvalidOperationException("User already has this badge");

        if (!await CheckBadgeRequirementsAsync(userId, badgeId))
            throw new InvalidOperationException("User does not meet badge requirements");

        var currentSupply = await _userBadgeRepository.CountAsync(ub => ub.BadgeId == badgeId);
        if (currentSupply >= badge.TotalSupply)
            throw new InvalidOperationException("Badge supply exhausted");

        if (badge.MintingCost > 0)
        {
            var result = await _wiseCoinService.SpendWSCAsync(userId, badge.MintingCost,
                TransactionType.BadgeUpgrade, $"Minting badge: {badge.Name}");
            if (!result.Success)
                throw new InvalidOperationException("Insufficient WSC to mint badge");
        }

        var userBadge = new UserBadge
        {
            UserId = userId,
            BadgeId = badgeId,
            EarnedAt = DateTime.UtcNow,
            IsActive = true,
            MultiplierBonus = badge.ValueMultiplier
        };

        await _userBadgeRepository.AddAsync(userBadge);
        badge.CurrentSupply++;
        await _badgeRepository.UpdateAsync(badge);

        // Badges first, currency second: refresh multipliers on the wallet
        await _wiseCoinService.UpdateBadgeMultipliersAsync(userId);

        _cache.Remove($"user_badges_{userId}");
        _logger.LogInformation("Awarded badge {Badge} to user {User}", badge.Name, userId);
        return userBadge;
    }

    public async Task<Badge> EvolveBadgeAsync(Guid userId, Guid sourceBadgeId, Guid targetBadgeId)
    {
        var sourceBadge = await _badgeRepository.GetByIdAsync(sourceBadgeId)
            ?? throw new InvalidOperationException("Source badge not found");
        var targetBadge = await _badgeRepository.GetByIdAsync(targetBadgeId)
            ?? throw new InvalidOperationException("Target badge not found");

        var userBadge = (await _userBadgeRepository.FindAsync(
            ub => ub.UserId == userId && ub.BadgeId == sourceBadgeId && ub.IsActive)).FirstOrDefault()
            ?? throw new InvalidOperationException("User does not have the source badge");

        var evolution = (await _evolutionRepository.FindAsync(
            e => e.SourceBadgeId == sourceBadgeId && e.TargetBadgeId == targetBadgeId)).FirstOrDefault()
            ?? throw new InvalidOperationException("Invalid evolution path");

        if (evolution.WSCRequired > 0)
        {
            var result = await _wiseCoinService.SpendWSCAsync(userId, evolution.WSCRequired,
                TransactionType.BadgeUpgrade, $"Badge evolution: {sourceBadge.Name} -> {targetBadge.Name}");
            if (!result.Success)
                throw new InvalidOperationException("Insufficient WSC for badge evolution");
        }

        userBadge.BadgeId = targetBadgeId;
        userBadge.MultiplierBonus = targetBadge.ValueMultiplier;
        await _userBadgeRepository.UpdateAsync(userBadge);

        await _wiseCoinService.UpdateBadgeMultipliersAsync(userId);
        _cache.Remove($"user_badges_{userId}");

        _logger.LogInformation("Evolved badge {Src} to {Tgt} for user {User}", sourceBadge.Name, targetBadge.Name, userId);
        return targetBadge;
    }

    public async Task<IEnumerable<Badge>> GetAvailableBadgesAsync(Guid userId)
    {
        var allBadges = await _badgeRepository.FindAsync(b => !b.IsDeleted);
        var userBadgeIds = (await GetUserBadgesAsync(userId)).Select(ub => ub.BadgeId).ToHashSet();
        return allBadges.Where(b => !userBadgeIds.Contains(b.Id));
    }

    public async Task<IEnumerable<UserBadge>> GetUserBadgesAsync(Guid userId)
    {
        if (_cache.TryGetValue($"user_badges_{userId}", out IEnumerable<UserBadge>? cached) && cached != null)
            return cached;
        var badges = await _userBadgeRepository.FindAsync(ub => ub.UserId == userId && ub.IsActive && !ub.IsDeleted);
        _cache.Set($"user_badges_{userId}", badges, TimeSpan.FromMinutes(30));
        return badges;
    }

    public async Task<Badge?> GetBadgeAsync(Guid badgeId) => await _badgeRepository.GetByIdAsync(badgeId);

    public async Task<bool> CheckBadgeRequirementsAsync(Guid userId, Guid badgeId)
    {
        var badge = await _badgeRepository.GetByIdAsync(badgeId);
        if (badge == null) return false;

        if (badge.MinimumWorkHours > 0)
        {
            var wallet = await _wiseCoinService.GetOrCreateWalletAsync(userId);
            if (wallet.WorkHoursContributed < badge.MinimumWorkHours)
                return false;
        }

        if (badge.Requirements != null)
        {
            BadgeRequirements? requirements;
            try
            {
                requirements = JsonSerializer.Deserialize<BadgeRequirements>(badge.Requirements.RootElement.GetRawText());
            }
            catch (JsonException) { return false; }

            if (requirements?.PrerequisiteBadges is { Count: > 0 })
            {
                var userBadgeIds = (await GetUserBadgesAsync(userId)).Select(ub => ub.BadgeId).ToHashSet();
                if (!requirements.PrerequisiteBadges.All(id => userBadgeIds.Contains(id)))
                    return false;
            }
        }

        return true;
    }

    public async Task<decimal> GetEarningBonusAsync(Guid userId, TransactionType type)
    {
        var bonus = 0m;
        foreach (var userBadge in await GetUserBadgesAsync(userId))
        {
            var badge = userBadge.Badge;
            if (badge == null) continue;

            if (badge.Type == BadgeType.Achievement && type is TransactionType.ContentCreation or TransactionType.CreativityWork)
                bonus += badge.ValueMultiplier * 0.1m;
            else if (badge.Type == BadgeType.Skill && type is TransactionType.Verification or TransactionType.SkillValidation)
                bonus += badge.ValueMultiplier * 0.15m;
            else if (badge.Type == BadgeType.Reputation)
                bonus += badge.ValueMultiplier * 0.05m;
        }
        return Math.Min(bonus, 2.0m);
    }

    public async Task<decimal> GetSkillBonusAsync(Guid userId)
    {
        var bonus = 0m;
        foreach (var userBadge in await GetUserBadgesAsync(userId))
            if (userBadge.Badge?.Type == BadgeType.Skill)
                bonus += userBadge.Badge.ValueMultiplier * 0.05m;
        return Math.Min(bonus, 1.5m);
    }

    public async Task<decimal> GetReputationBonusAsync(Guid userId)
    {
        var bonus = 0m;
        foreach (var userBadge in await GetUserBadgesAsync(userId))
            if (userBadge.Badge?.Type == BadgeType.Reputation)
                bonus += userBadge.Badge.ValueMultiplier * 0.1m;
        return Math.Min(bonus, 2.0m);
    }

    public async Task<decimal> GetStakingBonusAsync(Guid userId)
    {
        var bonus = 0m;
        foreach (var userBadge in await GetUserBadgesAsync(userId))
            if (userBadge.Badge?.Type == BadgeType.Contributor)
                bonus += userBadge.Badge.ValueMultiplier * 0.01m;
        return Math.Min(bonus, 0.05m);
    }

    public async Task CheckAndAwardMilestoneBadgesAsync(Guid userId)
    {
        var badges = await _badgeRepository.FindAsync(b => !b.IsDeleted && b.Type == BadgeType.Achievement);
        foreach (var badge in badges)
        {
            if (await _userBadgeRepository.ExistsAsync(ub => ub.UserId == userId && ub.BadgeId == badge.Id))
                continue;
            if (await CheckBadgeRequirementsAsync(userId, badge.Id))
                await AwardBadgeAsync(userId, badge.Id);
        }
    }

    public async Task AwardWelcomeBadgesAsync(Guid userId)
    {
        var welcome = await _badgeRepository.FindAsync(b => !b.IsDeleted && b.MintingCost == 0 && b.MinimumWorkHours == 0);
        foreach (var badge in welcome)
        {
            if (await _userBadgeRepository.ExistsAsync(ub => ub.UserId == userId && ub.BadgeId == badge.Id))
                continue;
            await _userBadgeRepository.AddAsync(new UserBadge
            {
                UserId = userId, BadgeId = badge.Id, EarnedAt = DateTime.UtcNow,
                IsActive = true, MultiplierBonus = badge.ValueMultiplier
            });
            badge.CurrentSupply++;
            await _badgeRepository.UpdateAsync(badge);
        }
        await _wiseCoinService.UpdateBadgeMultipliersAsync(userId);
        _cache.Remove($"user_badges_{userId}");
    }

    /// <summary>Idempotently seeds the default badge catalog (welcome, skill, reputation, contributor, rare).</summary>
    public async Task SeedDefaultBadgesAsync()
    {
        if (await _badgeRepository.CountAsync(b => !b.IsDeleted) > 0) return;

        var seeds = new List<Badge>
        {
            new() { Name = "First Steps", Description = "Joined the Wiseravenshare community", IconUrl = "/badges/first-steps.png", Type = BadgeType.Achievement, Rarity = BadgeRarity.Common, Category = BadgeCategory.CommunityBuilding, ValueMultiplier = 1.0m, TotalSupply = 10000 },
            new() { Name = "First Post", Description = "Created your first post", IconUrl = "/badges/first-post.png", Type = BadgeType.Achievement, Rarity = BadgeRarity.Common, Category = BadgeCategory.ContentCreation, ValueMultiplier = 1.1m, TotalSupply = 10000 },
            new() { Name = "Truth Seeker", Description = "Verified your first claim", IconUrl = "/badges/truth-seeker.png", Type = BadgeType.Achievement, Rarity = BadgeRarity.Uncommon, Category = BadgeCategory.TruthVerification, ValueMultiplier = 1.1m, TrustMultiplier = 1.2m, MinimumWorkHours = 5, MintingCost = 10, TotalSupply = 5000 },
            new() { Name = "Content Creator", Description = "Created valuable creative content", IconUrl = "/badges/content-creator.png", Type = BadgeType.Skill, Rarity = BadgeRarity.Uncommon, Category = BadgeCategory.ContentCreation, ValueMultiplier = 1.2m, WorkMultiplier = 1.1m, MinimumWorkHours = 10, MintingCost = 25, TotalSupply = 5000 },
            new() { Name = "Truth Guardian", Description = "Verified 100 claims", IconUrl = "/badges/truth-guardian.png", Type = BadgeType.Skill, Rarity = BadgeRarity.Rare, Category = BadgeCategory.TruthVerification, ValueMultiplier = 1.3m, TrustMultiplier = 1.3m, MinimumWorkHours = 50, MintingCost = 50, TotalSupply = 1000 },
            new() { Name = "Trusted Voice", Description = "Consistently accurate", IconUrl = "/badges/trusted-voice.png", Type = BadgeType.Reputation, Rarity = BadgeRarity.Uncommon, Category = BadgeCategory.TruthVerification, ValueMultiplier = 1.0m, TrustMultiplier = 1.2m, MinimumWorkHours = 20, MintingCost = 30, TotalSupply = 5000 },
            new() { Name = "Community Leader", Description = "Led community initiatives", IconUrl = "/badges/community-leader.png", Type = BadgeType.Reputation, Rarity = BadgeRarity.Epic, Category = BadgeCategory.Leadership, ValueMultiplier = 1.0m, TrustMultiplier = 1.3m, MinimumWorkHours = 100, MintingCost = 75, TotalSupply = 100 },
            new() { Name = "Dedicated Contributor", Description = "Contributed 50 hours of work", IconUrl = "/badges/dedicated-contributor.png", Type = BadgeType.Contributor, Rarity = BadgeRarity.Uncommon, Category = BadgeCategory.CommunityBuilding, ValueMultiplier = 1.0m, WorkMultiplier = 1.1m, StakingMultiplier = 1.1m, MinimumWorkHours = 50, MintingCost = 20, TotalSupply = 5000 },
            new() { Name = "Truth Master", Description = "Master of truth verification", IconUrl = "/badges/truth-master.png", Type = BadgeType.Rare, Rarity = BadgeRarity.Epic, Category = BadgeCategory.TruthVerification, ValueMultiplier = 1.5m, WorkMultiplier = 1.2m, TrustMultiplier = 1.5m, StakingMultiplier = 1.2m, MinimumWorkHours = 200, MintingCost = 200, TotalSupply = 100 },
            new() { Name = "Wise One", Description = "Community legend", IconUrl = "/badges/wise-one.png", Type = BadgeType.Rare, Rarity = BadgeRarity.Legendary, Category = BadgeCategory.Leadership, ValueMultiplier = 2.0m, WorkMultiplier = 1.5m, TrustMultiplier = 2.0m, StakingMultiplier = 1.5m, MinimumWorkHours = 500, MintingCost = 500, TotalSupply = 10 }
        };

        foreach (var badge in seeds)
            await _badgeRepository.AddAsync(badge);

        // Evolution path: First Steps -> Dedicated Contributor
        var first = seeds.First(b => b.Name == "First Steps");
        var dedicated = seeds.First(b => b.Name == "Dedicated Contributor");
        await _evolutionRepository.AddAsync(new BadgeEvolution
        {
            SourceBadgeId = first.Id,
            TargetBadgeId = dedicated.Id,
            EvolutionPath = "Earn 100 work hours to evolve",
            WorkHoursRequired = 100,
            WSCRequired = 50
        });

        _logger.LogInformation("Seeded default badge catalog ({Count} badges)", seeds.Count);
    }
}
