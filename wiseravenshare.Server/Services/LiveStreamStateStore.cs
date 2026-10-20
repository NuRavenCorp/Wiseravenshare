using Npgsql;

namespace Wiseravenshare.Server.Services;

public sealed class LiveStreamStateStore
{
    private static volatile bool _schemaEnsured;
    private static readonly object SchemaLock = new();

    private readonly string _connectionString;
    private readonly ILogger<LiveStreamStateStore> _logger;

    public LiveStreamStateStore(IConfiguration configuration, ILogger<LiveStreamStateStore> logger)
    {
        _connectionString = ResolveConnectionString(configuration);
        _logger = logger;
    }

    public LiveStreamState Create(LiveStreamState stream)
    {
        EnsureSchema();

        if (!TryParseGuid(stream.id, out var streamId))
        {
            throw new ArgumentException("stream.id must be a UUID.", nameof(stream));
        }

        var ownerIdRaw = string.IsNullOrWhiteSpace(stream.created_by_id) ? stream.streamer_id : stream.created_by_id;
        if (!TryParseGuid(ownerIdRaw, out var ownerId))
        {
            throw new ArgumentException("created_by_id/streamer_id must be a UUID.", nameof(stream));
        }

        var now = DateTime.UtcNow;
        var startedAt = stream.started_at ?? now;
        var endedAt = stream.ended_at;
        var expiresAt = stream.expires_at;
        if (!expiresAt.HasValue && endedAt.HasValue && !stream.kept_permanently)
        {
            expiresAt = endedAt.Value.AddHours(72);
        }

        var title = string.IsNullOrWhiteSpace(stream.title) ? "Untitled live" : stream.title.Trim();
        var category = stream.is_audio_only ? "audio" : "general";
        var language = "en";

        using var connection = OpenConnection();
        const string sql = """
INSERT INTO app_data.live_streams (
    stream_id, host_user_id, title, category, language, description, is_audio_only,
    current_chunk_uri, chunk_sequence, started_at, ended_at, expires_at,
    final_recording_key, final_recording_uri, final_video_id, recorded_duration_ms,
    total_segments, kept_permanently, kept_at, kept_by, expiry_reminder_sent_at,
    deleted_at, updated_at
)
VALUES (
    @stream_id, @host_user_id, @title, @category, @language, @description, @is_audio_only,
    @current_chunk_uri, @chunk_sequence, @started_at, @ended_at, @expires_at,
    @final_recording_key, @final_recording_uri, @final_video_id, @recorded_duration_ms,
    @total_segments, @kept_permanently, @kept_at, @kept_by, @expiry_reminder_sent_at,
    @deleted_at, NOW()
)
ON CONFLICT (stream_id) DO NOTHING;
""";
        using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("stream_id", streamId);
        command.Parameters.AddWithValue("host_user_id", ownerId);
        command.Parameters.AddWithValue("title", title);
        command.Parameters.AddWithValue("category", category);
        command.Parameters.AddWithValue("language", language);
        command.Parameters.AddWithValue("description", (object?)stream.description ?? DBNull.Value);
        command.Parameters.AddWithValue("is_audio_only", stream.is_audio_only);
        command.Parameters.AddWithValue("current_chunk_uri", (object?)stream.current_chunk_uri ?? DBNull.Value);
        command.Parameters.AddWithValue("chunk_sequence", Math.Max(0, stream.chunk_sequence));
        command.Parameters.AddWithValue("started_at", startedAt);
        command.Parameters.AddWithValue("ended_at", (object?)endedAt ?? DBNull.Value);
        command.Parameters.AddWithValue("expires_at", (object?)expiresAt ?? DBNull.Value);
        command.Parameters.AddWithValue("final_recording_key", (object?)stream.final_recording_key ?? DBNull.Value);
        command.Parameters.AddWithValue("final_recording_uri", (object?)stream.final_recording_uri ?? DBNull.Value);
        command.Parameters.AddWithValue("final_video_id", (object?)stream.final_video_id ?? DBNull.Value);
        command.Parameters.AddWithValue("recorded_duration_ms", Math.Max(0L, stream.recorded_duration_ms));
        command.Parameters.AddWithValue("total_segments", Math.Max(0, stream.total_segments));
        command.Parameters.AddWithValue("kept_permanently", stream.kept_permanently);
        command.Parameters.AddWithValue("kept_at", (object?)stream.kept_at ?? DBNull.Value);
        command.Parameters.AddWithValue("kept_by", (object?)stream.kept_by ?? DBNull.Value);
        command.Parameters.AddWithValue("expiry_reminder_sent_at", (object?)stream.expiry_reminder_sent_at ?? DBNull.Value);
        command.Parameters.AddWithValue("deleted_at", (object?)stream.deleted_at ?? DBNull.Value);
        command.ExecuteNonQuery();

        return TryGet(stream.id, out var stored) ? stored : stream;
    }

