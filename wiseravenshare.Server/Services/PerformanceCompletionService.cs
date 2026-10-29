using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Infrastructure.Data;

namespace Wiseravenshare.Server.Services;

public sealed class PerformanceCompletionService
{
    private readonly AppDbContext _db;
    private readonly KaraokePersistenceService _persistence;
    private readonly LyricScoringClient _scoring;

    public PerformanceCompletionService(
        AppDbContext db,
        KaraokePersistenceService persistence,
        LyricScoringClient scoring)
    {
        _db = db;
        _persistence = persistence;
        _scoring = scoring;
    }

    public Task CreatePerformanceAsync(
        Guid performanceId,
        Guid userId,
        Guid songId,
        DateTimeOffset startedAt,
        CancellationToken cancellationToken = default) =>
        _persistence.CreatePerformanceAsync(performanceId, userId, songId, startedAt, cancellationToken);

    public async Task<LyricScoreResult> CompleteAsync(
        Guid performanceId,
        Guid songId,
        IReadOnlyCollection<FinalTurn> turns,
        CancellationToken cancellationToken = default)
    {
        try
        {
            await _persistence.SaveFinalTurnsAsync(performanceId, turns, cancellationToken);

            var referenceLyrics = await LoadLicensedLyricsAsync(songId, cancellationToken);
            var request = new LyricScoreRequest(
                performanceId.ToString(),
                referenceLyrics,
                turns
                    .OrderBy(x => x.TurnOrder)
                    .Select(x => new TranscriptTurn(x.TurnOrder, x.Transcript, true))
                    .ToList());

            var result = await _scoring.ScoreAsync(request, cancellationToken);
            await _persistence.CompleteAsync(performanceId, result, cancellationToken);
            return result;
        }
        catch (Exception ex)
        {
            await _persistence.MarkFailedAsync(performanceId, ex.Message, CancellationToken.None);
            throw;
        }
    }

    private async Task<string> LoadLicensedLyricsAsync(Guid songId, CancellationToken cancellationToken)
    {
        var track = await _db.KaraokeTracks
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == songId, cancellationToken)
            ?? throw new KeyNotFoundException($"Song not found: {songId}");

        var lyrics = string.IsNullOrWhiteSpace(track.PlainLyrics)
            ? track.LrcContent
            : track.PlainLyrics;

        if (string.IsNullOrWhiteSpace(lyrics))
        {
            throw new InvalidOperationException($"No licensed lyrics are configured for song {songId}.");
        }

        return lyrics;
    }
}
