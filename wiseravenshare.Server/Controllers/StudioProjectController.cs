using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities.Studio;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Services;
using Wiseravenshare.Server.Shared;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Authorize]
[Route("api/studio-projects")]
public sealed class StudioProjectController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IBlobStorageService _blobStorage;
    private readonly ILogger<StudioProjectController> _logger;

    public StudioProjectController(
        AppDbContext db,
        IBlobStorageService blobStorage,
        ILogger<StudioProjectController> logger)
    {
        _db = db;
        _blobStorage = blobStorage;
        _logger = logger;
    }

    // GET /api/studio-projects
    [HttpGet]
    public async Task<IActionResult> GetProjects(CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var projects = await _db.StudioProjects
            .AsNoTracking()
            .Where(p => p.UserId == userId)
            .OrderByDescending(p => p.UpdatedAt)
            .Select(p => new
            {
                p.Id, p.Title, p.Type, p.Status, p.CreatedAt, p.UpdatedAt,
                TrackCount = p.Tracks.Count
            })
            .ToListAsync(ct);

        return Ok(projects);
    }

    // GET /api/studio-projects/{id}
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetProject(Guid id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var project = await _db.StudioProjects
            .AsNoTracking()
            .Include(p => p.Tracks.OrderBy(t => t.OrderIndex))
            .Where(p => p.Id == id && p.UserId == userId)
            .FirstOrDefaultAsync(ct);

        if (project is null) return NotFound(new { message = "Project not found." });

        var history = await _db.StudioEditEvents
            .AsNoTracking()
            .Where(e => e.ProjectId == id)
            .OrderByDescending(e => e.CreatedAt)
            .Take(50)
            .ToListAsync(ct);

        return Ok(new { project, history });
    }

    // POST /api/studio-projects
    [HttpPost]
    public async Task<IActionResult> CreateProject([FromBody] CreateProjectRequest body, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var project = new StudioProject
        {
            UserId = userId,
            Title = body.Title ?? "Untitled Project",
            Type = body.Type ?? "podcast",
        };

        _db.StudioProjects.Add(project);
        await _db.SaveChangesAsync(ct);
        return Ok(project);
    }

    // PUT /api/studio-projects/{id}
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> UpdateProject(Guid id, [FromBody] UpdateProjectRequest body, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var project = await _db.StudioProjects.FirstOrDefaultAsync(p => p.Id == id && p.UserId == userId, ct);
        if (project is null) return NotFound(new { message = "Project not found." });

        if (body.Title is not null) project.Title = body.Title;
        if (body.Status is not null) project.Status = body.Status;
        project.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);
        return Ok(project);
    }

    // DELETE /api/studio-projects/{id}
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteProject(Guid id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var project = await _db.StudioProjects.FirstOrDefaultAsync(p => p.Id == id && p.UserId == userId, ct);
        if (project is null) return NotFound(new { message = "Project not found." });

        _db.StudioProjects.Remove(project);
        await _db.SaveChangesAsync(ct);
        return Ok(new { message = "Deleted." });
    }

    // GET /api/studio-projects/{id}/tracks
    [HttpGet("{id:guid}/tracks")]
    public async Task<IActionResult> GetTracks(Guid id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var exists = await _db.StudioProjects.AnyAsync(p => p.Id == id && p.UserId == userId, ct);
        if (!exists) return NotFound(new { message = "Project not found." });

        var tracks = await _db.StudioTracks
            .AsNoTracking()
            .Where(t => t.ProjectId == id)
            .OrderBy(t => t.OrderIndex)
            .ToListAsync(ct);

        return Ok(tracks);
    }

    // POST /api/studio-projects/{id}/tracks
    [HttpPost("{id:guid}/tracks")]
    public async Task<IActionResult> AddTrack(Guid id, [FromBody] AddTrackRequest body, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var project = await _db.StudioProjects.FirstOrDefaultAsync(p => p.Id == id && p.UserId == userId, ct);
        if (project is null) return NotFound(new { message = "Project not found." });

        var track = new StudioTrack
        {
            ProjectId = id,
            Name = body.Name ?? "Track",
            Type = body.Type ?? "audio",
            BlobUrl = body.BlobUrl,
            OrderIndex = body.OrderIndex,
        };

        _db.StudioTracks.Add(track);

        var editEvent = new StudioEditEvent
        {
            ProjectId = id,
            ActionType = "add_track",
            Description = $"Added track: {track.Name}",
            AfterJson = JsonSerializer.Serialize(track),
        };
        _db.StudioEditEvents.Add(editEvent);

        project.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return Ok(track);
    }

    // PUT /api/studio-projects/{id}/tracks/{trackId}
    [HttpPut("{id:guid}/tracks/{trackId:guid}")]
    public async Task<IActionResult> UpdateTrack(Guid id, Guid trackId, [FromBody] UpdateTrackRequest body, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var exists = await _db.StudioProjects.AnyAsync(p => p.Id == id && p.UserId == userId, ct);
        if (!exists) return NotFound(new { message = "Project not found." });

        var track = await _db.StudioTracks.FirstOrDefaultAsync(t => t.Id == trackId && t.ProjectId == id, ct);
        if (track is null) return NotFound(new { message = "Track not found." });

        var beforeJson = JsonSerializer.Serialize(track);

        if (body.Name is not null) track.Name = body.Name;
        if (body.Volume.HasValue) track.Volume = body.Volume.Value;
        if (body.Muted.HasValue) track.Muted = body.Muted.Value;
        if (body.Soloed.HasValue) track.Soloed = body.Soloed.Value;
        if (body.FxChainJson is not null) track.FxChainJson = body.FxChainJson;

        var editEvent = new StudioEditEvent
        {
            ProjectId = id,
            ActionType = "update_track",
            Description = $"Updated track: {track.Name}",
            BeforeJson = beforeJson,
            AfterJson = JsonSerializer.Serialize(track),
        };
        _db.StudioEditEvents.Add(editEvent);

        await _db.SaveChangesAsync(ct);
        return Ok(track);
    }

    // DELETE /api/studio-projects/{id}/tracks/{trackId}
    [HttpDelete("{id:guid}/tracks/{trackId:guid}")]
    public async Task<IActionResult> DeleteTrack(Guid id, Guid trackId, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var exists = await _db.StudioProjects.AnyAsync(p => p.Id == id && p.UserId == userId, ct);
        if (!exists) return NotFound(new { message = "Project not found." });

        var track = await _db.StudioTracks.FirstOrDefaultAsync(t => t.Id == trackId && t.ProjectId == id, ct);
        if (track is null) return NotFound(new { message = "Track not found." });

        var editEvent = new StudioEditEvent
        {
            ProjectId = id,
            ActionType = "remove_track",
            Description = $"Removed track: {track.Name}",
            BeforeJson = JsonSerializer.Serialize(track),
        };
        _db.StudioEditEvents.Add(editEvent);

        _db.StudioTracks.Remove(track);
        await _db.SaveChangesAsync(ct);
        return Ok(new { message = "Track deleted." });
    }

    // POST /api/studio-projects/{id}/upload-recording
    [HttpPost("{id:guid}/upload-recording")]
    public async Task<IActionResult> UploadRecording(Guid id, IFormFile file, [FromForm] string? trackName, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var project = await _db.StudioProjects.FirstOrDefaultAsync(p => p.Id == id && p.UserId == userId, ct);
        if (project is null) return NotFound(new { message = "Project not found." });

        if (file is null || file.Length == 0)
            return BadRequest(new { message = "No file provided." });

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (string.IsNullOrEmpty(ext)) ext = ".webm";
        var objectKey = $"studio/{userId}/{id}/{Guid.NewGuid()}{ext}";

        string blobUrl;
        if (_blobStorage.IsConfigured)
        {
            await using var stream = file.OpenReadStream();
            var result = await _blobStorage.UploadAsync(objectKey, stream, file.ContentType, ct);
            blobUrl = result.PublicUrl;
        }
        else
        {
            blobUrl = objectKey;
        }

        var nextOrder = await _db.StudioTracks.Where(t => t.ProjectId == id).CountAsync(ct);
        var track = new StudioTrack
        {
            ProjectId = id,
            Name = trackName ?? "Recording",
            Type = "audio",
            BlobUrl = blobUrl,
            OrderIndex = nextOrder,
        };

        _db.StudioTracks.Add(track);

        var editEvent = new StudioEditEvent
        {
            ProjectId = id,
            ActionType = "add_track",
            Description = $"Uploaded recording: {track.Name}",
            AfterJson = JsonSerializer.Serialize(track),
        };
        _db.StudioEditEvents.Add(editEvent);

        project.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return Ok(new { trackId = track.Id, blobUrl = track.BlobUrl });
    }

    // GET /api/studio-projects/{id}/history
    [HttpGet("{id:guid}/history")]
    public async Task<IActionResult> GetHistory(Guid id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var exists = await _db.StudioProjects.AnyAsync(p => p.Id == id && p.UserId == userId, ct);
        if (!exists) return NotFound(new { message = "Project not found." });

        var history = await _db.StudioEditEvents
            .AsNoTracking()
            .Where(e => e.ProjectId == id)
            .OrderByDescending(e => e.CreatedAt)
            .Take(100)
            .ToListAsync(ct);

        return Ok(history);
    }

    // POST /api/studio-projects/{id}/undo
    [HttpPost("{id:guid}/undo")]
    public async Task<IActionResult> UndoEdit(Guid id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var project = await _db.StudioProjects.FirstOrDefaultAsync(p => p.Id == id && p.UserId == userId, ct);
        if (project is null) return NotFound(new { message = "Project not found." });

        var evt = await _db.StudioEditEvents
            .Where(e => e.ProjectId == id && !e.IsUndone)
            .OrderByDescending(e => e.CreatedAt)
            .FirstOrDefaultAsync(ct);

        if (evt is null) return BadRequest(new { message = "Nothing to undo." });

        switch (evt.ActionType)
        {
            case "add_track":
            {
                if (evt.AfterJson is not null)
                {
                    var snapshot = JsonSerializer.Deserialize<StudioTrack>(evt.AfterJson);
                    if (snapshot is not null)
                    {
                        var track = await _db.StudioTracks.FindAsync([snapshot.Id], ct);
                        if (track is not null) _db.StudioTracks.Remove(track);
                    }
                }
                break;
            }
            case "remove_track":
            {
                if (evt.BeforeJson is not null)
                {
                    var snapshot = JsonSerializer.Deserialize<StudioTrack>(evt.BeforeJson);
                    if (snapshot is not null)
                    {
                        snapshot.ProjectId = id;
                        _db.StudioTracks.Add(snapshot);
                    }
                }
                break;
            }
            case "update_track":
            {
                if (evt.BeforeJson is not null)
                {
                    var snapshot = JsonSerializer.Deserialize<StudioTrack>(evt.BeforeJson);
                    if (snapshot is not null)
                    {
                        var track = await _db.StudioTracks.FindAsync([snapshot.Id], ct);
                        if (track is not null)
                        {
                            track.Name = snapshot.Name;
                            track.Volume = snapshot.Volume;
                            track.Muted = snapshot.Muted;
                            track.Soloed = snapshot.Soloed;
                            track.FxChainJson = snapshot.FxChainJson;
                        }
                    }
                }
                break;
            }
        }

        evt.IsUndone = true;
        project.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return Ok(new { message = "Undone.", eventId = evt.Id });
    }

    // POST /api/studio-projects/{id}/redo
    [HttpPost("{id:guid}/redo")]
    public async Task<IActionResult> RedoEdit(Guid id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var project = await _db.StudioProjects.FirstOrDefaultAsync(p => p.Id == id && p.UserId == userId, ct);
        if (project is null) return NotFound(new { message = "Project not found." });

        var evt = await _db.StudioEditEvents
            .Where(e => e.ProjectId == id && e.IsUndone)
            .OrderByDescending(e => e.CreatedAt)
            .FirstOrDefaultAsync(ct);

        if (evt is null) return BadRequest(new { message = "Nothing to redo." });

        switch (evt.ActionType)
        {
            case "add_track":
            {
                if (evt.AfterJson is not null)
                {
                    var snapshot = JsonSerializer.Deserialize<StudioTrack>(evt.AfterJson);
                    if (snapshot is not null)
                    {
                        snapshot.ProjectId = id;
                        _db.StudioTracks.Add(snapshot);
                    }
                }
                break;
            }
            case "remove_track":
            {
                if (evt.BeforeJson is not null)
                {
                    var snapshot = JsonSerializer.Deserialize<StudioTrack>(evt.BeforeJson);
                    if (snapshot is not null)
                    {
                        var track = await _db.StudioTracks.FindAsync([snapshot.Id], ct);
                        if (track is not null) _db.StudioTracks.Remove(track);
                    }
                }
                break;
            }
            case "update_track":
            {
                if (evt.AfterJson is not null)
                {
                    var snapshot = JsonSerializer.Deserialize<StudioTrack>(evt.AfterJson);
                    if (snapshot is not null)
                    {
                        var track = await _db.StudioTracks.FindAsync([snapshot.Id], ct);
                        if (track is not null)
                        {
                            track.Name = snapshot.Name;
                            track.Volume = snapshot.Volume;
                            track.Muted = snapshot.Muted;
                            track.Soloed = snapshot.Soloed;
                            track.FxChainJson = snapshot.FxChainJson;
                        }
                    }
                }
                break;
            }
        }

        evt.IsUndone = false;
        project.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return Ok(new { message = "Redone.", eventId = evt.Id });
    }
}

public sealed record CreateProjectRequest(string? Title, string? Type);
public sealed record UpdateProjectRequest(string? Title, string? Status);
public sealed record AddTrackRequest(string? Name, string? Type, string? BlobUrl, int OrderIndex);
public sealed record UpdateTrackRequest(string? Name, float? Volume, bool? Muted, bool? Soloed, string? FxChainJson);
