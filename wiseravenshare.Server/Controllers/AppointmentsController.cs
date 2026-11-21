using System.Collections.Concurrent;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Services;
using Wiseravenshare.Server.Shared;

namespace Wiseravenshare.Server.Controllers;

/// <summary>
/// Calendar appointment CRUD for the Daily Planner.
/// Knitted seamlessly to WiseRavenShare's unified authentication flow
/// (JWT Bearer tokens, Identity cookies, and cookie authentication).
/// Supports dual persistence: PostgreSQL when available, and durable file-backed local storage
/// (App_Data/planner_appointments.json) for development and offline resilience.
///
/// Routes:
///   GET    /api/planner?start=&amp;end=&amp;all=   – list in date window or all
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
    ILogger<AppointmentsController> logger,
    IWebHostEnvironment environment,
    UserStore userStore) : ControllerBase
{
    private static readonly ConcurrentDictionary<Guid, Appointment> InMemoryAppointments = new();
    private static readonly ConcurrentDictionary<Guid, PlannerSessionStateRequest> InMemorySessionStates = new();
    private static readonly object StorageLock = new();
    private static bool _storageLoaded;
    private static string? _appDataDirectory;

    private string ResolveAppDataDir()
    {
        if (_appDataDirectory is not null && Directory.Exists(_appDataDirectory)) return _appDataDirectory;

        // 1. Prefer environment.ContentRootPath / App_Data (persists across builds)
        var contentRoot = environment?.ContentRootPath;
        if (!string.IsNullOrWhiteSpace(contentRoot))
        {
            var contentDir = Path.Combine(contentRoot, "App_Data");
            if (Directory.Exists(contentDir))
            {
                _appDataDirectory = contentDir;
                return _appDataDirectory;
            }
        }

        // 2. Base directory
        var baseDir = AppDomain.CurrentDomain.BaseDirectory;
        var dir = Path.Combine(baseDir, "App_Data");
        if (!Directory.Exists(dir))
        {
            try { Directory.CreateDirectory(dir); } catch { }
        }
        _appDataDirectory = dir;
        return _appDataDirectory;
    }

    private void EnsureStorageLoaded()
    {
        if (_storageLoaded) return;
        lock (StorageLock)
        {
            if (_storageLoaded) return;
            try
            {
                var candidateDirs = new List<string>();
                var primaryDir = ResolveAppDataDir();
                if (!string.IsNullOrWhiteSpace(primaryDir)) candidateDirs.Add(primaryDir);

                if (!string.IsNullOrWhiteSpace(environment?.ContentRootPath))
                {
                    var cDir = Path.Combine(environment.ContentRootPath, "App_Data");
                    if (!candidateDirs.Contains(cDir, StringComparer.OrdinalIgnoreCase)) candidateDirs.Add(cDir);
                }

                var bDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "App_Data");
                if (!candidateDirs.Contains(bDir, StringComparer.OrdinalIgnoreCase)) candidateDirs.Add(bDir);

                // Load appointments from first available candidate file
                foreach (var dir in candidateDirs)
                {
                    var apptFile = Path.Combine(dir, "planner_appointments.json");
                    if (System.IO.File.Exists(apptFile))
                    {
                        var json = System.IO.File.ReadAllText(apptFile);
                        var list = JsonSerializer.Deserialize<List<AppointmentPersistDto>>(json);
                        if (list is not null)
                        {
                            foreach (var item in list)
                            {
                                var appt = new Appointment
                                {
                                    Id = item.Id,
                                    UserId = item.UserId,
                                    UserEmail = item.UserEmail,
                                    Title = item.Title,
                                    Description = item.Description,
                                    StartUtc = item.StartUtc,
                                    EndUtc = item.EndUtc,
                                    ReminderMinutesBefore = item.ReminderMinutesBefore,
                                    AlertDismissed = item.AlertDismissed,
                                    Color = item.Color,
                                    CreatedAt = item.CreatedAt,
                                    UpdatedAt = item.UpdatedAt,
                                    IsDeleted = item.IsDeleted
                                };
                                InMemoryAppointments[appt.Id] = appt;
                            }
                            logger.LogInformation("Loaded {Count} planner appointments from {Path}", list.Count, apptFile);
                            break;
                        }
                    }
                }

                // Load session states
                foreach (var dir in candidateDirs)
                {
                    var stateFile = Path.Combine(dir, "planner_session_state.json");
                    if (System.IO.File.Exists(stateFile))
                    {
                        var json = System.IO.File.ReadAllText(stateFile);
                        var dict = JsonSerializer.Deserialize<Dictionary<Guid, PlannerSessionStateRequest>>(json);
                        if (dict is not null)
                        {
                            foreach (var kvp in dict)
                            {
                                InMemorySessionStates[kvp.Key] = kvp.Value;
                            }
                            break;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to load persisted planner storage from disk.");
            }

            _storageLoaded = true;
        }
    }

    private void PersistStorageToFile()
    {
        try
        {
            lock (StorageLock)
            {
                var list = InMemoryAppointments.Values
                    .Select(a => new AppointmentPersistDto
                    {
                        Id = a.Id,
                        UserId = a.UserId,
                        UserEmail = a.UserEmail ?? string.Empty,
                        Title = a.Title,
                        Description = a.Description,
                        StartUtc = a.StartUtc,
                        EndUtc = a.EndUtc,
                        ReminderMinutesBefore = a.ReminderMinutesBefore,
                        AlertDismissed = a.AlertDismissed,
                        Color = a.Color,
                        CreatedAt = a.CreatedAt,
                        UpdatedAt = a.UpdatedAt,
                        IsDeleted = a.IsDeleted
                    })
                    .ToList();

                var apptJson = JsonSerializer.Serialize(list, new JsonSerializerOptions { WriteIndented = true });
                var stateJson = JsonSerializer.Serialize(InMemorySessionStates, new JsonSerializerOptions { WriteIndented = true });

                var targetDir = ResolveAppDataDir();
                if (!Directory.Exists(targetDir)) Directory.CreateDirectory(targetDir);

                System.IO.File.WriteAllText(Path.Combine(targetDir, "planner_appointments.json"), apptJson);
                System.IO.File.WriteAllText(Path.Combine(targetDir, "planner_session_state.json"), stateJson);

                if (!string.IsNullOrWhiteSpace(environment?.ContentRootPath))
                {
                    var contentDir = Path.Combine(environment.ContentRootPath, "App_Data");
                    if (!string.Equals(targetDir, contentDir, StringComparison.OrdinalIgnoreCase))
                    {
                        if (!Directory.Exists(contentDir)) Directory.CreateDirectory(contentDir);
                        System.IO.File.WriteAllText(Path.Combine(contentDir, "planner_appointments.json"), apptJson);
                        System.IO.File.WriteAllText(Path.Combine(contentDir, "planner_session_state.json"), stateJson);
                    }
                }
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to persist planner storage to disk.");
        }
    }

    // ── Session State ─────────────────────────────────────────────────────

    [HttpGet("session-state")]
    public async Task<IActionResult> GetSessionState(CancellationToken ct = default)
    {
        EnsureStorageLoaded();
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
            {
                if (InMemorySessionStates.TryGetValue(userId, out var memFallback))
                {
                    return Ok(new
                    {
                        currentView = memFallback.CurrentView ?? "timeGridDay",
                        focusDateUtc = memFallback.FocusDateUtc,
                        draftJson = memFallback.DraftJson,
                        modalOpen = memFallback.ModalOpen
                    });
                }
                return Ok(defaultState);
            }

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
        EnsureStorageLoaded();
        try
        {
            var userId = await ResolveUserIdAsync(ct);
            if (userId == Guid.Empty) return Unauthorized();

            var currentView = string.IsNullOrWhiteSpace(body.CurrentView) ? "timeGridDay" : body.CurrentView.Trim();
            if (currentView.Length > 50)
                return BadRequest(new { message = "CurrentView exceeds the 50 character limit." });

            InMemorySessionStates[userId] = body;
            PersistStorageToFile();

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

    // ── List (date-range or all) ──────────────────────────────────────────

    [HttpGet]
    public async Task<IActionResult> GetAppointments(
        [FromQuery] DateTimeOffset? start,
        [FromQuery] DateTimeOffset? end,
        [FromQuery] bool? all,
        CancellationToken ct = default)
    {
        EnsureStorageLoaded();
        var userId = await ResolveUserIdAsync(ct);
        if (userId == Guid.Empty) return Unauthorized();

        var userEmail = User.FindFirstValue(ClaimTypes.Email)
            ?? User.FindFirstValue(JwtRegisteredClaimNames.Email)
            ?? User.FindFirstValue("email")
            ?? string.Empty;

        var hasWindow = (all != true) && start.HasValue && end.HasValue;
        var from = (start ?? DateTimeOffset.UtcNow.AddYears(-2)).UtcDateTime;
        var to   = (end   ?? DateTimeOffset.UtcNow.AddYears(5)).UtcDateTime;

        var merged = new Dictionary<Guid, Appointment>();

        // 1. Load from durable in-memory / file cache
        foreach (var appt in InMemoryAppointments.Values)
        {
            var matchesUser = appt.UserId == userId ||
                (!string.IsNullOrWhiteSpace(userEmail) && !string.IsNullOrWhiteSpace(appt.UserEmail) &&
                 string.Equals(appt.UserEmail, userEmail, StringComparison.OrdinalIgnoreCase));

            if (matchesUser && !appt.IsDeleted)
            {
                if (!hasWindow || (appt.StartUtc < to && appt.EndUtc > from))
                {
                    merged[appt.Id] = appt;
                }
            }
        }

        // 2. Query database if available and merge
        var connStr = db.Database.GetConnectionString();
        if (!string.IsNullOrWhiteSpace(connStr))
        {
            try
            {
                var query = db.Appointments
                    .AsNoTracking()
                    .Where(a => a.UserId == userId && !a.IsDeleted);

                if (hasWindow)
                {
                    query = query.Where(a => a.StartUtc < to && a.EndUtc > from);
                }

                var dbList = await query
                    .OrderBy(a => a.StartUtc)
                    .ToListAsync(ct);

                foreach (var appt in dbList)
                {
                    if (string.IsNullOrWhiteSpace(appt.UserEmail) && !string.IsNullOrWhiteSpace(userEmail))
                    {
                        appt.UserEmail = userEmail;
                    }
                    merged[appt.Id] = appt;
                    InMemoryAppointments[appt.Id] = appt;
                }
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Database query for appointments failed; using file/memory cache.");
            }
        }

        var result = merged.Values
            .OrderBy(a => a.StartUtc)
            .Select(MapDto)
            .ToList();

        return Ok(result);
    }

    // ── Create ────────────────────────────────────────────────────────────

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] AppointmentRequest body, CancellationToken ct = default)
    {
        EnsureStorageLoaded();
        var userId = await ResolveUserIdAsync(ct);
        if (userId == Guid.Empty) return Unauthorized();

        var userEmail = User.FindFirstValue(ClaimTypes.Email)
            ?? User.FindFirstValue(JwtRegisteredClaimNames.Email)
            ?? User.FindFirstValue("email")
            ?? string.Empty;

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
            UserEmail             = userEmail,
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

        // Always save to in-memory store and persist to file
        InMemoryAppointments[entity.Id] = entity;
        PersistStorageToFile();

        var connStr = db.Database.GetConnectionString();
        if (!string.IsNullOrWhiteSpace(connStr))
        {
            try
            {
                db.Appointments.Add(entity);
                await db.SaveChangesAsync(ct);
                logger.LogInformation("Appointment {Id} created in DB for user {UserId}", entity.Id, userId);
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
                }
                catch (Exception sqlEx)
                {
                    logger.LogWarning(sqlEx, "Direct SQL fallback insert also failed; retained in file-backed storage.");
                }
            }
        }

        return CreatedAtAction(nameof(GetById), new { id = entity.Id }, MapDto(entity));
    }

    // ── Get single (used by CreatedAtAction) ──────────────────────────────

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct = default)
    {
        EnsureStorageLoaded();
        var userId = await ResolveUserIdAsync(ct);
        if (userId == Guid.Empty) return Unauthorized();

        var userEmail = User.FindFirstValue(ClaimTypes.Email)
            ?? User.FindFirstValue(JwtRegisteredClaimNames.Email)
            ?? User.FindFirstValue("email")
            ?? string.Empty;

        if (InMemoryAppointments.TryGetValue(id, out var mem) &&
            (mem.UserId == userId || (!string.IsNullOrWhiteSpace(userEmail) && string.Equals(mem.UserEmail, userEmail, StringComparison.OrdinalIgnoreCase))) &&
            !mem.IsDeleted)
        {
            return Ok(MapDto(mem));
        }

        var connStr = db.Database.GetConnectionString();
        if (!string.IsNullOrWhiteSpace(connStr))
        {
            try
            {
                var entity = await db.Appointments
                    .AsNoTracking()
                    .FirstOrDefaultAsync(a => a.Id == id && a.UserId == userId && !a.IsDeleted, ct);
                if (entity is not null)
                {
                    InMemoryAppointments[entity.Id] = entity;
                    return Ok(MapDto(entity));
                }
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to query appointment {Id} from DB", id);
            }
        }

        return NotFound();
    }

    // ── Update (edit, drag-drop, resize) ──────────────────────────────────

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] AppointmentRequest body, CancellationToken ct = default)
    {
        EnsureStorageLoaded();
        var userId = await ResolveUserIdAsync(ct);
        if (userId == Guid.Empty) return Unauthorized();

        var userEmail = User.FindFirstValue(ClaimTypes.Email)
            ?? User.FindFirstValue(JwtRegisteredClaimNames.Email)
            ?? User.FindFirstValue("email")
            ?? string.Empty;

        if (InMemoryAppointments.TryGetValue(id, out var mem) &&
            (mem.UserId == userId || (!string.IsNullOrWhiteSpace(userEmail) && string.Equals(mem.UserEmail, userEmail, StringComparison.OrdinalIgnoreCase))) &&
            !mem.IsDeleted)
        {
            mem.Title                 = body.Title.Trim();
            mem.Description           = body.Description?.Trim();
            mem.StartUtc              = ToUtcDt(body.StartUtc);
            mem.EndUtc                = ToUtcDt(body.EndUtc);
            mem.ReminderMinutesBefore = body.ReminderMinutesBefore;
            mem.Color                 = string.IsNullOrWhiteSpace(body.Color) ? mem.Color : body.Color;
            mem.UpdatedAt             = DateTime.UtcNow;
            if (string.IsNullOrWhiteSpace(mem.UserEmail) && !string.IsNullOrWhiteSpace(userEmail))
            {
                mem.UserEmail = userEmail;
            }
            if (mem.StartUtc > DateTime.UtcNow) mem.AlertDismissed = false;
            PersistStorageToFile();
        }

        var connStr = db.Database.GetConnectionString();
        if (!string.IsNullOrWhiteSpace(connStr))
        {
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
        }

        return NoContent();
    }

    // ── Dismiss alert ─────────────────────────────────────────────────────

    [HttpPatch("{id:guid}/dismiss-alert")]
    public async Task<IActionResult> DismissAlert(Guid id, CancellationToken ct = default)
    {
        EnsureStorageLoaded();
        var userId = await ResolveUserIdAsync(ct);
        if (userId == Guid.Empty) return Unauthorized();

        var userEmail = User.FindFirstValue(ClaimTypes.Email)
            ?? User.FindFirstValue(JwtRegisteredClaimNames.Email)
            ?? User.FindFirstValue("email")
            ?? string.Empty;

        if (InMemoryAppointments.TryGetValue(id, out var mem) &&
            (mem.UserId == userId || (!string.IsNullOrWhiteSpace(userEmail) && string.Equals(mem.UserEmail, userEmail, StringComparison.OrdinalIgnoreCase))) &&
            !mem.IsDeleted)
        {
            mem.AlertDismissed = true;
            mem.UpdatedAt      = DateTime.UtcNow;
            PersistStorageToFile();
        }

        var connStr = db.Database.GetConnectionString();
        if (!string.IsNullOrWhiteSpace(connStr))
        {
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
        }

        return NoContent();
    }

    // ── Delete ────────────────────────────────────────────────────────────

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct = default)
    {
        EnsureStorageLoaded();
        var userId = await ResolveUserIdAsync(ct);
        if (userId == Guid.Empty) return Unauthorized();

        var userEmail = User.FindFirstValue(ClaimTypes.Email)
            ?? User.FindFirstValue(JwtRegisteredClaimNames.Email)
            ?? User.FindFirstValue("email")
            ?? string.Empty;

        if (InMemoryAppointments.TryGetValue(id, out var mem) &&
            (mem.UserId == userId || (!string.IsNullOrWhiteSpace(userEmail) && string.Equals(mem.UserEmail, userEmail, StringComparison.OrdinalIgnoreCase))))
        {
            mem.IsDeleted = true;
            mem.DeletedAt = DateTime.UtcNow;
            mem.UpdatedAt = DateTime.UtcNow;
            PersistStorageToFile();
        }

        var connStr = db.Database.GetConnectionString();
        if (!string.IsNullOrWhiteSpace(connStr))
        {
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

    private Guid ResolveStableUserId()
    {
        var claimUserId = User.GetUserId();
        if (claimUserId != Guid.Empty) return claimUserId;

        var email = User.FindFirstValue(ClaimTypes.Email)
            ?? User.FindFirstValue(JwtRegisteredClaimNames.Email)
            ?? User.FindFirstValue("email");

        if (!string.IsNullOrWhiteSpace(email) && userStore.TryGetByEmail(email, out var storeUser) && storeUser is not null)
        {
            if (Guid.TryParse(storeUser.Id, out var storeGuid))
            {
                return storeGuid;
            }
        }

        var rawId = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue(JwtRegisteredClaimNames.Sub)
            ?? User.FindFirstValue("sub")
            ?? User.FindFirstValue("id")
            ?? email
            ?? User.FindFirstValue(ClaimTypes.Name)
            ?? User.Identity?.Name;

        if (!string.IsNullOrWhiteSpace(rawId))
        {
            if (Guid.TryParse(rawId, out var parsed))
            {
                return parsed;
            }

            using var md5 = MD5.Create();
            var hash = md5.ComputeHash(Encoding.UTF8.GetBytes(rawId.Trim().ToLowerInvariant()));
            return new Guid(hash);
        }

        return Guid.Empty;
    }

    private async Task<Guid> ResolveUserIdAsync(CancellationToken ct)
    {
        EnsureStorageLoaded();
        var stableId = ResolveStableUserId();
        if (stableId == Guid.Empty) return Guid.Empty;

        var connStr = db.Database.GetConnectionString();
        if (string.IsNullOrWhiteSpace(connStr))
        {
            return stableId;
        }

        try
        {
            await using var conn = new NpgsqlConnection(connStr);
            await conn.OpenAsync(ct);

            // A. Check if user already exists in app_data.Users by stableId
            await using var checkIdCmd = conn.CreateCommand();
            checkIdCmd.CommandText = @"SELECT ""Id"" FROM app_data.""Users"" WHERE ""Id"" = @uid LIMIT 1;";
            checkIdCmd.Parameters.AddWithValue("uid", stableId);
            var existingId = await checkIdCmd.ExecuteScalarAsync(ct);
            if (existingId is Guid gid && gid != Guid.Empty)
            {
                return gid;
            }

            // B. Check if user already exists by Email
            var email = User.FindFirstValue(ClaimTypes.Email)
                ?? User.FindFirstValue(JwtRegisteredClaimNames.Email)
                ?? User.FindFirstValue("email");
            var normalizedEmail = !string.IsNullOrWhiteSpace(email) ? email.Trim() : $"{stableId:N}@local.wiseravenshare.internal";

            await using var checkEmailCmd = conn.CreateCommand();
            checkEmailCmd.CommandText = @"SELECT ""Id"" FROM app_data.""Users"" WHERE LOWER(""Email"") = LOWER(@em) LIMIT 1;";
            checkEmailCmd.Parameters.AddWithValue("em", normalizedEmail);
            var existingEmailId = await checkEmailCmd.ExecuteScalarAsync(ct);
            if (existingEmailId is Guid gidEmail && gidEmail != Guid.Empty)
            {
                return gidEmail;
            }

            // C. Insert minimal domain user row so foreign key FK_Appointments_Users_UserId is satisfied
            var rawUsername = normalizedEmail.Split('@')[0];
            var sanitizedUsername = new string(rawUsername.Where(char.IsLetterOrDigit).ToArray()).ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(sanitizedUsername)) sanitizedUsername = "user";
            var finalUsername = $"{sanitizedUsername}_{stableId:N}"[..Math.Min(30, $"{sanitizedUsername}_{stableId:N}".Length)];
            var displayName = rawUsername.Length > 0 ? rawUsername : finalUsername;

            await using var insertCmd = conn.CreateCommand();
            insertCmd.CommandText = @"
INSERT INTO app_data.""Users"" (""Id"", ""Email"", ""Username"", ""DisplayName"", ""PasswordHash"", ""IsActive"", ""TruthScore"", ""CreatedAt"", ""UpdatedAt"", ""IsDeleted"")
VALUES (@id, @email, @username, @displayName, '', TRUE, 50.00, NOW(), NOW(), FALSE)
ON CONFLICT (""Id"") DO NOTHING;";
            insertCmd.Parameters.AddWithValue("id", stableId);
            insertCmd.Parameters.AddWithValue("email", normalizedEmail);
            insertCmd.Parameters.AddWithValue("username", finalUsername);
            insertCmd.Parameters.AddWithValue("displayName", displayName);
            await insertCmd.ExecuteNonQueryAsync(ct);

            // Re-fetch in case ON CONFLICT triggered or user was concurrently inserted
            await using var verifyCmd = conn.CreateCommand();
            verifyCmd.CommandText = @"SELECT ""Id"" FROM app_data.""Users"" WHERE ""Id"" = @id OR LOWER(""Email"") = LOWER(@email) LIMIT 1;";
            verifyCmd.Parameters.AddWithValue("id", stableId);
            verifyCmd.Parameters.AddWithValue("email", normalizedEmail);
            var verifiedId = await verifyCmd.ExecuteScalarAsync(ct);
            if (verifiedId is Guid vGid && vGid != Guid.Empty)
            {
                return vGid;
            }

            return stableId;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to resolve or provision user in PostgreSQL; using stable ID {StableId}", stableId);
            return stableId;
        }
    }

    private sealed class AppointmentPersistDto
    {
        public Guid Id { get; set; }
        public Guid UserId { get; set; }
        public string? UserEmail { get; set; }
        public string Title { get; set; } = string.Empty;
        public string? Description { get; set; }
        public DateTime StartUtc { get; set; }
        public DateTime EndUtc { get; set; }
        public int ReminderMinutesBefore { get; set; } = 15;
        public bool AlertDismissed { get; set; }
        public string Color { get; set; } = "#3788d8";
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public bool IsDeleted { get; set; }
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
