using System.Collections.Concurrent;
using Npgsql;

namespace Wiseravenshare.Server.Services;

/// <summary>
/// Persists refresh tokens in Postgres so sessions survive deploys and instance
/// restarts. Falls back to an in-memory dictionary when the database is
/// unavailable, mirroring UserStore behaviour.
///
/// Schema resolution follows the exact same convention as UserStore for the
/// wise-ravens.com deployment: bind to an existing refresh_tokens table in the
/// app_data schema first, then public, and only attempt CREATE as a last resort
/// (supporting least-privilege DB users that cannot run DDL).
/// </summary>
public sealed class RefreshTokenStore
{
    public sealed record PersistedToken(string UserId, DateTime ExpiresAtUtc);

    private readonly string? _connectionString;
    private readonly ILogger<RefreshTokenStore> _logger;
    private readonly ConcurrentDictionary<string, PersistedToken> _memoryFallback = new(StringComparer.Ordinal);
    private readonly object _schemaLock = new();
    private volatile bool _tableResolved;
    private volatile bool _dbDisabled;
    private string _tokensTable = string.Empty;

    public RefreshTokenStore(IConfiguration configuration, ILogger<RefreshTokenStore> logger)
    {
        _logger = logger;
        _connectionString = ResolveConnectionString(configuration);
    }

    private static string? ResolveConnectionString(IConfiguration configuration)
    {
        // Same precedence as UserStore: DATABASE_URL (DigitalOcean) first, then
        // ConnectionStrings:DefaultConnection — both normalized.
        var databaseUrl = configuration["DATABASE_URL"];
        if (!string.IsNullOrWhiteSpace(databaseUrl))
        {
            return NormalizeConnectionString(databaseUrl);
        }

        var direct = configuration.GetConnectionString("DefaultConnection");
        return string.IsNullOrWhiteSpace(direct) ? null : NormalizeConnectionString(direct);
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

        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.Port > 0 ? uri.Port : 5432,
            Database = uri.AbsolutePath.TrimStart('/'),
            Username = Uri.UnescapeDataString(uri.UserInfo.Split(':')[0]),
            SslMode = SslMode.Require
        };

        if (uri.UserInfo.Contains(':'))
        {
            builder.Password = Uri.UnescapeDataString(uri.UserInfo.Split(':')[1]);
        }

