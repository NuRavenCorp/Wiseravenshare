// Wiseravenshare.Server/Services/Currency/LedgerHashService.cs
using System.Security.Cryptography;
using System.Text;
using Wiseravenshare.Server.Entities.Currency;

namespace Wiseravenshare.Server.Services.Currency;

/// <summary>
/// Computes and verifies the tamper-evident hash chain over CoinTransaction rows.
/// Each transaction's hash covers its fields PLUS the previous row's hash — so the
/// rows form a chain where editing any historical row breaks every hash after it.
/// </summary>
public interface ILedgerHashService
{
    string ComputeHash(CoinTransaction tx, string previousHash);
    Task<string> GetChainHeadAsync();
    Task StampChainAsync(CoinTransaction tx);
    Task<LedgerVerifyResult> VerifyRecentAsync(int count = 500);
    Task<LedgerAnchor?> GetLatestAnchorAsync();
    Task<LedgerAnchor> AnchorAsync(string note);
}

public class LedgerVerifyResult
{
    public bool IsValid { get; set; }
    public Guid? BrokenAtTransactionId { get; set; }
    public int TransactionsChecked { get; set; }
    public string? Detail { get; set; }
}

/// <summary>A periodic snapshot of the chain head, kept in its own table — an
/// attacker editing transaction rows must also forge this separately-stored value.</summary>
public class LedgerAnchor : Wiseravenshare.Server.Entities.BaseEntity
{
    [System.ComponentModel.DataAnnotations.MaxLength(64)]
    public string ChainHeadHash { get; set; } = string.Empty;
    public DateTimeOffset AnchoredUtc { get; set; } = DateTimeOffset.UtcNow;
    [System.ComponentModel.DataAnnotations.MaxLength(200)]
    public string? Note { get; set; }
}

public class LedgerHashService : ILedgerHashService
{
    private readonly IRepository<CoinTransaction> _transactionRepository;
    private readonly IRepository<LedgerAnchor> _anchorRepository;
    private readonly ILogger<LedgerHashService> _logger;

    public LedgerHashService(
        IRepository<CoinTransaction> transactionRepository,
        IRepository<LedgerAnchor> anchorRepository,
        ILogger<LedgerHashService> logger)
    {
        _transactionRepository = transactionRepository;
        _anchorRepository = anchorRepository;
        _logger = logger;
    }

    /// <summary>
    /// Canonical string of the transaction's important fields, in FIXED order.
    /// Never reorder or remove fields — that changes every hash in the chain.
    /// Add new hashed fields only at the END of the string.
    /// </summary>
    public string ComputeHash(CoinTransaction tx, string previousHash)
    {
        var payload = string.Join("|",
            previousHash,
            tx.Id,
            tx.UserId,
            tx.TargetUserId?.ToString() ?? "-",
            ((int)tx.Type).ToString(),
            tx.Amount.ToString("0.########################", System.Globalization.CultureInfo.InvariantCulture),
            tx.Fee.ToString("0.########################", System.Globalization.CultureInfo.InvariantCulture),
            tx.NetAmount.ToString("0.########################", System.Globalization.CultureInfo.InvariantCulture),
            ((int)tx.Status).ToString(),
            tx.CompletedAt?.ToString("O") ?? "-",
            tx.Description ?? "-",
            tx.ReferenceId?.ToString() ?? "-",
            tx.ReferenceType ?? "-");

        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(payload))).ToLowerInvariant();
    }

    public async Task<string> GetChainHeadAsync()
    {
        var latest = (await _transactionRepository.GetAllAsync())
            .OrderByDescending(t => t.CreatedAt)
            .FirstOrDefault();
        return latest?.Hash is { Length: 64 } h ? h : "GENESIS";
    }

    /// <summary>Links a new transaction onto the chain: sets PreviousHash + Hash on it.
    /// Call BEFORE saving the transaction.</summary>
    public async Task StampChainAsync(CoinTransaction tx)
    {
        var previousHash = await GetChainHeadAsync();
        tx.PreviousHash = previousHash;
        tx.Hash = ComputeHash(tx, previousHash);
    }

    /// <summary>
    /// Verifies the most recent `count` transactions (oldest of the window first).
    /// The window's first link is checked against the actual preceding row (or
    /// GENESIS), so deletions at the boundary are caught. Returns the first broken
    /// link, or a valid result when the segment is intact.
    /// </summary>
    public async Task<LedgerVerifyResult> VerifyRecentAsync(int count = 500)
    {
        var all = (await _transactionRepository.GetAllAsync())
            .OrderBy(t => t.CreatedAt)
            .ToList();

        if (all.Count == 0)
            return new LedgerVerifyResult { IsValid = true, TransactionsChecked = 0 };

        var recent = all.TakeLast(Math.Min(count, all.Count)).ToList();

        // Anchor the window to the REAL row that precedes it, so deletions at
        // (or before) the window boundary are detected instead of silently trusted.
        var windowStart = all.Count - recent.Count;
        var expectedPrev = windowStart > 0
            ? all[windowStart - 1].Hash
            : "GENESIS";
        foreach (var tx in recent)
        {
            if (tx.PreviousHash != expectedPrev)
            {
                return new LedgerVerifyResult
                {
                    IsValid = false,
                    BrokenAtTransactionId = tx.Id,
                    TransactionsChecked = recent.Count,
                    Detail = "Chain link mismatch: a row's PreviousHash does not match the prior row's Hash. Rows were inserted, reordered or deleted."
                };
            }

            var expected = ComputeHash(tx, tx.PreviousHash);
            if (!string.Equals(tx.Hash, expected, StringComparison.Ordinal))
            {
                return new LedgerVerifyResult
                {
                    IsValid = false,
                    BrokenAtTransactionId = tx.Id,
                    TransactionsChecked = recent.Count,
                    Detail = "Row content does not match its stored hash — this transaction was edited after being written."
                };
            }

            expectedPrev = tx.Hash;
        }

        return new LedgerVerifyResult { IsValid = true, TransactionsChecked = recent.Count };
    }

    public async Task<LedgerAnchor?> GetLatestAnchorAsync()
    {
        var anchors = await _anchorRepository.GetAllAsync();
        return anchors.OrderByDescending(a => a.AnchoredUtc).FirstOrDefault();
    }

    /// <summary>Stores the current chain head as an anchor snapshot. Call periodically
    /// (e.g. daily background job); the anchor is the tamper-evidence checkpoint.</summary>
    public async Task<LedgerAnchor> AnchorAsync(string note)
    {
        var head = await GetChainHeadAsync();
        var anchor = new LedgerAnchor { ChainHeadHash = head, Note = note };
        await _anchorRepository.AddAsync(anchor);
        _logger.LogInformation("Ledger anchored at head {Head}", head.Length >= 12 ? head[..12] : head);
        return anchor;
    }
}
