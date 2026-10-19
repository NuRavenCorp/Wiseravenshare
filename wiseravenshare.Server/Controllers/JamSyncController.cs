using System.Net.WebSockets;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace Wiseravenshare.Server.Controllers;

/// <summary>
/// Distributed musician jam session orchestration.
///
/// Handles: session creation, musician registration, latency measurement,
/// snowball routing order, shared metronome, and pairwise offset matrix.
///
/// Audio never flows through this server — it flows WebRTC P2P or via SFU.
/// Real-time sync: GET /api/jam-sync/ws/{jamId}
/// </summary>
[ApiController]
[Route("api/jam-sync")]
[Authorize]
public sealed class JamSyncController : ControllerBase
{
    private readonly IConfiguration _config;
    private readonly ILogger<JamSyncController> _logger;
    private static readonly string _channel = "jam_events";

    // In-memory RTT map (supplemented by DB for reconnects)
    private static readonly Dictionary<string, Dictionary<string, double>> _rttMap = new();
    private static readonly Dictionary<string, List<string>> _routingOrders = new();

    private static readonly Dictionary<string, int> RolePriority = new()
    {
        ["drummer"]     = 0,
        ["bassist"]     = 1,
        ["keyboardist"] = 2,
        ["guitarist"]   = 3,
        ["vocalist"]    = 4,
        ["other"]       = 5,
    };

    public JamSyncController(IConfiguration config, ILogger<JamSyncController> logger)
    {
        _config = config;
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
        [FromBody] CreateJamSessionRequest req, CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId == Guid.Empty) return Unauthorized();
        if (string.IsNullOrWhiteSpace(req.Title)) return BadRequest(new { message = "title is required" });

