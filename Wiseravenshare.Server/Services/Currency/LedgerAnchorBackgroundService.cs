// Wiseravenshare.Server/Services/Currency/LedgerAnchorBackgroundService.cs
using Wiseravenshare.Server.Services.Currency;

namespace Wiseravenshare.Server.HostedServices;

/// <summary>
/// Anchors the ledger hash chain once per day, and verifies integrity.
/// - Anchoring snapshots the current chain head into the LedgerAnchors table,
///   giving a periodic tamper-evidence checkpoint (an attacker editing old rows
///   cannot match a previously anchored head).
/// - When verification detects a broken chain, it logs a CRITICAL alert so it
///   can never fail silently.
/// </summary>
public class LedgerAnchorBackgroundService : BackgroundService
{
    private readonly ILedgerHashService _ledger;
    private readonly ILogger<LedgerAnchorBackgroundService> _logger;
    private static readonly TimeSpan Interval = TimeSpan.FromHours(24);

    public LedgerAnchorBackgroundService(ILedgerHashService ledger, ILogger<LedgerAnchorBackgroundService> logger)
    {
        _ledger = ledger;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Ledger anchor job started — anchoring every {Hours}h.", Interval.TotalHours);

        // Small initial delay so startup (migrations, warm-up) isn't disturbed.
        try { await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunCycleAsync();
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                // Never let one failed cycle kill the job.
                _logger.LogError(ex, "Ledger anchor cycle failed; will retry next interval.");
            }

            try { await Task.Delay(Interval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    private async Task RunCycleAsync()
    {
        // 1. Verify recent history — loud alert on any tamper indication.
        var verify = await _ledger.VerifyRecentAsync(1000);
        if (verify.IsValid)
        {
            _logger.LogInformation("Ledger integrity OK ({Count} tx verified).", verify.TransactionsChecked);
        }
        else
        {
            _logger.LogCritical(
                "LEDGER INTEGRITY FAILURE at transaction {TxId}: {Detail}. Investigate immediately — do not edit rows manually.",
                verify.BrokenAtTransactionId, verify.Detail);
        }

        // 2. Anchor the current head, but only if it moved since the last anchor.
        var head = await _ledger.GetChainHeadAsync();
        var latest = await _ledger.GetLatestAnchorAsync();
        if (latest is not null && latest.ChainHeadHash == head)
        {
            _logger.LogDebug("Ledger head unchanged since last anchor; skipping.");
            return;
        }

        var anchor = await _ledger.AnchorAsync(
            $"Automatic daily anchor — head {head[..Math.Min(12, head.Length)]}…, integrity {(verify.IsValid ? "OK" : "FAILED")}");
        _logger.LogInformation("Ledger anchored: {AnchorId} at head {Head}.",
            anchor.Id, anchor.ChainHeadHash[..Math.Min(12, anchor.ChainHeadHash.Length)]);
    }
}
