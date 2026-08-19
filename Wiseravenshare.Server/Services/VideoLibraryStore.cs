using Npgsql;
using Wiseravenshare.Server.Models;

namespace Wiseravenshare.Server.Services;

public sealed class VideoLibraryStore
{
    private const string DefaultSchemaName = "app_data";
    private const string DefaultVideosTableName = "ravensight_videos_v2";
    private const string DefaultCommentsTableName = "ravensight_video_comments_v2";

    private readonly string _connectionString;
    private string _videosTable = $"{DefaultSchemaName}.{DefaultVideosTableName}";
    private string _commentsTable = $"{DefaultSchemaName}.{DefaultCommentsTableName}";
    private bool _schemaEnsured;
    private readonly SemaphoreSlim _schemaLock = new(1, 1);

    public VideoLibraryStore(IConfiguration configuration)
    {
        _connectionString = ResolveConnectionString(configuration);
    }

    private static string ResolveConnectionString(IConfiguration configuration)
    {
        var databaseUrl = configuration["DATABASE_URL"];
        if (!string.IsNullOrWhiteSpace(databaseUrl))
        {
            return NormalizeConnectionString(databaseUrl);
        }

        return NormalizeConnectionString(configuration.GetConnectionString("DefaultConnection") ?? string.Empty);
    }

    public async Task EnsureSchemaAsync(CancellationToken cancellationToken = default)
    {
        if (_schemaEnsured || string.IsNullOrWhiteSpace(_connectionString))
        {
            return;
        }

        await _schemaLock.WaitAsync(cancellationToken);
        try
        {
            if (_schemaEnsured)
            {
                return;
            }

            var connection = await OpenWithDatabaseProvisioningAsync(cancellationToken);
            await using (connection)
            {
                if (await TryBindExistingSchemaAsync(connection, DefaultSchemaName, cancellationToken))
                {
                    _schemaEnsured = true;
                    return;
                }

                if (await TryEnsureSchemaAsync(connection, DefaultSchemaName, cancellationToken))
                {
                    _schemaEnsured = true;
                    return;
                }

                throw new InvalidOperationException("Unable to create or access the Ravensight video persistence tables.");
            }
        }
        finally
        {
            _schemaLock.Release();
        }
    }

    private async Task<bool> TryBindExistingSchemaAsync(NpgsqlConnection connection, string schemaName, CancellationToken cancellationToken)
    {
        try
        {
            var videosTable = $"{schemaName}.{DefaultVideosTableName}";
            var commentsTable = $"{schemaName}.{DefaultCommentsTableName}";

            var videosExists = await TableExistsAsync(connection, videosTable, cancellationToken);
            if (!videosExists)
            {
                return false;
            }

            var commentsExists = await TableExistsAsync(connection, commentsTable, cancellationToken);

            _videosTable = videosTable;
            _commentsTable = commentsTable;
            return commentsExists;
        }
        catch
        {
            return false;
        }
    }

    private static async Task<bool> TableExistsAsync(NpgsqlConnection connection, string tableName, CancellationToken cancellationToken)
    {
        const string sql = "SELECT to_regclass(@table_name) IS NOT NULL;";
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("table_name", tableName);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is bool exists && exists;
    }