    public bool TryGet(string id, out LiveStreamState stream)
    {
        stream = new LiveStreamState();
        EnsureSchema();
        if (!TryParseGuid(id, out var streamId))
        {
            return false;
        }

        using var connection = OpenConnection();
        using var command = new NpgsqlCommand(BuildStreamSelectSql("WHERE ls.stream_id = @stream_id LIMIT 1"), connection);
        command.Parameters.AddWithValue("stream_id", streamId);
        using var reader = command.ExecuteReader();
        if (!reader.Read())
        {
            return false;
        }

        stream = MapStream(reader);
        return true;
    }

    public LiveStreamState? Update(string id, Action<LiveStreamState> apply)
    {
        if (!TryGet(id, out var current))
        {
            return null;
        }

        apply(current);
        current.updated_date = DateTime.UtcNow;
        if (!TryParseGuid(current.id, out var streamId))
        {
            return null;
        }

        if (!TryParseGuid(current.created_by_id, out var ownerId))
        {
            return null;
        }

        var category = current.is_audio_only ? "audio" : "general";
        using var connection = OpenConnection();
        const string sql = """
UPDATE app_data.live_streams
SET host_user_id = @host_user_id,
    title = @title,
    category = @category,
    language = @language,
    description = @description,
    is_audio_only = @is_audio_only,
    current_chunk_uri = @current_chunk_uri,
    chunk_sequence = @chunk_sequence,
    started_at = @started_at,
    ended_at = @ended_at,
    expires_at = @expires_at,
    final_recording_key = @final_recording_key,
    final_recording_uri = @final_recording_uri,
    final_video_id = @final_video_id,
    recorded_duration_ms = @recorded_duration_ms,
    total_segments = @total_segments,
    kept_permanently = @kept_permanently,
    kept_at = @kept_at,
    kept_by = @kept_by,
    expiry_reminder_sent_at = @expiry_reminder_sent_at,
    deleted_at = @deleted_at,
    updated_at = NOW()
WHERE stream_id = @stream_id;
""";
        using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("stream_id", streamId);
        command.Parameters.AddWithValue("host_user_id", ownerId);
        command.Parameters.AddWithValue("title", string.IsNullOrWhiteSpace(current.title) ? "Untitled live" : current.title.Trim());
        command.Parameters.AddWithValue("category", category);
        command.Parameters.AddWithValue("language", "en");
        command.Parameters.AddWithValue("description", (object?)current.description ?? DBNull.Value);
        command.Parameters.AddWithValue("is_audio_only", current.is_audio_only);
        command.Parameters.AddWithValue("current_chunk_uri", (object?)current.current_chunk_uri ?? DBNull.Value);
        command.Parameters.AddWithValue("chunk_sequence", Math.Max(0, current.chunk_sequence));
        command.Parameters.AddWithValue("started_at", (object?)current.started_at ?? DBNull.Value);
        command.Parameters.AddWithValue("ended_at", (object?)current.ended_at ?? DBNull.Value);
        command.Parameters.AddWithValue("expires_at", (object?)current.expires_at ?? DBNull.Value);
        command.Parameters.AddWithValue("final_recording_key", (object?)current.final_recording_key ?? DBNull.Value);
        command.Parameters.AddWithValue("final_recording_uri", (object?)current.final_recording_uri ?? DBNull.Value);
        command.Parameters.AddWithValue("final_video_id", (object?)current.final_video_id ?? DBNull.Value);
        command.Parameters.AddWithValue("recorded_duration_ms", Math.Max(0L, current.recorded_duration_ms));
        command.Parameters.AddWithValue("total_segments", Math.Max(0, current.total_segments));
        command.Parameters.AddWithValue("kept_permanently", current.kept_permanently);
        command.Parameters.AddWithValue("kept_at", (object?)current.kept_at ?? DBNull.Value);
        command.Parameters.AddWithValue("kept_by", (object?)current.kept_by ?? DBNull.Value);
        command.Parameters.AddWithValue("expiry_reminder_sent_at", (object?)current.expiry_reminder_sent_at ?? DBNull.Value);
        command.Parameters.AddWithValue("deleted_at", (object?)current.deleted_at ?? DBNull.Value);
        command.ExecuteNonQuery();

        return TryGet(id, out var updated) ? updated : null;
    }

