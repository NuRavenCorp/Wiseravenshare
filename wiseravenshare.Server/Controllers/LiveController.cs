using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using AgoraIO.Media;
using Npgsql;
using System.Text.Json;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Hubs;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Shared;
using Wiseravenshare.Server.Services;
using System.Globalization;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/live")]
public sealed class LiveController : ControllerBase
{
    private static readonly HashSet<string> KeepPhrases = new(StringComparer.OrdinalIgnoreCase)
    {
        "keep",
        "keep it",
        "keep this",
        "save",
        "save it",
    };

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly LiveStreamStateStore _liveStreamStateStore;
    private readonly VideoLibraryStore _videoLibraryStore;
    private readonly IBlobStorageService _blobStorageService;
    private readonly IMediaBlobSignatureService _signatureService;
    private readonly AppDbContext _db;
    private readonly IHubContext<NotificationHub> _notificationHub;
    private readonly IConfiguration _configuration;
    private readonly ILogger<LiveController> _logger;

    public LiveController(
        IHttpClientFactory httpClientFactory,
        LiveStreamStateStore liveStreamStateStore,
        VideoLibraryStore videoLibraryStore,
        IBlobStorageService blobStorageService,
        IMediaBlobSignatureService signatureService,
        AppDbContext db,
        IHubContext<NotificationHub> notificationHub,
        IConfiguration configuration,
        ILogger<LiveController> logger)
    {
        _httpClientFactory = httpClientFactory;
        _liveStreamStateStore = liveStreamStateStore;
        _videoLibraryStore = videoLibraryStore;
        _blobStorageService = blobStorageService;
        _signatureService = signatureService;
        _db = db;
        _notificationHub = notificationHub;
        _configuration = configuration;
        _logger = logger;
    }

    [HttpGet("feed")]
    [AllowAnonymous]
    public async Task<IActionResult> Feed(
        [FromQuery] string viewer_id,
        [FromQuery] int limit = 50,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(viewer_id))
        {
            return BadRequest(new { message = "viewer_id is required." });
        }

        var boundedLimit = Math.Clamp(limit, 1, 100);
        var query = $"live/feed?viewer_id={Uri.EscapeDataString(viewer_id)}&limit={boundedLimit}";

