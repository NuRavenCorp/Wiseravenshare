using Azure.Storage.Blobs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities.Karaoke;
using Wiseravenshare.Server.Infrastructure.Data;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/performances")]
[Authorize]
public sealed class PerformancesController(
    AppDbContext db,
    BlobServiceClient blobs,
    IConfiguration configuration,
    ILogger<PerformancesController> logger) : ControllerBase
{
    private readonly string _containerName =
        configuration["KaraokeStorage:Container"] ?? "karaoke-private";

    // ----------------------------------------------------------------
    // GET /api/performances  — list the caller's performances
    // ----------------------------------------------------------------

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = db.Performances
            .Where(x => x.UserId == userId)
            .OrderByDescending(x => x.StartedAt);

        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(x => new
            {
                x.Id,
                x.SongId,
                x.Status,
                x.StartedAt,
                x.CompletedAt,
                x.LyricScore,
                x.Matches,
                x.Substitutions,
                x.Missing,
                x.Extras,
                HasAlignment = x.AlignmentBlobName != null,
                HasRecording = x.RecordingBlobName != null
            })
            .ToListAsync(cancellationToken);

        return Ok(new { total, page, pageSize, items });
    }

    // ----------------------------------------------------------------
    // GET /api/performances/{id}  — single performance + alignment
    // ----------------------------------------------------------------

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(
        [FromRoute] Guid id,
        CancellationToken cancellationToken = default)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var perf = await db.Performances
            .AsNoTracking()
            .Include(x => x.Turns.OrderBy(t => t.TurnOrder))
            .FirstOrDefaultAsync(x => x.Id == id && x.UserId == userId, cancellationToken);

        if (perf is null) return NotFound();

        object? alignment = null;
        if (!string.IsNullOrWhiteSpace(perf.AlignmentBlobName))
        {
            try
            {
                var container = blobs.GetBlobContainerClient(_containerName);
                var blob = container.GetBlobClient(perf.AlignmentBlobName);
                var download = await blob.DownloadContentAsync(cancellationToken);
                alignment = System.Text.Json.JsonDocument.Parse(
                    download.Value.Content.ToArray()).RootElement;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Could not read alignment blob {Blob}", perf.AlignmentBlobName);
            }
        }

        return Ok(new
        {
            perf.Id,
            perf.SongId,
            perf.Status,
            perf.StartedAt,
            perf.CompletedAt,
            perf.LyricScore,
            perf.Matches,
            perf.Substitutions,
            perf.Missing,
            perf.Extras,
            perf.FailureReason,
            HasRecording = perf.RecordingBlobName != null,
            Turns = perf.Turns.Select(t => new
            {
                t.TurnOrder,
                t.Transcript,
                t.StartMilliseconds,
                t.EndMilliseconds
            }),
            Alignment = alignment
        });
    }

    // ----------------------------------------------------------------
    // DELETE /api/performances/{id}
    // ----------------------------------------------------------------

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(
        [FromRoute] Guid id,
        CancellationToken cancellationToken = default)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var perf = await db.Performances
            .FirstOrDefaultAsync(x => x.Id == id && x.UserId == userId, cancellationToken);

        if (perf is null) return NotFound();

        // Best-effort: delete blobs (don't fail the delete if blobs are already gone)
        var container = blobs.GetBlobContainerClient(_containerName);
        foreach (var blobName in new[] { perf.AlignmentBlobName, perf.RecordingBlobName })
        {
            if (string.IsNullOrWhiteSpace(blobName)) continue;
            try { await container.GetBlobClient(blobName).DeleteIfExistsAsync(cancellationToken: cancellationToken); }
            catch (Exception ex) { logger.LogWarning(ex, "Could not delete blob {Blob}", blobName); }
        }

        db.Performances.Remove(perf);
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }
}