    public IReadOnlyList<LiveStreamState> GetAll()
    {
        EnsureSchema();
        using var connection = OpenConnection();
        using var command = new NpgsqlCommand(BuildStreamSelectSql("ORDER BY ls.updated_at DESC"), connection);
        using var reader = command.ExecuteReader();

        var streams = new List<LiveStreamState>();
        while (reader.Read())
        {
            streams.Add(MapStream(reader));
        }

        return streams;
    }

    public bool TryMarkKeep(string id, string userId, string source, string? phrase, out LiveStreamState? stream)
    {
        stream = null;
        EnsureSchema();
        if (!TryParseGuid(id, out var streamId) || !TryParseGuid(userId, out var keepUserId))
        {
            return false;
        }

        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();

        bool? alreadyKept = null;
        using (var read = new NpgsqlCommand("SELECT kept_permanently FROM app_data.live_streams WHERE stream_id = @stream_id LIMIT 1;", connection, transaction))
        {
            read.Parameters.AddWithValue("stream_id", streamId);
            var scalar = read.ExecuteScalar();
            if (scalar is null || scalar is DBNull)
            {
                transaction.Rollback();
                return false;
            }

            alreadyKept = scalar is bool b && b;
        }

        if (!alreadyKept.GetValueOrDefault())
        {
            using var update = new NpgsqlCommand("""
UPDATE app_data.live_streams
SET kept_permanently = TRUE,
    kept_at = NOW(),
    kept_by = @source,
    expires_at = NULL,
    updated_at = NOW()
WHERE stream_id = @stream_id;
""", connection, transaction);
            update.Parameters.AddWithValue("stream_id", streamId);
            update.Parameters.AddWithValue("source", source ?? "ui");
            update.ExecuteNonQuery();

            using var insert = new NpgsqlCommand("""
INSERT INTO app_data.live_keep_events (stream_id, user_id, source, phrase, created_at)
VALUES (@stream_id, @user_id, @source, @phrase, NOW());
""", connection, transaction);
            insert.Parameters.AddWithValue("stream_id", streamId);
            insert.Parameters.AddWithValue("user_id", keepUserId);
            insert.Parameters.AddWithValue("source", source ?? "ui");
            insert.Parameters.AddWithValue("phrase", (object?)phrase ?? DBNull.Value);
            insert.ExecuteNonQuery();
        }

        transaction.Commit();
        stream = TryGet(id, out var updated) ? updated : null;
        return stream is not null;
    }

    public IReadOnlyList<LiveKeepEvent> GetKeepEvents(string streamId)
    {
        EnsureSchema();
        if (!TryParseGuid(streamId, out var parsedStreamId))
        {
            return [];
        }

        using var connection = OpenConnection();
        using var command = new NpgsqlCommand("""
SELECT stream_id, user_id, source, phrase, created_at
FROM app_data.live_keep_events
WHERE stream_id = @stream_id
ORDER BY created_at DESC;
""", connection);
        command.Parameters.AddWithValue("stream_id", parsedStreamId);
        using var reader = command.ExecuteReader();

        var events = new List<LiveKeepEvent>();
        while (reader.Read())
        {
            events.Add(new LiveKeepEvent
            {
                stream_id = reader.GetGuid(reader.GetOrdinal("stream_id")).ToString(),
                user_id = reader.GetGuid(reader.GetOrdinal("user_id")).ToString(),
                source = reader.IsDBNull(reader.GetOrdinal("source")) ? "ui" : reader.GetString(reader.GetOrdinal("source")),
                phrase = reader.IsDBNull(reader.GetOrdinal("phrase")) ? null : reader.GetString(reader.GetOrdinal("phrase")),
                created_at = reader.GetDateTime(reader.GetOrdinal("created_at")).ToUniversalTime()
            });
        }

        return events;
    }