        var jamId = Guid.NewGuid();
        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "INSERT INTO app_data.jam_sessions (jam_id, host_user_id, title) VALUES (@id, @uid, @t)";
        cmd.Parameters.AddWithValue("id",  jamId);
        cmd.Parameters.AddWithValue("uid", userId);
        cmd.Parameters.AddWithValue("t",   req.Title.Trim());
        await cmd.ExecuteNonQueryAsync(ct);
        return Ok(new { jamId });
    }

    [HttpPost("sessions/{jamId:guid}/musicians")]
    public async Task<IActionResult> JoinSession(
        Guid jamId, [FromBody] JoinJamRequest req, CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO app_data.jam_musicians
                (jam_id, musician_id, role, display_name, connected_at)
            VALUES (@jid, @mid, @role, @name, now())
            ON CONFLICT (jam_id, musician_id) DO UPDATE
                SET role=@role, display_name=@name, last_seen_at=now()";
        cmd.Parameters.AddWithValue("jid",  jamId);
        cmd.Parameters.AddWithValue("mid",  req.MusicianId);
        cmd.Parameters.AddWithValue("role", req.Role ?? "other");
        cmd.Parameters.AddWithValue("name", req.DisplayName ?? "");
        await cmd.ExecuteNonQueryAsync(ct);
        return Ok(new { joined = true, audioConfig = BuildAudioConfig(jamId.ToString(), req.MusicianId) });
    }

    // ──────────────────────────────────────────────────────────────────
    // LATENCY + ROUTING
    // ──────────────────────────────────────────────────────────────────

    [HttpPost("sessions/{jamId:guid}/rtt")]
    public async Task<IActionResult> ReportRtt(
        Guid jamId, [FromBody] RttReportRequest req, CancellationToken ct)
    {
        var key = jamId.ToString();
        if (!_rttMap.ContainsKey(key)) _rttMap[key] = new();
        _rttMap[key][req.MusicianId] = req.RttMs;

        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync(ct);
        await using var upd = conn.CreateCommand();
        upd.CommandText = "UPDATE app_data.jam_musicians SET rtt_ms=@rtt, last_seen_at=now() WHERE jam_id=@jid AND musician_id=@mid";
        upd.Parameters.AddWithValue("rtt", req.RttMs);
        upd.Parameters.AddWithValue("jid", jamId);
        upd.Parameters.AddWithValue("mid", req.MusicianId);
        await upd.ExecuteNonQueryAsync(ct);

        var order  = await ComputeSnowballOrder(conn, jamId);
        var matrix = BuildOffsetMatrix(key);

        // Broadcast routing update
        await using var n = conn.CreateCommand();
        n.CommandText = "SELECT pg_notify(@ch, @p)";
        n.Parameters.AddWithValue("ch", _channel);
        n.Parameters.AddWithValue("p", JsonSerializer.Serialize(new
        {
            @event          = "routing_update",
            jam_id          = jamId.ToString("D"),
            snowball_order  = order,
            offset_matrix   = matrix,
        }));
        await n.ExecuteNonQueryAsync(ct);

        return Ok(new
        {
            snowballOrder = order,
            offsetMatrix  = matrix,
            audioConfig   = BuildAudioConfig(key, req.MusicianId),
        });
    }

    [HttpGet("sessions/{jamId:guid}/offset-matrix")]
    public IActionResult GetOffsetMatrix(Guid jamId) =>
        Ok(BuildOffsetMatrix(jamId.ToString()));

    [HttpGet("sessions/{jamId:guid}/audio-config/{musicianId}")]
    public IActionResult GetAudioConfig(Guid jamId, string musicianId) =>
        Ok(BuildAudioConfig(jamId.ToString(), musicianId));

    // ──────────────────────────────────────────────────────────────────
    // METRONOME
    // ──────────────────────────────────────────────────────────────────

    [HttpPost("sessions/{jamId:guid}/metronome")]
    public async Task<IActionResult> StartMetronome(
        Guid jamId, [FromBody] StartMetronomeRequest req, CancellationToken ct)
    {
        var startTs = DateTimeOffset.UtcNow.AddSeconds(2).ToUnixTimeMilliseconds() / 1000.0;

        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO app_data.jam_metronome_state (jam_id, bpm, start_ts, running)
            VALUES (@jid, @bpm, to_timestamp(@ts), TRUE)
            ON CONFLICT (jam_id) DO UPDATE
                SET bpm=@bpm, start_ts=to_timestamp(@ts), running=TRUE";
        cmd.Parameters.AddWithValue("jid", jamId);
        cmd.Parameters.AddWithValue("bpm", req.Bpm);
        cmd.Parameters.AddWithValue("ts",  startTs);
        await cmd.ExecuteNonQueryAsync(ct);

        var key     = jamId.ToString();
        var offsets = (_rttMap.TryGetValue(key, out var rtts) ? rtts : new())
            .ToDictionary(kv => kv.Key, kv => Math.Round(kv.Value / 2.0, 1));

        await using var n = conn.CreateCommand();
        n.CommandText = "SELECT pg_notify(@ch, @p)";
        n.Parameters.AddWithValue("ch", _channel);
        n.Parameters.AddWithValue("p", JsonSerializer.Serialize(new
        {
            @event   = "metronome_started",
            jam_id   = jamId.ToString("D"),
            bpm      = req.Bpm,
            start_ts = startTs,
            offsets,
        }));
        await n.ExecuteNonQueryAsync(ct);

        return Ok(new { bpm = req.Bpm, startTs, offsets });
    }

    // ──────────────────────────────────────────────────────────────────
    // WEBSOCKET
    // ──────────────────────────────────────────────────────────────────

    [HttpGet("ws/{jamId:guid}")]
    public async Task JamWebSocket(Guid jamId)
    {
        if (!HttpContext.WebSockets.IsWebSocketRequest)
        {
            HttpContext.Response.StatusCode = 400;
            return;
        }

        using var ws  = await HttpContext.WebSockets.AcceptWebSocketAsync();
        var cs         = ConnectionString!;
        var jamKey     = jamId.ToString();
        string? musicianId = null;

        // Receive init message with musician_id, role, name
        var initBuf = new byte[1024];
        var initRes = await ws.ReceiveAsync(initBuf, CancellationToken.None);
        try
        {
            using var doc  = JsonDocument.Parse(initBuf.AsMemory(0, initRes.Count));
            musicianId     = doc.RootElement.TryGetProperty("musician_id", out var m) ? m.GetString() : Guid.NewGuid().ToString();
            var role       = doc.RootElement.TryGetProperty("role",        out var r) ? r.GetString() : "other";
            var name       = doc.RootElement.TryGetProperty("name",        out var n) ? n.GetString() : "";
            await RegisterMusician(cs, jamId, musicianId!, role!, name!);
        }
        catch { musicianId ??= Guid.NewGuid().ToString(); }

        await SendJson(ws, new { @event = "connected", musicianId, audioConfig = BuildAudioConfig(jamKey, musicianId!) });

        // Listen for NOTIFY and forward
        await using var listenConn = new NpgsqlConnection(cs);
        await listenConn.OpenAsync();
        using var cts = new CancellationTokenSource();

        listenConn.Notification += (_, e) =>
        {
            try
            {
                var data = JsonDocument.Parse(e.Payload);
                var jid  = data.RootElement.TryGetProperty("jam_id", out var je) ? je.GetString() : null;
                if (string.Equals(jid, jamId.ToString("D"), StringComparison.OrdinalIgnoreCase))
                    _ = SendJson(ws, data.RootElement);
            }
            catch { }
        };
        await using var lc = listenConn.CreateCommand();
        lc.CommandText = $"LISTEN {_channel}";
        await lc.ExecuteNonQueryAsync();

        _ = Task.Run(async () =>
        {
            while (!cts.Token.IsCancellationRequested)
                try { await listenConn.WaitAsync(cts.Token); } catch { break; }
        }, cts.Token);

        var buf = new byte[4096];
        while (ws.State == WebSocketState.Open)
        {
            WebSocketReceiveResult res;
            try { res = await ws.ReceiveAsync(buf, CancellationToken.None); }
            catch { break; }
            if (res.MessageType == WebSocketMessageType.Close) break;

            try
            {
                using var doc = JsonDocument.Parse(buf.AsMemory(0, res.Count));
                var type      = doc.RootElement.TryGetProperty("type", out var t) ? t.GetString() : null;
                var mid       = doc.RootElement.TryGetProperty("musician_id", out var mi) ? mi.GetString() : musicianId;

                if (type == "ping")
                {
                    var clientTs = doc.RootElement.TryGetProperty("ts", out var ts) ? ts.GetDouble() : 0;
                    await SendJson(ws, new { pong = true, serverTs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() / 1000.0, clientTs });
                }
                else if (type == "rtt_report" && mid != null)
                {
                    var rtt = doc.RootElement.TryGetProperty("rtt_ms", out var r2) ? r2.GetDouble() : 0;
                    if (!_rttMap.ContainsKey(jamKey)) _rttMap[jamKey] = new();
                    _rttMap[jamKey][mid] = rtt;
                    await using var cmdConn = new NpgsqlConnection(cs);
                    await cmdConn.OpenAsync();
                    var order = await ComputeSnowballOrder(cmdConn, jamId);
                    await SendJson(ws, new { @event = "routing_update", snowballOrder = order, audioConfig = BuildAudioConfig(jamKey, mid) });
                }
                else if (type == "start_metronome")
                {
                    var bpm = doc.RootElement.TryGetProperty("bpm", out var bv) ? bv.GetInt32() : 120;
                    await using var cmdConn = new NpgsqlConnection(cs);
                    await cmdConn.OpenAsync();
                    await StartMetronomeInternal(cmdConn, jamId, bpm);
                }
            }
            catch (Exception ex) { _logger.LogWarning(ex, "Jam WS malformed msg"); }
        }

        await cts.CancelAsync();
    }

    // ──────────────────────────────────────────────────────────────────
    // HELPERS
    // ──────────────────────────────────────────────────────────────────

    private static async Task RegisterMusician(string cs, Guid jamId, string musicianId, string role, string name)
    {
        await using var conn = new NpgsqlConnection(cs);
        await conn.OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO app_data.jam_musicians (jam_id, musician_id, role, display_name, connected_at)
            VALUES (@jid, @mid, @role, @name, now())
            ON CONFLICT (jam_id, musician_id) DO UPDATE SET role=@role, display_name=@name, last_seen_at=now()";
        cmd.Parameters.AddWithValue("jid",  jamId);
        cmd.Parameters.AddWithValue("mid",  musicianId);
        cmd.Parameters.AddWithValue("role", role);
        cmd.Parameters.AddWithValue("name", name);
        await cmd.ExecuteNonQueryAsync();
    }

    private async Task<List<string>> ComputeSnowballOrder(NpgsqlConnection conn, Guid jamId)
    {
        var key = jamId.ToString();
        var rtt = _rttMap.TryGetValue(key, out var m) ? m : new();

        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT musician_id, role FROM app_data.jam_musicians WHERE jam_id=@jid AND last_seen_at > now() - interval '5 minutes'";
        cmd.Parameters.AddWithValue("jid", jamId);
        var musicians = new List<(string id, string role, double rttMs)>();
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            var mid  = r.GetString(0);
            var role = r.GetString(1);
            rtt.TryGetValue(mid, out var rttMs);
            musicians.Add((mid, role, rttMs));
        }

        var order = musicians
            .OrderBy(m => RolePriority.TryGetValue(m.role, out var p) ? p : 5)
            .ThenBy(m => m.rttMs)
            .Select(m => m.id)
            .ToList();

        _routingOrders[key] = order;
        return order;
    }

    private Dictionary<string, Dictionary<string, double>> BuildOffsetMatrix(string jamKey)
    {
        var rtt = _rttMap.TryGetValue(jamKey, out var m) ? m : new();
        var matrix = new Dictionary<string, Dictionary<string, double>>();
        foreach (var (aId, aRtt) in rtt)
        {
            matrix[aId] = new();
            foreach (var (bId, bRtt) in rtt)
            {
                if (aId == bId) continue;
                matrix[aId][bId] = Math.Round(bRtt / 2.0 - aRtt / 2.0, 1);
            }
        }
        return matrix;
    }

    private object BuildAudioConfig(string jamKey, string musicianId)
    {
        var rtt     = _rttMap.TryGetValue(jamKey, out var m) ? m : new();
        var offset  = rtt.TryGetValue(musicianId, out var r) ? Math.Round(r / 2.0, 1) : 0.0;
        var order   = _routingOrders.TryGetValue(jamKey, out var o) ? o : new();
        var pos     = order.IndexOf(musicianId);
        return new
        {
            audio = new
            {
                echoCancellation = false,
                noiseSuppression = false,
                autoGainControl  = false,
                sampleRate       = 48000,
                channelCount     = 2,
            },
            codec = new
            {
                mimeType    = "audio/opus",
                clockRate   = 48000,
                channels    = 2,
                bitrate     = 128000,
                ptime       = 20,
            },
            metronomeOffsetMs = offset,
            routingPosition   = pos,
            hearFrom          = pos > 0 ? order[..pos] : new List<string>(),
        };
    }

    private static async Task StartMetronomeInternal(NpgsqlConnection conn, Guid jamId, int bpm)
    {
        var startTs = DateTimeOffset.UtcNow.AddSeconds(2).ToUnixTimeMilliseconds() / 1000.0;
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO app_data.jam_metronome_state (jam_id, bpm, start_ts, running)
            VALUES (@jid, @bpm, to_timestamp(@ts), TRUE)
            ON CONFLICT (jam_id) DO UPDATE SET bpm=@bpm, start_ts=to_timestamp(@ts), running=TRUE";
        cmd.Parameters.AddWithValue("jid", jamId);
        cmd.Parameters.AddWithValue("bpm", bpm);
        cmd.Parameters.AddWithValue("ts",  startTs);
        await cmd.ExecuteNonQueryAsync();

        await using var n = conn.CreateCommand();
        n.CommandText = "SELECT pg_notify(@ch, @p)";
        n.Parameters.AddWithValue("ch", "jam_events");
        n.Parameters.AddWithValue("p", JsonSerializer.Serialize(new
        {
            @event   = "metronome_started",
            jam_id   = jamId.ToString("D"),
            bpm,
            start_ts = startTs,
        }));
        await n.ExecuteNonQueryAsync();
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

public sealed class CreateJamSessionRequest
{
    public string Title { get; set; } = string.Empty;
}

public sealed class JoinJamRequest
{
    public string  MusicianId  { get; set; } = string.Empty;
    public string? Role        { get; set; }
    public string? DisplayName { get; set; }
}

public sealed class RttReportRequest
{
    public string MusicianId { get; set; } = string.Empty;
    public double RttMs      { get; set; }
}

public sealed class StartMetronomeRequest
{
    public int Bpm { get; set; } = 120;
}