        return builder.ConnectionString;
    }

    public bool IsDatabasePersistenceAvailable => _connectionString is not null && !_dbDisabled;

    public void Save(string token, string userId, DateTime expiresAtUtc)
    {
        if (string.IsNullOrWhiteSpace(token)) return;
        _memoryFallback[token] = new PersistedToken(userId, expiresAtUtc);

        if (!TryGetTokensTable()) return;

        try
        {
            using var connection = new NpgsqlConnection(_connectionString);
            connection.Open();
            using var command = new NpgsqlCommand($@"
INSERT INTO {_tokensTable} (token, user_id, expires_at_utc, created_at_utc)
VALUES (@token, @userId, @expires, @created)
ON CONFLICT (token) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        expires_at_utc = EXCLUDED.expires_at_utc;", connection);
            command.Parameters.AddWithValue("token", token);
            command.Parameters.AddWithValue("userId", userId);
            command.Parameters.AddWithValue("expires", expiresAtUtc);
            command.Parameters.AddWithValue("created", DateTime.UtcNow);
            command.ExecuteNonQuery();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to persist refresh token; relying on in-memory fallback for this process.");
        }
    }

    public PersistedToken? Find(string token)
    {
        // Prefer database state; fall back to memory on any failure.
        if (TryGetTokensTable())
        {
            try
            {
                using var connection = new NpgsqlConnection(_connectionString);
                connection.Open();
                using var command = new NpgsqlCommand(
                    $"SELECT user_id, expires_at_utc FROM {_tokensTable} WHERE token = @token LIMIT 1;",
                    connection);
                command.Parameters.AddWithValue("token", token);
                using var reader = command.ExecuteReader();
                if (reader.Read())
                {
                    return new PersistedToken(
                        reader.GetString(0),
                        reader.GetFieldValue<DateTime>(1));
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to read refresh token from database; using in-memory fallback.");
            }
        }

        return _memoryFallback.TryGetValue(token, out var cached) ? cached : null;
    }

    public void Remove(string token)
    {
        _memoryFallback.TryRemove(token, out _);

        if (!TryGetTokensTable()) return;

        try
        {
            using var connection = new NpgsqlConnection(_connectionString);
            connection.Open();
            using var command = new NpgsqlCommand($"DELETE FROM {_tokensTable} WHERE token = @token;", connection);
            command.Parameters.AddWithValue("token", token);
            command.ExecuteNonQuery();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to delete refresh token from database.");
        }
    }

    public void RemoveAllForUser(string userId)
    {
        foreach (var pair in _memoryFallback.Where(p => string.Equals(p.Value.UserId, userId, StringComparison.Ordinal)).ToList())
        {
            _memoryFallback.TryRemove(pair.Key, out _);
        }

        if (!TryGetTokensTable()) return;

        try
        {
            using var connection = new NpgsqlConnection(_connectionString);
            connection.Open();
            using var command = new NpgsqlCommand($"DELETE FROM {_tokensTable} WHERE user_id = @userId;", connection);
            command.Parameters.AddWithValue("userId", userId);
            command.ExecuteNonQuery();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to revoke refresh tokens for user {UserId}.", userId);
        }
    }

    public void CleanupExpired()
    {
        foreach (var pair in _memoryFallback.Where(p => p.Value.ExpiresAtUtc < DateTime.UtcNow).ToList())
        {
            _memoryFallback.TryRemove(pair.Key, out _);
        }

        if (!TryGetTokensTable()) return;

        try
        {
            using var connection = new NpgsqlConnection(_connectionString);
            connection.Open();
            using var command = new NpgsqlCommand($"DELETE FROM {_tokensTable} WHERE expires_at_utc < @now;", connection);
            command.Parameters.AddWithValue("now", DateTime.UtcNow);
            command.ExecuteNonQuery();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to clean up expired refresh tokens.");
        }
    }

    /// <summary>
    /// Resolves the refresh-token table using the UserStore convention:
    /// 1. Bind existing app_data.refresh_tokens (read probe — no DDL needed).
    /// 2. Bind existing public.refresh_tokens.
    /// 3. Create app_data.refresh_tokens (requires CREATE SCHEMA/TABLE privileges).
    /// 4. Create public.refresh_tokens (no schema creation needed).
    /// </summary>
    private bool TryGetTokensTable()
    {
        if (_tableResolved) return !_dbDisabled;
        if (string.IsNullOrWhiteSpace(_connectionString)) return false;

        lock (_schemaLock)
        {
            if (_tableResolved) return !_dbDisabled;

            if (TryBindExistingTable("app_data"))
            {
                _tokensTable = "app_data.refresh_tokens";
                _tableResolved = true;
                return true;
            }

            if (TryBindExistingTable("public"))
            {
                _tokensTable = "public.refresh_tokens";
                _tableResolved = true;
                return true;
            }

            if (TryEnsureTable("app_data", ensureSchema: true))
            {
                _tokensTable = "app_data.refresh_tokens";
                _tableResolved = true;
                return true;
            }

            if (TryEnsureTable("public", ensureSchema: false))
            {
                _tokensTable = "public.refresh_tokens";
                _tableResolved = true;
                return true;
            }

            _logger.LogWarning(
                "Unable to create or access the refresh_tokens table in app_data or public schema; refresh tokens will stay in memory only until restart.");
            _dbDisabled = true;
            return false;
        }
    }

    private bool TryBindExistingTable(string schemaName)
    {
        try
        {
            using var connection = new NpgsqlConnection(_connectionString);
            connection.Open();
            using var command = new NpgsqlCommand($"SELECT 1 FROM {schemaName}.refresh_tokens LIMIT 1;", connection);
            command.ExecuteScalar();
            return true;
        }
        catch
        {
            return false;
        }
    }

    private bool TryEnsureTable(string schemaName, bool ensureSchema)
    {
        try
        {
            using var connection = new NpgsqlConnection(_connectionString);
            connection.Open();
            var createSchemaSql = ensureSchema ? $"CREATE SCHEMA IF NOT EXISTS {schemaName};" : string.Empty;
            var sql = $@"
{createSchemaSql}

CREATE TABLE IF NOT EXISTS {schemaName}.refresh_tokens (
    token           TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    expires_at_utc  TIMESTAMPTZ NOT NULL,
    created_at_utc  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON {schemaName}.refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON {schemaName}.refresh_tokens(expires_at_utc);";
            using var command = new NpgsqlCommand(sql, connection);
            command.ExecuteNonQuery();
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "TryEnsureTable failed for {SchemaName} refresh_tokens: {Message}", schemaName, ex.Message);
            return false;
        }
    }
}