    public void Remove(string streamId)
    {
        EnsureSchema();
        if (!TryParseGuid(streamId, out var parsedStreamId))
        {
            return;
        }

        using var connection = OpenConnection();
        using var command = new NpgsqlCommand("DELETE FROM app_data.live_streams WHERE stream_id = @stream_id;", connection);
        command.Parameters.AddWithValue("stream_id", parsedStreamId);
        command.ExecuteNonQuery();
    }

    public LiveSegmentState UpsertSegment(string streamId, int segmentIndex, string storageKey, long sizeBytes, string sha256)
    {
        EnsureSchema();
        if (!TryParseGuid(streamId, out var parsedStreamId))
        {
            throw new ArgumentException("streamId must be a UUID.", nameof(streamId));
        }

        using var connection = OpenConnection();
        using (var command = new NpgsqlCommand("""
INSERT INTO app_data.live_segments
    (stream_id, segment_index, storage_key, size_bytes, sha256, upload_state, created_at)
VALUES
    (@stream_id, @segment_index, @storage_key, @size_bytes, @sha256, 'pending', NOW())
ON CONFLICT (stream_id, segment_index) DO UPDATE
SET storage_key = EXCLUDED.storage_key,
    size_bytes = EXCLUDED.size_bytes,
    sha256 = EXCLUDED.sha256;
""", connection))
        {
            command.Parameters.AddWithValue("stream_id", parsedStreamId);
            command.Parameters.AddWithValue("segment_index", Math.Max(0, segmentIndex));
            command.Parameters.AddWithValue("storage_key", storageKey ?? string.Empty);
            command.Parameters.AddWithValue("size_bytes", Math.Max(0L, sizeBytes));
            command.Parameters.AddWithValue("sha256", sha256 ?? string.Empty);
            command.ExecuteNonQuery();
        }

        using (var update = new NpgsqlCommand("UPDATE app_data.live_streams SET updated_at = NOW() WHERE stream_id = @stream_id;", connection))
        {
            update.Parameters.AddWithValue("stream_id", parsedStreamId);
            update.ExecuteNonQuery();
        }

        var segment = GetSegments(streamId).FirstOrDefault(x => x.segment_index == Math.Max(0, segmentIndex));
        return segment ?? new LiveSegmentState
        {
            stream_id = streamId,
            segment_index = Math.Max(0, segmentIndex),
            storage_key = storageKey ?? string.Empty,
            size_bytes = Math.Max(0L, sizeBytes),
            sha256 = sha256 ?? string.Empty,
            upload_state = "pending",
            created_at = DateTime.UtcNow
        };
    }

    public LiveSegmentState? MarkSegmentUploaded(string streamId, int segmentIndex)
    {
        EnsureSchema();
        if (!TryParseGuid(streamId, out var parsedStreamId))
        {
            return null;
        }

        using var connection = OpenConnection();
        using (var command = new NpgsqlCommand("""
UPDATE app_data.live_segments
SET upload_state = 'done',
    uploaded_at = COALESCE(uploaded_at, NOW())
WHERE stream_id = @stream_id
  AND segment_index = @segment_index;
""", connection))
        {
            command.Parameters.AddWithValue("stream_id", parsedStreamId);
            command.Parameters.AddWithValue("segment_index", Math.Max(0, segmentIndex));
            var changed = command.ExecuteNonQuery();
            if (changed == 0)
            {
                return null;
            }
        }

        var segments = GetSegments(streamId);
        var segment = segments.FirstOrDefault(x => x.segment_index == Math.Max(0, segmentIndex));
        if (segment is null)
        {
            return null;
        }

        using var update = new NpgsqlCommand("""
UPDATE app_data.live_streams
SET current_chunk_uri = @current_chunk_uri,
    chunk_sequence = @chunk_sequence,
    updated_at = NOW()
WHERE stream_id = @stream_id;
""", connection);
        update.Parameters.AddWithValue("stream_id", parsedStreamId);
        update.Parameters.AddWithValue("current_chunk_uri", StreamingUrlHelper.StreamByBlobPath(segment.storage_key));
        update.Parameters.AddWithValue("chunk_sequence", segments
            .Where(x => string.Equals(x.upload_state, "done", StringComparison.OrdinalIgnoreCase))
            .Select(x => x.segment_index)
            .DefaultIfEmpty(-1)
            .Max() + 1);
        update.ExecuteNonQuery();

        return segment;
    }

