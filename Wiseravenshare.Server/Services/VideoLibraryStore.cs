using Npgsql;
using Wiseravenshare.Server.Models;

namespace Wiseravenshare.Server.Services;

public sealed class VideoLibraryStore
{
    private readonly string _connectionString;
    private bool _schemaEnsured;
    private readonly SemaphoreSlim _schemaLock = new(1, 1);

    public VideoLibraryStore(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("DefaultConnection") ?? string.Empty;
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

            var sql = @"
CREATE TABLE IF NOT EXISTS ravensight_videos (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    video_url TEXT NOT NULL,
    thumbnail_url TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'published',
    privacy_status TEXT NOT NULL DEFAULT 'unlisted',
    youtube_url TEXT NULL,
    tiktok_url TEXT NULL,
    facebook_url TEXT NULL,
    views INTEGER NOT NULL DEFAULT 0,
    likes INTEGER NOT NULL DEFAULT 0,
    comments INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ravensight_videos_user_id_created_at
    ON ravensight_videos (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ravensight_videos_created_at
    ON ravensight_videos (created_at DESC);

CREATE TABLE IF NOT EXISTS ravensight_video_comments (
    id TEXT PRIMARY KEY,
    video_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    comment TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_ravensight_video_comments_video
        FOREIGN KEY (video_id) REFERENCES ravensight_videos (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ravensight_video_comments_video_id_created_at
    ON ravensight_video_comments (video_id, created_at DESC);
";

                await using var command = new NpgsqlCommand(sql, connection);
                await command.ExecuteNonQueryAsync(cancellationToken);
            }
            _schemaEnsured = true;
        }
        finally
        {
            _schemaLock.Release();
        }
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
        var source = new NpgsqlConnectionStringBuilder(_connectionString);
        if (string.IsNullOrWhiteSpace(source.Database))
        {
            throw new InvalidOperationException("Connection string must include a database name.");
        }

        var targetDatabase = source.Database;
        var admin = new NpgsqlConnectionStringBuilder(_connectionString)
        {
            Database = "postgres"
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

        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        const string sql = @"
INSERT INTO ravensight_videos (
    id, user_id, title, description, tags, video_url, thumbnail_url, status, privacy_status,
    youtube_url, tiktok_url, facebook_url, views, likes, comments, created_at, updated_at
) VALUES (
    @id, @user_id, @title, @description, @tags, @video_url, @thumbnail_url, @status, @privacy_status,
    @youtube_url, @tiktok_url, @facebook_url, 0, 0, 0, @created_at, @updated_at
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
        command.Parameters.AddWithValue("created_at", entity.CreatedAt);
        command.Parameters.AddWithValue("updated_at", entity.UpdatedAt);
        await command.ExecuteNonQueryAsync(cancellationToken);

        return entity;
    }

    public async Task<IReadOnlyList<VideoLibraryVideo>> GetUserVideosAsync(string userId, CancellationToken cancellationToken = default)
    {
        await EnsureSchemaAsync(cancellationToken);
        EnsureDbConfigured();

        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        const string sql = @"
SELECT id, user_id, title, description, tags, video_url, thumbnail_url, status, privacy_status,
       youtube_url, tiktok_url, facebook_url, views, likes, comments, created_at, updated_at
FROM ravensight_videos
WHERE user_id = @user_id
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

        var whereClause = string.Empty;
        if (string.Equals(filter, "my_videos", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(userId))
        {
            whereClause = "WHERE user_id = @user_id";
        }

        var sql = $@"
SELECT id, user_id, title, description, tags, video_url, thumbnail_url, status, privacy_status,
       youtube_url, tiktok_url, facebook_url, views, likes, comments, created_at, updated_at
FROM ravensight_videos
{whereClause}
ORDER BY created_at DESC
LIMIT @limit_plus_one OFFSET @offset;";

        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("limit_plus_one", safeLimit + 1);
        command.Parameters.AddWithValue("offset", offset);
        if (!string.IsNullOrWhiteSpace(whereClause))
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

        const string sql = @"
SELECT id, user_id, title, description, tags, video_url, thumbnail_url, status, privacy_status,
       youtube_url, tiktok_url, facebook_url, views, likes, comments, created_at, updated_at
FROM ravensight_videos
WHERE id = @id
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

        const string sql = @"
UPDATE ravensight_videos
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

        const string sql = "DELETE FROM ravensight_videos WHERE id = @id AND user_id = @user_id;";
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

        const string sql = @"
UPDATE ravensight_videos
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

        const string insertComment = @"
INSERT INTO ravensight_video_comments (id, video_id, user_id, comment, created_at)
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

        const string incrementCount = @"
UPDATE ravensight_videos
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

        const string sql = @"
SELECT id, video_id, user_id, comment, created_at
FROM ravensight_video_comments
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
                Views = reader.GetInt32(12),
                Likes = reader.GetInt32(13),
                Comments = reader.GetInt32(14),
                CreatedAt = reader.GetDateTime(15),
                UpdatedAt = reader.GetDateTime(16)
            });
        }

        return list;
    }

    private void EnsureDbConfigured()
    {
        if (string.IsNullOrWhiteSpace(_connectionString))
        {
            throw new InvalidOperationException("ConnectionStrings:DefaultConnection is required for video library persistence.");
        }
    }
}
