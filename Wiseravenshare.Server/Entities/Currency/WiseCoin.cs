// Wiseravenshare.Server/Entities/Currency/WiseCoin.cs
using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace Wiseravenshare.Server.Entities.Currency;

public class WiseCoin : BaseEntity
{
    public Guid UserId { get; set; }
    public decimal Balance { get; set; }
    public decimal LockedBalance { get; set; }      // For staking
    public decimal EscrowedBalance { get; set; }    // For pending transactions
    public decimal TotalEarned { get; set; }
    public decimal TotalSpent { get; set; }
    public decimal WorkHoursContributed { get; set; }
    public decimal CurrentValuePerHour { get; set; } = 10m;

    // Badge multipliers (like Voter-Alliance badge-first approach)
    public decimal BadgeMultiplier { get; set; } = 1.0m;
    public decimal SkillMultiplier { get; set; } = 1.0m;
    public decimal ReputationMultiplier { get; set; } = 1.0m;
    public decimal TotalMultiplier => BadgeMultiplier * SkillMultiplier * ReputationMultiplier;

    public virtual User User { get; set; } = null!;
    public virtual ICollection<CoinTransaction> Transactions { get; set; } = new List<CoinTransaction>();
    public virtual ICollection<CoinStake> Stakes { get; set; } = new List<CoinStake>();
    public virtual ICollection<UserBadge> Badges { get; set; } = new List<UserBadge>();

    public decimal GetEffectiveBalance() => Balance + (LockedBalance * 0.5m);
    public decimal GetWorkHourValue() => CurrentValuePerHour * WorkHoursContributed;
}

public class CoinTransaction : BaseEntity
{
    public Guid UserId { get; set; }
    public Guid? TargetUserId { get; set; }
    public TransactionType Type { get; set; }
    public decimal Amount { get; set; }
    public decimal Fee { get; set; }
    public decimal NetAmount { get; set; }
    [MaxLength(500)]
    public string? Description { get; set; }
    public TransactionStatus Status { get; set; } = TransactionStatus.Pending;
    public Guid? ReferenceId { get; set; }
    [MaxLength(50)]
    public string? ReferenceType { get; set; }
    public JsonDocument? Metadata { get; set; }
    public DateTime? CompletedAt { get; set; }

    // Work hour backing
    public decimal WorkHoursValue { get; set; }
    public decimal WorkHourRate { get; set; }

    // ---- Tamper-evident ledger chain ----
    // Hash = SHA256(PreviousHash + this transaction's fields), hex string.
    // PreviousHash links to the prior transaction, forming a chain: editing ANY
    // historical row changes its hash and breaks every hash after it.
    [MaxLength(64)]
    public string Hash { get; set; } = string.Empty;
    [MaxLength(64)]
    public string PreviousHash { get; set; } = string.Empty;

    public virtual User User { get; set; } = null!;
    public virtual User? TargetUser { get; set; }
}

public enum TransactionType
{
    Mining, ContentCreation, Verification, BadgeReward, Staking, Tip,
    Purchase, Transfer, Burn, Fee, Governance, BadgeUpgrade,
    SkillValidation, Referral, CommunityBonus, CreativityWork
}

public enum TransactionStatus
{
    Pending, Completed, Failed, Refunded, Cancelled, UnderReview
}

public class CoinStake : BaseEntity
{
    public Guid UserId { get; set; }
    public decimal Amount { get; set; }
    public decimal WorkHourValue { get; set; }
    public int DurationDays { get; set; }
    public DateTime StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public decimal StakingRewardRate { get; set; }
    public decimal CurrentReward { get; set; }
    public bool IsActive { get; set; } = true;
    public StakingType Type { get; set; } = StakingType.Flexible;

    public virtual User User { get; set; } = null!;
}

public enum StakingType
{
    Flexible,    // Withdraw anytime (1.0x)
    Locked,      // Locked for duration (1.5x)
    WorkBacked   // Backed by work hours (2.0x)
}
