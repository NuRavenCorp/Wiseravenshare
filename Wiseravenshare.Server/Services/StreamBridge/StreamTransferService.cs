using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities.Stream;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Services.StreamBridge;

// ── DTOs ────────────────────────────────────────────────────────────────────

public sealed record RubricPoint(
    int PointId,
    string PointName,
    string Result,        // PASS | FLAG | FAIL
    double Confidence,
    string? Evidence = null,
    string? Notes = null);

public sealed record RubricResult(
    bool AllPassed,
    IReadOnlyList<RubricPoint> Points,
    DateTime ScreenedAt,
    string EngineVersion);

public sealed record InitiateTransferRequest(
    string SourceContentId,
    string SourceCreatorId,
    string VideoUrl,
    string Title,
    string? Description,
    long FileSizeBytes,
    string? MimeType);

public sealed record TransferDto(
    Guid Id,
    string SourceContentId,
    string SourceCreatorId,
    string VideoUrl,
    string Title,
    string? Description,
    string Status,
    string? StreamVideoUid,
    DateTime CreatedAt,
    DateTime? PublishedAt,
    int RetryCount,
    RubricResult? RubricResult);

public sealed record GatekeeperDecisionRequest(
    string Action,       // Cleared | RequiresEdit | Escalated | Rejected
    string Rationale);

// ── Interface ────────────────────────────────────────────────────────────────

public interface IStreamTransferService
{
    Task<TransferDto> InitiateAsync(InitiateTransferRequest req, CancellationToken ct = default);
    Task<TransferDto?> GetAsync(Guid id, CancellationToken ct = default);
    Task<IReadOnlyList<TransferDto>> GetPendingReviewAsync(CancellationToken ct = default);
    Task<TransferDto> ApplyGatekeeperDecisionAsync(Guid id, string adminId, GatekeeperDecisionRequest req, CancellationToken ct = default);
    Task<bool> RetryAsync(Guid id, CancellationToken ct = default);
    Task CancelAsync(Guid id, CancellationToken ct = default);
}

// ── Implementation ────────────────────────────────────────────────────────────

public sealed class StreamTransferService : IStreamTransferService
{
    private readonly AppDbContext _db;
    private readonly IUploadMalwareScanner _scanner;
    private readonly ILogger<StreamTransferService> _logger;

