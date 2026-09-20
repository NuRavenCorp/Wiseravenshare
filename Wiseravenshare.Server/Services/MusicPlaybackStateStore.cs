using System.Text.Json;
using Npgsql;
using Wiseravenshare.Server.DTOs;

namespace Wiseravenshare.Server.Services;

public interface IMusicPlaybackStateStore
{
    Task<MusicPlayerStateDto> GetStateAsync(Guid userId, CancellationToken cancellationToken = default);

    Task<MusicPlayerStateDto> UpsertStateAsync(
        Guid userId,
        MusicPlayerStateUpsertRequest request,
        CancellationToken cancellationToken = default);

    Task<MusicPlayerStateDto> ToggleFavoriteAsync(
        Guid userId,
        string trackId,
        bool isFavorite,
        CancellationToken cancellationToken = default);

    Task<MusicPlayerStateDto> AppendHistoryAsync(
        Guid userId,
        string trackId,
        double positionSeconds,
        bool completed,
        CancellationToken cancellationToken = default);
}

public sealed class MusicPlaybackStateStore : IMusicPlaybackStateStore
{
    private const int MaxQueueTracks = 500;
    private const int MaxFavorites = 2000;
    private const int MaxPlaylists = 200;
    private const int MaxPlaylistTracks = 500;
    private const int MaxHistoryEntries = 200;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly string _connectionString;

    public MusicPlaybackStateStore(IConfiguration configuration)
    {
        _connectionString = ResolveConnectionString(configuration);
    }

    public async Task<MusicPlayerStateDto> GetStateAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        if (userId == Guid.Empty || string.IsNullOrWhiteSpace(_connectionString))
        {
            return NewState();
        }

        await EnsureTableAsync(cancellationToken);

        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        const string sql = @"
SELECT state::text, updated_at
FROM app_data.music_player_state
WHERE user_id = @user_id
LIMIT 1;";

        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("user_id", userId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return NewState();
        }

        var rawState = reader.IsDBNull(0) ? null : reader.GetString(0);
        var updatedAt = reader.IsDBNull(1) ? DateTime.UtcNow : reader.GetDateTime(1).ToUniversalTime();

