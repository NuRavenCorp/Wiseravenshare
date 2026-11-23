using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities.Karaoke;
using Wiseravenshare.Server.Hubs;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Services;
using Wiseravenshare.Server.Shared;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Authorize]
[Route("api/actions")]
public sealed class WebsiteActionsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly LiveStreamStateStore _liveStreamStateStore;
    private readonly IHubContext<NotificationHub> _notificationHub;
    private readonly IHubContext<GoLiveHub> _goLiveHub;
    private readonly IHubContext<LiveChatHub> _liveChatHub;

    public WebsiteActionsController(
        AppDbContext db,
        LiveStreamStateStore liveStreamStateStore,
        IHubContext<NotificationHub> notificationHub,
        IHubContext<GoLiveHub> goLiveHub,
        IHubContext<LiveChatHub> liveChatHub)
    {
        _db = db;
        _liveStreamStateStore = liveStreamStateStore;
        _notificationHub = notificationHub;
        _goLiveHub = goLiveHub;
        _liveChatHub = liveChatHub;
    }

    [HttpPost("karaoke/search_karaoke_track")]
    public async Task<IActionResult> SearchKaraokeTrack(
        [FromBody] SearchKaraokeTrackRequest request,
        CancellationToken cancellationToken)
    {
        var query = (request.Query ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(query))
        {
            return BadRequest(new { message = "query is required." });
        }

        var userId = User.GetUserId();
        var limit = Math.Clamp(request.Limit ?? 10, 1, 50);
        var like = $"%{query}%";

        var tracks = await _db.KaraokeTracks
            .AsNoTracking()
            .Where(x =>
                !x.IsDeleted &&
                x.Status == KaraokeTrackStatus.Ready &&
                x.IsPublic &&
                (EF.Functions.ILike(x.Title, like) || EF.Functions.ILike(x.Artist, like)))
            .OrderByDescending(x => x.PlayCount)
            .ThenBy(x => x.Title)
            .Take(limit)
            .Select(x => new SearchResultItem
            {
                Kind = "track",
                Id = x.Id,
                Title = x.Title,
                Artist = x.Artist,
                InstrumentalUrl = x.InstrumentalUrl
            })
            .ToListAsync(cancellationToken);

        var remaining = Math.Max(0, limit - tracks.Count);
        var songs = remaining > 0
            ? await _db.KaraokeSongFiles
                .AsNoTracking()
                .Where(x =>
                    !x.IsDeleted &&
                    (x.UploadedByUserId == userId || x.IsPublic) &&
                    (EF.Functions.ILike(x.Title, like) || EF.Functions.ILike(x.Artist ?? string.Empty, like)))
                .OrderByDescending(x => x.PlayCount)
                .ThenByDescending(x => x.CreatedAt)
                .Take(remaining)
                .Select(x => new SearchResultItem
                {
                    Kind = "song",
                    Id = x.Id,
                    Title = x.Title,
                    Artist = x.Artist,
                    StreamUrl = $"/api/karaoke/songs/{x.Id}/stream"
                })
                .ToListAsync(cancellationToken)
            : new List<SearchResultItem>();

        return Ok(new
        {
            query,
            results = tracks.Concat(songs).ToList()
        });
    }

    [HttpPost("karaoke/add_to_queue")]
    public async Task<IActionResult> AddToQueue(
        [FromBody] AddToQueueRequest request,
        CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized();
        }

        if (request.SongId == Guid.Empty)
        {
            return BadRequest(new { message = "song_id is required." });
        }

        var exists = await _db.KaraokeTracks.AsNoTracking().AnyAsync(
            x => x.Id == request.SongId && !x.IsDeleted && x.IsPublic,
            cancellationToken);

        if (!exists)
        {
            exists = await _db.KaraokeSongFiles.AsNoTracking().AnyAsync(
                x => x.Id == request.SongId && !x.IsDeleted && (x.UploadedByUserId == userId || x.IsPublic),
                cancellationToken);
        }

        if (!exists)
        {
            return NotFound(new { message = "song_id was not found." });
        }

        await PublishUserActionAsync(userId, "karaoke.queue_song", new
        {
            song_id = request.SongId,
            request.SessionId
        });

        return Ok(new { queued = true, song_id = request.SongId });
    }

    [HttpPost("karaoke/play_pause_track")]
    public async Task<IActionResult> PlayPauseTrack([FromBody] PlayPauseTrackRequest request)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized();
        }

        await PublishUserActionAsync(userId, "karaoke.play_pause_track", new
        {
            request.IsPaused,
            request.SessionId
        });

        return Ok(new { paused = request.IsPaused });
    }

    [HttpPost("karaoke/adjust_pitch")]
    public async Task<IActionResult> AdjustPitch([FromBody] AdjustPitchRequest request)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized();
        }

        if (request.Semitones is < -12 or > 12)
        {
            return BadRequest(new { message = "semitones must be between -12 and 12." });
        }

        await PublishUserActionAsync(userId, "karaoke.adjust_pitch", new
        {
            request.Semitones,
            request.SessionId
        });

        return Ok(new { applied = true, semitones = request.Semitones });
    }

    [HttpPost("podcast/start_recording")]
    public async Task<IActionResult> StartRecording([FromBody] StartRecordingRequest request)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized();
        }

        await PublishUserActionAsync(userId, "podcast.start_recording", new
        {
            request.SessionId,
            request.TeamId
        });

        return Ok(new { started = true, request.SessionId });
    }

    [HttpPost("podcast/stop_recording")]
    public async Task<IActionResult> StopRecording([FromBody] StopRecordingRequest request)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized();
        }

        await PublishUserActionAsync(userId, "podcast.stop_recording", new
        {
            request.SessionId
        });

        return Ok(new { stopped = true, request.SessionId });
    }

    [HttpPost("podcast/insert_chapter_marker")]
    public async Task<IActionResult> InsertChapterMarker([FromBody] InsertChapterMarkerRequest request)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized();
        }

        var title = (request.Title ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(title))
        {
            return BadRequest(new { message = "title is required." });
        }

        await PublishUserActionAsync(userId, "podcast.insert_chapter_marker", new
        {
            request.SessionId,
            title,
            request.TimestampSeconds
        });

        return Ok(new { created = true, title });
    }

    [HttpPost("podcast/play_episode")]
    public async Task<IActionResult> PlayEpisode(
        [FromBody] PlayEpisodeRequest request,
        CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized();
        }

        if (request.EpisodeId == Guid.Empty)
        {
            return BadRequest(new { message = "episode_id is required." });
        }

        var episode = await _db.RadioStationEpisodes
            .AsNoTracking()
            .Where(x => x.Id == request.EpisodeId && !x.IsDeleted && x.IsPublished)
            .Select(x => new { x.Id, x.Title, x.AudioUrl })
            .FirstOrDefaultAsync(cancellationToken);

        if (episode is null)
        {
            return NotFound(new { message = "episode_id was not found." });
        }

        await PublishUserActionAsync(userId, "podcast.play_episode", new
        {
            episode_id = episode.Id,
            episode_title = episode.Title,
            audio_url = episode.AudioUrl
        });

        return Ok(new { playing = true, episode_id = episode.Id, episode_title = episode.Title });
    }

    [HttpPost("live/toggle_live_stream")]
    public IActionResult ToggleLiveStream([FromBody] ToggleLiveStreamRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.StreamId))
        {
            return BadRequest(new { message = "stream_id is required." });
        }

        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized();
        }

        var streamId = request.StreamId.Trim();
        if (request.Status)
        {
            if (_liveStreamStateStore.TryGet(streamId, out var existingStream)
                && !(Guid.TryParse(existingStream.created_by_id, out var ownerId) && ownerId == userId))
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { message = "Not your stream." });
            }

            var now = DateTime.UtcNow;
            var stream = _liveStreamStateStore.Update(streamId, s =>
            {
                s.status = "live";
                s.ended_at = null;
                s.deleted_at = null;
                s.started_at ??= now;
                if (!string.IsNullOrWhiteSpace(request.Title))
                {
                    s.title = request.Title.Trim();
                }
            });

            if (stream is null)
            {
                _liveStreamStateStore.Create(new LiveStreamState
                {
                    id = streamId,
                    created_by_id = userId.ToString(),
                    streamer_id = userId.ToString(),
                    title = string.IsNullOrWhiteSpace(request.Title) ? "Untitled live" : request.Title.Trim(),
                    status = "live",
                    started_at = now,
                    created_date = now,
                    updated_date = now
                });
            }
        }
        else
        {
            if (!CanControlStream(streamId, userId))
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { message = "Not your stream." });
            }

            var stream = _liveStreamStateStore.Update(streamId, s =>
            {
                s.status = "ended";
                s.ended_at ??= DateTime.UtcNow;
                if (!s.kept_permanently)
                {
                    s.expires_at = s.ended_at.Value.AddHours(24);
                }
            });

            if (stream is null)
            {
                return NotFound(new { message = "stream_id was not found." });
            }
        }

        return Ok(new { stream_id = streamId, status = request.Status ? "live" : "ended" });
    }

    [HttpPost("live/switch_scene")]
    public async Task<IActionResult> SwitchScene([FromBody] SwitchSceneRequest request)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized();
        }

        var streamId = (request.StreamId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(streamId))
        {
            return BadRequest(new { message = "stream_id is required." });
        }

        if (!CanControlStream(streamId, userId))
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "Not your stream." });
        }

        var sceneName = (request.SceneName ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(sceneName))
        {
            return BadRequest(new { message = "scene_name is required." });
        }

        await _goLiveHub.Clients.Group(BuildGoLiveGroup(streamId)).SendAsync("SwitchSceneCommand", new
        {
            stream_id = streamId,
            scene_name = sceneName
        });

        return Ok(new { switched = true, stream_id = streamId, scene_name = sceneName });
    }

    [HttpPost("live/mute_mic")]
    public async Task<IActionResult> MuteMic([FromBody] MuteMicRequest request)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized();
        }

        var streamId = (request.StreamId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(streamId))
        {
            return BadRequest(new { message = "stream_id is required." });
        }

        if (!CanControlStream(streamId, userId))
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "Not your stream." });
        }

        await _goLiveHub.Clients.Group(BuildGoLiveGroup(streamId)).SendAsync("MuteMicCommand", new
        {
            stream_id = streamId,
            muted = request.Muted
        });

        return Ok(new { stream_id = streamId, muted = request.Muted });
    }

    [HttpPost("live/pin_chat_message")]
    public async Task<IActionResult> PinChatMessage([FromBody] PinChatMessageRequest request)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized();
        }

        var streamId = (request.StreamId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(streamId))
        {
            return BadRequest(new { message = "stream_id is required." });
        }

        if (!CanControlStream(streamId, userId))
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "Not your stream." });
        }

        var messageId = (request.MessageId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(messageId))
        {
            return BadRequest(new { message = "message_id is required." });
        }

        await _liveChatHub.Clients.Group(BuildLiveChatGroup(streamId)).SendAsync("PinChatMessageCommand", new
        {
            stream_id = streamId,
            message_id = messageId
        });

        return Ok(new { pinned = true, stream_id = streamId, message_id = messageId });
    }

    private Task PublishUserActionAsync(Guid userId, string action, object payload)
    {
        var group = NotificationHub.BuildUserGroup(userId.ToString());
        return _notificationHub.Clients.Group(group).SendAsync("WebsiteAction", new
        {
            action,
            payload
        });
    }

    private static string BuildGoLiveGroup(string streamId) => $"golive:{streamId.Trim().ToUpperInvariant()}";

    private static string BuildLiveChatGroup(string streamId) => $"livechat:{streamId.Trim().ToUpperInvariant()}";

    private bool CanControlStream(string streamId, Guid userId)
    {
        if (!_liveStreamStateStore.TryGet(streamId, out var stream))
        {
            return false;
        }

        return Guid.TryParse(stream.created_by_id, out var ownerId) && ownerId == userId;
    }

    public sealed class SearchKaraokeTrackRequest
    {
        public string? Query { get; set; }
        public int? Limit { get; set; }
    }

    public sealed class SearchResultItem
    {
        public string Kind { get; set; } = string.Empty;
        public Guid Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public string? Artist { get; set; }
        public string? InstrumentalUrl { get; set; }
        public string? StreamUrl { get; set; }
    }

    public sealed class AddToQueueRequest
    {
        public Guid SongId { get; set; }
        public string? SessionId { get; set; }
    }

    public sealed class PlayPauseTrackRequest
    {
        public bool IsPaused { get; set; }
        public string? SessionId { get; set; }
    }

    public sealed class AdjustPitchRequest
    {
        public int Semitones { get; set; }
        public string? SessionId { get; set; }
    }

    public sealed class StartRecordingRequest
    {
        public string? SessionId { get; set; }
        public string? TeamId { get; set; }
    }

    public sealed class StopRecordingRequest
    {
        public string? SessionId { get; set; }
    }

    public sealed class InsertChapterMarkerRequest
    {
        public string? SessionId { get; set; }
        public string? Title { get; set; }
        public int? TimestampSeconds { get; set; }
    }

    public sealed class PlayEpisodeRequest
    {
        public Guid EpisodeId { get; set; }
    }

    public sealed class ToggleLiveStreamRequest
    {
        public string? StreamId { get; set; }
        public bool Status { get; set; }
        public string? Title { get; set; }
    }

    public sealed class SwitchSceneRequest
    {
        public string? StreamId { get; set; }
        public string? SceneName { get; set; }
    }

    public sealed class MuteMicRequest
    {
        public string? StreamId { get; set; }
        public bool Muted { get; set; }
    }

    public sealed class PinChatMessageRequest
    {
        public string? StreamId { get; set; }
        public string? MessageId { get; set; }
    }
}
