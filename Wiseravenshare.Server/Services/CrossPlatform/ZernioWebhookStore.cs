using Npgsql;

namespace Wiseravenshare.Server.Services.CrossPlatform;

public interface IZernioWebhookStore
{
    Task<bool> TryRecordEventAsync(string eventId, string eventType, string payloadJson, string? accountId, string? profileId, CancellationToken cancellationToken = default);
    Task UpsertAccountMappingAsync(string accountId, string? profileId, string? platform, string? username, CancellationToken cancellationToken = default);
    Task SetAccountConnectionStateAsync(string accountId, bool isConnected, CancellationToken cancellationToken = default);
    Task MarkProcessedAsync(string eventId, string status, string? processingError, CancellationToken cancellationToken = default);
}

public sealed class ZernioWebhookStore : IZernioWebhookStore
{
    private readonly string _connectionString;

    public ZernioWebhookStore(IConfiguration configuration)
    {
        _connectionString = ResolvePrimaryConnectionString(configuration);
    }

    public async Task<bool> TryRecordEventAsync(
        string eventId,
        string eventType,
        string payloadJson,
        string? accountId,
        string? profileId,
        CancellationToken cancellationToken = default)
    {
        EnsureConnectionStringAvailable();

        const string sql = """
            INSERT INTO app_data.zernio_webhook_events
            (event_id, event_type, account_id, profile_id, payload_json, received_at_utc, status)
            VALUES (@event_id, @event_type, @account_id, @profile_id, CAST(@payload_json AS jsonb), NOW(), 'accepted')
            ON CONFLICT (event_id) DO NOTHING;
            """;

        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("event_id", eventId);
        command.Parameters.AddWithValue("event_type", eventType);
        command.Parameters.AddWithValue("account_id", (object?)accountId ?? DBNull.Value);
        command.Parameters.AddWithValue("profile_id", (object?)profileId ?? DBNull.Value);
        command.Parameters.AddWithValue("payload_json", payloadJson);
        var rows = await command.ExecuteNonQueryAsync(cancellationToken);
        return rows > 0;
    }

    public async Task UpsertAccountMappingAsync(
        string accountId,
        string? profileId,
        string? platform,
        string? username,
        CancellationToken cancellationToken = default)
    {
        EnsureConnectionStringAvailable();
        if (string.IsNullOrWhiteSpace(accountId))
        {
            return;
        }

        const string sql = """
            INSERT INTO app_data.zernio_account_mappings
            (account_id, profile_id, platform, username, is_connected, updated_at_utc)
            VALUES (@account_id, @profile_id, @platform, @username, TRUE, NOW())
            ON CONFLICT (account_id) DO UPDATE
            SET profile_id = EXCLUDED.profile_id,
                platform = EXCLUDED.platform,
                username = EXCLUDED.username,
                is_connected = TRUE,
                updated_at_utc = NOW();
            """;

        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("account_id", accountId);
        command.Parameters.AddWithValue("profile_id", (object?)profileId ?? DBNull.Value);
        command.Parameters.AddWithValue("platform", (object?)platform ?? DBNull.Value);
        command.Parameters.AddWithValue("username", (object?)username ?? DBNull.Value);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task SetAccountConnectionStateAsync(
        string accountId,
        bool isConnected,
        CancellationToken cancellationToken = default)
    {
        EnsureConnectionStringAvailable();
        if (string.IsNullOrWhiteSpace(accountId))
        {
            return;
        }

        const string sql = """
            UPDATE app_data.zernio_account_mappings
            SET is_connected = @is_connected,
                updated_at_utc = NOW()
            WHERE account_id = @account_id;
            """;

        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("account_id", accountId);
        command.Parameters.AddWithValue("is_connected", isConnected);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task MarkProcessedAsync(
        string eventId,
        string status,
        string? processingError,
        CancellationToken cancellationToken = default)
    {
        EnsureConnectionStringAvailable();

        const string sql = """
            UPDATE app_data.zernio_webhook_events
            SET processed_at_utc = NOW(),
                status = @status,
                processing_error = @processing_error
            WHERE event_id = @event_id;
            """;

        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("event_id", eventId);
        command.Parameters.AddWithValue("status", status);
        command.Parameters.AddWithValue("processing_error", (object?)processingError ?? DBNull.Value);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private void EnsureConnectionStringAvailable()
    {
        if (string.IsNullOrWhiteSpace(_connectionString))
        {
            throw new InvalidOperationException("Database connection is required for Zernio webhook idempotency.");
        }
    }

    private static string ResolvePrimaryConnectionString(IConfiguration configuration)
    {
        var configured = (configuration["DATABASE_URL"] ??
                          configuration.GetConnectionString("DefaultConnection") ??
                          string.Empty).Trim();

        if (string.IsNullOrWhiteSpace(configured))
        {
            return string.Empty;
        }

        if (!configured.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) &&
            !configured.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
        {
            return configured;
        }

        var normalized = configured.Replace("postgres://", "postgresql://", StringComparison.OrdinalIgnoreCase);
        if (!Uri.TryCreate(normalized, UriKind.Absolute, out var uri))
        {
            return configured;
        }

        var userInfo = uri.UserInfo.Split(':', 2);
        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.Port > 0 ? uri.Port : 5432,
            Database = uri.AbsolutePath.Trim('/'),
            Username = userInfo.Length > 0 ? Uri.UnescapeDataString(userInfo[0]) : string.Empty,
            Password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : string.Empty,
            SslMode = SslMode.Require,
            TrustServerCertificate = true
        };

        return builder.ConnectionString;
    }
}
