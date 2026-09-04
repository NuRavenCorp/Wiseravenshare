using System.Text.Json;
using Npgsql;
using Wiseravenshare.Server.DTOs;
using Wiseravenshare.Server.Models;

namespace Wiseravenshare.Server.Services;

public interface IMusicLibraryStore
{
    Task<IReadOnlyList<UserMusicTrackDto>> GetUserMusicAsync(Guid userId, CancellationToken cancellationToken = default);

    Task<UserMusicTrackDto> SaveMusicAsync(
        Guid userId,
        IFormFile file,
        SaveRavensightMusicDto dto,
        CancellationToken cancellationToken = default);
}

public sealed class BucketMusicLibraryStore : IMusicLibraryStore
{
    private readonly string _connectionString;
    private readonly string _bucketName;
    private readonly string _region;
    private readonly string _endpoint;
    private readonly string _cdnBaseUrl;
    private readonly string _provider = "digitalocean_spaces";
    private readonly IBlobStorageService _blobStorageService;
    private readonly IRavensightMusicService _musicService;

    public BucketMusicLibraryStore(
        IConfiguration configuration,
        IBlobStorageService blobStorageService,
        IRavensightMusicService musicService)
    {
        _connectionString = ResolveConnectionString(configuration);
        _bucketName = configuration["Storage:Blob:BucketName"]?.Trim() ?? "bucket-wrs-01010";
        _region = configuration["Storage:Blob:Region"]?.Trim() ?? "nyc3";
        _endpoint = configuration["Storage:Blob:Endpoint"]?.Trim() ?? "https://nyc3.digitaloceanspaces.com";
        _cdnBaseUrl = configuration["Storage:Blob:PublicBaseUrl"]?.Trim() ?? string.Empty;
        _blobStorageService = blobStorageService;
        _musicService = musicService;
    }

    public async Task<IReadOnlyList<UserMusicTrackDto>> GetUserMusicAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        if (userId == Guid.Empty || string.IsNullOrWhiteSpace(_connectionString))
        {
            return Array.Empty<UserMusicTrackDto>();
        }

        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        const string sql = @"
SELECT id, object_key, original_file_name, content_type, size_bytes, public_url, metadata::text, created_at
FROM app_data.bucket_objects
WHERE owner_user_id = @user_id
  AND deleted_at IS NULL
  AND upload_status = 'uploaded'
  AND (
      metadata->>'mediaType' = 'music'
      OR folder_path ILIKE '%music%'
  )
ORDER BY created_at DESC;";

        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("user_id", userId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var tracks = new List<UserMusicTrackDto>();

        while (await reader.ReadAsync(cancellationToken))
        {
            var objectKey = reader.GetString(1);
            var originalFileName = reader.GetString(2);
            var metadata = ParseMetadata(reader.IsDBNull(6) ? null : reader.GetString(6));
            var storedFileName = ReadMetadataString(metadata, "storedFileName", originalFileName);
            var mediaUrl = ResolveMediaUrl(reader.IsDBNull(5) ? null : reader.GetString(5), objectKey, storedFileName);

            tracks.Add(new UserMusicTrackDto
            {
                Id = reader.GetString(0),
                Title = ReadMetadataString(metadata, "title", Path.GetFileNameWithoutExtension(originalFileName)),
                Artist = ReadMetadataString(metadata, "artist", string.Empty),
                Album = ReadMetadataString(metadata, "album", string.Empty),
                Genre = ReadMetadataString(metadata, "genre", string.Empty),
                Fingerprint = ReadMetadataString(metadata, "fingerprint", null),
                MediaUrl = mediaUrl,
                FileName = storedFileName,
                UploadedAt = reader.GetDateTime(7).ToString("O"),
                SizeBytes = reader.GetInt64(4)
            });
        }

        return tracks;
    }

    public async Task<UserMusicTrackDto> SaveMusicAsync(
        Guid userId,
        IFormFile file,
        SaveRavensightMusicDto dto,
        CancellationToken cancellationToken = default)
    {
        if (file is null || file.Length == 0)
        {
            throw new InvalidOperationException("No music file uploaded.");
        }

        var saved = await _musicService.SaveMusicAsync(file, dto.DestinationFolder, cancellationToken);
        var bucketObjectId = Guid.NewGuid().ToString("N");
        var metadata = new Dictionary<string, object?>
        {
            ["mediaType"] = "music",
            ["title"] = string.IsNullOrWhiteSpace(dto.Title) ? Path.GetFileNameWithoutExtension(file.FileName) : dto.Title.Trim(),
            ["artist"] = dto.Artist?.Trim() ?? string.Empty,
            ["album"] = dto.Album?.Trim() ?? string.Empty,
            ["genre"] = dto.Genre?.Trim() ?? string.Empty,
            ["fingerprint"] = string.IsNullOrWhiteSpace(dto.Fingerprint) ? null : dto.Fingerprint.Trim(),
            ["destinationFolder"] = saved.DestinationFolder,
            ["sourceFileName"] = file.FileName,
            ["storedFileName"] = saved.FileName,
            ["mediaUrl"] = ResolveMediaUrl(saved.PublicUrl, saved.RelativePath, saved.FileName)
        };

        await InsertBucketObjectAsync(bucketObjectId, userId, file, saved, metadata, cancellationToken);

        return new UserMusicTrackDto
        {
            Id = bucketObjectId,
            Title = Convert.ToString(metadata["title"]) ?? Path.GetFileNameWithoutExtension(file.FileName),
            Artist = Convert.ToString(metadata["artist"]) ?? string.Empty,
            Album = Convert.ToString(metadata["album"]) ?? string.Empty,
            Genre = Convert.ToString(metadata["genre"]) ?? string.Empty,
            Fingerprint = Convert.ToString(metadata["fingerprint"]),
            MediaUrl = Convert.ToString(metadata["mediaUrl"]) ?? ResolveMediaUrl(saved.PublicUrl, saved.RelativePath, saved.FileName),
            FileName = saved.FileName,
            UploadedAt = saved.SavedAtUtc.ToString("O"),
            SizeBytes = saved.SizeBytes
        };
    }

