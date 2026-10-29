using System.Text.Json;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Infrastructure.Data;

namespace Wiseravenshare.Server.Services;

public sealed class KaraokePersistenceService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly AppDbContext _db;
    private readonly BlobServiceClient? _blobs;
    private readonly string _containerName;

    public KaraokePersistenceService(AppDbContext db, BlobServiceClient? blobs, IConfiguration configuration)
    {
        _db = db;
        _blobs = blobs;
        _containerName = configuration["KaraokeStorage:Container"] ?? "karaoke-private";
    }

    public async Task CreatePerformanceAsync(
        Guid performanceId,
        Guid userId,
        Guid songId,
        DateTimeOffset startedAt,
        CancellationToken cancellationToken = default)
    {
        _db.Performances.Add(new Entities.Karaoke.Performance
        {
            Id = performanceId,
            UserId = userId,
            SongId = songId,
            StartedAt = startedAt,
            Status = Entities.Karaoke.PerformanceStatus.Recording
        });

        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task SaveFinalTurnsAsync(
        Guid performanceId,
        IReadOnlyCollection<FinalTurn> turns,
        CancellationToken cancellationToken = default)
    {
        var performance = await _db.Performances
            .SingleOrDefaultAsync(x => x.Id == performanceId, cancellationToken)
            ?? throw new KeyNotFoundException("Performance not found.");

        performance.Status = Entities.Karaoke.PerformanceStatus.Processing;

        var existingOrders = await _db.PerformanceTurns
            .Where(x => x.PerformanceId == performanceId)
            .Select(x => x.TurnOrder)
            .ToHashSetAsync(cancellationToken);

        foreach (var turn in turns.Where(x =>
                     !existingOrders.Contains(x.TurnOrder) &&
                     !string.IsNullOrWhiteSpace(x.Transcript)))
        {
            _db.PerformanceTurns.Add(new Entities.Karaoke.PerformanceTurn
            {
                PerformanceId = performanceId,
                TurnOrder = turn.TurnOrder,
                Transcript = turn.Transcript,
                StartMilliseconds = turn.StartMilliseconds,
                EndMilliseconds = turn.EndMilliseconds
            });
        }

        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task CompleteAsync(
        Guid performanceId,
        LyricScoreResult result,
        CancellationToken cancellationToken = default)
    {
        var performance = await _db.Performances
            .SingleOrDefaultAsync(x => x.Id == performanceId, cancellationToken)
            ?? throw new KeyNotFoundException("Performance not found.");

        string? blobName = null;
        if (_blobs is not null)
        {
            var container = _blobs.GetBlobContainerClient(_containerName);
            await container.CreateIfNotExistsAsync(PublicAccessType.None, cancellationToken: cancellationToken);

            blobName = $"performances/{performanceId:N}/alignment.json";
            var blob = container.GetBlobClient(blobName);
            var payload = JsonSerializer.SerializeToUtf8Bytes(result, JsonOptions);

            await using var stream = new MemoryStream(payload);
            await blob.UploadAsync(
                stream,
                new BlobUploadOptions
                {
                    HttpHeaders = new BlobHttpHeaders
                    {
                        ContentType = "application/json; charset=utf-8"
                    },
                    Metadata = new Dictionary<string, string>
                    {
                        ["performanceId"] = performanceId.ToString("N"),
                        ["schemaVersion"] = "1"
                    }
                },
                cancellationToken);
        }

        performance.LyricScore = Convert.ToDecimal(result.Score);
        performance.Matches = result.Matches;
        performance.Substitutions = result.Substitutions;
        performance.Missing = result.Missing;
        performance.Extras = result.Extras;
        if (blobName is not null)
            performance.AlignmentBlobName = blobName;
        performance.CompletedAt = DateTimeOffset.UtcNow;
        performance.Status = Entities.Karaoke.PerformanceStatus.Completed;
        performance.FailureReason = null;
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task MarkFailedAsync(Guid performanceId, string reason, CancellationToken cancellationToken = default)
    {
        var performance = await _db.Performances
            .SingleOrDefaultAsync(x => x.Id == performanceId, cancellationToken)
            ?? throw new KeyNotFoundException("Performance not found.");

        performance.Status = Entities.Karaoke.PerformanceStatus.Failed;
        performance.FailureReason = reason.Length <= 2_000 ? reason : reason[..2_000];
        await _db.SaveChangesAsync(cancellationToken);
    }
}