    public IReadOnlyList<LiveSegmentState> GetSegments(string streamId)
    {
        EnsureSchema();
        if (!TryParseGuid(streamId, out var parsedStreamId))
        {
            return [];
        }

        using var connection = OpenConnection();
        using var command = new NpgsqlCommand("""
SELECT stream_id, segment_index, storage_key, size_bytes, sha256, upload_state, created_at, uploaded_at
FROM app_data.live_segments
WHERE stream_id = @stream_id
ORDER BY segment_index ASC;
""", connection);
        command.Parameters.AddWithValue("stream_id", parsedStreamId);
        using var reader = command.ExecuteReader();

        var segments = new List<LiveSegmentState>();
        while (reader.Read())
        {
            segments.Add(MapSegment(reader));
        }

        return segments;
    }

    private void EnsureSchema()
    {
        if (_schemaEnsured)
        {
            return;
        }

        lock (SchemaLock)
        {
            if (_schemaEnsured)
            {
                return;
            }

            using var connection = OpenConnection();
            const string sql = """
CREATE SCHEMA IF NOT EXISTS app_data;

CREATE TABLE IF NOT EXISTS app_data.live_streams (
    stream_id UUID PRIMARY KEY,
    host_user_id UUID NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    language TEXT NOT NULL DEFAULT 'en',
    description TEXT NULL,
    is_audio_only BOOLEAN NOT NULL DEFAULT FALSE,
    current_chunk_uri TEXT NULL,
    chunk_sequence INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ NULL,
    expires_at TIMESTAMPTZ NULL,
    final_recording_key TEXT NULL,
    final_recording_uri TEXT NULL,
    final_video_id TEXT NULL,
    recorded_duration_ms BIGINT NOT NULL DEFAULT 0,
    total_segments INTEGER NOT NULL DEFAULT 0,
    kept_permanently BOOLEAN NOT NULL DEFAULT FALSE,
    kept_at TIMESTAMPTZ NULL,
    kept_by TEXT NULL,
    expiry_reminder_sent_at TIMESTAMPTZ NULL,
    deleted_at TIMESTAMPTZ NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app_data.live_streams ADD COLUMN IF NOT EXISTS host_user_id UUID;
ALTER TABLE app_data.live_streams ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE app_data.live_streams ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'general';
ALTER TABLE app_data.live_streams ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';
ALTER TABLE app_data.live_streams ADD COLUMN IF NOT EXISTS description TEXT NULL;
ALTER TABLE app_data.live_streams ADD COLUMN IF NOT EXISTS is_audio_only BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE app_data.live_streams ADD COLUMN IF NOT EXISTS current_chunk_uri TEXT NULL;
ALTER TABLE app_data.live_streams ADD COLUMN IF NOT EXISTS chunk_sequence INTEGER NOT NULL DEFAULT 0;
ALTER TABLE app_data.live_streams ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE app_data.live_streams ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ NULL;
ALTER TABLE app_data.live_streams ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL;
ALTER TABLE app_data.live_streams ADD COLUMN IF NOT EXISTS final_recording_key TEXT NULL;
ALTER TABLE app_data.live_streams ADD COLUMN IF NOT EXISTS final_recording_uri TEXT NULL;
ALTER TABLE app_data.live_streams ADD COLUMN IF NOT EXISTS final_video_id TEXT NULL;
ALTER TABLE app_data.live_streams ADD COLUMN IF NOT EXISTS recorded_duration_ms BIGINT NOT NULL DEFAULT 0;
ALTER TABLE app_data.live_streams ADD COLUMN IF NOT EXISTS total_segments INTEGER NOT NULL DEFAULT 0;
ALTER TABLE app_data.live_streams ADD COLUMN IF NOT EXISTS kept_permanently BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE app_data.live_streams ADD COLUMN IF NOT EXISTS kept_at TIMESTAMPTZ NULL;
ALTER TABLE app_data.live_streams ADD COLUMN IF NOT EXISTS kept_by TEXT NULL;
ALTER TABLE app_data.live_streams ADD COLUMN IF NOT EXISTS expiry_reminder_sent_at TIMESTAMPTZ NULL;
ALTER TABLE app_data.live_streams ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
ALTER TABLE app_data.live_streams ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS ix_live_streams_active
    ON app_data.live_streams (started_at DESC)
    WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_live_streams_expiry
    ON app_data.live_streams (expires_at)
    WHERE ended_at IS NOT NULL
      AND kept_permanently = FALSE
      AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS app_data.live_segments (
    id BIGSERIAL PRIMARY KEY,
    stream_id UUID NOT NULL REFERENCES app_data.live_streams(stream_id) ON DELETE CASCADE,
    segment_index INTEGER NOT NULL,
    storage_key TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    sha256 TEXT NOT NULL,
    upload_state TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    uploaded_at TIMESTAMPTZ NULL,
    UNIQUE (stream_id, segment_index)
);

CREATE INDEX IF NOT EXISTS ix_live_segments_stream
    ON app_data.live_segments (stream_id, segment_index);

CREATE TABLE IF NOT EXISTS app_data.live_keep_events (
    id BIGSERIAL PRIMARY KEY,
    stream_id UUID NOT NULL REFERENCES app_data.live_streams(stream_id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    source TEXT NOT NULL,
    phrase TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Live streams must continue working even when user table schema drifts.
ALTER TABLE app_data.live_streams
    DROP CONSTRAINT IF EXISTS fk_live_streams_users;
""";
            using var command = new NpgsqlCommand(sql, connection);
            command.ExecuteNonQuery();
            _schemaEnsured = true;
        }
    }