    private async Task InsertBucketObjectAsync(
        string bucketObjectId,
        Guid userId,
        IFormFile file,
        RavensightSavedMediaFile saved,
        IDictionary<string, object?> metadata,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_connectionString))
        {
            return;
        }

        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        const string sql = @"
INSERT INTO app_data.bucket_objects (
    id, owner_user_id, provider, bucket_name, region, endpoint, folder_path,
    object_key, original_file_name, content_type, size_bytes, etag, acl,
    cdn_base_url, public_url, upload_status, metadata, created_at, updated_at, deleted_at
) VALUES (
    @id, @owner_user_id, @provider, @bucket_name, @region, @endpoint, @folder_path,
    @object_key, @original_file_name, @content_type, @size_bytes, @etag, @acl,
    @cdn_base_url, @public_url, @upload_status, CAST(@metadata AS jsonb), @created_at, @updated_at, NULL
);";

        await using var command = new NpgsqlCommand(sql, connection);
                command.Parameters.AddWithValue("id", bucketObjectId);
        command.Parameters.AddWithValue("owner_user_id", userId);
        command.Parameters.AddWithValue("provider", _provider);
        command.Parameters.AddWithValue("bucket_name", _bucketName);
        command.Parameters.AddWithValue("region", _region);
        command.Parameters.AddWithValue("endpoint", _endpoint);
        command.Parameters.AddWithValue("folder_path", NormalizeFolderPath(saved.DestinationFolder));
        command.Parameters.AddWithValue("object_key", saved.RelativePath);
        command.Parameters.AddWithValue("original_file_name", file.FileName);
        command.Parameters.AddWithValue("content_type", string.IsNullOrWhiteSpace(saved.ContentType) ? file.ContentType ?? "application/octet-stream" : saved.ContentType);
        command.Parameters.AddWithValue("size_bytes", saved.SizeBytes);
        command.Parameters.AddWithValue("etag", DBNull.Value);
        command.Parameters.AddWithValue("acl", "private");
        command.Parameters.AddWithValue("cdn_base_url", string.IsNullOrWhiteSpace(_cdnBaseUrl) ? DBNull.Value : _cdnBaseUrl);
        command.Parameters.AddWithValue("public_url", (object?)saved.PublicUrl ?? DBNull.Value);
        command.Parameters.AddWithValue("upload_status", "uploaded");
        command.Parameters.AddWithValue("metadata", JsonSerializer.Serialize(metadata));
        command.Parameters.AddWithValue("created_at", saved.SavedAtUtc);
        command.Parameters.AddWithValue("updated_at", saved.SavedAtUtc);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private string ResolveMediaUrl(string? publicUrl, string objectKey, string fileName)
    {
        if (!string.IsNullOrWhiteSpace(publicUrl))
        {
            return publicUrl;
        }

        var resolved = _blobStorageService.ResolvePublicUrl(objectKey);
        if (!string.IsNullOrWhiteSpace(resolved))
        {
            return resolved;
        }

        return $"/api/videostreaming/stream?fileName={Uri.EscapeDataString(fileName)}";
    }

    private static JsonElement? ParseMetadata(string? metadataJson)
    {
        if (string.IsNullOrWhiteSpace(metadataJson))
        {
            return null;
        }

        try
        {
            var document = JsonDocument.Parse(metadataJson);
            return document.RootElement.Clone();
        }
        catch
        {
            return null;
        }
    }

    private static string ReadMetadataString(JsonElement? metadata, string propertyName, string? fallback)
    {
        if (metadata is not { } element)
        {
            return fallback ?? string.Empty;
        }

        if (element.ValueKind == JsonValueKind.Object
            && element.TryGetProperty(propertyName, out var value)
            && value.ValueKind == JsonValueKind.String)
        {
            return value.GetString() ?? (fallback ?? string.Empty);
        }

        return fallback ?? string.Empty;
    }

    private static string NormalizeFolderPath(string? folder)
    {
        var value = String.IsNullOrWhiteSpace(folder) ? "wiseravenshare/ravensight/music" : folder!.Trim();
        value = value.Replace('\\', '/').Trim('/');
        return string.IsNullOrWhiteSpace(value) ? "wiseravenshare/ravensight/music" : value;
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