        var state = DeserializeState(rawState);
        state.UpdatedAtUtc = updatedAt;
        return NormalizeState(state);
    }

    public async Task<MusicPlayerStateDto> UpsertStateAsync(
        Guid userId,
        MusicPlayerStateUpsertRequest request,
        CancellationToken cancellationToken = default)
    {
        if (userId == Guid.Empty || string.IsNullOrWhiteSpace(_connectionString))
        {
            return NormalizeState(MapRequest(request));
        }

        await EnsureTableAsync(cancellationToken);

        var state = NormalizeState(MapRequest(request));
        state.UpdatedAtUtc = DateTime.UtcNow;

        await SaveStateAsync(userId, state, cancellationToken);
        return state;
    }

    public async Task<MusicPlayerStateDto> ToggleFavoriteAsync(
        Guid userId,
        string trackId,
        bool isFavorite,
        CancellationToken cancellationToken = default)
    {
        var normalizedTrackId = NormalizeTrackId(trackId);
        if (string.IsNullOrWhiteSpace(normalizedTrackId))
        {
            return await GetStateAsync(userId, cancellationToken);
        }

        var state = await GetStateAsync(userId, cancellationToken);
        if (isFavorite)
        {
            if (!state.FavoriteTrackIds.Contains(normalizedTrackId, StringComparer.OrdinalIgnoreCase))
            {
                state.FavoriteTrackIds.Insert(0, normalizedTrackId);
            }
        }
        else
        {
            state.FavoriteTrackIds = state.FavoriteTrackIds
                .Where(id => !string.Equals(id, normalizedTrackId, StringComparison.OrdinalIgnoreCase))
                .ToList();
        }

        state = NormalizeState(state);
        state.UpdatedAtUtc = DateTime.UtcNow;

        if (!string.IsNullOrWhiteSpace(_connectionString) && userId != Guid.Empty)
        {
            await SaveStateAsync(userId, state, cancellationToken);
        }

        return state;
    }

    public async Task<MusicPlayerStateDto> AppendHistoryAsync(
        Guid userId,
        string trackId,
        double positionSeconds,
        bool completed,
        CancellationToken cancellationToken = default)
    {
        var normalizedTrackId = NormalizeTrackId(trackId);
        if (string.IsNullOrWhiteSpace(normalizedTrackId))
        {
            return await GetStateAsync(userId, cancellationToken);
        }

        var state = await GetStateAsync(userId, cancellationToken);
        state.RecentHistory = state.RecentHistory
            .Where(item => !string.Equals(item.TrackId, normalizedTrackId, StringComparison.OrdinalIgnoreCase))
            .ToList();

        state.RecentHistory.Insert(0, new MusicHistoryEntryDto
        {
            TrackId = normalizedTrackId,
            PlayedAt = DateTime.UtcNow.ToString("O"),
            PositionSeconds = Math.Max(0, positionSeconds),
            Completed = completed
        });

        state.LastTrackId = normalizedTrackId;
        state.LastPositionSeconds = Math.Max(0, positionSeconds);
        state = NormalizeState(state);
        state.UpdatedAtUtc = DateTime.UtcNow;

        if (!string.IsNullOrWhiteSpace(_connectionString) && userId != Guid.Empty)
        {
            await SaveStateAsync(userId, state, cancellationToken);
        }

        return state;
    }

    private async Task SaveStateAsync(Guid userId, MusicPlayerStateDto state, CancellationToken cancellationToken)
    {
        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        const string sql = @"
INSERT INTO app_data.music_player_state (user_id, state, created_at, updated_at)
VALUES (@user_id, CAST(@state AS jsonb), NOW(), NOW())
ON CONFLICT (user_id)
DO UPDATE SET state = EXCLUDED.state, updated_at = NOW();";

        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("user_id", userId);
        command.Parameters.AddWithValue("state", JsonSerializer.Serialize(state, JsonOptions));
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private async Task EnsureTableAsync(CancellationToken cancellationToken)
    {
        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        const string sql = @"
CREATE SCHEMA IF NOT EXISTS app_data;

CREATE TABLE IF NOT EXISTS app_data.music_player_state (
    user_id UUID PRIMARY KEY,
    state JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_music_player_state_updated
    ON app_data.music_player_state (updated_at DESC);

DO $$
BEGIN
    IF to_regclass('app_data.""Users""') IS NOT NULL THEN
        BEGIN
            ALTER TABLE app_data.music_player_state
                ADD CONSTRAINT fk_music_player_state_user
                FOREIGN KEY (user_id) REFERENCES app_data.""Users"" (""Id"") ON DELETE CASCADE;
        EXCEPTION
            WHEN duplicate_object THEN
                NULL;
        END;
    END IF;
END;
$$;";

        await using var command = new NpgsqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static MusicPlayerStateDto MapRequest(MusicPlayerStateUpsertRequest request)
    {
        return new MusicPlayerStateDto
        {
            ActivePlaylistId = NormalizeTrackId(request.ActivePlaylistId),
            LastTrackId = NormalizeTrackId(request.LastTrackId),
            LastPositionSeconds = Math.Max(0, request.LastPositionSeconds),
            QueueTrackIds = request.QueueTrackIds ?? new List<string>(),
            FavoriteTrackIds = request.FavoriteTrackIds ?? new List<string>(),
            Playlists = request.Playlists ?? new List<MusicPlaylistStateDto>(),
            RecentHistory = request.RecentHistory ?? new List<MusicHistoryEntryDto>()
        };
    }

    private static MusicPlayerStateDto NormalizeState(MusicPlayerStateDto state)
    {
        state.QueueTrackIds = (state.QueueTrackIds ?? new List<string>())
            .Select(NormalizeTrackId)
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Select(id => id!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(MaxQueueTracks)
            .ToList();

        state.FavoriteTrackIds = (state.FavoriteTrackIds ?? new List<string>())
            .Select(NormalizeTrackId)
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Select(id => id!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(MaxFavorites)
            .ToList();

        state.Playlists = (state.Playlists ?? new List<MusicPlaylistStateDto>())
            .Where(p => !string.IsNullOrWhiteSpace(p?.Name))
            .Select(p => new MusicPlaylistStateDto
            {
                Id = string.IsNullOrWhiteSpace(p.Id) ? $"playlist_{Guid.NewGuid():N}" : p.Id.Trim(),
                Name = p.Name.Trim(),
                CreatedAt = string.IsNullOrWhiteSpace(p.CreatedAt) ? DateTime.UtcNow.ToString("O") : p.CreatedAt,
                TrackIds = (p.TrackIds ?? new List<string>())
                    .Select(NormalizeTrackId)
                    .Where(id => !string.IsNullOrWhiteSpace(id))
                    .Select(id => id!)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .Take(MaxPlaylistTracks)
                    .ToList()
            })
            .Take(MaxPlaylists)
            .ToList();

        state.RecentHistory = (state.RecentHistory ?? new List<MusicHistoryEntryDto>())
            .Where(h => !string.IsNullOrWhiteSpace(h?.TrackId))
            .Select(h => new MusicHistoryEntryDto
            {
                TrackId = NormalizeTrackId(h.TrackId) ?? string.Empty,
                PlayedAt = string.IsNullOrWhiteSpace(h.PlayedAt) ? DateTime.UtcNow.ToString("O") : h.PlayedAt,
                PositionSeconds = Math.Max(0, h.PositionSeconds),
                Completed = h.Completed
            })
            .Where(h => !string.IsNullOrWhiteSpace(h.TrackId))
            .Take(MaxHistoryEntries)
            .ToList();

        state.ActivePlaylistId = NormalizeTrackId(state.ActivePlaylistId);
        state.LastTrackId = NormalizeTrackId(state.LastTrackId);
        state.LastPositionSeconds = Math.Max(0, state.LastPositionSeconds);

        return state;
    }

    private static MusicPlayerStateDto DeserializeState(string? rawState)
    {
        if (string.IsNullOrWhiteSpace(rawState))
        {
            return NewState();
        }

        try
        {
            return JsonSerializer.Deserialize<MusicPlayerStateDto>(rawState, JsonOptions) ?? NewState();
        }
        catch
        {
            return NewState();
        }
    }

    private static MusicPlayerStateDto NewState()
    {
        return new MusicPlayerStateDto
        {
            QueueTrackIds = new List<string>(),
            FavoriteTrackIds = new List<string>(),
            Playlists = new List<MusicPlaylistStateDto>(),
            RecentHistory = new List<MusicHistoryEntryDto>(),
            UpdatedAtUtc = DateTime.UtcNow
        };
    }

    private static string? NormalizeTrackId(string? value)
    {
        var normalized = value?.Trim();
        return string.IsNullOrWhiteSpace(normalized) ? null : normalized;
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