    public async Task<bool> IsDatabasePersistenceAvailableAsync(CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_connectionString))
        {
            return false;
        }

        try
        {
            await EnsureSchemaAsync(cancellationToken);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private async Task<bool> TryEnsureSchemaAsync(NpgsqlConnection connection, string schemaName, CancellationToken cancellationToken)
    {
        try
        {
            var videosTable = $"{schemaName}.{DefaultVideosTableName}";
            var commentsTable = $"{schemaName}.{DefaultCommentsTableName}";
            var sql = BuildSchemaBootstrapSql(schemaName, videosTable, commentsTable);

            await using var command = new NpgsqlCommand(sql, connection);
            await command.ExecuteNonQueryAsync(cancellationToken);

            _videosTable = videosTable;
            _commentsTable = commentsTable;
            return true;
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException($"Failed to initialize Ravensight video persistence schema '{schemaName}'.", ex);
        }
    }

    public static string BuildSchemaBootstrapSql(string schemaName, string videosTable, string commentsTable)
    {
        return $@"
CREATE SCHEMA IF NOT EXISTS {schemaName};

CREATE TABLE IF NOT EXISTS {videosTable} (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    video_url TEXT NOT NULL DEFAULT '',
    thumbnail_url TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'published',
    privacy_status TEXT NOT NULL DEFAULT 'unlisted',
    youtube_url TEXT NULL,
    tiktok_url TEXT NULL,
    facebook_url TEXT NULL,
    storage_mode TEXT NOT NULL DEFAULT 'temporary',
    retention_status TEXT NOT NULL DEFAULT 'active',
    expires_at TIMESTAMPTZ NULL,
    views INTEGER NOT NULL DEFAULT 0,
    likes INTEGER NOT NULL DEFAULT 0,
    comments INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ravensight_videos_v2_user_id_created_at
    ON {videosTable} (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ravensight_videos_v2_created_at
    ON {videosTable} (created_at DESC);

CREATE TABLE IF NOT EXISTS {commentsTable} (
    id TEXT PRIMARY KEY,
    video_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    comment TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_ravensight_video_comments_v2_video
        FOREIGN KEY (video_id) REFERENCES {videosTable} (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ravensight_video_comments_v2_video_id_created_at
    ON {commentsTable} (video_id, created_at DESC);
";
    }

    private async Task<NpgsqlConnection> OpenWithDatabaseProvisioningAsync(CancellationToken cancellationToken)
    {
        var connection = new NpgsqlConnection(_connectionString);
        try
        {
            await connection.OpenAsync(cancellationToken);
            return connection;
        }
        catch (PostgresException ex) when (ex.SqlState == "3D000")
        {
            await connection.DisposeAsync();
            await EnsureDatabaseExistsAsync(cancellationToken);

            var retryConnection = new NpgsqlConnection(_connectionString);
            await retryConnection.OpenAsync(cancellationToken);
            return retryConnection;
        }
    }

    private async Task EnsureDatabaseExistsAsync(CancellationToken cancellationToken)
    {
        var source = new NpgsqlConnectionStringBuilder(_connectionString)
        {
            Pooling = true
        };
        if (string.IsNullOrWhiteSpace(source.Database))
        {
            throw new InvalidOperationException("Connection string must include a database name.");
        }

        var targetDatabase = source.Database;
        var admin = new NpgsqlConnectionStringBuilder(_connectionString)
        {
            Database = "postgres",
            Pooling = true
        };

        await using var adminConnection = new NpgsqlConnection(admin.ConnectionString);
        await adminConnection.OpenAsync(cancellationToken);

        const string existsSql = "SELECT 1 FROM pg_database WHERE datname = @name LIMIT 1;";
        await using (var exists = new NpgsqlCommand(existsSql, adminConnection))
        {
            exists.Parameters.AddWithValue("name", targetDatabase);
            var found = await exists.ExecuteScalarAsync(cancellationToken);
            if (found is not null)
            {
                return;
            }
        }

        var safeName = targetDatabase.Replace("\"", "\"\"");
        var createSql = $"CREATE DATABASE \"{safeName}\"";
        await using var create = new NpgsqlCommand(createSql, adminConnection);
        await create.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<VideoLibraryVideo> CreateVideoAsync(CreateVideoLibraryEntryRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureSchemaAsync(cancellationToken);
        EnsureDbConfigured();

        var entity = new VideoLibraryVideo
        {
            Id = Guid.NewGuid().ToString("N"),
            UserId = request.UserId.Trim(),
            Title = string.IsNullOrWhiteSpace(request.Title) ? "Uploaded Video" : request.Title.Trim(),
            Description = request.Description?.Trim() ?? string.Empty,
            Tags = (request.Tags ?? []).Where(t => !string.IsNullOrWhiteSpace(t)).Select(t => t.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToList(),
            VideoUrl = request.VideoUrl.Trim(),
            ThumbnailUrl = request.ThumbnailUrl?.Trim() ?? string.Empty,
            Status = string.IsNullOrWhiteSpace(request.Status) ? "published" : request.Status.Trim().ToLowerInvariant(),
            PrivacyStatus = string.IsNullOrWhiteSpace(request.PrivacyStatus) ? "unlisted" : request.PrivacyStatus.Trim().ToLowerInvariant(),
            YouTubeUrl = string.IsNullOrWhiteSpace(request.YouTubeUrl) ? null : request.YouTubeUrl.Trim(),
            TikTokUrl = string.IsNullOrWhiteSpace(request.TikTokUrl) ? null : request.TikTokUrl.Trim(),
            FacebookUrl = string.IsNullOrWhiteSpace(request.FacebookUrl) ? null : request.FacebookUrl.Trim(),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        var storageMode = VideoRetentionPolicy.NormalizeStorageMode(request.StorageMode, request.IsPermanent);
        var expiresAt = VideoRetentionPolicy.GetExpiresAt(entity.CreatedAt, request.IsPermanent);
        entity.StorageMode = storageMode;
        entity.RetentionStatus = VideoRetentionPolicy.GetStorageStatus(entity.CreatedAt, request.IsPermanent);
        entity.ExpiresAt = request.IsPermanent ? null : expiresAt;

        try
        {
            await using var connection = new NpgsqlConnection(_connectionString);
            await connection.OpenAsync(cancellationToken);

            var sql = $@"
INSERT INTO {_videosTable} (
    id, user_id, title, description, tags, video_url, thumbnail_url, status, privacy_status,
    youtube_url, tiktok_url, facebook_url, storage_mode, retention_status, expires_at, views, likes, comments, created_at, updated_at
) VALUES (
    @id, @user_id, @title, @description, @tags, @video_url, @thumbnail_url, @status, @privacy_status,
    @youtube_url, @tiktok_url, @facebook_url, @storage_mode, @retention_status, @expires_at, 0, 0, 0, @created_at, @updated_at
);";

            await using var command = new NpgsqlCommand(sql, connection);
            command.Parameters.AddWithValue("id", entity.Id);
            command.Parameters.AddWithValue("user_id", entity.UserId);
            command.Parameters.AddWithValue("title", entity.Title);
            command.Parameters.AddWithValue("description", entity.Description);
            command.Parameters.AddWithValue("tags", entity.Tags.ToArray());
            command.Parameters.AddWithValue("video_url", entity.VideoUrl);
            command.Parameters.AddWithValue("thumbnail_url", entity.ThumbnailUrl);
            command.Parameters.AddWithValue("status", entity.Status);
            command.Parameters.AddWithValue("privacy_status", entity.PrivacyStatus);
            command.Parameters.AddWithValue("youtube_url", (object?)entity.YouTubeUrl ?? DBNull.Value);
            command.Parameters.AddWithValue("tiktok_url", (object?)entity.TikTokUrl ?? DBNull.Value);
            command.Parameters.AddWithValue("facebook_url", (object?)entity.FacebookUrl ?? DBNull.Value);
            command.Parameters.AddWithValue("storage_mode", entity.StorageMode);
            command.Parameters.AddWithValue("retention_status", entity.RetentionStatus);
            command.Parameters.AddWithValue("expires_at", (object?)entity.ExpiresAt ?? DBNull.Value);
            command.Parameters.AddWithValue("created_at", entity.CreatedAt);
            command.Parameters.AddWithValue("updated_at", entity.UpdatedAt);
            await command.ExecuteNonQueryAsync(cancellationToken);

            return entity;
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException($"Failed to insert video library entry into {_videosTable} for user '{entity.UserId}'.", ex);
        }
    }

    public async Task<IReadOnlyList<VideoLibraryVideo>> GetUserVideosAsync(string userId, CancellationToken cancellationToken = default)
    {
        await EnsureSchemaAsync(cancellationToken);
        EnsureDbConfigured();

        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        var sql = $@"
SELECT id, user_id, title, description, tags, video_url, thumbnail_url, status, privacy_status,
       youtube_url, tiktok_url, facebook_url, storage_mode, retention_status, expires_at, views, likes, comments, created_at, updated_at
    FROM {_videosTable}
WHERE user_id = @user_id
  AND (storage_mode = 'permanent' OR expires_at IS NULL OR expires_at > NOW())
ORDER BY created_at DESC;";

        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("user_id", userId);

        return await ReadVideosAsync(command, cancellationToken);
    }

    public async Task<(IReadOnlyList<VideoLibraryVideo> Videos, bool HasMore)> GetFeedAsync(string filter, string? userId, int page, int limit, CancellationToken cancellationToken = default)
    {
        await EnsureSchemaAsync(cancellationToken);
        EnsureDbConfigured();

        var safeLimit = Math.Clamp(limit, 1, 50);
        var safePage = Math.Max(page, 1);
        var offset = (safePage - 1) * safeLimit;

        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        var whereClauses = new List<string> { "(storage_mode = 'permanent' OR expires_at IS NULL OR expires_at > NOW())" };
        if (string.Equals(filter, "my_videos", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(userId))
        {
            whereClauses.Add("user_id = @user_id");
        }

        var whereClause = whereClauses.Count > 0 ? $"WHERE {string.Join(" AND ", whereClauses)}" : string.Empty;

        var sql = $@"
SELECT id, user_id, title, description, tags, video_url, thumbnail_url, status, privacy_status,
       youtube_url, tiktok_url, facebook_url, storage_mode, retention_status, expires_at, views, likes, comments, created_at, updated_at
    FROM {_videosTable}
{whereClause}
ORDER BY created_at DESC
LIMIT @limit_plus_one OFFSET @offset;";

        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("limit_plus_one", safeLimit + 1);
        command.Parameters.AddWithValue("offset", offset);
        if (whereClauses.Any(clause => clause.Contains("user_id", StringComparison.OrdinalIgnoreCase)))
        {
            command.Parameters.AddWithValue("user_id", userId!);
        }

        var videos = (await ReadVideosAsync(command, cancellationToken)).ToList();
        var hasMore = videos.Count > safeLimit;
        if (hasMore)
        {
            videos.RemoveAt(videos.Count - 1);
        }

        return (videos, hasMore);
    }

    public async Task<VideoLibraryVideo?> GetByIdAsync(string id, CancellationToken cancellationToken = default)
    {
        await EnsureSchemaAsync(cancellationToken);
        EnsureDbConfigured();

        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        var sql = $@"
SELECT id, user_id, title, description, tags, video_url, thumbnail_url, status, privacy_status,
       youtube_url, tiktok_url, facebook_url, storage_mode, retention_status, expires_at, views, likes, comments, created_at, updated_at
    FROM {_videosTable}
WHERE id = @id
  AND (storage_mode = 'permanent' OR expires_at IS NULL OR expires_at > NOW())
LIMIT 1;";

        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("id", id);

        var videos = await ReadVideosAsync(command, cancellationToken);
        return videos.FirstOrDefault();
    }

    public async Task<VideoLibraryVideo?> UpdateVideoAsync(string id, string userId, UpdateVideoLibraryEntryRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureSchemaAsync(cancellationToken);
        EnsureDbConfigured();

        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        var sql = $@"
    UPDATE {_videosTable}
SET title = COALESCE(@title, title),
    description = COALESCE(@description, description),
    tags = COALESCE(@tags, tags),
    updated_at = @updated_at
WHERE id = @id AND user_id = @user_id;";

        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("user_id", userId);
        command.Parameters.AddWithValue("title", (object?)request.Title?.Trim() ?? DBNull.Value);
        command.Parameters.AddWithValue("description", (object?)request.Description?.Trim() ?? DBNull.Value);

        if (request.Tags is null)
        {
            command.Parameters.AddWithValue("tags", DBNull.Value);
        }
        else
        {
            var tags = request.Tags
                .Where(t => !string.IsNullOrWhiteSpace(t))
                .Select(t => t.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();
            command.Parameters.AddWithValue("tags", tags);
        }

        command.Parameters.AddWithValue("updated_at", DateTime.UtcNow);

        var updated = await command.ExecuteNonQueryAsync(cancellationToken);
        if (updated == 0)
        {
            return null;
        }

        return await GetByIdAsync(id, cancellationToken);
    }

    public async Task<bool> DeleteVideoAsync(string id, string userId, CancellationToken cancellationToken = default)
    {
        await EnsureSchemaAsync(cancellationToken);
        EnsureDbConfigured();

        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        var sql = $"DELETE FROM {_videosTable} WHERE id = @id AND user_id = @user_id;";
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("user_id", userId);
        return await command.ExecuteNonQueryAsync(cancellationToken) > 0;
    }

    public async Task<bool> AddLikeAsync(string id, CancellationToken cancellationToken = default)
    {
        return await UpdateLikesAsync(id, +1, cancellationToken);
    }

    public async Task<bool> RemoveLikeAsync(string id, CancellationToken cancellationToken = default)
    {
        return await UpdateLikesAsync(id, -1, cancellationToken);
    }

    private async Task<bool> UpdateLikesAsync(string id, int delta, CancellationToken cancellationToken)
    {
        await EnsureSchemaAsync(cancellationToken);
        EnsureDbConfigured();

        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        var sql = $@"
    UPDATE {_videosTable}
SET likes = GREATEST(likes + @delta, 0),
    updated_at = @updated_at
WHERE id = @id;";

        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("delta", delta);
        command.Parameters.AddWithValue("updated_at", DateTime.UtcNow);
        return await command.ExecuteNonQueryAsync(cancellationToken) > 0;
    }

    public async Task<VideoLibraryComment?> AddCommentAsync(string id, string userId, string comment, CancellationToken cancellationToken = default)
    {
        await EnsureSchemaAsync(cancellationToken);
        EnsureDbConfigured();

        var safeComment = comment.Trim();
        if (string.IsNullOrWhiteSpace(safeComment))
        {
            return null;
        }

        var entity = new VideoLibraryComment
        {
            Id = Guid.NewGuid().ToString("N"),
            VideoId = id,
            UserId = userId,
            Comment = safeComment,
            CreatedAt = DateTime.UtcNow
        };

        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var tx = await connection.BeginTransactionAsync(cancellationToken);

        var insertComment = $@"
    INSERT INTO {_commentsTable} (id, video_id, user_id, comment, created_at)
VALUES (@id, @video_id, @user_id, @comment, @created_at);";

        await using (var insert = new NpgsqlCommand(insertComment, connection, tx))
        {
            insert.Parameters.AddWithValue("id", entity.Id);
            insert.Parameters.AddWithValue("video_id", entity.VideoId);
            insert.Parameters.AddWithValue("user_id", entity.UserId);
            insert.Parameters.AddWithValue("comment", entity.Comment);
            insert.Parameters.AddWithValue("created_at", entity.CreatedAt);
            await insert.ExecuteNonQueryAsync(cancellationToken);
        }

        var incrementCount = $@"
    UPDATE {_videosTable}
SET comments = comments + 1,
    updated_at = @updated_at
WHERE id = @id;";

        await using (var update = new NpgsqlCommand(incrementCount, connection, tx))
        {
            update.Parameters.AddWithValue("id", id);
            update.Parameters.AddWithValue("updated_at", DateTime.UtcNow);
            await update.ExecuteNonQueryAsync(cancellationToken);
        }

        await tx.CommitAsync(cancellationToken);
        return entity;
    }

    public async Task<IReadOnlyList<VideoLibraryComment>> GetCommentsAsync(string videoId, int page, int pageSize = 20, CancellationToken cancellationToken = default)
    {
        await EnsureSchemaAsync(cancellationToken);
        EnsureDbConfigured();

        var safePage = Math.Max(page, 1);
        var safeSize = Math.Clamp(pageSize, 1, 100);
        var offset = (safePage - 1) * safeSize;

        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        var sql = $@"
SELECT id, video_id, user_id, comment, created_at
    FROM {_commentsTable}
WHERE video_id = @video_id
ORDER BY created_at DESC
LIMIT @limit OFFSET @offset;";

        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("video_id", videoId);
        command.Parameters.AddWithValue("limit", safeSize);
        command.Parameters.AddWithValue("offset", offset);

        var comments = new List<VideoLibraryComment>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            comments.Add(new VideoLibraryComment
            {
                Id = reader.GetString(0),
                VideoId = reader.GetString(1),
                UserId = reader.GetString(2),
                Comment = reader.GetString(3),
                CreatedAt = reader.GetDateTime(4)
            });
        }

        return comments;
    }

    private static async Task<IReadOnlyList<VideoLibraryVideo>> ReadVideosAsync(NpgsqlCommand command, CancellationToken cancellationToken)
    {
        var list = new List<VideoLibraryVideo>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        while (await reader.ReadAsync(cancellationToken))
        {
            list.Add(new VideoLibraryVideo
            {
                Id = reader.GetString(0),
                UserId = reader.GetString(1),
                Title = reader.GetString(2),
                Description = reader.GetString(3),
                Tags = reader.IsDBNull(4) ? [] : reader.GetFieldValue<string[]>(4).ToList(),
                VideoUrl = reader.GetString(5),
                ThumbnailUrl = reader.GetString(6),
                Status = reader.GetString(7),
                PrivacyStatus = reader.GetString(8),
                YouTubeUrl = reader.IsDBNull(9) ? null : reader.GetString(9),
                TikTokUrl = reader.IsDBNull(10) ? null : reader.GetString(10),
                FacebookUrl = reader.IsDBNull(11) ? null : reader.GetString(11),
                StorageMode = reader.IsDBNull(12) ? "temporary" : reader.GetString(12),
                RetentionStatus = reader.IsDBNull(13) ? "active" : reader.GetString(13),
                ExpiresAt = reader.IsDBNull(14) ? null : reader.GetDateTime(14),
                Views = reader.GetInt32(15),
                Likes = reader.GetInt32(16),
                Comments = reader.GetInt32(17),
                CreatedAt = reader.GetDateTime(18),
                UpdatedAt = reader.GetDateTime(19)
            });
        }

        return list;
    }

    private void EnsureDbConfigured()
    {
        if (string.IsNullOrWhiteSpace(_connectionString))
        {
            throw new InvalidOperationException("DATABASE_URL or ConnectionStrings:DefaultConnection is required for video library persistence.");
        }
    }

    private static string NormalizeConnectionString(string connectionString)
    {
        var value = connectionString?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        if (!value.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase)
            && !value.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
        {
            return value;
        }

        if (value.EndsWith("?sslmode", StringComparison.OrdinalIgnoreCase))
        {
            return value + "=require";
        }

        value = value.Replace("?sslmode&", "?sslmode=require&", StringComparison.OrdinalIgnoreCase);
        value = value.Replace("&sslmode&", "&sslmode=require&", StringComparison.OrdinalIgnoreCase);

        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri))
        {
            return value;
        }

        var userName = string.Empty;
        var password = string.Empty;
        if (!string.IsNullOrWhiteSpace(uri.UserInfo))
        {
            var parts = uri.UserInfo.Split(':', 2);
            userName = Uri.UnescapeDataString(parts[0]);
            if (parts.Length > 1)
            {
                password = Uri.UnescapeDataString(parts[1]);
            }
        }

        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.IsDefaultPort ? 5432 : uri.Port,
            Username = userName,
            Password = password,
            Database = uri.AbsolutePath.Trim('/'),
            SslMode = SslMode.Require,
            Pooling = true
        };

        var query = uri.Query?.TrimStart('?') ?? string.Empty;
        foreach (var segment in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var kv = segment.Split('=', 2);
            var key = Uri.UnescapeDataString(kv[0]);
            var val = kv.Length > 1 ? Uri.UnescapeDataString(kv[1]) : string.Empty;

            if (key.Equals("sslmode", StringComparison.OrdinalIgnoreCase)
                && Enum.TryParse<SslMode>(val, true, out var mode))
            {
                builder.SslMode = mode;
            }
        }

        return builder.ConnectionString;
    }
}