        try
        {
            using var client = _httpClientFactory.CreateClient("PythonLiveRankerService");
            var response = await client.GetAsync(query, cancellationToken);
            var raw = await response.Content.ReadAsStringAsync(cancellationToken);
            var mediaType = response.Content.Headers.ContentType?.MediaType;

            if (string.Equals(mediaType, "application/json", StringComparison.OrdinalIgnoreCase))
            {
                return new ContentResult
                {
                    Content = raw,
                    ContentType = "application/json",
                    StatusCode = (int)response.StatusCode,
                };
            }

            return StatusCode((int)response.StatusCode, new { message = raw });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Live feed proxy request failed.");
            return Ok(new { streams = BuildLocalFeed(boundedLimit) });
        }
    }

    [HttpGet("training-data")]
    [AllowAnonymous]
    public async Task<IActionResult> TrainingData(
        [FromQuery] int limit = 500,
        CancellationToken cancellationToken = default)
    {
        var boundedLimit = Math.Clamp(limit, 1, 5000);
        var query = $"live/training-data?limit={boundedLimit}";

        try
        {
            using var client = _httpClientFactory.CreateClient("PythonLiveRankerService");
            var response = await client.GetAsync(query, cancellationToken);
            var raw = await response.Content.ReadAsStringAsync(cancellationToken);
            var mediaType = response.Content.Headers.ContentType?.MediaType;

            if (response.IsSuccessStatusCode
                && string.Equals(mediaType, "application/json", StringComparison.OrdinalIgnoreCase))
            {
                return new ContentResult
                {
                    Content = raw,
                    ContentType = "application/json",
                    StatusCode = (int)response.StatusCode,
                };
            }

            _logger.LogWarning(
                "Python live training-data upstream returned {StatusCode}. Using local fallback.",
                (int)response.StatusCode);
            return Ok(await BuildLocalTrainingDataFallbackAsync(boundedLimit, cancellationToken));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Live feed training data proxy request failed. Using local fallback.");
            return Ok(await BuildLocalTrainingDataFallbackAsync(boundedLimit, cancellationToken));
        }
    }

    private async Task<object> BuildLocalTrainingDataFallbackAsync(int limit, CancellationToken cancellationToken)
    {
        var normalizedLimit = Math.Clamp(limit, 1, 5000);
        var connectionString = _db.Database.GetDbConnection().ConnectionString;
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            return new
            {
                samples = Array.Empty<object>(),
                count = 0,
                source = "local-fallback",
                message = "Live training data fallback is unavailable because the database connection string is missing."
            };
        }

        try
        {
            await using var connection = new NpgsqlConnection(connectionString);
            await connection.OpenAsync(cancellationToken);

            var schema = await ResolveLiveRankSchemaAsync(connection, cancellationToken);
            if (string.IsNullOrWhiteSpace(schema))
            {
                return new
                {
                    samples = Array.Empty<object>(),
                    count = 0,
                    source = "local-fallback",
                    message = "No live rank impression table is available yet."
                };
            }

            var interactionsExists = await TableExistsAsync(connection, schema, "live_interactions", cancellationToken);
            var impressionsTable = $"{schema}.live_rank_impressions";
            var interactionsTable = $"{schema}.live_interactions";

            var query = interactionsExists
                ? $"""
SELECT
    i.id,
    i.viewer_id,
    i.stream_id,
    i.score,
    i.score_source,
    i.rank_position,
    i.features::text,
    i.created_at,
    COALESCE(SUM(li.watch_seconds), 0) AS watch_seconds,
    COALESCE(BOOL_OR(li.liked), FALSE) AS liked,
    COALESCE(BOOL_OR(li.commented), FALSE) AS commented,
    COALESCE(BOOL_OR(li.shared), FALSE) AS shared,
    COALESCE(BOOL_OR(li.followed_after), FALSE) AS followed_after
FROM {impressionsTable} i
LEFT JOIN {interactionsTable} li
    ON li.viewer_id = i.viewer_id
   AND li.stream_id = i.stream_id
   AND li.created_at >= i.created_at
   AND li.created_at < i.created_at + interval '24 hours'
GROUP BY
    i.id, i.viewer_id, i.stream_id, i.score, i.score_source,
    i.rank_position, i.features, i.created_at
ORDER BY i.id DESC
LIMIT @limit;
"""
                : $"""
SELECT
    i.id,
    i.viewer_id,
    i.stream_id,
    i.score,
    i.score_source,
    i.rank_position,
    i.features::text,
    i.created_at,
    0::double precision AS watch_seconds,
    FALSE AS liked,
    FALSE AS commented,
    FALSE AS shared,
    FALSE AS followed_after
FROM {impressionsTable} i
ORDER BY i.id DESC
LIMIT @limit;
""";

            await using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("limit", normalizedLimit);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);

            var samples = new List<object>();
            while (await reader.ReadAsync(cancellationToken))
            {
                var featuresRaw = reader.IsDBNull(6) ? "{}" : reader.GetString(6);
                var features = ParseFeatureMap(featuresRaw);
                var watchSeconds = reader.IsDBNull(8) ? 0d : Convert.ToDouble(reader.GetValue(8), CultureInfo.InvariantCulture);
                var liked = !reader.IsDBNull(9) && reader.GetBoolean(9);
                var commented = !reader.IsDBNull(10) && reader.GetBoolean(10);
                var shared = !reader.IsDBNull(11) && reader.GetBoolean(11);
                var followedAfter = !reader.IsDBNull(12) && reader.GetBoolean(12);
                var label = DeriveRankLabel(watchSeconds, liked, commented, shared, followedAfter);

                samples.Add(new
                {
                    impression_id = reader.IsDBNull(0) ? 0L : Convert.ToInt64(reader.GetValue(0), CultureInfo.InvariantCulture),
                    viewer_id = reader.IsDBNull(1) ? string.Empty : reader.GetString(1),
                    stream_id = reader.IsDBNull(2) ? string.Empty : reader.GetString(2),
                    features,
                    label,
                    metadata = new
                    {
                        scored_at = reader.IsDBNull(7)
                            ? DateTimeOffset.UtcNow.ToString("O")
                            : reader.GetDateTime(7).ToUniversalTime().ToString("O"),
                        heuristic_or_model_score = reader.IsDBNull(3) ? 0d : Convert.ToDouble(reader.GetValue(3), CultureInfo.InvariantCulture),
                        score_source = reader.IsDBNull(4) ? string.Empty : reader.GetString(4),
                        rank_position = reader.IsDBNull(5) ? 0 : Convert.ToInt32(reader.GetValue(5), CultureInfo.InvariantCulture),
                        watch_seconds_24h = watchSeconds,
                        liked_24h = liked,
                        commented_24h = commented,
                        shared_24h = shared,
                        followed_after_24h = followedAfter
                    }
                });
            }

            return new
            {
                samples,
                count = samples.Count,
                source = "local-fallback",
                schema
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to build local live training data fallback.");
            return new
            {
                samples = Array.Empty<object>(),
                count = 0,
                source = "local-fallback",
                message = "Live training data fallback failed."
            };
        }
    }

    private static async Task<string> ResolveLiveRankSchemaAsync(NpgsqlConnection connection, CancellationToken cancellationToken)
    {
        foreach (var schema in new[] { "public", "app_data" })
        {
            if (await TableExistsAsync(connection, schema, "live_rank_impressions", cancellationToken))
            {
                return schema;
            }
        }

        return string.Empty;
    }

    private static async Task<bool> TableExistsAsync(NpgsqlConnection connection, string schema, string tableName, CancellationToken cancellationToken)
    {
        const string sql = """
SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = @schema
      AND table_name = @table
);
""";
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("schema", schema);
        command.Parameters.AddWithValue("table", tableName);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is bool exists && exists;
    }

    private static Dictionary<string, object?> ParseFeatureMap(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        }

        try
        {
            var parsed = JsonSerializer.Deserialize<Dictionary<string, object?>>(raw);
            return parsed ?? new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        }
        catch
        {
            return new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        }
    }

    private static int DeriveRankLabel(double watchSeconds, bool liked, bool commented, bool shared, bool followedAfter)
    {
        if (shared || followedAfter)
        {
            return 3;
        }

        if (commented || watchSeconds >= 120d)
        {
            return 2;
        }

        if (liked || watchSeconds >= 30d)
        {
            return 1;
        }

        return 0;
    }

    [HttpGet("agora/token")]
    [AllowAnonymous]
    public IActionResult GetAgoraToken(
        [FromQuery] string channelName,
        [FromQuery] uint uid = 0,
        [FromQuery] string role = "publisher")
    {
        var normalizedChannelName = (channelName ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedChannelName))
        {
            return BadRequest(new { message = "channelName is required." });
        }

        var appId = ReadSetting("Agora:AppId", "AGORA_APP_ID");
        var appCertificate = ReadSetting("Agora:AppCertificate", "AGORA_APP_CERTIFICATE");
        if (string.IsNullOrWhiteSpace(appId) || string.IsNullOrWhiteSpace(appCertificate))
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                message = "Agora is not configured on this server."
            });
        }

        var expiryRaw = ReadSetting("Agora:TokenExpirySeconds", "AGORA_TOKEN_EXPIRY_SECONDS");
        var expirySeconds = 3600u;
        if (uint.TryParse(expiryRaw, out var parsedExpiry) && parsedExpiry > 0)
        {
            expirySeconds = parsedExpiry;
        }

        var normalizedRole = (role ?? string.Empty).Trim().ToLowerInvariant();
        var agoraRole = normalizedRole switch
        {
            "subscriber" => RtcTokenBuilder.Role.RoleSubscriber,
            "attendee" => RtcTokenBuilder.Role.RoleAttendee,
            "admin" => RtcTokenBuilder.Role.RoleAdmin,
            _ => RtcTokenBuilder.Role.RolePublisher
        };

        var privilegeExpiredTs = (uint)DateTimeOffset.UtcNow.ToUnixTimeSeconds() + expirySeconds;
        var token = RtcTokenBuilder.buildTokenWithUID(
            appId,
            appCertificate,
            normalizedChannelName,
            uid,
            agoraRole,
            privilegeExpiredTs);

        return Ok(new
        {
            appId,
            token,
            channelName = normalizedChannelName,
            uid,
            role = normalizedRole,
            expiresInSeconds = expirySeconds
        });
    }

    [HttpGet("ice-servers")]
    [AllowAnonymous]
    public async Task<IActionResult> IceServers(CancellationToken cancellationToken = default)
    {
        var appName = ReadSetting("MeteredTurn:AppName", "METERED_TURN_APP_NAME");
        var credentialApiKey = ReadSetting("MeteredTurn:CredentialApiKey", "METERED_TURN_API_KEY", "Metered_Turn_Secret_Key");
        var credentialsEndpoint = ReadSetting("MeteredTurn:CredentialsEndpoint", "METERED_TURN_CREDENTIALS_ENDPOINT");
        var region = ReadSetting("MeteredTurn:Region", "METERED_TURN_REGION");
        var username = ReadSetting("MeteredTurn:Username", "METERED_TURN_USERNAME");
        var password = ReadSetting("MeteredTurn:Password", "METERED_TURN_PASSWORD");
        var relayHost = ReadSetting("MeteredTurn:RelayHost", "METERED_TURN_RELAY_HOST");
        var stunHost = ReadSetting("MeteredTurn:StunHost", "METERED_TURN_STUN_HOST");
        var timeoutSecondsRaw = ReadSetting("MeteredTurn:TimeoutSeconds", "METERED_TURN_TIMEOUT_SECONDS");

        if (string.IsNullOrWhiteSpace(relayHost))
        {
            relayHost = "global.relay.metered.ca";
        }

        if (string.IsNullOrWhiteSpace(stunHost))
        {
            stunHost = "stun.relay.metered.ca";
        }

        var timeoutSeconds = 4;
        if (int.TryParse(timeoutSecondsRaw, out var parsedTimeout) && parsedTimeout > 0)
        {
            timeoutSeconds = parsedTimeout;
        }

        if (!string.IsNullOrWhiteSpace(username) && !string.IsNullOrWhiteSpace(password))
        {
            return Ok(new
            {
                providers = "metered-static-credential",
                iceServers = BuildMeteredStaticCredentialIceServers(username, password, relayHost, stunHost)
            });
        }

        if (string.IsNullOrWhiteSpace(appName) || string.IsNullOrWhiteSpace(credentialApiKey))
        {
            if (string.IsNullOrWhiteSpace(credentialsEndpoint) || string.IsNullOrWhiteSpace(credentialApiKey))
            {
                return Ok(new { providers = "fallback", iceServers = BuildFallbackIceServers() });
            }
        }

        var meteredUrl = BuildMeteredCredentialsUrl(
            appName,
            credentialApiKey,
            credentialsEndpoint,
            region);

        try
        {
            using var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(timeoutSeconds);

            using var response = await client.GetAsync(meteredUrl, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var detail = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogWarning(
                    "Metered ICE server fetch failed with {StatusCode}: {Detail}",
                    (int)response.StatusCode,
                    detail);

                return Ok(new { providers = "fallback", iceServers = BuildFallbackIceServers() });
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            var iceServers = await JsonSerializer.DeserializeAsync<object[]>(stream, cancellationToken: cancellationToken)
                ?? Array.Empty<object>();

            if (iceServers.Length == 0)
            {
                return Ok(new { providers = "fallback", iceServers = BuildFallbackIceServers() });
            }

            return Ok(new
            {
                providers = "metered",
                iceServers
            });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Metered ICE server fetch failed. Falling back to STUN-only config.");
            return Ok(new { providers = "fallback", iceServers = BuildFallbackIceServers() });
        }
    }

    private static object[] BuildFallbackIceServers() => new object[]
    {
        new { urls = "stun:stun.relay.metered.ca:80" },
        new { urls = "stun:stun.l.google.com:19302" }
    };

    private static object[] BuildMeteredStaticCredentialIceServers(string username, string password, string relayHost, string stunHost) => new object[]
    {
        new { urls = $"stun:{stunHost}:80" },
        new { urls = $"turn:{relayHost}:80", username, credential = password },
        new { urls = $"turn:{relayHost}:80?transport=tcp", username, credential = password },
        new { urls = $"turn:{relayHost}:443", username, credential = password },
        new { urls = $"turns:{relayHost}:443?transport=tcp", username, credential = password }
    };

    private string ReadSetting(params string[] keys)
    {
        foreach (var key in keys)
        {
            var value = (_configuration[key] ?? string.Empty).Trim();
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value;
            }
        }

        return string.Empty;
    }

    private static string BuildMeteredCredentialsUrl(
        string appName,
        string credentialApiKey,
        string credentialsEndpoint,
        string region)
    {
        var endpoint = (credentialsEndpoint ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(endpoint))
        {
            var delimiter = endpoint.Contains('?') ? "&" : "?";
            var url = $"{endpoint}{delimiter}apiKey={Uri.EscapeDataString(credentialApiKey)}";
            if (!string.IsNullOrWhiteSpace(region))
            {
                url = $"{url}&region={Uri.EscapeDataString(region)}";
            }

            return url;
        }

        var defaultUrl = $"https://{appName}.metered.live/api/v1/turn/credentials?apiKey={Uri.EscapeDataString(credentialApiKey)}";
        if (!string.IsNullOrWhiteSpace(region))
        {
            defaultUrl = $"{defaultUrl}&region={Uri.EscapeDataString(region)}";
        }

        return defaultUrl;
    }

    [HttpPost("{streamId}/start")]
    [Authorize]
    public async Task<IActionResult> StartStream(
        [FromRoute] string streamId,
        [FromBody] LiveStreamStartRequest? body = null,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(streamId))
        {
            return BadRequest(new { message = "streamId is required." });
        }

        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        var now = DateTime.UtcNow;
        var title = string.IsNullOrWhiteSpace(body?.title) ? "Untitled live" : body.title.Trim();
        var audioOnly = body?.is_audio_only ?? false;
        var hadExisting = _liveStreamStateStore.TryGet(streamId, out var priorStream) && priorStream is not null;
        var alreadyLive = hadExisting
            && string.Equals(priorStream!.status, "live", StringComparison.OrdinalIgnoreCase)
            && !priorStream.ended_at.HasValue
            && priorStream.deleted_at is null;
        LiveStreamState? existing;
        try
        {
            existing = _liveStreamStateStore.Update(streamId, stream =>
            {
                stream.title = title;
                stream.status = "live";
                stream.is_audio_only = audioOnly;
                stream.started_at ??= now;
                stream.ended_at = null;
                stream.deleted_at = null;
            });

            if (existing is null)
            {
                existing = _liveStreamStateStore.Create(new LiveStreamState
                {
                    id = streamId,
                    created_by_id = userId,
                    streamer_id = userId,
                    title = title,
                    status = "live",
                    is_audio_only = audioOnly,
                    started_at = now,
                    created_date = now,
                    updated_date = now
                });
            }
        }
        catch (PostgresException ex) when (string.Equals(ex.SqlState, "23503", StringComparison.Ordinal))
        {
            _logger.LogWarning(ex, "Live stream start blocked by missing user reference for {UserId}", userId);
            return Conflict(new { message = "Live stream start is blocked by user profile sync. Please re-login and retry." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Live stream start failed for stream {StreamId}", streamId);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = "Live service is temporarily unavailable." });
        }

        if (!alreadyLive && existing is not null)
        {
            try
            {
                await NotifyConnectionsLiveStartedAsync(existing, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Live notification fan-out failed for stream {StreamId}", existing.id);
            }
        }

        return Ok(new
        {
            stream_id = existing.id,
            started_at = existing.started_at,
            status = existing.status
        });
    }

    [HttpPost("{streamId}/join")]
    [Authorize]
    public IActionResult JoinStream([FromRoute] string streamId)
    {
        if (string.IsNullOrWhiteSpace(streamId))
        {
            return BadRequest(new { message = "streamId is required." });
        }

        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        if (!_liveStreamStateStore.TryGet(streamId, out var stream))
        {
            return NotFound(new { message = "Stream not found." });
        }

        if (stream.deleted_at is not null)
        {
            return NotFound(new { message = "Stream is no longer available." });
        }

        if (!string.Equals(stream.status, "live", StringComparison.OrdinalIgnoreCase) || stream.ended_at.HasValue)
        {
            return Conflict(new { message = "Stream is not currently live." });
        }

        return Ok(new
        {
            stream_id = stream.id,
            status = stream.status,
            title = stream.title,
            join_method = "Open viewer, connect to /api/hubs/live-chat, then send chat messages while signed in.",
            chat_room_id = stream.id,
            join_path = $"/media?tab=live&streamId={Uri.EscapeDataString(stream.id)}",
            streamer_id = stream.streamer_id
        });
    }

    [HttpPost("{streamId}/segments/presign")]
    [Authorize]
    public async Task<IActionResult> PresignSegment(
        [FromRoute] string streamId,
        [FromBody] LiveSegmentRequest request,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(streamId))
        {
            return BadRequest(new { message = "streamId is required." });
        }

        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        if (!_liveStreamStateStore.TryGet(streamId, out var stream))
        {
            return NotFound(new { message = "Stream not found." });
        }

        if (!IsOwner(stream, userId))
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "Not your stream." });
        }

        if (stream.ended_at.HasValue)
        {
            return Conflict(new { message = "Stream already ended." });
        }

        if (request.segment_index < 0)
        {
            return BadRequest(new { message = "segment_index must be >= 0." });
        }

        var key = $"live/{streamId}/segments/{request.segment_index:D6}.webm";
        var uploadUrl = await _blobStorageService.GetPresignedUploadUrlAsync(key, "video/webm", TimeSpan.FromMinutes(5));
        if (string.IsNullOrWhiteSpace(uploadUrl))
        {
            return StatusCode(503, new { message = "Blob upload signing is unavailable." });
        }

        _liveStreamStateStore.UpsertSegment(streamId, request.segment_index, key, Math.Max(0, request.size_bytes), request.sha256 ?? string.Empty);
        return Ok(new
        {
            url = uploadUrl,
            key,
            segment_index = request.segment_index
        });
    }

    [HttpPost("{streamId}/segments/{index:int}/confirm")]
    [Authorize]
    public async Task<IActionResult> ConfirmSegment(
        [FromRoute] string streamId,
        [FromRoute] int index,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(streamId))
        {
            return BadRequest(new { message = "streamId is required." });
        }

        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        if (!_liveStreamStateStore.TryGet(streamId, out var stream))
        {
            return NotFound(new { message = "Stream not found." });
        }

        if (!IsOwner(stream, userId))
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "Not your stream." });
        }

        var segment = _liveStreamStateStore.GetSegments(streamId).FirstOrDefault(x => x.segment_index == index);
        if (segment is null)
        {
            return NotFound(new { message = "Unknown segment." });
        }

        var exists = await _blobStorageService.ExistsAsync(segment.storage_key, cancellationToken);
        if (!exists)
        {
            return Conflict(new { message = "Segment not found in storage." });
        }

        _liveStreamStateStore.MarkSegmentUploaded(streamId, index);
        var streamPath = AppendBlobSignatureIfNeeded(
            StreamingUrlHelper.StreamByBlobPath(segment.storage_key),
            segment.storage_key);
        _liveStreamStateStore.Update(streamId, s =>
        {
            s.current_chunk_uri = streamPath;
            s.chunk_sequence = Math.Max(s.chunk_sequence, index + 1);
        });

        var totalDone = _liveStreamStateStore.GetSegments(streamId).Count(x => string.Equals(x.upload_state, "done", StringComparison.OrdinalIgnoreCase));
        return Ok(new
        {
            confirmed = true,
            total_segments = totalDone
        });
    }

    [HttpPost("{streamId}/end")]
    [Authorize]
    public IActionResult EndStream([FromRoute] string streamId)
    {
        if (string.IsNullOrWhiteSpace(streamId))
        {
            return BadRequest(new { message = "streamId is required." });
        }

        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        if (!_liveStreamStateStore.TryGet(streamId, out var stream))
        {
            return NotFound(new { message = "Stream not found." });
        }

        if (!IsOwner(stream, userId))
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "Not your stream." });
        }

        var ended = _liveStreamStateStore.Update(streamId, s =>
        {
            s.ended_at ??= DateTime.UtcNow;
            s.status = "ended";
            if (!s.kept_permanently)
            {
                s.expires_at = s.ended_at.Value.AddHours(72);
            }
        });

        return Ok(new
        {
            stream_id = ended?.id,
            ended_at = ended?.ended_at,
            expires_at = ended?.expires_at,
            kept_permanently = ended?.kept_permanently ?? false
        });
    }

    [HttpDelete("{streamId}")]
    [Authorize]
    public async Task<IActionResult> DeleteStream(
        [FromRoute] string streamId,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(streamId))
        {
            return BadRequest(new { message = "streamId is required." });
        }

        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        if (!_liveStreamStateStore.TryGet(streamId, out var stream))
        {
            return NotFound(new { message = "Stream not found." });
        }

        if (!IsOwner(stream, userId))
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "Not your stream." });
        }

        if (string.Equals(stream.status, "live", StringComparison.OrdinalIgnoreCase) && !stream.ended_at.HasValue)
        {
            return Conflict(new { message = "End the live stream before deleting its files." });
        }

        _liveStreamStateStore.Update(streamId, s =>
        {
            s.deleted_at = DateTime.UtcNow;
            s.status = "deleted";
        });

        var deletedBlobKeys = new List<string>();
        var missingBlobKeys = new List<string>();
        var failedBlobKeys = new List<string>();

        var keys = _liveStreamStateStore.GetSegments(streamId)
            .Select(x => x.storage_key)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .ToList();
        if (!string.IsNullOrWhiteSpace(stream.final_recording_key))
        {
            keys.Add(stream.final_recording_key);
        }

        foreach (var key in keys.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            try
            {
                var deleted = await _blobStorageService.DeleteAsync(key, cancellationToken);
                if (deleted)
                {
                    deletedBlobKeys.Add(key);
                }
                else
                {
                    missingBlobKeys.Add(key);
                }
            }
            catch (Exception ex)
            {
                failedBlobKeys.Add(key);
                _logger.LogWarning(ex, "Failed deleting blob key {BlobKey} for live stream {StreamId}.", key, streamId);
            }
        }

        var deletedRecording = false;
        var finalVideoId = (stream.final_video_id ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(finalVideoId))
        {
            try
            {
                deletedRecording = await _videoLibraryStore.DeleteVideoAsync(finalVideoId, userId, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed deleting final video record {VideoId} for stream {StreamId}.", finalVideoId, streamId);
            }
        }

        _liveStreamStateStore.Remove(streamId);

        return Ok(new
        {
            success = true,
            stream_id = streamId,
            deleted_recording = deletedRecording,
            deleted_blob_keys = deletedBlobKeys,
            missing_blob_keys = missingBlobKeys,
            failed_blob_keys = failedBlobKeys
        });
    }

    [HttpPost("{streamId}/keep")]
    [Authorize]
    public IActionResult KeepStream([FromRoute] string streamId)
    {
        if (string.IsNullOrWhiteSpace(streamId))
        {
            return BadRequest(new { message = "streamId is required." });
        }

        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        if (!_liveStreamStateStore.TryGet(streamId, out var stream))
        {
            return NotFound(new { message = "Stream not found." });
        }

        if (!IsOwner(stream, userId))
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "Not your stream." });
        }

        var alreadyKept = stream.kept_permanently;
        _liveStreamStateStore.TryMarkKeep(streamId, userId, "ui", null, out var updated);
        return Ok(new
        {
            kept = true,
            already = alreadyKept,
            stream_id = streamId,
            kept_at = updated?.kept_at
        });
    }

    [HttpPost("{streamId}/message")]
    [Authorize]
    public IActionResult StreamMessage([FromRoute] string streamId, [FromBody] LiveStreamMessageRequest? body)
    {
        if (string.IsNullOrWhiteSpace(streamId))
        {
            return BadRequest(new { message = "streamId is required." });
        }

        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        if (!_liveStreamStateStore.TryGet(streamId, out var stream))
        {
            return NotFound(new { message = "Stream not found." });
        }

        if (!IsOwner(stream, userId))
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "Not your stream." });
        }

        var text = body?.text?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(text))
        {
            return BadRequest(new { message = "text is required." });
        }

        var isKeep = KeepPhrases.Contains(text) || text.StartsWith("keep ", StringComparison.OrdinalIgnoreCase);
        if (isKeep && !stream.kept_permanently)
        {
            _liveStreamStateStore.TryMarkKeep(streamId, userId, "text", text, out _);
        }

        return Ok(new
        {
            kept = isKeep,
            text
        });
    }

    // ── Direct recording upload (fallback for when blob storage is unavailable) ──

    /// <summary>
    /// Accepts the full browser-recorded video (webm/mp4) and stores it in the
    /// local bucket.  Used as a fallback when DigitalOcean Spaces / S3 presigning
    /// is not configured, so recordings are always retained server-side.
    /// </summary>
    [HttpPost("{streamId}/recording")]
    [Authorize]
    [RequestSizeLimit(2_147_483_648)]   // 2 GB
    [RequestFormLimits(MultipartBodyLengthLimit = 2_147_483_648)]
    public async Task<IActionResult> UploadRecording(
        [FromRoute] string streamId,
        IFormFile? file,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(streamId))
            return BadRequest(new { message = "streamId is required." });

        if (!TryResolveUserId(out var userId))
            return Unauthorized(new { message = "Invalid user session." });

        if (file is null || file.Length == 0)
            return BadRequest(new { message = "No recording file provided." });

        // Create stream record if it doesn't already exist (broadcaster may not have called /start)
        if (!_liveStreamStateStore.TryGet(streamId, out var stream))
        {
            stream = _liveStreamStateStore.Create(new LiveStreamState
            {
                id              = streamId,
                created_by_id   = userId,
                streamer_id     = userId,
                title           = $"Recording {streamId}",
                status          = "ended",
                started_at      = DateTime.UtcNow,
                ended_at        = DateTime.UtcNow,
                created_date    = DateTime.UtcNow,
                updated_date    = DateTime.UtcNow,
                kept_permanently = true,
                kept_at         = DateTime.UtcNow,
            });
        }

        if (!IsOwner(stream, userId))
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "Not your stream." });

        var bucketsRoot = _configuration["Persistence:BucketsRoot"] ?? "/app/Buckets";
        var ext = Path.GetExtension(file.FileName ?? "recording.webm").ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(ext)) ext = ".webm";
        var relKey  = Path.Combine("live", streamId, $"recording{ext}").Replace('\\', '/');
        var fullPath = Path.Combine(bucketsRoot, relKey);

        Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);
        await using (var dest = System.IO.File.Create(fullPath))
        await using (var src  = file.OpenReadStream())
            await src.CopyToAsync(dest, cancellationToken);

        _liveStreamStateStore.Update(streamId, s =>
        {
            s.final_recording_uri = $"/api/live/{streamId}/playback";
            s.kept_permanently    = true;
            s.kept_at             = DateTime.UtcNow;
            s.ended_at          ??= DateTime.UtcNow;
            s.status              = "ended";
        });

        _logger.LogInformation("Recording saved for stream {StreamId}: {Bytes} bytes", streamId, file.Length);
        return Ok(new
        {
            stream_id     = streamId,
            recording_key = relKey,
            playback_url  = $"/api/live/{streamId}/playback",
            size_bytes    = file.Length,
        });
    }

    /// <summary>Serve the locally stored recording with range support.</summary>
    [HttpGet("{streamId}/playback")]
    [AllowAnonymous]
    public IActionResult Playback([FromRoute] string streamId)
    {
        if (string.IsNullOrWhiteSpace(streamId))
            return BadRequest(new { message = "streamId is required." });

        var bucketsRoot = _configuration["Persistence:BucketsRoot"] ?? "/app/Buckets";
        foreach (var ext in new[] { ".webm", ".mp4", ".mov", ".ogg" })
        {
            var fullPath = Path.Combine(bucketsRoot, "live", streamId, $"recording{ext}");
            if (!System.IO.File.Exists(fullPath)) continue;
            var mime = ext switch
            {
                ".mp4" => "video/mp4",
                ".mov" => "video/quicktime",
                ".ogg" => "video/ogg",
                _      => "video/webm",
            };
            return File(System.IO.File.OpenRead(fullPath), mime, enableRangeProcessing: true);
        }
        return NotFound(new { message = "Recording file not found." });
    }

    [HttpGet("{streamId}/expiry")]
    [Authorize]
    public IActionResult GetExpiry([FromRoute] string streamId, [FromQuery] string? user_id = null)
    {
        if (string.IsNullOrWhiteSpace(streamId))
        {
            return BadRequest(new { message = "streamId is required." });
        }

        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        if (!_liveStreamStateStore.TryGet(streamId, out var stream))
        {
            return NotFound(new { message = "Stream not found." });
        }

        if (!IsOwner(stream, userId))
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "Not your stream." });
        }

        var now = DateTime.UtcNow;
        var expiresAt = stream.expires_at;
        int? secondsRemaining = null;
        if (expiresAt.HasValue)
        {
            secondsRemaining = (int)Math.Floor((expiresAt.Value - now).TotalSeconds);
        }

        return Ok(new
        {
            stream_id = stream.id,
            kept_permanently = stream.kept_permanently,
            kept_at = stream.kept_at,
            expires_at = expiresAt,
            seconds_remaining = secondsRemaining,
            reminder_sent_at = stream.expiry_reminder_sent_at,
            deleted_at = stream.deleted_at,
            in_reminder_window = secondsRemaining.HasValue
                && secondsRemaining.Value > 0
                && secondsRemaining.Value <= 24 * 3600
                && !stream.kept_permanently
        });
    }

    private async Task NotifyConnectionsLiveStartedAsync(LiveStreamState stream, CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(stream.streamer_id, out var streamerUserId))
        {
            return;
        }

        var recipientIds = await ResolveLiveRecipientIdsAsync(streamerUserId, cancellationToken);
        if (recipientIds.Count == 0)
        {
            return;
        }

        var streamerDisplayName = await _db.Users
            .AsNoTracking()
            .Where(user => user.Id == streamerUserId)
            .Select(user => string.IsNullOrWhiteSpace(user.DisplayName) ? user.Username : user.DisplayName)
            .FirstOrDefaultAsync(cancellationToken)
            ?? "Someone you follow";

        var message = $"{streamerDisplayName} is live now: {stream.title}";
        var joinLink = $"/media?tab=live&streamId={Uri.EscapeDataString(stream.id)}";

        foreach (var recipientId in recipientIds)
        {
            var notificationPayload = new
            {
                id = Guid.NewGuid().ToString("N"),
                type = "live",
                message,
                link = joinLink,
                stream_id = stream.id,
                streamer_id = stream.streamer_id,
                title = stream.title,
                sent_at = DateTime.UtcNow
            };

            // SignalR push for online users.
            await _notificationHub.Clients
                .Group(NotificationHub.BuildUserGroup(recipientId.ToString()))
                .SendAsync("LiveStarted", notificationPayload, cancellationToken);

            // Persist notification so users can see it later in NotificationBell.
            try
            {
                await _db.Database.ExecuteSqlInterpolatedAsync($@"
INSERT INTO ""Notification"" (id, recipient_id, type, message, link, read)
VALUES ({Guid.NewGuid().ToString("N")}, {recipientId.ToString()}, {"system"}, {message}, {joinLink}, {false});", cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Notification insert skipped for recipient {RecipientId}", recipientId);
            }
        }
    }

    private async Task<HashSet<Guid>> ResolveLiveRecipientIdsAsync(Guid streamerUserId, CancellationToken cancellationToken)
    {
        var recipients = new HashSet<Guid>();

        var followerIds = await _db.UserFollows
            .AsNoTracking()
            .Where(follow => !follow.IsDeleted && follow.FollowingId == streamerUserId)
            .Select(follow => follow.FollowerId)
            .ToListAsync(cancellationToken);
        foreach (var followerId in followerIds)
        {
            recipients.Add(followerId);
        }

        var streamerConversationIds = await _db.ConversationParticipants
            .AsNoTracking()
            .Where(participant => !participant.IsDeleted && participant.UserId == streamerUserId)
            .Select(participant => participant.ConversationId)
            .ToListAsync(cancellationToken);

        if (streamerConversationIds.Count > 0)
        {
            var connectionIds = await _db.ConversationParticipants
                .AsNoTracking()
                .Where(participant => !participant.IsDeleted
                    && streamerConversationIds.Contains(participant.ConversationId)
                    && participant.UserId != streamerUserId)
                .Select(participant => participant.UserId)
                .Distinct()
                .ToListAsync(cancellationToken);

            foreach (var connectionId in connectionIds)
            {
                recipients.Add(connectionId);
            }
        }

        var sharedProjectIds = await _db.ProjectMembers
            .AsNoTracking()
            .Where(member => !member.IsDeleted
                && member.IsActive
                && member.UserId == streamerUserId)
            .Select(member => member.ProjectId)
            .ToListAsync(cancellationToken);

        if (sharedProjectIds.Count > 0)
        {
            var projectMemberIds = await _db.ProjectMembers
                .AsNoTracking()
                .Where(member => !member.IsDeleted
                    && member.IsActive
                    && sharedProjectIds.Contains(member.ProjectId)
                    && member.UserId != streamerUserId)
                .Select(member => member.UserId)
                .Distinct()
                .ToListAsync(cancellationToken);

            foreach (var projectMemberId in projectMemberIds)
            {
                recipients.Add(projectMemberId);
            }
        }

        recipients.Remove(streamerUserId);
        recipients.Remove(Guid.Empty);
        return recipients;
    }

    private IReadOnlyList<object> BuildLocalFeed(int limit)
    {
        return _liveStreamStateStore.GetAll()
            .Where(stream => stream.deleted_at is null)
            .Where(stream => string.Equals(stream.status, "live", StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(stream => stream.chunk_sequence)
            .ThenByDescending(stream => stream.updated_date)
            .Take(Math.Clamp(limit, 1, 100))
            .Select(stream => (object)new
            {
                stream_id = stream.id,
                title = stream.title,
                category = stream.is_audio_only ? "audio" : "video",
                viewer_count = 0,
                streamer_id = stream.streamer_id,
                current_chunk_uri = EnsureSignedBlobPath(stream.current_chunk_uri),
                chunk_sequence = stream.chunk_sequence,
                is_audio_only = stream.is_audio_only,
                started_at = stream.started_at,
                updated_date = stream.updated_date
            })
            .ToList();
    }

    private bool TryResolveUserId(out string userId)
    {
        var parsedUserId = User.GetUserId();
        if (parsedUserId == Guid.Empty)
        {
            userId = string.Empty;
            return false;
        }

        userId = parsedUserId.ToString();
        return true;
    }

    private string AppendBlobSignatureIfNeeded(string streamPath, string? objectKey)
    {
        if (string.IsNullOrWhiteSpace(streamPath)
            || !streamPath.StartsWith("/api/media/blob/", StringComparison.OrdinalIgnoreCase))
        {
            return streamPath;
        }

        var normalizedKey = (objectKey ?? string.Empty).Replace('\\', '/').Trim('/');
        if (string.IsNullOrWhiteSpace(normalizedKey))
        {
            return streamPath;
        }

        var signature = _signatureService.SignKey(normalizedKey);
        if (string.IsNullOrWhiteSpace(signature))
        {
            return streamPath;
        }

        var separator = streamPath.Contains('?') ? "&" : "?";
        return $"{streamPath}{separator}sig={Uri.EscapeDataString(signature)}";
    }

    private string EnsureSignedBlobPath(string? streamPath)
    {
        var value = streamPath ?? string.Empty;
        if (string.IsNullOrWhiteSpace(value)
            || !value.StartsWith("/api/media/blob/", StringComparison.OrdinalIgnoreCase)
            || value.Contains("sig=", StringComparison.OrdinalIgnoreCase))
        {
            return value;
        }

        var objectKey = ExtractObjectKeyFromMediaPath(value);
        return AppendBlobSignatureIfNeeded(value, objectKey);
    }

    private static string ExtractObjectKeyFromMediaPath(string streamPath)
    {
        var cleanPath = streamPath.Split('?', 2)[0];
        const string mediaBlobPrefix = "/api/media/blob/";
        if (!cleanPath.StartsWith(mediaBlobPrefix, StringComparison.OrdinalIgnoreCase))
        {
            return string.Empty;
        }

        return Uri.UnescapeDataString(cleanPath[mediaBlobPrefix.Length..]).Trim('/');
    }

    private static bool IsOwner(LiveStreamState stream, string userId)
    {
        return string.Equals(stream.created_by_id, userId, StringComparison.OrdinalIgnoreCase)
            || string.Equals(stream.streamer_id, userId, StringComparison.OrdinalIgnoreCase);
    }
}

public sealed class LiveStreamMessageRequest
{
    public string text { get; set; } = string.Empty;
}

public sealed class LiveStreamStartRequest
{
    public string? title { get; set; }
    public bool is_audio_only { get; set; }
}

public sealed class LiveSegmentRequest
{
    public int segment_index { get; set; }
    public long size_bytes { get; set; }
    public string? sha256 { get; set; }
}
