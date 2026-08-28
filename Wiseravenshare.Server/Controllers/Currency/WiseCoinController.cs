// Wiseravenshare.Server/Controllers/Currency/WiseCoinController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Entities.Currency;
using Wiseravenshare.Server.Services.Currency;
using Wiseravenshare.Server.Shared;

namespace Wiseravenshare.Server.Controllers.Currency;

[ApiController]
[Route("api/wisecoin")]
[Authorize]
[Produces("application/json")]
public class WiseCoinController : ControllerBase
{
    private readonly IWiseCoinService _wiseCoinService;
    private readonly IBadgeService _badgeService;
    private readonly ILedgerHashService _ledger;
    private readonly ILogger<WiseCoinController> _logger;

    public WiseCoinController(IWiseCoinService wiseCoinService, IBadgeService badgeService, ILedgerHashService ledger, ILogger<WiseCoinController> logger)
    {
        _wiseCoinService = wiseCoinService;
        _badgeService = badgeService;
        _ledger = ledger;
        _logger = logger;
    }

    /// <summary>Get the current user's WSC wallet with multipliers.</summary>
    [HttpGet("balance")]
    public async Task<IActionResult> GetBalance()
    {
        var userId = User.GetUserId();
        var wallet = await _wiseCoinService.GetOrCreateWalletAsync(userId);
        var valuation = await _wiseCoinService.GetCurrentValuationAsync();
        return Ok(new
        {
            balance = wallet.Balance,
            lockedBalance = wallet.LockedBalance,
            escrowedBalance = wallet.EscrowedBalance,
            effectiveBalance = wallet.GetEffectiveBalance(),
            workHoursContributed = wallet.WorkHoursContributed,
            workHourValue = await _wiseCoinService.GetWorkHourValueAsync(userId),
            currentValueUSD = decimal.Round(wallet.Balance * valuation.WSCPerHour / 100m, 2),
            badgeMultiplier = wallet.BadgeMultiplier,
            skillMultiplier = wallet.SkillMultiplier,
            reputationMultiplier = wallet.ReputationMultiplier,
            totalMultiplier = wallet.TotalMultiplier
        });
    }

