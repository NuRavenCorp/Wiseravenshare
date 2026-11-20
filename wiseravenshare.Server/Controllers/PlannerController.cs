using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Shared;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/planner")]
[Authorize(AuthenticationSchemes = "Identity.Application,Bearer")]
public sealed class PlannerController(
    AppDbContext db,
    ILogger<PlannerController> logger) : ControllerBase
{
    [HttpGet("session-state")]
    public async Task<IActionResult> GetSessionState(CancellationToken ct = default)
    {
        var defaultState = new
        {
            currentView = "timeGridDay",
            focusDateUtc = (DateTime?)null,
            draftJson = (string?)null,
            modalOpen = false,
        };

        try
        {
            var userId = await ResolveUserIdAsync(ct);
            if (userId == Guid.Empty) return Unauthorized();

            var connStr = db.Database.GetConnectionString();
            if (string.IsNullOrWhiteSpace(connStr)) return Ok(defaultState);

            await using var conn = new NpgsqlConnection(connStr);
            await conn.OpenAsync(ct);

            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
SELECT ""CurrentView"", ""FocusDateUtc"", ""DraftJson"", ""ModalOpen""
FROM app_data.""PlannerSessionStates""
WHERE ""UserId"" = @uid AND ""IsDeleted"" = FALSE
LIMIT 1";
            cmd.Parameters.AddWithValue("uid", userId);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            if (!await reader.ReadAsync(ct))
                return Ok(defaultState);

            return Ok(new
            {
                currentView = reader.IsDBNull(0) ? "timeGridDay" : reader.GetString(0),
                focusDateUtc = reader.IsDBNull(1) ? (DateTime?)null : DateTime.SpecifyKind(reader.GetDateTime(1), DateTimeKind.Utc),
                draftJson = reader.IsDBNull(2) ? (string?)null : reader.GetString(2),
                modalOpen = !reader.IsDBNull(3) && reader.GetBoolean(3),
            });
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "PlannerSessionStates read failed; returning default state.");
            return Ok(defaultState);
        }
    }

    [HttpPut("session-state")]
    public async Task<IActionResult> UpsertSessionState([FromBody] PlannerSessionStateUpsertRequest body, CancellationToken ct = default)
    {
        try
        {
            var userId = await ResolveUserIdAsync(ct);
            if (userId == Guid.Empty) return Unauthorized();

            var currentView = string.IsNullOrWhiteSpace(body.CurrentView) ? "timeGridDay" : body.CurrentView.Trim();
            if (currentView.Length > 50)
                return BadRequest(new { message = "CurrentView exceeds the 50 character limit." });

            var connStr = db.Database.GetConnectionString();
            if (string.IsNullOrWhiteSpace(connStr)) return NoContent();

            await using var conn = new NpgsqlConnection(connStr);
            await conn.OpenAsync(ct);

            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
INSERT INTO app_data.""PlannerSessionStates"" (""Id"", ""UserId"", ""CurrentView"", ""FocusDateUtc"", ""DraftJson"", ""ModalOpen"", ""CreatedAt"", ""UpdatedAt"", ""IsDeleted"")
VALUES (gen_random_uuid(), @uid, @view, @focus, @draft, @modal, NOW(), NOW(), FALSE)
ON CONFLICT (""UserId"") DO UPDATE
    SET ""CurrentView"" = EXCLUDED.""CurrentView"",
        ""FocusDateUtc"" = EXCLUDED.""FocusDateUtc"",
        ""DraftJson"" = EXCLUDED.""DraftJson"",
        ""ModalOpen"" = EXCLUDED.""ModalOpen"",
        ""UpdatedAt"" = NOW()";

            cmd.Parameters.AddWithValue("uid", userId);
            cmd.Parameters.AddWithValue("view", currentView);
            cmd.Parameters.Add(new NpgsqlParameter("focus", NpgsqlDbType.TimestampTz) { Value = body.FocusDateUtc.HasValue ? (object)body.FocusDateUtc.Value.ToUniversalTime() : DBNull.Value });
            cmd.Parameters.Add(new NpgsqlParameter("draft", NpgsqlDbType.Text) { Value = string.IsNullOrWhiteSpace(body.DraftJson) ? (object)DBNull.Value : body.DraftJson });
            cmd.Parameters.AddWithValue("modal", body.ModalOpen);

            await cmd.ExecuteNonQueryAsync(ct);
            return NoContent();
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to upsert planner session state.");
            return NoContent();
        }
    }

    [HttpGet]
    public async Task<IActionResult> GetAppointments([FromQuery] DateTimeOffset? start, [FromQuery] DateTimeOffset? end, CancellationToken ct = default)
    {
        var userId = await ResolveUserIdAsync(ct);
        if (userId == Guid.Empty) return Unauthorized();

        var from = (start ?? DateTimeOffset.UtcNow.AddMonths(-1)).UtcDateTime;
        var to = (end ?? DateTimeOffset.UtcNow.AddMonths(2)).UtcDateTime;

        var events = await db.Appointments
            .Where(a => a.UserId == userId
                     && !a.IsDeleted
                     && a.StartUtc < to
                     && a.EndUtc > from)
            .OrderBy(a => a.StartUtc)
            .Select(a => new
            {
                id = a.Id.ToString(),
                title = a.Title,
                start = DateTime.SpecifyKind(a.StartUtc, DateTimeKind.Utc),
                end = DateTime.SpecifyKind(a.EndUtc, DateTimeKind.Utc),
                backgroundColor = a.Color,
                borderColor = a.Color,
                extendedProps = new
                {
                    description = a.Description,
                    reminderMinutesBefore = a.ReminderMinutesBefore,
                    alertDismissed = a.AlertDismissed,
                },
            })
            .ToListAsync(ct);

        return Ok(events);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] PlannerAppointmentRequest body, CancellationToken ct = default)
    {
        var userId = await ResolveUserIdAsync(ct);
        if (userId == Guid.Empty) return Unauthorized();

        if (string.IsNullOrWhiteSpace(body.Title))
            return BadRequest(new { message = "Title is required." });
        if (body.EndUtc <= body.StartUtc)
            return BadRequest(new { message = "End time must be after start time." });
        if (body.ReminderMinutesBefore < 0)
            return BadRequest(new { message = "Reminder must be zero or greater." });

        var entity = new Appointment
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Title = body.Title.Trim(),
            Description = body.Description?.Trim(),
            StartUtc = ToUtcDt(body.StartUtc),
            EndUtc = ToUtcDt(body.EndUtc),
            ReminderMinutesBefore = body.ReminderMinutesBefore,
            Color = string.IsNullOrWhiteSpace(body.Color) ? "#3788d8" : body.Color,
            AlertDismissed = false,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };

        db.Appointments.Add(entity);
        await db.SaveChangesAsync(ct);

        return CreatedAtAction(nameof(GetById), new { id = entity.Id }, MapDto(entity));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct = default)
    {
        var userId = await ResolveUserIdAsync(ct);
        if (userId == Guid.Empty) return Unauthorized();

        var entity = await db.Appointments.FirstOrDefaultAsync(a => a.Id == id && a.UserId == userId && !a.IsDeleted, ct);
        if (entity is null) return NotFound();
        return Ok(MapDto(entity));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] PlannerAppointmentRequest body, CancellationToken ct = default)
    {
        var userId = await ResolveUserIdAsync(ct);
        if (userId == Guid.Empty) return Unauthorized();

        var entity = await db.Appointments.FirstOrDefaultAsync(a => a.Id == id && a.UserId == userId && !a.IsDeleted, ct);
        if (entity is null) return NotFound();

        entity.Title = body.Title.Trim();
        entity.Description = body.Description?.Trim();
        entity.StartUtc = ToUtcDt(body.StartUtc);
        entity.EndUtc = ToUtcDt(body.EndUtc);
        entity.ReminderMinutesBefore = body.ReminderMinutesBefore;
        entity.Color = string.IsNullOrWhiteSpace(body.Color) ? entity.Color : body.Color;
        entity.UpdatedAt = DateTime.UtcNow;

        if (entity.StartUtc > DateTime.UtcNow)
            entity.AlertDismissed = false;

        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpPatch("{id:guid}/dismiss-alert")]
    public async Task<IActionResult> DismissAlert(Guid id, CancellationToken ct = default)
    {
        var userId = await ResolveUserIdAsync(ct);
        if (userId == Guid.Empty) return Unauthorized();

        var entity = await db.Appointments.FirstOrDefaultAsync(a => a.Id == id && a.UserId == userId && !a.IsDeleted, ct);
        if (entity is null) return NotFound();

        entity.AlertDismissed = true;
        entity.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct = default)
    {
        var userId = await ResolveUserIdAsync(ct);
        if (userId == Guid.Empty) return Unauthorized();

        var entity = await db.Appointments.FirstOrDefaultAsync(a => a.Id == id && a.UserId == userId && !a.IsDeleted, ct);
        if (entity is null) return NotFound();

        entity.IsDeleted = true;
        entity.DeletedAt = DateTime.UtcNow;
        entity.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private static DateTime ToUtcDt(DateTimeOffset dto) => DateTime.SpecifyKind(dto.UtcDateTime, DateTimeKind.Utc);

    private static object MapDto(Appointment a) => new
    {
        id = a.Id.ToString(),
        title = a.Title,
        start = DateTime.SpecifyKind(a.StartUtc, DateTimeKind.Utc),
        end = DateTime.SpecifyKind(a.EndUtc, DateTimeKind.Utc),
        backgroundColor = a.Color,
        borderColor = a.Color,
        extendedProps = new
        {
            description = a.Description,
            reminderMinutesBefore = a.ReminderMinutesBefore,
            alertDismissed = a.AlertDismissed,
        },
    };

    private async Task<Guid> ResolveUserIdAsync(CancellationToken ct)
    {
        const int maxUsernameLength = 100;
        const int maxDisplayNameLength = 200;

        var email = User.FindFirstValue(ClaimTypes.Email)
            ?? User.FindFirstValue(JwtRegisteredClaimNames.Email)
            ?? User.FindFirstValue("email");

        if (!string.IsNullOrWhiteSpace(email))
        {
            var normalizedEmail = email.Trim();
            var lowerEmail = normalizedEmail.ToLowerInvariant();

            var existingByEmail = await db.Users
                .Where(u => u.Email.ToLower() == lowerEmail)
                .Select(u => new { u.Id, u.Username })
                .FirstOrDefaultAsync(ct);

            if (existingByEmail is not null)
            {
                return existingByEmail.Id;
            }

            var preferredId = User.GetUserId();
            var userId = preferredId != Guid.Empty ? preferredId : Guid.NewGuid();
            var baseUsernameRaw = normalizedEmail.Split('@')[0];
            var baseUsername = new string(baseUsernameRaw.Where(char.IsLetterOrDigit).ToArray()).ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(baseUsername))
            {
                baseUsername = $"user{userId.ToString("N")[..8]}";
            }
            if (baseUsername.Length > maxUsernameLength)
            {
                baseUsername = baseUsername[..maxUsernameLength];
            }

            var username = baseUsername;
            var suffix = 0;
            while (await db.Users.AnyAsync(u => u.Username.ToLower() == username.ToLower(), ct))
            {
                suffix++;
                var suffixText = suffix.ToString();
                var maxStemLength = Math.Max(1, maxUsernameLength - suffixText.Length);
                var stem = baseUsername.Length > maxStemLength ? baseUsername[..maxStemLength] : baseUsername;
                username = $"{stem}{suffixText}";
            }

            var displayName = string.IsNullOrWhiteSpace(baseUsernameRaw) ? username : baseUsernameRaw.Trim();
            if (displayName.Length > maxDisplayNameLength)
            {
                displayName = displayName[..maxDisplayNameLength];
            }

            var newUser = new User
            {
                Id = userId,
                Email = normalizedEmail,
                Username = username,
                DisplayName = displayName,
                PasswordHash = string.Empty,
                IsActive = true,
                TruthScore = 50.00m,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            };

            try
            {
                db.Users.Add(newUser);
                await db.SaveChangesAsync(ct);
                return newUser.Id;
            }
            catch (DbUpdateException)
            {
                var recovered = await db.Users
                    .AsNoTracking()
                    .Where(u => u.Email.ToLower() == lowerEmail)
                    .Select(u => u.Id)
                    .FirstOrDefaultAsync(ct);
                if (recovered != Guid.Empty)
                {
                    return recovered;
                }

                logger.LogWarning("Unable to provision planner user record for {Email}. Falling back to claim lookup.", normalizedEmail);
            }
        }

        var claimUserId = User.GetUserId();
        if (claimUserId != Guid.Empty)
        {
            var exists = await db.Users
                .AsNoTracking()
                .AnyAsync(u => u.Id == claimUserId, ct);
            if (exists)
            {
                return claimUserId;
            }
        }

        return Guid.Empty;
    }
}

public sealed class PlannerAppointmentRequest
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTimeOffset StartUtc { get; set; }
    public DateTimeOffset EndUtc { get; set; }
    public int ReminderMinutesBefore { get; set; } = 15;
    public string Color { get; set; } = "#3788d8";
}

public sealed class PlannerSessionStateUpsertRequest
{
    public string? CurrentView { get; set; }
    public DateTime? FocusDateUtc { get; set; }
    public string? DraftJson { get; set; }
    public bool ModalOpen { get; set; }
}

