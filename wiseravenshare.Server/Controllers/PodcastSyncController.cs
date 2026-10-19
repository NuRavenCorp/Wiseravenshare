using System.Net.WebSockets;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using Wiseravenshare.Server.Shared;

namespace Wiseravenshare.Server.Controllers;

/// <summary>
/// Podcast session management, script card control, device sync,
/// and presigned recording-chunk upload URLs.
///
/// Real-time sync is delivered via WebSocket at
///   GET /api/podcast-sync/ws/{sessionId}?deviceId=…&deviceType=…
/// All other operations are standard REST.
/// </summary>
[ApiController]
[Route("api/podcast-sync")]
[Authorize]
public sealed class PodcastSyncController : ControllerBase
{
    private readonly IConfiguration _config;
    private readonly IHttpClientFactory _http;
    private readonly ILogger<PodcastSyncController> _logger;
    private static readonly string _channel = "podcast_session_events";

    public PodcastSyncController(
        IConfiguration config,
        IHttpClientFactory http,
        ILogger<PodcastSyncController> logger)
    {
        _config = config;
        _http   = http;
        _logger = logger;
    }

    private string? ConnectionString =>
        _config.GetConnectionString("DefaultConnection")
        ?? _config["ConnectionStrings__DefaultConnection"];

    private Guid CurrentUserId =>
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub"), out var id)
            ? id : Guid.Empty;

    // ──────────────────────────────────────────────────────────────────
    // SESSION LIFECYCLE
    // ──────────────────────────────────────────────────────────────────

    [HttpPost("sessions")]
    public async Task<IActionResult> CreateSession(
        [FromBody] CreatePodcastSyncSessionRequest req,
        CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId == Guid.Empty) return Unauthorized();
        if (string.IsNullOrWhiteSpace(req.Title)) return BadRequest(new { message = "title is required" });

        var sessionId = Guid.NewGuid();
        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync(ct);

        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO app_data.podcast_sessions
                (session_id, host_user_id, title, total_cards)
            VALUES (@sid, @uid, @title, @total)";
        cmd.Parameters.AddWithValue("sid",   sessionId);
        cmd.Parameters.AddWithValue("uid",   userId);
        cmd.Parameters.AddWithValue("title", req.Title.Trim());
        cmd.Parameters.AddWithValue("total", req.Cards?.Count ?? 0);
        await cmd.ExecuteNonQueryAsync(ct);

        if (req.Cards?.Count > 0)
            await UpsertCards(conn, sessionId, req.Cards, ct);