    private NpgsqlConnection OpenConnection()
    {
        if (string.IsNullOrWhiteSpace(_connectionString))
        {
            throw new InvalidOperationException("Live stream persistence requires a PostgreSQL connection string.");
        }

        var connection = new NpgsqlConnection(_connectionString);
        connection.Open();
        return connection;
    }

    private static string BuildStreamSelectSql(string suffix)
    {
        return $"""
SELECT
    ls.stream_id,
    ls.host_user_id,
    ls.title,
    ls.description,
    ls.is_audio_only,
    ls.started_at,
    ls.ended_at,
    ls.expires_at,
    ls.kept_permanently,
    ls.kept_at,
    ls.kept_by,
    ls.expiry_reminder_sent_at,
    ls.deleted_at,
    ls.final_recording_key,
    ls.final_recording_uri,
    ls.final_video_id,
    ls.recorded_duration_ms,
    ls.total_segments,
    ls.updated_at,
    COALESCE(
        (SELECT MAX(seg.segment_index) + 1
         FROM app_data.live_segments seg
         WHERE seg.stream_id = ls.stream_id
           AND seg.upload_state = 'done'),
        0
    ) AS computed_chunk_sequence,
    (SELECT seg.storage_key
     FROM app_data.live_segments seg
     WHERE seg.stream_id = ls.stream_id
       AND seg.upload_state = 'done'
     ORDER BY seg.segment_index DESC
     LIMIT 1) AS latest_segment_key
FROM app_data.live_streams ls
{suffix};
""";
    }

