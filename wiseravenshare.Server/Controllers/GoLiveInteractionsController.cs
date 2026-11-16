using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Hubs;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

/// <summary>
/// Go Live social interactions: follow streamer, like, view, comment, affirmations.
/// These run alongside the existing LiveController without touching it.
/// All successful interaction fire notifications to the streamer.
/// </summary>
[ApiController]
[Route("api/live/interactions")]
[Authorize]
public sealed class GoLiveInteractionsController : ControllerBase
{
    private readonly INotificationService _notifications;
    private readonly LiveStreamStateStore _store;
    private readonly IHubContext<GoLiveHub> _goLiveHub;
    private readonly IHubContext<NotificationHub> _notificationHub;
    private readonly ILogger<GoLiveInteractionsController> _logger;

    public GoLiveInteractionsController(
        INotificationService notifications,
        LiveStreamStateStore store,
        IHubContext<GoLiveHub> goLiveHub,
        IHubContext<NotificationHub> notificationHub,
        ILogger<GoLiveInteractionsController> logger)
    {
        _notifications    = notifications;
        _store            = store;
        _goLiveHub        = goLiveHub;
        _notificationHub  = notificationHub;
        _logger           = logger;
    }

    // ── Follow streamer ───────────────────────────────────────────────────────

    /// <summary>POST /api/live/interactions/{streamId}/follow</summary>
    [HttpPost("{streamId}/follow")]
    public async Task<IActionResult> FollowStreamer(string streamId, CancellationToken ct)
    {
        if (!TryResolveStream(streamId, out var stream, out var actorId)) return NotFound();

        await _notifications.SendAsync(
            ParseStreamer(stream),
            NotificationType.LiveStream,
            actorId: actorId,
            streamId: streamId,
            content: "followed your live stream",
            cancellationToken: ct);

        await BroadcastRoomAsync(streamId, "StreamerFollowed",
            new { streamId, userId = actorId, occurredAt = DateTime.UtcNow }, ct);

        return Ok(new { followed = true, streamId });
    }

    // ── Like ──────────────────────────────────────────────────────────────────

    /// <summary>POST /api/live/interactions/{streamId}/like</summary>
    [HttpPost("{streamId}/like")]
    public async Task<IActionResult> Like(string streamId, CancellationToken ct)
    {
        if (!TryResolveStream(streamId, out var stream, out var actorId)) return NotFound();

        await _notifications.SendAsync(
            ParseStreamer(stream),
            NotificationType.LiveLike,
            actorId: actorId,
            streamId: streamId,
            content: "liked your live stream",
            cancellationToken: ct);

        await BroadcastRoomAsync(streamId, "StreamLike",
            new { streamId, userId = actorId, occurredAt = DateTime.UtcNow }, ct);

        return Ok(new { liked = true, streamId });
    }

    // ── View ──────────────────────────────────────────────────────────────────

    /// <summary>POST /api/live/interactions/{streamId}/view  — fire-and-forget, non-spammy</summary>
    [HttpPost("{streamId}/view")]
    public IActionResult View(string streamId, CancellationToken ct)
    {
        if (!_store.TryGet(streamId, out var stream)) return NotFound();
        var actorId = ResolveUserId();

        _ = Task.Run(async () =>
        {
            await _notifications.SendAsync(
                ParseStreamer(stream),
                NotificationType.LiveView,
                actorId: actorId == Guid.Empty ? null : actorId,
                streamId: streamId,
                content: "someone started watching your stream",
                cancellationToken: CancellationToken.None);

            await BroadcastRoomAsync(streamId, "StreamView",
                new { streamId, occurredAt = DateTime.UtcNow }, CancellationToken.None);
        }, ct);

        return NoContent();
    }

    // ── Comment ───────────────────────────────────────────────────────────────

    /// <summary>POST /api/live/interactions/{streamId}/comment</summary>
    [HttpPost("{streamId}/comment")]
    public async Task<IActionResult> Comment(
        string streamId,
        [FromBody] LiveCommentRequest request,
        CancellationToken ct)
    {
        var text = (request.Text ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(text))
            return BadRequest(new { message = "text is required." });
        if (text.Length > 500)
            return BadRequest(new { message = "comment must be 500 characters or fewer." });

        if (!TryResolveStream(streamId, out var stream, out var actorId)) return NotFound();

        await _notifications.SendAsync(
            ParseStreamer(stream),
            NotificationType.LiveComment,
            actorId: actorId,
            streamId: streamId,
            content: $"commented on your stream: \"{text[..Math.Min(80, text.Length)]}\"",
            cancellationToken: ct);

        await BroadcastRoomAsync(streamId, "StreamComment",
            new { streamId, userId = actorId, text, occurredAt = DateTime.UtcNow }, ct);

        return Ok(new { sent = true, streamId });
    }

    // ── Affirmation ───────────────────────────────────────────────────────────

    /// <summary>POST /api/live/interactions/{streamId}/affirm</summary>
    [HttpPost("{streamId}/affirm")]
    public async Task<IActionResult> Affirm(
        string streamId,
        [FromBody] AffirmationRequest request,
        CancellationToken ct)
    {
        var allowed = new HashSet<string>
            { "🔥", "❤️", "⭐", "💯", "👏", "🎉", "🙌", "💪", "😍", "🎤" };

        var emoji = (request.Emoji ?? "🔥").Trim();
        if (!allowed.Contains(emoji)) emoji = "🔥";

        if (!TryResolveStream(streamId, out var stream, out var actorId)) return NotFound();

        await _notifications.SendAsync(
            ParseStreamer(stream),
            NotificationType.Affirmation,
            actorId: actorId,
            streamId: streamId,
            content: $"sent {emoji} on your stream",
            cancellationToken: ct);

        await BroadcastRoomAsync(streamId, "StreamAffirmation",
            new { streamId, userId = actorId, emoji, occurredAt = DateTime.UtcNow }, ct);

        return Ok(new { affirmed = true, streamId, emoji });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private bool TryResolveStream(string streamId, out LiveStreamState stream, out Guid actorId)
    {
        actorId = ResolveUserId();
        if (!_store.TryGet(streamId, out stream) || stream.deleted_at is not null)
        {
            stream = new LiveStreamState();
            return false;
        }
        return true;
    }

    private static Guid ParseStreamer(LiveStreamState stream)
    {
        return Guid.TryParse(stream.streamer_id ?? stream.created_by_id, out var id) ? id : Guid.Empty;
    }

    private Guid ResolveUserId()
    {
        var raw = User.FindFirstValue(ClaimTypes.NameIdentifier)
               ?? User.FindFirstValue("sub")
               ?? User.FindFirstValue("userId");
        return Guid.TryParse(raw, out var id) ? id : Guid.Empty;
    }

    private Task BroadcastRoomAsync(string streamId, string method, object payload, CancellationToken ct)
    {
        var group = $"golive:{streamId.Trim().ToUpperInvariant()}";
        return _goLiveHub.Clients.Group(group).SendAsync(method, payload, ct);
    }

    public sealed class LiveCommentRequest { public string? Text { get; set; } }
    public sealed class AffirmationRequest  { public string? Emoji { get; set; } }
}
