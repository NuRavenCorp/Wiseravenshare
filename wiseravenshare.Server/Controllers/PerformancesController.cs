using Azure.Storage.Blobs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities.Karaoke;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/performances")]
[Authorize]
public sealed class PerformancesController(
    AppDbContext db,
    IConfiguration configuration,
    KaraokePersistenceService persistence,
    PerformanceCompletionService completionService,
    ILogger<PerformancesController> logger,
    BlobServiceClient? blobs = null) : ControllerBase
{
    private readonly string _containerName =
        configuration["KaraokeStorage:Container"] ?? "karaoke-private";

    // ----------------------------------------------------------------
    // POST /api/performances  — create a new performance
    // ----------------------------------------------------------------

    [HttpPost]
    public async Task<IActionResult> Create(
        [FromBody] CreatePerformanceRequest request,
        CancellationToken cancellationToken = default)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        if (request is null || request.SongId == Guid.Empty)
        {
            return BadRequest(new { message = "songId is required." });
        }

        var performanceId = Guid.NewGuid();
        await persistence.CreatePerformanceAsync(
            performanceId,
            userId,
            request.SongId,
            DateTimeOffset.UtcNow,
            cancellationToken);

        return CreatedAtAction(nameof(Get), new { id = performanceId }, new { id = performanceId });
    }

    // ----------------------------------------------------------------
    // PUT /api/performances/{id}/turns  — save turns for performance
    // ----------------------------------------------------------------

    [HttpPut("{id:guid}/turns")]
    public async Task<IActionResult> SaveTurns(
        [FromRoute] Guid id,
        [FromBody] SavePerformanceTurnsRequest request,
        CancellationToken cancellationToken = default)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var perf = await db.Performances
            .FirstOrDefaultAsync(x => x.Id == id && x.UserId == userId, cancellationToken);

        if (perf is null) return NotFound();

        var turns = (request?.Turns ?? [])
            .Where(t => !string.IsNullOrWhiteSpace(t.Transcript))
            .Select(t => new FinalTurn(t.TurnOrder, t.Transcript, t.StartMilliseconds, t.EndMilliseconds))
            .ToList();

        await persistence.SaveFinalTurnsAsync(id, turns, cancellationToken);
        return NoContent();
    }

    // ----------------------------------------------------------------
    // POST /api/performances/{id}/complete  — score performance
    // ----------------------------------------------------------------

    [HttpPost("{id:guid}/complete")]
    public async Task<IActionResult> Complete(
        [FromRoute] Guid id,
        CancellationToken cancellationToken = default)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var perf = await db.Performances
            .Include(x => x.Turns)
            .FirstOrDefaultAsync(x => x.Id == id && x.UserId == userId, cancellationToken);

        if (perf is null) return NotFound();

        var turns = perf.Turns
            .OrderBy(t => t.TurnOrder)
            .Select(t => new FinalTurn(t.TurnOrder, t.Transcript, t.StartMilliseconds, t.EndMilliseconds))
            .ToList();

        var result = await completionService.CompleteAsync(
            id,
            perf.SongId,
            turns,
            cancellationToken);

        return Ok(result);
    }

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
        if (blobs is not null && !string.IsNullOrWhiteSpace(perf.AlignmentBlobName))
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

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(
        [FromRoute] string id,
        CancellationToken cancellationToken = default)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        if (!Guid.TryParse(id, out var performanceId))
        {
            return BadRequest(new { message = "Invalid performance id." });
        }

        return await DeletePerformanceAsync(userId, performanceId, cancellationToken);
    }

    // Compatibility route for hosts/proxies that block DELETE.
    [HttpPost("{id}/delete")]
    public async Task<IActionResult> DeleteViaPost(
        [FromRoute] string id,
        CancellationToken cancellationToken = default)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        if (!Guid.TryParse(id, out var performanceId))
        {
            return BadRequest(new { message = "Invalid performance id." });
        }

        return await DeletePerformanceAsync(userId, performanceId, cancellationToken);
    }

    private async Task<IActionResult> DeletePerformanceAsync(
        Guid userId,
        Guid performanceId,
        CancellationToken cancellationToken)
    {
        var perf = await db.Performances
            .FirstOrDefaultAsync(x => x.Id == performanceId && x.UserId == userId, cancellationToken);

        if (perf is null) return NotFound();

        // Best-effort: delete blobs if blob storage is configured
        if (blobs is not null)
        {
            try
            {
                var container = blobs.GetBlobContainerClient(_containerName);
                foreach (var blobName in new[] { perf.AlignmentBlobName, perf.RecordingBlobName })
                {
                    if (string.IsNullOrWhiteSpace(blobName)) continue;
                    try { await container.GetBlobClient(blobName).DeleteIfExistsAsync(cancellationToken: cancellationToken); }
                    catch (Exception ex) { logger.LogWarning(ex, "Could not delete blob {Blob}", blobName); }
                }
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Could not access blob container to delete blobs for performance {Id}", performanceId);
            }
        }

        db.Performances.Remove(perf);
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }
}

public sealed class CreatePerformanceRequest
{
    public Guid SongId { get; set; }
}

public sealed class SavePerformanceTurnsRequest
{
    public List<FinalTurnDto> Turns { get; set; } = [];
}

public sealed class FinalTurnDto
{
    public int TurnOrder { get; set; }
    public string Transcript { get; set; } = string.Empty;
    public long? StartMilliseconds { get; set; }
    public long? EndMilliseconds { get; set; }
}
