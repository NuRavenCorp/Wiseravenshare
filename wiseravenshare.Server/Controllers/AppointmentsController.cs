using System.Collections.Concurrent;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Shared;

namespace Wiseravenshare.Server.Controllers;

/// <summary>
/// Calendar appointment CRUD for the Daily Planner.
/// Knitted seamlessly to WiseRavenShare's unified authentication flow
/// (JWT Bearer tokens, Identity cookies, and cookie authentication).
/// All times are stored and returned in UTC; the browser converts to local.
///
/// Routes:
///   GET    /api/planner?start=&amp;end=         – list in date window
///   POST   /api/planner                      – create
///   PUT    /api/planner/{id}                 – edit / drag-drop / resize
///   PATCH  /api/planner/{id}/dismiss-alert   – mark alert dismissed
///   DELETE /api/planner/{id}                 – delete
/// </summary>
[ApiController]
[Route("api/appointments")]
[Route("api/planner")]
[Authorize(AuthenticationSchemes = $"{UnifiedAuthExtensions.UnifiedAuthScheme},{JwtBearerDefaults.AuthenticationScheme},Identity.Application,{CookieAuthenticationDefaults.AuthenticationScheme}")]
public sealed class AppointmentsController(
    AppDbContext db,
    ILogger<AppointmentsController> logger) : ControllerBase
{
    private static readonly ConcurrentDictionary<Guid, Appointment> InMemoryAppointments = new();
    private static readonly ConcurrentDictionary<Guid, PlannerSessionStateRequest> InMemorySessionStates = new();

    // ── Session State ─────────────────────────────────────────────────────

    [HttpGet("session-state")]
    public async Task<IActionResult> GetSessionState(CancellationToken ct = default)
    {
        var defaultState = new
        {
            currentView = "timeGridDay",
            focusDateUtc = (DateTime?)null,
            draftJson = (string?)null,
            modalOpen = false
        };

        try
        {
            var userId = await ResolveUserIdAsync(ct);
            if (userId == Guid.Empty) return Unauthorized();

            var connStr = db.Database.GetConnectionString();
            if (string.IsNullOrWhiteSpace(connStr))
            {
                if (InMemorySessionStates.TryGetValue(userId, out var memState))
                {
                    return Ok(new
                    {
                        currentView = memState.CurrentView ?? "timeGridDay",
                        focusDateUtc = memState.FocusDateUtc,
                        draftJson = memState.DraftJson,
                        modalOpen = memState.ModalOpen
                    });
                }
                return Ok(defaultState);
            }

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
                modalOpen = !reader.IsDBNull(3) && reader.GetBoolean(3)
            });
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "PlannerSessionStates read failed; returning default state.");
            return Ok(defaultState);
        }
    }

    [HttpPut("session-state")]
    public async Task<IActionResult> UpsertSessionState(
        [FromBody] PlannerSessionStateRequest body,
        CancellationToken ct = default)
    {
        try
        {
            var userId = await ResolveUserIdAsync(ct);
            if (userId == Guid.Empty) return Unauthorized();

            var currentView = string.IsNullOrWhiteSpace(body.CurrentView) ? "timeGridDay" : body.CurrentView.Trim();
            if (currentView.Length > 50)
                return BadRequest(new { message = "CurrentView exceeds the 50 character limit." });

            InMemorySessionStates[userId] = body;

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

    // ── List (date-range) ─────────────────────────────────────────────────

    [HttpGet]
    public async Task<IActionResult> GetAppointments(
        [FromQuery] DateTimeOffset? start,
        [FromQuery] DateTimeOffset? end,
        CancellationToken ct = default)
    {
        var userId = await ResolveUserIdAsync(ct);
        if (userId == Guid.Empty) return Unauthorized();

        var from = (start ?? DateTimeOffset.UtcNow.AddMonths(-1)).UtcDateTime;
        var to   = (end   ?? DateTimeOffset.UtcNow.AddMonths(2)).UtcDateTime;

        var connStr = db.Database.GetConnectionString();
        if (string.IsNullOrWhiteSpace(connStr))
        {
            var memEvents = InMemoryAppointments.Values
                .Where(a => a.UserId == userId && !a.IsDeleted && a.StartUtc < to && a.EndUtc > from)
                .OrderBy(a => a.StartUtc)
                .Select(MapDto)
                .ToList();
            return Ok(memEvents);
        }

        try
        {
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
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Database query for appointments failed; falling back to in-memory store.");
            var fallbackEvents = InMemoryAppointments.Values
                .Where(a => a.UserId == userId && !a.IsDeleted && a.StartUtc < to && a.EndUtc > from)
                .OrderBy(a => a.StartUtc)
                .Select(MapDto)
                .ToList();
            return Ok(fallbackEvents);
        }
    }

    // ── Create ────────────────────────────────────────────────────────────

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] AppointmentRequest body, CancellationToken ct = default)
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
            Id                    = Guid.NewGuid(),
            UserId                = userId,
            Title                 = body.Title.Trim(),
            Description           = body.Description?.Trim(),
            StartUtc              = ToUtcDt(body.StartUtc),
            EndUtc                = ToUtcDt(body.EndUtc),
            ReminderMinutesBefore = body.ReminderMinutesBefore,
            Color                 = string.IsNullOrWhiteSpace(body.Color) ? "#3788d8" : body.Color,
            AlertDismissed        = false,
            CreatedAt             = DateTime.UtcNow,
            UpdatedAt             = DateTime.UtcNow,
        };

        var connStr = db.Database.GetConnectionString();
        if (string.IsNullOrWhiteSpace(connStr))
        {
            InMemoryAppointments[entity.Id] = entity;
            logger.LogInformation("Appointment {Id} created in memory for user {UserId}", entity.Id, userId);
            return CreatedAtAction(nameof(GetById), new { id = entity.Id }, MapDto(entity));
        }

        try
        {
            db.Appointments.Add(entity);
            await db.SaveChangesAsync(ct);
            logger.LogInformation("Appointment {Id} created in DB by user {UserId}", entity.Id, userId);
            return CreatedAtAction(nameof(GetById), new { id = entity.Id }, MapDto(entity));
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "EF save failed for appointment {Id}; attempting direct SQL fallback.", entity.Id);
            try { db.Entry(entity).State = EntityState.Detached; } catch { }

            try
            {
                await using var conn = new NpgsqlConnection(connStr);
                await conn.OpenAsync(ct);
                await using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
INSERT INTO app_data.""Appointments"" (""Id"", ""UserId"", ""Title"", ""Description"", ""StartUtc"", ""EndUtc"", ""ReminderMinutesBefore"", ""AlertDismissed"", ""Color"", ""CreatedAt"", ""UpdatedAt"", ""IsDeleted"")
VALUES (@id, @uid, @title, @desc, @start, @end, @reminder, @alert, @color, @created, @updated, FALSE)
ON CONFLICT (""Id"") DO UPDATE SET ""Title"" = EXCLUDED.""Title"", ""UpdatedAt"" = NOW();";
                cmd.Parameters.AddWithValue("id", entity.Id);
                cmd.Parameters.AddWithValue("uid", entity.UserId);
                cmd.Parameters.AddWithValue("title", entity.Title);
                cmd.Parameters.Add(new NpgsqlParameter("desc", NpgsqlDbType.Text) { Value = (object?)entity.Description ?? DBNull.Value });
                cmd.Parameters.Add(new NpgsqlParameter("start", NpgsqlDbType.TimestampTz) { Value = entity.StartUtc });
                cmd.Parameters.Add(new NpgsqlParameter("end", NpgsqlDbType.TimestampTz) { Value = entity.EndUtc });
                cmd.Parameters.AddWithValue("reminder", entity.ReminderMinutesBefore);
                cmd.Parameters.AddWithValue("alert", entity.AlertDismissed);
                cmd.Parameters.AddWithValue("color", entity.Color);
                cmd.Parameters.Add(new NpgsqlParameter("created", NpgsqlDbType.TimestampTz) { Value = entity.CreatedAt });
                cmd.Parameters.Add(new NpgsqlParameter("updated", NpgsqlDbType.TimestampTz) { Value = entity.UpdatedAt });
                await cmd.ExecuteNonQueryAsync(ct);

                return CreatedAtAction(nameof(GetById), new { id = entity.Id }, MapDto(entity));
            }
            catch (Exception sqlEx)
            {
                logger.LogWarning(sqlEx, "Direct SQL fallback insert also failed for appointment {Id}; saving in memory.", entity.Id);
                InMemoryAppointments[entity.Id] = entity;
                return CreatedAtAction(nameof(GetById), new { id = entity.Id }, MapDto(entity));
            }
        }
    }

    // ── Get single (used by CreatedAtAction) ──────────────────────────────

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct = default)
    {
        var userId = await ResolveUserIdAsync(ct);
        if (userId == Guid.Empty) return Unauthorized();

        var connStr = db.Database.GetConnectionString();
        if (string.IsNullOrWhiteSpace(connStr))
        {
            if (InMemoryAppointments.TryGetValue(id, out var mem) && mem.UserId == userId && !mem.IsDeleted)
            {
                return Ok(MapDto(mem));
            }
            return NotFound();
        }

        try
        {
            var entity = await db.Appointments.FirstOrDefaultAsync(
                a => a.Id == id && a.UserId == userId && !a.IsDeleted, ct);
            if (entity is not null) return Ok(MapDto(entity));
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to query appointment {Id} from DB", id);
        }

        if (InMemoryAppointments.TryGetValue(id, out var fallback) && fallback.UserId == userId && !fallback.IsDeleted)
        {
            return Ok(MapDto(fallback));
        }

        return NotFound();
    }

    // ── Update (edit, drag-drop, resize) ──────────────────────────────────

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] AppointmentRequest body, CancellationToken ct = default)
    {
        var userId = await ResolveUserIdAsync(ct);
        if (userId == Guid.Empty) return Unauthorized();

        if (InMemoryAppointments.TryGetValue(id, out var mem) && mem.UserId == userId && !mem.IsDeleted)
        {
            mem.Title = body.Title.Trim();
            mem.Description = body.Description?.Trim();
            mem.StartUtc = ToUtcDt(body.StartUtc);
            mem.EndUtc = ToUtcDt(body.EndUtc);
            mem.ReminderMinutesBefore = body.ReminderMinutesBefore;
            mem.Color = string.IsNullOrWhiteSpace(body.Color) ? mem.Color : body.Color;
            mem.UpdatedAt = DateTime.UtcNow;
            if (mem.StartUtc > DateTime.UtcNow) mem.AlertDismissed = false;
        }

        var connStr = db.Database.GetConnectionString();
        if (string.IsNullOrWhiteSpace(connStr)) return NoContent();

        try
        {
            var entity = await db.Appointments.FirstOrDefaultAsync(
                a => a.Id == id && a.UserId == userId && !a.IsDeleted, ct);
            if (entity is not null)
            {
                entity.Title                 = body.Title.Trim();
                entity.Description           = body.Description?.Trim();
                entity.StartUtc              = ToUtcDt(body.StartUtc);
                entity.EndUtc                = ToUtcDt(body.EndUtc);
                entity.ReminderMinutesBefore = body.ReminderMinutesBefore;
                entity.Color                 = string.IsNullOrWhiteSpace(body.Color) ? entity.Color : body.Color;
                entity.UpdatedAt             = DateTime.UtcNow;

                if (entity.StartUtc > DateTime.UtcNow)
                    entity.AlertDismissed = false;

                await db.SaveChangesAsync(ct);
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to update appointment {Id} in DB", id);
        }

        return NoContent();
    }

    // ── Dismiss alert ─────────────────────────────────────────────────────

    [HttpPatch("{id:guid}/dismiss-alert")]
    public async Task<IActionResult> DismissAlert(Guid id, CancellationToken ct = default)
    {
        var userId = await ResolveUserIdAsync(ct);
        if (userId == Guid.Empty) return Unauthorized();

        if (InMemoryAppointments.TryGetValue(id, out var mem) && mem.UserId == userId && !mem.IsDeleted)
        {
            mem.AlertDismissed = true;
            mem.UpdatedAt = DateTime.UtcNow;
        }

        var connStr = db.Database.GetConnectionString();
        if (string.IsNullOrWhiteSpace(connStr)) return NoContent();

        try
        {
            var entity = await db.Appointments.FirstOrDefaultAsync(
                a => a.Id == id && a.UserId == userId && !a.IsDeleted, ct);
            if (entity is not null)
            {
                entity.AlertDismissed = true;
                entity.UpdatedAt      = DateTime.UtcNow;
                await db.SaveChangesAsync(ct);
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to dismiss alert for appointment {Id} in DB", id);
        }

        return NoContent();
    }

    // ── Delete ────────────────────────────────────────────────────────────

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct = default)
    {
        var userId = await ResolveUserIdAsync(ct);
        if (userId == Guid.Empty) return Unauthorized();

        if (InMemoryAppointments.TryGetValue(id, out var mem) && mem.UserId == userId)
        {
            mem.IsDeleted = true;
            mem.DeletedAt = DateTime.UtcNow;
            mem.UpdatedAt = DateTime.UtcNow;
        }

        var connStr = db.Database.GetConnectionString();
        if (string.IsNullOrWhiteSpace(connStr)) return NoContent();

        try
        {
            var entity = await db.Appointments.FirstOrDefaultAsync(
                a => a.Id == id && a.UserId == userId && !a.IsDeleted, ct);
            if (entity is not null)
            {
                entity.IsDeleted = true;
                entity.DeletedAt = DateTime.UtcNow;
                entity.UpdatedAt = DateTime.UtcNow;
                await db.SaveChangesAsync(ct);
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to delete appointment {Id} in DB", id);
        }

        return NoContent();
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private static DateTime ToUtcDt(DateTimeOffset dto) =>
        DateTime.SpecifyKind(dto.UtcDateTime, DateTimeKind.Utc);

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

    private async Task<Guid> ResolveUserIdAsync(CancellationToken ct)
    {
        var claimUserId = User.GetUserId();

        var email = User.FindFirstValue(ClaimTypes.Email)
            ?? User.FindFirstValue(JwtRegisteredClaimNames.Email)
            ?? User.FindFirstValue("email");

        var normalizedEmail = !string.IsNullOrWhiteSpace(email) ? email.Trim() : null;
        var connStr = db.Database.GetConnectionString();

        if (string.IsNullOrWhiteSpace(connStr))
        {
            if (claimUserId != Guid.Empty) return claimUserId;
            if (!string.IsNullOrWhiteSpace(normalizedEmail))
            {
                using var md5 = MD5.Create();
                var hash = md5.ComputeHash(Encoding.UTF8.GetBytes(normalizedEmail.ToLowerInvariant()));
                return new Guid(hash);
            }
            return Guid.NewGuid();
        }

        try
        {
            await using var conn = new NpgsqlConnection(connStr);
            await conn.OpenAsync(ct);

            // A. Check if user already exists in app_data.Users by Id
            if (claimUserId != Guid.Empty)
            {
                await using var checkIdCmd = conn.CreateCommand();
                checkIdCmd.CommandText = @"SELECT ""Id"" FROM app_data.""Users"" WHERE ""Id"" = @uid LIMIT 1;";
                checkIdCmd.Parameters.AddWithValue("uid", claimUserId);
                var existingId = await checkIdCmd.ExecuteScalarAsync(ct);
                if (existingId is Guid gid && gid != Guid.Empty)
                {
                    return gid;
                }
            }

            // B. Check if user already exists by Email
            if (!string.IsNullOrWhiteSpace(normalizedEmail))
            {
                await using var checkEmailCmd = conn.CreateCommand();
                checkEmailCmd.CommandText = @"SELECT ""Id"" FROM app_data.""Users"" WHERE LOWER(""Email"") = LOWER(@em) LIMIT 1;";
                checkEmailCmd.Parameters.AddWithValue("em", normalizedEmail);
                var existingEmailId = await checkEmailCmd.ExecuteScalarAsync(ct);
                if (existingEmailId is Guid gidEmail && gidEmail != Guid.Empty)
                {
                    return gidEmail;
                }
            }

            // C. Insert minimal domain user row so foreign key FK_Appointments_Users_UserId is satisfied
            var targetId = claimUserId != Guid.Empty ? claimUserId : Guid.NewGuid();
            var safeEmail = !string.IsNullOrWhiteSpace(normalizedEmail)
                ? normalizedEmail
                : $"{targetId:N}@local.wiseravenshare.internal";
            var rawUsername = safeEmail.Split('@')[0];
            var sanitizedUsername = new string(rawUsername.Where(char.IsLetterOrDigit).ToArray()).ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(sanitizedUsername)) sanitizedUsername = "user";
            var finalUsername = $"{sanitizedUsername}_{targetId:N}"[..Math.Min(30, $"{sanitizedUsername}_{targetId:N}".Length)];
            var displayName = rawUsername.Length > 0 ? rawUsername : finalUsername;

            await using var insertCmd = conn.CreateCommand();
            insertCmd.CommandText = @"
INSERT INTO app_data.""Users"" (""Id"", ""Email"", ""Username"", ""DisplayName"", ""PasswordHash"", ""IsActive"", ""TruthScore"", ""CreatedAt"", ""UpdatedAt"", ""IsDeleted"")
VALUES (@id, @email, @username, @displayName, '', TRUE, 50.00, NOW(), NOW(), FALSE)
ON CONFLICT (""Id"") DO NOTHING;";
            insertCmd.Parameters.AddWithValue("id", targetId);
            insertCmd.Parameters.AddWithValue("email", safeEmail);
            insertCmd.Parameters.AddWithValue("username", finalUsername);
            insertCmd.Parameters.AddWithValue("displayName", displayName);
            await insertCmd.ExecuteNonQueryAsync(ct);

            // Re-fetch in case ON CONFLICT triggered or user was concurrently inserted
            await using var verifyCmd = conn.CreateCommand();
            verifyCmd.CommandText = @"SELECT ""Id"" FROM app_data.""Users"" WHERE ""Id"" = @id OR LOWER(""Email"") = LOWER(@email) LIMIT 1;";
            verifyCmd.Parameters.AddWithValue("id", targetId);
            verifyCmd.Parameters.AddWithValue("email", safeEmail);
            var verifiedId = await verifyCmd.ExecuteScalarAsync(ct);
            if (verifiedId is Guid vGid && vGid != Guid.Empty)
            {
                return vGid;
            }

            return targetId;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to resolve or provision user in PostgreSQL; falling back to target ID {ClaimUserId}", claimUserId);
            return claimUserId != Guid.Empty ? claimUserId : Guid.NewGuid();
        }
    }
}

/// <summary>Shared request body for create and update.</summary>
public sealed class AppointmentRequest
{
    public string   Title                 { get; set; } = string.Empty;
    public string?  Description           { get; set; }
    public DateTimeOffset StartUtc { get; set; }
    public DateTimeOffset EndUtc { get; set; }
    public int      ReminderMinutesBefore { get; set; } = 15;
    public string   Color                 { get; set; } = "#3788d8";
}

public sealed class PlannerSessionStateRequest
{
    public string? CurrentView { get; set; }
    public DateTime? FocusDateUtc { get; set; }
    public string? DraftJson { get; set; }
    public bool ModalOpen { get; set; }
}
