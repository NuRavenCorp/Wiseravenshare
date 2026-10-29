using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Azure.Storage.Sas;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities.Karaoke;
using Wiseravenshare.Server.Infrastructure.Data;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/performances")]
[Authorize]
public sealed class PerformanceRecordingsController(
    AppDbContext db,
    BlobServiceClient blobs,
    IConfiguration configuration,
    ILogger<PerformanceRecordingsController> logger) : ControllerBase
{
    private readonly string _containerName =
        configuration["KaraokeStorage:Container"] ?? "karaoke-private";

    private static readonly TimeSpan SasTtl = TimeSpan.FromMinutes(15);

    // ----------------------------------------------------------------
    // POST /api/performances/{id}/recording-upload-ticket
    // Returns a write-only SAS URL the browser uses to PUT the recording.
    // ----------------------------------------------------------------

    [HttpPost("{id:guid}/recording-upload-ticket")]
    public async Task<IActionResult> UploadTicket(
        [FromRoute] Guid id,
        [FromBody] RecordingUploadTicketRequest request,
        CancellationToken cancellationToken = default)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var perf = await db.Performances
            .FirstOrDefaultAsync(x => x.Id == id && x.UserId == userId, cancellationToken);

        if (perf is null) return NotFound();

        // Only allow ticket creation while the performance has not been deleted/completed
        // Allow re-issuance while still in Recording or Failed state (retry scenario)
        if (perf.Status == PerformanceStatus.Processing)
        {
            return Conflict(new { message = "Performance is currently being scored." });
        }

        var container = blobs.GetBlobContainerClient(_containerName);
        await container.CreateIfNotExistsAsync(PublicAccessType.None, cancellationToken: cancellationToken);

        var contentType = (request?.ContentType ?? "audio/ogg;codecs=opus").Trim();
        var ext = contentType.Contains("webm") ? "webm" : contentType.Contains("mp4") ? "mp4" : "ogg";
        var blobName = $"performances/{id:N}/recording.{ext}";

        var sasBuilder = new BlobSasBuilder
        {
            BlobContainerName = _containerName,
            BlobName = blobName,
            Resource = "b",
            ExpiresOn = DateTimeOffset.UtcNow.Add(SasTtl)
        };
        sasBuilder.SetPermissions(BlobSasPermissions.Create | BlobSasPermissions.Write);

        var sasUri = container.GetBlobClient(blobName).GenerateSasUri(sasBuilder);

        perf.RecordingBlobName = blobName;
        perf.RecordingUploadExpiresAt = sasBuilder.ExpiresOn;
        await db.SaveChangesAsync(cancellationToken);

        return Ok(new
        {
            uploadUrl = sasUri.ToString(),
            blobName,
            expiresAt = sasBuilder.ExpiresOn
        });
    }

    // ----------------------------------------------------------------
    // POST /api/performances/{id}/recording-confirm
    // Called after the browser finishes the PUT. Verifies the blob exists.
    // ----------------------------------------------------------------

    [HttpPost("{id:guid}/recording-confirm")]
    public async Task<IActionResult> ConfirmRecording(
        [FromRoute] Guid id,
        CancellationToken cancellationToken = default)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var perf = await db.Performances
            .FirstOrDefaultAsync(x => x.Id == id && x.UserId == userId, cancellationToken);

        if (perf is null) return NotFound();

        if (string.IsNullOrWhiteSpace(perf.RecordingBlobName))
        {
            return BadRequest(new { message = "No upload ticket was issued for this performance." });
        }

        var container = blobs.GetBlobContainerClient(_containerName);
        var blob = container.GetBlobClient(perf.RecordingBlobName);

        bool exists;
        try { exists = await blob.ExistsAsync(cancellationToken); }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Could not check recording blob {Blob}", perf.RecordingBlobName);
            return StatusCode(502, new { message = "Storage check failed." });
        }

        if (!exists)
        {
            return UnprocessableEntity(new { message = "Recording blob was not found. Upload may not have completed." });
        }

        perf.RecordingUploadExpiresAt = null;
        await db.SaveChangesAsync(cancellationToken);

        return Ok(new { confirmed = true, blobName = perf.RecordingBlobName });
    }
}

public sealed class RecordingUploadTicketRequest
{
    public string? ContentType { get; set; }
}
