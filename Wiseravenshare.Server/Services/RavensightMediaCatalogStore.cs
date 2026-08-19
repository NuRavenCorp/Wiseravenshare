using Npgsql;
using Wiseravenshare.Server.Models;

namespace Wiseravenshare.Server.Services;

public sealed class RavensightMediaCatalogStore
{
    private const string DefaultSchemaName = "app_data";
    private const string DefaultAssetsTableName = "ravensight_media_assets";
    private const string DefaultPreferencesTableName = "ravensight_user_media_preferences";

    private readonly string _connectionString;
    private bool _schemaEnsured;
    private readonly SemaphoreSlim _schemaLock = new(1, 1);

    private string AssetsTable => $"{DefaultSchemaName}.{DefaultAssetsTableName}";
    private string PreferencesTable => $"{DefaultSchemaName}.{DefaultPreferencesTableName}";

    public RavensightMediaCatalogStore(IConfiguration configuration)
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

            await using var connection = new NpgsqlConnection(_connectionString);
            await connection.OpenAsync(cancellationToken);

            await using var command = new NpgsqlCommand(BuildSchemaBootstrapSql(), connection);
            await command.ExecuteNonQueryAsync(cancellationToken);
            _schemaEnsured = true;
        }
        finally
        {
            _schemaLock.Release();
        }
    }

    private string BuildSchemaBootstrapSql()
    {
        return $@"
CREATE SCHEMA IF NOT EXISTS {DefaultSchemaName};

CREATE TABLE IF NOT EXISTS {AssetsTable} (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL,
    media_type TEXT NOT NULL,
    file_name TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    public_url TEXT NULL,
    absolute_path TEXT NOT NULL,
    destination_folder TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    saved_at_utc TIMESTAMPTZ NOT NULL,
    expires_at_utc TIMESTAMPTZ NOT NULL,
    auto_delete_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    metadata_json JSONB NOT NULL DEFAULT '{{}}'::jsonb,
    deleted_at_utc TIMESTAMPTZ NULL,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ravensight_media_assets_user_saved
    ON {AssetsTable} (user_id, saved_at_utc DESC);

CREATE INDEX IF NOT EXISTS idx_ravensight_media_assets_expiry
    ON {AssetsTable} (expires_at_utc)
    WHERE deleted_at_utc IS NULL AND auto_delete_enabled = TRUE;

CREATE TABLE IF NOT EXISTS {PreferencesTable} (
    user_id UUID PRIMARY KEY,
    local_folder_permission_granted BOOLEAN NOT NULL DEFAULT FALSE,
    local_folder_alias TEXT NULL,
    local_save_root TEXT NOT NULL DEFAULT 'auto',
    folder_identity_key TEXT NULL,
    granted_at_utc TIMESTAMPTZ NULL,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
";
    }

    public async Task<RavensightMediaAssetRecord> CreateAssetAsync(
        CreateRavensightMediaAssetRequest request,
        CancellationToken cancellationToken = default)
    {
        await EnsureSchemaAsync(cancellationToken);

        var now = DateTime.UtcNow;
        var expiresAtUtc = request.SavedAtUtc.AddDays(VideoRetentionPolicy.TemporaryRetentionDays);
        var id = Guid.NewGuid().ToString("N");
        var mediaType = request.MediaType.ToString().ToLowerInvariant();

        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        var sql = $@"
INSERT INTO {AssetsTable} (
    id, user_id, media_type, file_name, relative_path, public_url, absolute_path,
    destination_folder, content_type, size_bytes, saved_at_utc, expires_at_utc,
    auto_delete_enabled, metadata_json, deleted_at_utc, created_at_utc, updated_at_utc
) VALUES (
    @id, @user_id, @media_type, @file_name, @relative_path, @public_url, @absolute_path,
    @destination_folder, @content_type, @size_bytes, @saved_at_utc, @expires_at_utc,
    TRUE, CAST(@metadata_json AS jsonb), NULL, @created_at_utc, @updated_at_utc
);";

        await using (var command = new NpgsqlCommand(sql, connection))
        {
            command.Parameters.AddWithValue("id", id);
            command.Parameters.AddWithValue("user_id", request.UserId);
            command.Parameters.AddWithValue("media_type", mediaType);
            command.Parameters.AddWithValue("file_name", request.FileName);
            command.Parameters.AddWithValue("relative_path", request.RelativePath);
            command.Parameters.AddWithValue("public_url", (object?)request.PublicUrl ?? DBNull.Value);
            command.Parameters.AddWithValue("absolute_path", request.AbsolutePath);
            command.Parameters.AddWithValue("destination_folder", request.DestinationFolder);
            command.Parameters.AddWithValue("content_type", request.ContentType);
            command.Parameters.AddWithValue("size_bytes", request.SizeBytes);
            command.Parameters.AddWithValue("saved_at_utc", request.SavedAtUtc);
            command.Parameters.AddWithValue("expires_at_utc", expiresAtUtc);
            command.Parameters.AddWithValue("metadata_json", string.IsNullOrWhiteSpace(request.MetadataJson) ? "{}" : request.MetadataJson);
            command.Parameters.AddWithValue("created_at_utc", now);
            command.Parameters.AddWithValue("updated_at_utc", now);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        return new RavensightMediaAssetRecord
        {
            Id = id,
            UserId = request.UserId,
            MediaType = mediaType,
            FileName = request.FileName,
            RelativePath = request.RelativePath,
            PublicUrl = request.PublicUrl,
            AbsolutePath = request.AbsolutePath,
            DestinationFolder = request.DestinationFolder,
            ContentType = request.ContentType,
            SizeBytes = request.SizeBytes,
            SavedAtUtc = request.SavedAtUtc,
            ExpiresAtUtc = expiresAtUtc,
            AutoDeleteEnabled = true,
            MetadataJson = string.IsNullOrWhiteSpace(request.MetadataJson) ? "{}" : request.MetadataJson,
            DeletedAtUtc = null
        };
    }

    public async Task<RavensightMediaUserPreference?> GetUserPreferenceAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        await EnsureSchemaAsync(cancellationToken);

        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        var sql = $@"
SELECT user_id, local_folder_permission_granted, local_folder_alias, local_save_root, folder_identity_key, granted_at_utc, updated_at_utc
FROM {PreferencesTable}
WHERE user_id = @user_id;";

        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("user_id", userId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new RavensightMediaUserPreference
        {
            UserId = reader.GetGuid(0),
            LocalFolderPermissionGranted = reader.GetBoolean(1),
            LocalFolderAlias = reader.IsDBNull(2) ? null : reader.GetString(2),
            LocalSaveRoot = reader.IsDBNull(3) ? "auto" : reader.GetString(3),
            FolderIdentityKey = reader.IsDBNull(4) ? null : reader.GetString(4),
            GrantedAtUtc = reader.IsDBNull(5) ? null : reader.GetDateTime(5),
            UpdatedAtUtc = reader.GetDateTime(6)
        };
    }

    public async Task<RavensightMediaUserPreference> UpsertUserPreferenceAsync(
        Guid userId,
        SaveRavensightMediaPreferenceRequest request,
        CancellationToken cancellationToken = default)
    {
        await EnsureSchemaAsync(cancellationToken);

        var now = DateTime.UtcNow;
        var normalizedRoot = NormalizeSaveRoot(request.LocalSaveRoot);
        var normalizedAlias = string.IsNullOrWhiteSpace(request.LocalFolderAlias) ? "Ravensight" : request.LocalFolderAlias.Trim();
        var safeAlias = new string(normalizedAlias.Where(ch => char.IsLetterOrDigit(ch) || ch is '-' or '_').ToArray());
        if (string.IsNullOrWhiteSpace(safeAlias))
        {
            safeAlias = "Ravensight";
        }

        var folderIdentityKey = request.LocalFolderPermissionGranted
            ? $"{userId:N}:ravensight:{safeAlias.ToLowerInvariant()}"
            : null;

        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        var sql = $@"
INSERT INTO {PreferencesTable} (
    user_id, local_folder_permission_granted, local_folder_alias, local_save_root,
    folder_identity_key, granted_at_utc, created_at_utc, updated_at_utc
) VALUES (
    @user_id, @local_folder_permission_granted, @local_folder_alias, @local_save_root,
    @folder_identity_key, @granted_at_utc, @created_at_utc, @updated_at_utc
)
ON CONFLICT (user_id)
DO UPDATE SET
    local_folder_permission_granted = EXCLUDED.local_folder_permission_granted,
    local_folder_alias = EXCLUDED.local_folder_alias,
    local_save_root = EXCLUDED.local_save_root,
    folder_identity_key = EXCLUDED.folder_identity_key,
    granted_at_utc = EXCLUDED.granted_at_utc,
    updated_at_utc = EXCLUDED.updated_at_utc;";

        await using (var command = new NpgsqlCommand(sql, connection))
        {
            command.Parameters.AddWithValue("user_id", userId);
            command.Parameters.AddWithValue("local_folder_permission_granted", request.LocalFolderPermissionGranted);
            command.Parameters.AddWithValue("local_folder_alias", request.LocalFolderPermissionGranted ? safeAlias : (object)DBNull.Value);
            command.Parameters.AddWithValue("local_save_root", normalizedRoot);
            command.Parameters.AddWithValue("folder_identity_key", (object?)folderIdentityKey ?? DBNull.Value);
            command.Parameters.AddWithValue("granted_at_utc", request.LocalFolderPermissionGranted ? now : (object)DBNull.Value);
            command.Parameters.AddWithValue("created_at_utc", now);
            command.Parameters.AddWithValue("updated_at_utc", now);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        return new RavensightMediaUserPreference
        {
            UserId = userId,
            LocalFolderPermissionGranted = request.LocalFolderPermissionGranted,
            LocalFolderAlias = request.LocalFolderPermissionGranted ? safeAlias : null,
            LocalSaveRoot = normalizedRoot,
            FolderIdentityKey = folderIdentityKey,
            GrantedAtUtc = request.LocalFolderPermissionGranted ? now : null,
            UpdatedAtUtc = now
        };
    }

    public async Task<IReadOnlyList<RavensightMediaAssetRecord>> GetExpiredAssetsAsync(DateTime nowUtc, int limit, CancellationToken cancellationToken = default)
    {
        await EnsureSchemaAsync(cancellationToken);

        var take = Math.Clamp(limit, 1, 500);

        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        var sql = $@"
SELECT id, user_id, media_type, file_name, relative_path, public_url, absolute_path, destination_folder,
       content_type, size_bytes, saved_at_utc, expires_at_utc, auto_delete_enabled, metadata_json, deleted_at_utc
FROM {AssetsTable}
WHERE auto_delete_enabled = TRUE
  AND deleted_at_utc IS NULL
  AND expires_at_utc <= @now_utc
ORDER BY expires_at_utc ASC
LIMIT @limit;";

        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("now_utc", nowUtc);
        command.Parameters.AddWithValue("limit", take);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var rows = new List<RavensightMediaAssetRecord>();

        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(new RavensightMediaAssetRecord
            {
                Id = reader.GetString(0),
                UserId = reader.GetGuid(1),
                MediaType = reader.GetString(2),
                FileName = reader.GetString(3),
                RelativePath = reader.GetString(4),
                PublicUrl = reader.IsDBNull(5) ? null : reader.GetString(5),
                AbsolutePath = reader.GetString(6),
                DestinationFolder = reader.GetString(7),
                ContentType = reader.GetString(8),
                SizeBytes = reader.GetInt64(9),
                SavedAtUtc = reader.GetDateTime(10),
                ExpiresAtUtc = reader.GetDateTime(11),
                AutoDeleteEnabled = reader.GetBoolean(12),
                MetadataJson = reader.IsDBNull(13) ? "{}" : reader.GetString(13),
                DeletedAtUtc = reader.IsDBNull(14) ? null : reader.GetDateTime(14)
            });
        }

        return rows;
    }

    public async Task MarkAssetDeletedAsync(string id, DateTime deletedAtUtc, CancellationToken cancellationToken = default)
    {
        await EnsureSchemaAsync(cancellationToken);

        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        var sql = $@"
UPDATE {AssetsTable}
SET deleted_at_utc = @deleted_at_utc,
    updated_at_utc = @updated_at_utc
WHERE id = @id;";

        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("deleted_at_utc", deletedAtUtc);
        command.Parameters.AddWithValue("updated_at_utc", deletedAtUtc);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static string NormalizeSaveRoot(string? value)
    {
        var normalized = string.Concat(value ?? "auto").Trim().ToLowerInvariant();
        return normalized is "videos" or "pictures" ? normalized : "auto";
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
