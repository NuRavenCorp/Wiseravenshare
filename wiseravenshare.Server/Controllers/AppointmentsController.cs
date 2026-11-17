using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Shared;

namespace Wiseravenshare.Server.Controllers;

/// <summary>
/// Calendar appointment CRUD for the Daily Planner.
/// All times are stored and returned in UTC; the browser converts to local.
///
/// Routes:
///   GET    /api/appointments?start=&amp;end=         – list in date window
///   POST   /api/appointments                      – create
///   PUT    /api/appointments/{id}                 – edit / drag-drop / resize
///   PATCH  /api/appointments/{id}/dismiss-alert   – mark alert dismissed
///   DELETE /api/appointments/{id}                 – delete
/// </summary>
[ApiController]
[Route("api/appointments")]
[Authorize]
public sealed class AppointmentsController(
    AppDbContext db,
    ILogger<AppointmentsController> logger) : ControllerBase
{
    // ── List (date-range) ─────────────────────────────────────────────────

    [HttpGet]
    public async Task<IActionResult> GetAppointments(
        [FromQuery] DateTimeOffset? start,
        [FromQuery] DateTimeOffset? end,
        CancellationToken ct = default)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var from = (start ?? DateTimeOffset.UtcNow.AddMonths(-1)).UtcDateTime;
        var to   = (end   ?? DateTimeOffset.UtcNow.AddMonths(2)).UtcDateTime;

        var events = await db.Appointments
            .Where(a => a.UserId == userId
                     && !a.IsDeleted
                     && a.StartUtc < to
                     && a.EndUtc   > from)
            .OrderBy(a => a.StartUtc)
            .Select(a => new
            {
                id              = a.Id.ToString(),
                title           = a.Title,
                start           = DateTime.SpecifyKind(a.StartUtc, DateTimeKind.Utc),
                end             = DateTime.SpecifyKind(a.EndUtc,   DateTimeKind.Utc),
                backgroundColor = a.Color,
                borderColor     = a.Color,
                extendedProps   = new
                {
                    description           = a.Description,
                    reminderMinutesBefore = a.ReminderMinutesBefore,
                    alertDismissed        = a.AlertDismissed,
                }
            })
            .ToListAsync(ct);

        return Ok(events);
    }

    // ── Create ────────────────────────────────────────────────────────────

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] AppointmentRequest body, CancellationToken ct = default)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        if (string.IsNullOrWhiteSpace(body.Title))
            return BadRequest(new { message = "Title is required." });

        var entity = new Appointment
        {
            Id                    = Guid.NewGuid(),
            UserId                = userId,
            Title                 = body.Title.Trim(),
            Description           = body.Description?.Trim(),
            StartUtc              = body.StartUtc.ToUniversalTime(),
            EndUtc                = body.EndUtc.ToUniversalTime(),
            ReminderMinutesBefore = body.ReminderMinutesBefore,
            Color                 = string.IsNullOrWhiteSpace(body.Color) ? "#3788d8" : body.Color,
            AlertDismissed        = false,
            CreatedAt             = DateTime.UtcNow,
            UpdatedAt             = DateTime.UtcNow,
        };

        db.Appointments.Add(entity);
        await db.SaveChangesAsync(ct);

        logger.LogInformation("Appointment {Id} created by user {UserId}", entity.Id, userId);
        return CreatedAtAction(nameof(GetById), new { id = entity.Id }, MapDto(entity));
    }

    // ── Get single (used by CreatedAtAction) ──────────────────────────────

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct = default)
    {
        var userId = User.GetUserId();
        var entity = await db.Appointments.FirstOrDefaultAsync(
            a => a.Id == id && a.UserId == userId && !a.IsDeleted, ct);
        if (entity is null) return NotFound();
        return Ok(MapDto(entity));
    }

    // ── Update (edit, drag-drop, resize) ──────────────────────────────────

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] AppointmentRequest body, CancellationToken ct = default)
    {
        var userId = User.GetUserId();
        var entity = await db.Appointments.FirstOrDefaultAsync(
            a => a.Id == id && a.UserId == userId && !a.IsDeleted, ct);
        if (entity is null) return NotFound();

        entity.Title                 = body.Title.Trim();
        entity.Description           = body.Description?.Trim();
        entity.StartUtc              = body.StartUtc.ToUniversalTime();
        entity.EndUtc                = body.EndUtc.ToUniversalTime();
        entity.ReminderMinutesBefore = body.ReminderMinutesBefore;
        entity.Color                 = string.IsNullOrWhiteSpace(body.Color) ? entity.Color : body.Color;
        entity.UpdatedAt             = DateTime.UtcNow;

        // Reset alert if the appointment was moved into the future
        if (entity.StartUtc > DateTime.UtcNow)
            entity.AlertDismissed = false;

        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ── Dismiss alert ─────────────────────────────────────────────────────

    [HttpPatch("{id:guid}/dismiss-alert")]
    public async Task<IActionResult> DismissAlert(Guid id, CancellationToken ct = default)
    {
        var userId = User.GetUserId();
        var entity = await db.Appointments.FirstOrDefaultAsync(
            a => a.Id == id && a.UserId == userId && !a.IsDeleted, ct);
        if (entity is null) return NotFound();

        entity.AlertDismissed = true;
        entity.UpdatedAt      = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ── Delete ────────────────────────────────────────────────────────────

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct = default)
    {
        var userId = User.GetUserId();
        var entity = await db.Appointments.FirstOrDefaultAsync(
            a => a.Id == id && a.UserId == userId && !a.IsDeleted, ct);
        if (entity is null) return NotFound();

        entity.IsDeleted  = true;
        entity.DeletedAt  = DateTime.UtcNow;
        entity.UpdatedAt  = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private static object MapDto(Appointment a) => new
    {
        id              = a.Id.ToString(),
        title           = a.Title,
        start           = DateTime.SpecifyKind(a.StartUtc, DateTimeKind.Utc),
        end             = DateTime.SpecifyKind(a.EndUtc,   DateTimeKind.Utc),
        backgroundColor = a.Color,
        borderColor     = a.Color,
        extendedProps   = new
        {
            description           = a.Description,
            reminderMinutesBefore = a.ReminderMinutesBefore,
            alertDismissed        = a.AlertDismissed,
        }
    };
}

/// <summary>Shared request body for create and update.</summary>
public sealed class AppointmentRequest
{
    public string   Title                 { get; set; } = string.Empty;
    public string?  Description           { get; set; }
    public DateTime StartUtc              { get; set; }
    public DateTime EndUtc                { get; set; }
    public int      ReminderMinutesBefore { get; set; } = 15;
    public string   Color                 { get; set; } = "#3788d8";
}