    /// <summary>Get transaction history (paged).</summary>
    [HttpGet("transactions")]
    public async Task<IActionResult> GetTransactions([FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        var userId = User.GetUserId();
        var transactions = await _wiseCoinService.GetTransactionHistoryAsync(userId, page, Math.Min(pageSize, 100));
        return Ok(transactions.Select(t => new
        {
            t.Id,
            t.Type,
            t.Amount,
            t.Fee,
            t.NetAmount,
            t.Description,
            t.Status,
            t.CreatedAt,
            t.CompletedAt,
            t.WorkHoursValue,
            t.WorkHourRate
        }));
    }

    /// <summary>Get the current work-hour valuation (public).</summary>
    [HttpGet("valuation")]
    [AllowAnonymous]
    public async Task<IActionResult> GetValuation() => Ok(await _wiseCoinService.GetCurrentValuationAsync());

    // === Ledger integrity (tamper-evident hash chain) ===

    /// <summary>Verifies the hash chain over the most recent transactions.
    /// Returns whether the ledger is intact and, if not, the first broken row.</summary>
    [HttpGet("ledger/verify")]
    public async Task<IActionResult> VerifyLedger([FromQuery] int count = 500)
    {
        var result = await _ledger.VerifyRecentAsync(Math.Clamp(count, 10, 5000));
        var anchor = await _ledger.GetLatestAnchorAsync();
        return Ok(new
        {
            result.IsValid,
            result.TransactionsChecked,
            result.BrokenAtTransactionId,
            result.Detail,
            latestAnchor = anchor is null ? null : new { anchor.ChainHeadHash, anchor.AnchoredUtc, anchor.Note }
        });
    }

    /// <summary>Returns the current chain head hash and the latest stored anchor.</summary>
    [HttpGet("ledger/head")]
    public async Task<IActionResult> GetLedgerHead()
    {
        var head = await _ledger.GetChainHeadAsync();
        var anchor = await _ledger.GetLatestAnchorAsync();
        return Ok(new
        {
            head,
            anchored = anchor is not null && anchor.ChainHeadHash == head,
            latestAnchor = anchor is null ? null : new { anchor.ChainHeadHash, anchor.AnchoredUtc, anchor.Note }
        });
    }

    /// <summary>Stores the current chain head as an anchor snapshot (admin/integrity tool).</summary>
    [HttpPost("ledger/anchor")]
    public async Task<IActionResult> AnchorLedger([FromBody] AnchorRequest request)
    {
        var anchor = await _ledger.AnchorAsync(request.Note ?? "Manual anchor");
        return Ok(new { anchor.Id, anchor.ChainHeadHash, anchor.AnchoredUtc, anchor.Note });
    }

    /// <summary>Transfer WSC to another user.</summary>
    [HttpPost("transfer")]
    public async Task<IActionResult> Transfer([FromBody] TransferRequest request)
    {
        var userId = User.GetUserId();
        var result = await _wiseCoinService.TransferWSCAsync(userId, request.RecipientId, request.Amount, request.Message);
        return result.Success ? Ok(result) : BadRequest(new { error = result.ErrorMessage });
    }

    /// <summary>Stake WSC tokens.</summary>
    [HttpPost("stake")]
    public async Task<IActionResult> Stake([FromBody] StakeRequest request)
    {
        var userId = User.GetUserId();
        var result = await _wiseCoinService.StakeWSCAsync(userId, request.Amount, request.DurationDays, request.Type);
        return result.Success ? Ok(result) : BadRequest(new { error = result.ErrorMessage });
    }

    /// <summary>Unstake WSC tokens.</summary>
    [HttpPost("unstake/{stakeId:guid}")]
    public async Task<IActionResult> Unstake(Guid stakeId)
    {
        var userId = User.GetUserId();
        var result = await _wiseCoinService.UnstakeWSCAsync(userId, stakeId);
        return result.Success ? Ok(result) : BadRequest(new { error = result.ErrorMessage });
    }

    // === Badge endpoints (badges first, currency second) ===

    /// <summary>Get the user's earned badges.</summary>
    [HttpGet("badges")]
    public async Task<IActionResult> GetBadges()
    {
        var userId = User.GetUserId();
        var badges = await _badgeService.GetUserBadgesAsync(userId);
        return Ok(badges.Select(ub => new
        {
            ub.Id,
            ub.BadgeId,
            ub.EarnedAt,
            ub.IsActive,
            ub.MultiplierBonus,
            name = ub.Badge?.Name,
            description = ub.Badge?.Description,
            iconUrl = ub.Badge?.IconUrl,
            type = ub.Badge?.Type.ToString(),
            rarity = ub.Badge?.Rarity.ToString(),
            category = ub.Badge?.Category.ToString(),
            valueMultiplier = ub.Badge?.ValueMultiplier ?? 1m
        }));
    }

    /// <summary>Get badges available to earn.</summary>
    [HttpGet("badges/available")]
    public async Task<IActionResult> GetAvailableBadges()
    {
        var userId = User.GetUserId();
        var badges = await _badgeService.GetAvailableBadgesAsync(userId);
        return Ok(badges.Select(b => new
        {
            b.Id,
            b.Name,
            b.Description,
            b.IconUrl,
            b.Type,
            b.Rarity,
            b.Category,
            b.ValueMultiplier,
            b.WorkMultiplier,
            b.TrustMultiplier,
            b.StakingMultiplier,
            b.MinimumWorkHours,
            b.MintingCost,
            b.IsSoulbound,
            b.TotalSupply,
            b.CurrentSupply
        }));
    }

    /// <summary>Claim/award a badge (checks requirements, deducts minting cost).</summary>
    [HttpPost("badges/{badgeId:guid}/claim")]
    public async Task<IActionResult> ClaimBadge(Guid badgeId)
    {
        var userId = User.GetUserId();
        try
        {
            var userBadge = await _badgeService.AwardBadgeAsync(userId, badgeId);
            return Ok(new { userBadge.Id, userBadge.BadgeId, userBadge.EarnedAt, userBadge.MultiplierBonus });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    /// <summary>Evolve a badge along a defined evolution path.</summary>
    [HttpPost("badges/evolve")]
    public async Task<IActionResult> EvolveBadge([FromBody] EvolveBadgeRequest request)
    {
        var userId = User.GetUserId();
        try
        {
            var badge = await _badgeService.EvolveBadgeAsync(userId, request.SourceBadgeId, request.TargetBadgeId);
            return Ok(new { badge.Id, badge.Name, badge.ValueMultiplier });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }
}

public class TransferRequest
{
    public Guid RecipientId { get; set; }
    public decimal Amount { get; set; }
    public string? Message { get; set; }
}

public class StakeRequest
{
    public decimal Amount { get; set; }
    public int DurationDays { get; set; }
    public StakingType Type { get; set; } = StakingType.Flexible;
}

public class EvolveBadgeRequest
{
    public Guid SourceBadgeId { get; set; }
    public Guid TargetBadgeId { get; set; }
}

public class AnchorRequest
{
    public string? Note { get; set; }
}