        return Ok(new { sessionId, totalCards = req.Cards?.Count ?? 0 });
    }

    [HttpPost("sessions/{sessionId:guid}/cards")]
    public async Task<IActionResult> SetCards(
        Guid sessionId,
        [FromBody] SetCardsRequest req,
        CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync(ct);
        await UpsertCards(conn, sessionId, req.Cards, ct);

        await using var upd = conn.CreateCommand();
        upd.CommandText = "UPDATE app_data.podcast_sessions SET total_cards=@n, updated_at=now() WHERE session_id=@sid";
        upd.Parameters.AddWithValue("n",   req.Cards.Count);
        upd.Parameters.AddWithValue("sid", sessionId);
        await upd.ExecuteNonQueryAsync(ct);

        return Ok(new { totalCards = req.Cards.Count });
    }

    [HttpGet("sessions/{sessionId:guid}")]
    public async Task<IActionResult> GetSession(Guid sessionId, CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT session_id, title, recording_state, current_card_index,
                   total_cards, card_state, created_at
            FROM app_data.podcast_sessions WHERE session_id = @sid";
        cmd.Parameters.AddWithValue("sid", sessionId);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct)) return NotFound();
        return Ok(new
        {
            sessionId        = r.GetGuid(0),
            title            = r.GetString(1),
            recordingState   = r.GetString(2),
            currentCardIndex = r.GetInt32(3),
            totalCards       = r.GetInt32(4),
            cardState        = r.GetString(5),
        });
    }

    [HttpGet("sessions/{sessionId:guid}/cards")]
    public async Task<IActionResult> GetCards(Guid sessionId, CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT card_index, title, body, media_url, media_type,
                   duration_seconds, speaker_hint
            FROM app_data.podcast_script_cards
            WHERE session_id = @sid ORDER BY card_index";
        cmd.Parameters.AddWithValue("sid", sessionId);
        var cards = new List<object>();
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            cards.Add(new
            {
                cardIndex       = r.GetInt32(0),
                title           = r.IsDBNull(1) ? "" : r.GetString(1),
                body            = r.IsDBNull(2) ? "" : r.GetString(2),
                mediaUrl        = r.IsDBNull(3) ? null : r.GetString(3),
                mediaType       = r.IsDBNull(4) ? null : r.GetString(4),
                durationSeconds = r.IsDBNull(5) ? (int?)null : r.GetInt32(5),
                speakerHint     = r.IsDBNull(6) ? null : r.GetString(6),
            });
        }
        return Ok(cards);
    }

    // ──────────────────────────────────────────────────────────────────
    // RECORDING CHUNKS (resumable upload)
    // ──────────────────────────────────────────────────────────────────

    [HttpPost("sessions/{sessionId:guid}/chunks/presign")]
    public IActionResult PresignChunk(Guid sessionId, [FromBody] PresignChunkRequest req)
    {
        var key    = $"podcasts/{sessionId:N}/{req.DeviceId}/chunk-{req.ChunkIndex:D5}.webm";
        var bucket = _config["Storage:Blob:BucketName"] ?? "wise-raven-media";
        var endpoint = _config["Storage:Blob:Endpoint"]   ?? "https://nyc3.digitaloceanspaces.com";
        var region   = _config["Storage:Blob:Region"]     ?? "nyc3";
        var accessKey = _config["Storage:Blob:AccessKey"]  ?? "";
        var secret    = _config["Storage:Blob:SecretKey"]  ?? "";

        // Build presigned URL using Amazon SDK pattern
        var awsClient = new Amazon.S3.AmazonS3Client(
            accessKey, secret,
            new Amazon.S3.AmazonS3Config
            {
                ServiceURL = endpoint,
                ForcePathStyle = true,
                RegionEndpoint = Amazon.RegionEndpoint.GetBySystemName(region),
            });

        var presignedReq = new Amazon.S3.Model.GetPreSignedUrlRequest
        {
            BucketName = bucket,
            Key        = key,
            Verb       = Amazon.S3.HttpVerb.PUT,
            Expires    = DateTime.UtcNow.AddHours(1),
            ContentType = "video/webm",
        };
        var url = awsClient.GetPreSignedURL(presignedReq);
        return Ok(new { uploadUrl = url, storageKey = key });
    }

    [HttpGet("sessions/{sessionId:guid}/chunks")]
    public async Task<IActionResult> ListChunks(
        Guid sessionId, [FromQuery] string deviceId, CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT chunk_index, storage_key, size_bytes
            FROM app_data.podcast_recording_chunks
            WHERE session_id=@sid AND device_id=@did ORDER BY chunk_index";
        cmd.Parameters.AddWithValue("sid", sessionId);
        cmd.Parameters.AddWithValue("did", deviceId);
        var chunks = new List<object>();
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
            chunks.Add(new { chunkIndex = r.GetInt32(0), storageKey = r.GetString(1), sizeBytes = r.GetInt64(2) });
        return Ok(new { chunks });
    }

    [HttpPost("sessions/{sessionId:guid}/chunks")]
    public async Task<IActionResult> RegisterChunk(
        Guid sessionId,
        [FromBody] RegisterChunkRequest req,
        CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO app_data.podcast_recording_chunks
                (session_id, device_id, chunk_index, storage_key, size_bytes, sha256)
            VALUES (@sid, @did, @ci, @sk, @sz, @sha)
            ON CONFLICT (session_id, device_id, chunk_index) DO NOTHING";
        cmd.Parameters.AddWithValue("sid", sessionId);
        cmd.Parameters.AddWithValue("did", req.DeviceId);
        cmd.Parameters.AddWithValue("ci",  req.ChunkIndex);
        cmd.Parameters.AddWithValue("sk",  req.StorageKey);
        cmd.Parameters.AddWithValue("sz",  req.SizeBytes);
        cmd.Parameters.AddWithValue("sha", req.Sha256);
        await cmd.ExecuteNonQueryAsync(ct);
        return Ok(new { registered = req.ChunkIndex });
    }

    // ──────────────────────────────────────────────────────────────────
    // WEBSOCKET — real-time device sync
    // ──────────────────────────────────────────────────────────────────

    [HttpGet("ws/{sessionId:guid}")]
    public async Task PodcastWebSocket(
        Guid sessionId,
        [FromQuery] string deviceId   = "unknown",
        [FromQuery] string deviceType = "browser")
    {
        if (!HttpContext.WebSockets.IsWebSocketRequest)
        {
            HttpContext.Response.StatusCode = 400;
            return;
        }

        using var ws = await HttpContext.WebSockets.AcceptWebSocketAsync();
        _logger.LogInformation("Podcast WS: session={S} device={D} type={T}", sessionId, deviceId, deviceType);

        var cs = ConnectionString!;

        // Register device and send resumed state
        var state = await RegisterDevice(cs, sessionId, deviceId, deviceType);
        await SendJson(ws, new { @event = "connected", resumedState = state });

        // Listen for NOTIFY events and forward to this client
        await using var listenConn = new NpgsqlConnection(cs);
        await listenConn.OpenAsync();
        using var cts = new CancellationTokenSource();

        listenConn.Notification += (_, e) =>
        {
            try
            {
                var data = JsonDocument.Parse(e.Payload);
                var sid  = data.RootElement.TryGetProperty("session_id", out var sidEl) ? sidEl.GetString() : null;
                if (string.Equals(sid, sessionId.ToString("D"), StringComparison.OrdinalIgnoreCase))
                    _ = SendJson(ws, data.RootElement);
            }
            catch { /* ignore malformed notify */ }
        };
        await using var listenCmd = listenConn.CreateCommand();
        listenCmd.CommandText = $"LISTEN {_channel}";
        await listenCmd.ExecuteNonQueryAsync();

        // Background poll so NOTIFY events are flushed
        _ = Task.Run(async () =>
        {
            while (!cts.Token.IsCancellationRequested)
            {
                try { await listenConn.WaitAsync(cts.Token); }
                catch { break; }
            }
        }, cts.Token);

        // Handle incoming commands from this device
        var buf = new byte[4096];
        while (ws.State == WebSocketState.Open)
        {
            WebSocketReceiveResult result;
            try { result = await ws.ReceiveAsync(buf, CancellationToken.None); }
            catch { break; }

            if (result.MessageType == WebSocketMessageType.Close) break;

            var json = Encoding.UTF8.GetString(buf, 0, result.Count);
            try
            {
                using var doc    = JsonDocument.Parse(json);
                var root  = doc.RootElement;
                var action = root.TryGetProperty("action", out var a) ? a.GetString() : null;

                await using var cmdConn = new NpgsqlConnection(cs);
                await cmdConn.OpenAsync();

                if (action == "advance_card")
                {
                    var dir = root.TryGetProperty("direction", out var d) ? d.GetString() : "forward";
                    await AdvanceCard(cmdConn, sessionId, deviceId, dir ?? "forward");
                }
                else if (action == "video_feed")
                {
                    var active = root.TryGetProperty("active", out var av) && av.GetBoolean();
                    var ft     = root.TryGetProperty("feed_type", out var ft2) ? ft2.GetString() : "camera";
                    await UpdateVideoFeed(cmdConn, sessionId, deviceId, active, ft ?? "camera");
                }
                else if (action == "recording_state")
                {
                    var st = root.TryGetProperty("state", out var sv) ? sv.GetString() : "idle";
                    await SetRecordingState(cmdConn, sessionId, deviceId, st ?? "idle");
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Podcast WS: malformed command from {D}", deviceId);
            }
        }

        await cts.CancelAsync();
    }

    // ──────────────────────────────────────────────────────────────────
    // PRIVATE HELPERS
    // ──────────────────────────────────────────────────────────────────

    private static async Task<object> RegisterDevice(
        string cs, Guid sessionId, string deviceId, string deviceType)
    {
        await using var conn = new NpgsqlConnection(cs);
        await conn.OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO app_data.podcast_device_sessions
                (session_id, device_id, device_type, connected_at, last_seen_at)
            VALUES (@sid, @did, @dtype, now(), now())
            ON CONFLICT (session_id, device_id) DO UPDATE
                SET last_seen_at = now(),
                    connected_at = COALESCE(podcast_device_sessions.connected_at, now())
            RETURNING recording_state, current_card_index, video_feed_active";
        cmd.Parameters.AddWithValue("sid",   sessionId);
        cmd.Parameters.AddWithValue("did",   deviceId);
        cmd.Parameters.AddWithValue("dtype", deviceType);
        await using var r = await cmd.ExecuteReaderAsync();
        if (!await r.ReadAsync()) return new { };
        var resumed = new
        {
            recordingState   = r.GetString(0),
            currentCardIndex = r.GetInt32(1),
            videoFeedActive  = r.GetBoolean(2),
        };

        // Notify other devices
        await r.CloseAsync();
        await using var n = conn.CreateCommand();
        n.CommandText = "SELECT pg_notify(@ch, @payload)";
        n.Parameters.AddWithValue("ch", _channel);
        n.Parameters.AddWithValue("payload", JsonSerializer.Serialize(new
        {
            @event      = "device_joined",
            session_id  = sessionId.ToString("D"),
            device_id   = deviceId,
            device_type = deviceType,
            resumed_state = resumed,
        }));
        await n.ExecuteNonQueryAsync();
        return resumed;
    }

    private static async Task AdvanceCard(NpgsqlConnection conn, Guid sessionId, string deviceId, string direction)
    {
        await using var tx = await conn.BeginTransactionAsync();
        try
        {
            await using var sel = conn.CreateCommand();
            sel.CommandText = "SELECT current_card_index, total_cards FROM app_data.podcast_sessions WHERE session_id=@sid FOR UPDATE";
            sel.Parameters.AddWithValue("sid", sessionId);
            sel.Transaction = tx;
            await using var r = await sel.ExecuteReaderAsync();
            if (!await r.ReadAsync()) { await tx.RollbackAsync(); return; }
            var current = r.GetInt32(0);
            var total   = r.GetInt32(1);
            await r.CloseAsync();

            var next = direction == "forward"
                ? Math.Min(current + 1, total - 1)
                : Math.Max(current - 1, 0);

            await using var upd = conn.CreateCommand();
            upd.CommandText = "UPDATE app_data.podcast_sessions SET current_card_index=@n, card_state='active', updated_at=now() WHERE session_id=@sid";
            upd.Parameters.AddWithValue("n",   next);
            upd.Parameters.AddWithValue("sid", sessionId);
            upd.Transaction = tx;
            await upd.ExecuteNonQueryAsync();

            await using var n = conn.CreateCommand();
            n.CommandText = "SELECT pg_notify(@ch, @p)";
            n.Parameters.AddWithValue("ch", _channel);
            n.Parameters.AddWithValue("p",  JsonSerializer.Serialize(new
            {
                @event      = "card_advanced",
                session_id  = sessionId.ToString("D"),
                card_index  = next,
                advanced_by = deviceId,
                direction,
            }));
            n.Transaction = tx;
            await n.ExecuteNonQueryAsync();
            await tx.CommitAsync();
        }
        catch { await tx.RollbackAsync(); throw; }
    }

    private static async Task UpdateVideoFeed(
        NpgsqlConnection conn, Guid sessionId, string deviceId, bool active, string feedType)
    {
        if (active)
        {
            await using var clr = conn.CreateCommand();
            clr.CommandText = "UPDATE app_data.podcast_device_sessions SET video_feed_active=FALSE WHERE session_id=@sid AND device_id!=@did";
            clr.Parameters.AddWithValue("sid", sessionId);
            clr.Parameters.AddWithValue("did", deviceId);
            await clr.ExecuteNonQueryAsync();
        }
        await using var upd = conn.CreateCommand();
        upd.CommandText = "UPDATE app_data.podcast_device_sessions SET video_feed_active=@a, video_feed_type=@ft, last_seen_at=now() WHERE session_id=@sid AND device_id=@did";
        upd.Parameters.AddWithValue("a",   active);
        upd.Parameters.AddWithValue("ft",  feedType);
        upd.Parameters.AddWithValue("sid", sessionId);
        upd.Parameters.AddWithValue("did", deviceId);
        await upd.ExecuteNonQueryAsync();

        await using var n = conn.CreateCommand();
        n.CommandText = "SELECT pg_notify(@ch, @p)";
        n.Parameters.AddWithValue("ch", _channel);
        n.Parameters.AddWithValue("p", JsonSerializer.Serialize(new
        {
            @event            = "video_feed_changed",
            session_id        = sessionId.ToString("D"),
            active_device_id  = active ? deviceId : null,
            feed_type         = feedType,
        }));
        await n.ExecuteNonQueryAsync();
    }

    private static async Task SetRecordingState(NpgsqlConnection conn, Guid sessionId, string deviceId, string state)
    {
        await using var upd = conn.CreateCommand();
        upd.CommandText = "UPDATE app_data.podcast_sessions SET recording_state=@s, updated_at=now() WHERE session_id=@sid";
        upd.Parameters.AddWithValue("s",   state);
        upd.Parameters.AddWithValue("sid", sessionId);
        await upd.ExecuteNonQueryAsync();

        await using var n = conn.CreateCommand();
        n.CommandText = "SELECT pg_notify(@ch, @p)";
        n.Parameters.AddWithValue("ch", _channel);
        n.Parameters.AddWithValue("p", JsonSerializer.Serialize(new
        {
            @event           = "recording_state_changed",
            session_id       = sessionId.ToString("D"),
            device_id        = deviceId,
            recording_state  = state,
        }));
        await n.ExecuteNonQueryAsync();
    }

    private static async Task UpsertCards(NpgsqlConnection conn, Guid sessionId, List<ScriptCardInput> cards, CancellationToken ct)
    {
        for (var i = 0; i < cards.Count; i++)
        {
            var c = cards[i];
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                INSERT INTO app_data.podcast_script_cards
                    (session_id, card_index, title, body, media_url,
                     media_type, duration_seconds, speaker_hint)
                VALUES (@sid,@i,@t,@b,@mu,@mt,@ds,@sh)
                ON CONFLICT (session_id, card_index) DO UPDATE
                    SET title=@t, body=@b, media_url=@mu,
                        media_type=@mt, duration_seconds=@ds, speaker_hint=@sh";
            cmd.Parameters.AddWithValue("sid", sessionId);
            cmd.Parameters.AddWithValue("i",   i);
            cmd.Parameters.AddWithValue("t",   (object?)c.Title          ?? DBNull.Value);
            cmd.Parameters.AddWithValue("b",   (object?)c.Body           ?? DBNull.Value);
            cmd.Parameters.AddWithValue("mu",  (object?)c.MediaUrl       ?? DBNull.Value);
            cmd.Parameters.AddWithValue("mt",  (object?)c.MediaType      ?? DBNull.Value);
            cmd.Parameters.AddWithValue("ds",  (object?)c.DurationSeconds ?? DBNull.Value);
            cmd.Parameters.AddWithValue("sh",  (object?)c.SpeakerHint    ?? DBNull.Value);
            await cmd.ExecuteNonQueryAsync(ct);
        }
    }

    private static async Task SendJson(WebSocket ws, object payload)
    {
        if (ws.State != WebSocketState.Open) return;
        var bytes = JsonSerializer.SerializeToUtf8Bytes(payload,
            new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
        await ws.SendAsync(bytes, WebSocketMessageType.Text, true, CancellationToken.None);
    }
}

// ── Request DTOs ──────────────────────────────────────────────────────────────

public sealed class CreatePodcastSyncSessionRequest
{
    public string Title { get; set; } = string.Empty;
    public List<ScriptCardInput>? Cards { get; set; }
}

public sealed class SetCardsRequest
{
    public List<ScriptCardInput> Cards { get; set; } = new();
}

public sealed class ScriptCardInput
{
    public string  Title           { get; set; } = string.Empty;
    public string  Body            { get; set; } = string.Empty;
    public string? MediaUrl        { get; set; }
    public string? MediaType       { get; set; }
    public int?    DurationSeconds { get; set; }
    public string? SpeakerHint     { get; set; }
}

public sealed class PresignChunkRequest
{
    public string DeviceId    { get; set; } = string.Empty;
    public int    ChunkIndex  { get; set; }
    public string ContentType { get; set; } = "video/webm";
}

public sealed class RegisterChunkRequest
{
    public string DeviceId    { get; set; } = string.Empty;
    public int    ChunkIndex  { get; set; }
    public string StorageKey  { get; set; } = string.Empty;
    public long   SizeBytes   { get; set; }
    public string Sha256      { get; set; } = string.Empty;
}
