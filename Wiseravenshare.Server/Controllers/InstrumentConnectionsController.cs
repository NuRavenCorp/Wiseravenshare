using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.DTOs;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Shared;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public sealed class InstrumentConnectionsController : ControllerBase
{
    private readonly AppDbContext _dbContext;
    private readonly ILogger<InstrumentConnectionsController> _logger;

    public InstrumentConnectionsController(AppDbContext dbContext, ILogger<InstrumentConnectionsController> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    [HttpGet]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<InstrumentConnectionResponse>>> GetMyConnections(CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        var items = await _dbContext.Set<InstrumentConnection>()
            .AsNoTracking()
            .Where(x => x.UserId == userId && !x.IsDeleted)
            .OrderByDescending(x => x.LastSeenAtUtc)
            .Select(x => ToResponse(x))
            .ToListAsync(cancellationToken);

        return Ok(items);
    }

    [HttpPost]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<InstrumentConnectionResponse>> UpsertConnection(
        [FromBody] UpsertInstrumentConnectionRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.DeviceIdentifier))
        {
            return BadRequest(new { message = "DeviceIdentifier is required." });
        }

        if (string.IsNullOrWhiteSpace(request.DeviceName))
        {
            return BadRequest(new { message = "DeviceName is required." });
        }

        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        var normalizedTransport = NormalizeTransport(request.Transport);
        var normalizedIdentifier = request.DeviceIdentifier.Trim();

        var entity = await _dbContext.Set<InstrumentConnection>()
            .FirstOrDefaultAsync(
                x => x.UserId == userId && x.DeviceIdentifier == normalizedIdentifier,
                cancellationToken);

        if (entity == null)
        {
            entity = new InstrumentConnection
            {
                UserId = userId,
                DeviceIdentifier = normalizedIdentifier,
                CreatedAt = DateTime.UtcNow
            };
            _dbContext.Set<InstrumentConnection>().Add(entity);
        }

        entity.DeviceName = request.DeviceName.Trim();
        entity.Transport = normalizedTransport;
        entity.HardwareAddress = string.IsNullOrWhiteSpace(request.HardwareAddress) ? null : request.HardwareAddress.Trim();
        entity.IsPaired = request.IsPaired;
        entity.IsTrusted = request.IsTrusted;
        entity.IsActive = true;
        entity.MetadataJson = string.IsNullOrWhiteSpace(request.MetadataJson) ? null : request.MetadataJson.Trim();
        entity.LastSeenAtUtc = DateTime.UtcNow;
        entity.IsDeleted = false;
        entity.DeletedAt = null;
        entity.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Instrument connection upserted for user {UserId} and device {DeviceIdentifier}", userId, normalizedIdentifier);
        return Ok(ToResponse(entity));
    }

    [HttpPost("bluetooth/pair")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public Task<ActionResult<InstrumentConnectionResponse>> RegisterBluetoothPair(
        [FromBody] RegisterBluetoothPairRequest request,
        CancellationToken cancellationToken)
    {
        return UpsertConnection(new UpsertInstrumentConnectionRequest
        {
            DeviceIdentifier = request.DeviceIdentifier,
            DeviceName = request.DeviceName,
            HardwareAddress = request.HardwareAddress,
            MetadataJson = request.MetadataJson,
            Transport = "bluetooth",
            IsPaired = true,
            IsTrusted = true
        }, cancellationToken);
    }

    [HttpPost("{id:guid}/heartbeat")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Heartbeat(Guid id, CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        var entity = await _dbContext.Set<InstrumentConnection>()
            .FirstOrDefaultAsync(x => x.Id == id && x.UserId == userId && !x.IsDeleted, cancellationToken);

        if (entity == null)
        {
            return NotFound(new { message = "Instrument connection not found." });
        }

        entity.IsActive = true;
        entity.LastSeenAtUtc = DateTime.UtcNow;
        entity.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync(cancellationToken);
        return Ok();
    }

    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> RemoveConnection(Guid id, CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        var entity = await _dbContext.Set<InstrumentConnection>()
            .FirstOrDefaultAsync(x => x.Id == id && x.UserId == userId && !x.IsDeleted, cancellationToken);

        if (entity == null)
        {
            return NotFound(new { message = "Instrument connection not found." });
        }

        entity.IsActive = false;
        entity.IsDeleted = true;
        entity.DeletedAt = DateTime.UtcNow;
        entity.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    private static InstrumentConnectionResponse ToResponse(InstrumentConnection x)
    {
        return new InstrumentConnectionResponse
        {
            Id = x.Id,
            DeviceIdentifier = x.DeviceIdentifier,
            DeviceName = x.DeviceName,
            Transport = x.Transport,
            HardwareAddress = x.HardwareAddress,
            IsPaired = x.IsPaired,
            IsTrusted = x.IsTrusted,
            IsActive = x.IsActive,
            LastSeenAtUtc = x.LastSeenAtUtc,
            CreatedAt = x.CreatedAt,
            UpdatedAt = x.UpdatedAt,
            MetadataJson = x.MetadataJson
        };
    }

    private static string NormalizeTransport(string? transport)
    {
        var value = string.IsNullOrWhiteSpace(transport)
            ? "wired"
            : transport.Trim().ToLowerInvariant();

        return value switch
        {
            "bluetooth" => "bluetooth",
            "usb" => "usb",
            "network" => "network",
            "wired" => "wired",
            _ => "wired"
        };
    }
}