    private static LiveStreamState MapStream(NpgsqlDataReader reader)
    {
        var streamId = ReadGuidOrDefault(reader, "stream_id", Guid.Empty);
        var ownerId = ReadNullableGuid(reader, "host_user_id") ?? streamId;
        var endedAt = ReadNullableDateTime(reader, "ended_at");
        var deletedAt = ReadNullableDateTime(reader, "deleted_at");
        var status = deletedAt.HasValue
            ? "deleted"
            : endedAt.HasValue ? "ended" : "live";

        var finalKey = ReadNullableString(reader, "final_recording_key");
        var finalUri = ReadNullableString(reader, "final_recording_uri");
        if (string.IsNullOrWhiteSpace(finalUri) && !string.IsNullOrWhiteSpace(finalKey))
        {
            finalUri = StreamingUrlHelper.StreamByBlobPath(finalKey);
        }

        var latestSegmentKey = ReadNullableString(reader, "latest_segment_key");
        var currentChunkUri = ReadNullableString(reader, "current_chunk_uri");
        if (string.IsNullOrWhiteSpace(currentChunkUri) && !string.IsNullOrWhiteSpace(latestSegmentKey))
        {
            currentChunkUri = StreamingUrlHelper.StreamByBlobPath(latestSegmentKey);
        }

        return new LiveStreamState
        {
            id = streamId.ToString(),
            created_by_id = ownerId.ToString(),
            streamer_id = ownerId.ToString(),
            title = ReadStringOrDefault(reader, "title", "Untitled live"),
            description = ReadNullableString(reader, "description"),
            status = status,
            current_chunk_uri = currentChunkUri,
            chunk_sequence = ReadInt32OrDefault(reader, "computed_chunk_sequence", 0),
            is_audio_only = ReadBoolOrDefault(reader, "is_audio_only", false),
            started_at = ReadDateTimeOrDefault(reader, "started_at", DateTime.UtcNow),
            ended_at = endedAt,
            kept_permanently = ReadBoolOrDefault(reader, "kept_permanently", false),
            kept_at = ReadNullableDateTime(reader, "kept_at"),
            kept_by = ReadNullableString(reader, "kept_by"),
            expires_at = ReadNullableDateTime(reader, "expires_at"),
            expiry_reminder_sent_at = ReadNullableDateTime(reader, "expiry_reminder_sent_at"),
            deleted_at = deletedAt,
            final_recording_uri = finalUri,
            final_recording_key = finalKey,
            final_video_id = ReadNullableString(reader, "final_video_id"),
            recorded_duration_ms = ReadInt64OrDefault(reader, "recorded_duration_ms", 0L),
            total_segments = ReadInt32OrDefault(reader, "total_segments", 0),
            created_date = ReadDateTimeOrDefault(reader, "started_at", DateTime.UtcNow),
            updated_date = ReadDateTimeOrDefault(reader, "updated_at", DateTime.UtcNow)
        };
    }

    private static LiveSegmentState MapSegment(NpgsqlDataReader reader)
    {
        return new LiveSegmentState
        {
            stream_id = reader.GetGuid(reader.GetOrdinal("stream_id")).ToString(),
            segment_index = reader.GetInt32(reader.GetOrdinal("segment_index")),
            storage_key = reader.GetString(reader.GetOrdinal("storage_key")),
            size_bytes = reader.GetInt64(reader.GetOrdinal("size_bytes")),
            sha256 = reader.GetString(reader.GetOrdinal("sha256")),
            upload_state = reader.GetString(reader.GetOrdinal("upload_state")),
            created_at = reader.GetDateTime(reader.GetOrdinal("created_at")).ToUniversalTime(),
            uploaded_at = ReadNullableDateTime(reader, "uploaded_at")
        };
    }