    private static readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web);

    public StreamTransferService(
        AppDbContext db,
        IUploadMalwareScanner scanner,
        ILogger<StreamTransferService> logger)
    {
        _db = db;
        _scanner = scanner;
        _logger = logger;
    }

    public async Task<TransferDto> InitiateAsync(InitiateTransferRequest req, CancellationToken ct = default)
    {
        var transfer = new StreamTransfer
        {
            SourceContentId = req.SourceContentId,
            SourceCreatorId = req.SourceCreatorId,
            VideoUrl = req.VideoUrl,
            Title = req.Title,
            Description = req.Description,
            FileSizeBytes = req.FileSizeBytes,
            MimeType = req.MimeType,
            Status = StreamTransferStatus.AutoScreening
        };

        _db.Set<StreamTransfer>().Add(transfer);
        await _db.SaveChangesAsync(ct);

        var rubric = RunAutoScreen(transfer);
        transfer.RubricResultJson = JsonSerializer.Serialize(rubric, _json);

        if (rubric.Points.Any(p => p.Result == "FAIL"))
        {
            transfer.Status = StreamTransferStatus.AutoBlocked;
            _logger.LogWarning("Transfer {Id} auto-blocked: FAIL in rubric", transfer.Id);
        }
        else if (rubric.AllPassed)
        {
            transfer.Status = StreamTransferStatus.Approved;
            _logger.LogInformation("Transfer {Id} auto-approved", transfer.Id);
        }
        else
        {
            transfer.Status = StreamTransferStatus.GatekeeperReview;
            _logger.LogInformation("Transfer {Id} routed to gatekeeper review ({Flags} flags)",
                transfer.Id, rubric.Points.Count(p => p.Result == "FLAG"));
        }

        await _db.SaveChangesAsync(ct);
        return ToDto(transfer, rubric);
    }

    public async Task<TransferDto?> GetAsync(Guid id, CancellationToken ct = default)
    {
        var t = await _db.Set<StreamTransfer>().AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (t is null) return null;
        return ToDto(t, DeserializeRubric(t.RubricResultJson));
    }

    public async Task<IReadOnlyList<TransferDto>> GetPendingReviewAsync(CancellationToken ct = default)
    {
        var rows = await _db.Set<StreamTransfer>()
            .AsNoTracking()
            .Where(t => t.Status == StreamTransferStatus.GatekeeperReview)
            .OrderBy(t => t.CreatedAt)
            .ToListAsync(ct);

        return rows.Select(t => ToDto(t, DeserializeRubric(t.RubricResultJson))).ToList();
    }

    public async Task<TransferDto> ApplyGatekeeperDecisionAsync(
        Guid id, string adminId, GatekeeperDecisionRequest req, CancellationToken ct = default)
    {
        var transfer = await _db.Set<StreamTransfer>().FirstOrDefaultAsync(t => t.Id == id, ct)
            ?? throw new KeyNotFoundException($"Transfer {id} not found.");

        _db.Set<StreamGatekeeperDecision>().Add(new StreamGatekeeperDecision
        {
            TransferId = id,
            AdminId = adminId,
            Action = req.Action,
            Rationale = req.Rationale,
            DecidedAt = DateTime.UtcNow
        });

        transfer.Status = req.Action switch
        {
            "Cleared"      => StreamTransferStatus.Approved,
            "RequiresEdit" => StreamTransferStatus.Pending,
            "Rejected"     => StreamTransferStatus.Rejected,
            "Escalated"    => StreamTransferStatus.AutoBlocked,
            _              => transfer.Status
        };

        _logger.LogInformation("Gatekeeper {Admin} applied {Action} to transfer {Id}", adminId, req.Action, id);
        await _db.SaveChangesAsync(ct);
        return ToDto(transfer, DeserializeRubric(transfer.RubricResultJson));
    }

    public async Task<bool> RetryAsync(Guid id, CancellationToken ct = default)
    {
        var transfer = await _db.Set<StreamTransfer>().FirstOrDefaultAsync(t => t.Id == id, ct);
        if (transfer is null || transfer.RetryCount >= 3) return false;

        transfer.Status = StreamTransferStatus.Approved;
        transfer.RetryCount++;
        await _db.SaveChangesAsync(ct);
        return true;
    }

    public async Task CancelAsync(Guid id, CancellationToken ct = default)
    {
        var transfer = await _db.Set<StreamTransfer>().FirstOrDefaultAsync(t => t.Id == id, ct);
        if (transfer is null) return;
        transfer.Status = StreamTransferStatus.Cancelled;
        await _db.SaveChangesAsync(ct);
    }

    // ── Rubric screening (stubs — wire real checkers per point) ─────────────

    private static RubricResult RunAutoScreen(StreamTransfer t)
    {
        var points = new List<RubricPoint>
        {
            // Points 1–10; results here are stubs that can be replaced with real AI/scan calls.
            new(1,  "Identity & Authorization",        "PASS", 1.00),
            new(2,  "Malware & File Integrity",         "PASS", 1.00),
            new(3,  "Intellectual Property / DMCA",     "PASS", 0.90),
            new(4,  "Content Safety (Zero-Tolerance)",  "PASS", 0.99),
            new(5,  "Hate Speech & Harassment",         "PASS", 0.97),
            new(6,  "Age-Rating & Labeling",            "PASS", 0.95),
            new(7,  "Truth Scoring & Verification",     "PASS", 0.88),
            new(8,  "Sponsorship & Disclosure",         "PASS", 0.90),
            new(9,  "Technical Quality",                "PASS", 1.00),
            new(10, "Metadata & Distribution",          "PASS", 0.98),
        };

        var allPassed = !points.Any(p => p.Result is "FAIL" or "FLAG");
        return new RubricResult(allPassed, points, DateTime.UtcNow, "autoscreen-1.0.0");
    }

    private static RubricResult? DeserializeRubric(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try { return JsonSerializer.Deserialize<RubricResult>(json, _json); }
        catch { return null; }
    }

    private static TransferDto ToDto(StreamTransfer t, RubricResult? rubric) => new(
        t.Id, t.SourceContentId, t.SourceCreatorId, t.VideoUrl,
        t.Title, t.Description, t.Status.ToString(),
        t.StreamVideoUid, t.CreatedAt, t.PublishedAt,
        t.RetryCount, rubric);
}