    private static string? ReadNullableString(NpgsqlDataReader reader, string columnName)
    {
        var ordinal = FindColumnOrdinal(reader, columnName);
        if (ordinal < 0)
        {
            return null;
        }

        return reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal);
    }

    private static DateTime? ReadNullableDateTime(NpgsqlDataReader reader, string columnName)
    {
        var ordinal = FindColumnOrdinal(reader, columnName);
        if (ordinal < 0)
        {
            return null;
        }

        return reader.IsDBNull(ordinal) ? null : reader.GetDateTime(ordinal).ToUniversalTime();
    }

    private static Guid? ReadNullableGuid(NpgsqlDataReader reader, string columnName)
    {
        var ordinal = FindColumnOrdinal(reader, columnName);
        if (ordinal < 0 || reader.IsDBNull(ordinal))
        {
            return null;
        }

        return reader.GetGuid(ordinal);
    }

    private static Guid ReadGuidOrDefault(NpgsqlDataReader reader, string columnName, Guid fallback)
    {
        var value = ReadNullableGuid(reader, columnName);
        return value ?? fallback;
    }

    private static string ReadStringOrDefault(NpgsqlDataReader reader, string columnName, string fallback)
    {
        var value = ReadNullableString(reader, columnName);
        return string.IsNullOrWhiteSpace(value) ? fallback : value;
    }

    private static bool ReadBoolOrDefault(NpgsqlDataReader reader, string columnName, bool fallback)
    {
        var ordinal = FindColumnOrdinal(reader, columnName);
        if (ordinal < 0 || reader.IsDBNull(ordinal))
        {
            return fallback;
        }

        return reader.GetBoolean(ordinal);
    }

    private static int ReadInt32OrDefault(NpgsqlDataReader reader, string columnName, int fallback)
    {
        var ordinal = FindColumnOrdinal(reader, columnName);
        if (ordinal < 0 || reader.IsDBNull(ordinal))
        {
            return fallback;
        }

        return reader.GetInt32(ordinal);
    }

    private static long ReadInt64OrDefault(NpgsqlDataReader reader, string columnName, long fallback)
    {
        var ordinal = FindColumnOrdinal(reader, columnName);
        if (ordinal < 0 || reader.IsDBNull(ordinal))
        {
            return fallback;
        }

        return reader.GetInt64(ordinal);
    }

    private static DateTime ReadDateTimeOrDefault(NpgsqlDataReader reader, string columnName, DateTime fallback)
    {
        var value = ReadNullableDateTime(reader, columnName);
        return value ?? fallback;
    }

    private static int FindColumnOrdinal(NpgsqlDataReader reader, string columnName)
    {
        for (var index = 0; index < reader.FieldCount; index++)
        {
            if (string.Equals(reader.GetName(index), columnName, StringComparison.OrdinalIgnoreCase))
            {
                return index;
            }
        }

        return -1;
    }

    private static bool TryParseGuid(string? input, out Guid value)
    {
        return Guid.TryParse(input?.Trim(), out value);
    }

    private static string ResolveConnectionString(IConfiguration configuration)
    {
        var databaseUrl = configuration["DATABASE_URL"];
        if (!string.IsNullOrWhiteSpace(databaseUrl))
        {
            return NormalizeConnectionString(databaseUrl);
        }

        var defaultConnection = configuration.GetConnectionString("DefaultConnection")
            ?? configuration.GetConnectionString("DatabaseConnection")
            ?? string.Empty;

        return NormalizeConnectionString(defaultConnection);
    }

    private static string NormalizeConnectionString(string value)
    {
        var raw = value.Trim();
        if (raw.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase)
            || raw.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
        {
            var uri = new Uri(raw);
            var userInfo = uri.UserInfo.Split(':');
            var builder = new NpgsqlConnectionStringBuilder
            {
                Host = uri.Host,
                Port = uri.Port,
                Username = Uri.UnescapeDataString(userInfo[0]),
                Password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : string.Empty,
                Database = uri.AbsolutePath.Trim('/'),
                SslMode = SslMode.Require
            };

            return builder.ConnectionString;
        }

        return raw;
    }
}

public sealed class LiveStreamState
{
    public string id { get; set; } = Guid.NewGuid().ToString("N");
    public string created_by_id { get; set; } = string.Empty;
    public string title { get; set; } = "Untitled stream";
    public string? description { get; set; }
    public string streamer_id { get; set; } = string.Empty;
    public string status { get; set; } = "live";
    public string? current_chunk_uri { get; set; }
    public int chunk_sequence { get; set; }
    public bool is_audio_only { get; set; }
    public DateTime? started_at { get; set; }
    public DateTime? ended_at { get; set; }
    public bool kept_permanently { get; set; }
    public DateTime? kept_at { get; set; }
    public string? kept_by { get; set; }
    public DateTime? expires_at { get; set; }
    public DateTime? expiry_reminder_sent_at { get; set; }
    public DateTime? deleted_at { get; set; }
    public string? final_recording_uri { get; set; }
    public string? final_recording_key { get; set; }
    public string? final_video_id { get; set; }
    public long recorded_duration_ms { get; set; }
    public int total_segments { get; set; }
    public DateTime created_date { get; set; } = DateTime.UtcNow;
    public DateTime updated_date { get; set; } = DateTime.UtcNow;
}

public sealed class LiveKeepEvent
{
    public string stream_id { get; set; } = string.Empty;
    public string user_id { get; set; } = string.Empty;
    public string source { get; set; } = "ui";
    public string? phrase { get; set; }
    public DateTime created_at { get; set; } = DateTime.UtcNow;
}

public sealed class LiveSegmentState
{
    public string stream_id { get; set; } = string.Empty;
    public int segment_index { get; set; }
    public string storage_key { get; set; } = string.Empty;
    public long size_bytes { get; set; }
    public string sha256 { get; set; } = string.Empty;
    public string upload_state { get; set; } = "pending";
    public DateTime created_at { get; set; } = DateTime.UtcNow;
    public DateTime? uploaded_at { get; set; }
}
