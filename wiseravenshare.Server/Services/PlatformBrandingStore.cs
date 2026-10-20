using Npgsql;

namespace Wiseravenshare.Server.Services;

public sealed class PlatformBrandingStore
{
    private const string SchemaName = "app_data";
    private const string TableName = "platform_branding_settings";

    private readonly string _connectionString;
    private bool _schemaEnsured;
    private readonly SemaphoreSlim _schemaLock = new(1, 1);

    public PlatformBrandingStore(IConfiguration configuration)
    {
        _connectionString = ResolveConnectionString(configuration);
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
            await using var command = new NpgsqlCommand($"""
CREATE SCHEMA IF NOT EXISTS {SchemaName};
CREATE TABLE IF NOT EXISTS {SchemaName}.{TableName} (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
""", connection);
            await command.ExecuteNonQueryAsync(cancellationToken);
            _schemaEnsured = true;
        }
        finally
        {
            _schemaLock.Release();
        }
    }

    public async Task<string?> GetValueAsync(string settingKey, CancellationToken cancellationToken = default)
    {
        await EnsureSchemaAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(_connectionString))
        {
            return null;
        }

        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand($"""
SELECT setting_value
FROM {SchemaName}.{TableName}
WHERE setting_key = @setting_key
LIMIT 1;
""", connection);
        command.Parameters.AddWithValue("setting_key", settingKey.Trim());
        var value = await command.ExecuteScalarAsync(cancellationToken);
        return value as string;
    }

    public async Task SetDefaultValueAsync(string settingKey, string settingValue, CancellationToken cancellationToken = default)
    {
        await EnsureSchemaAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(_connectionString)
            || string.IsNullOrWhiteSpace(settingKey)
            || string.IsNullOrWhiteSpace(settingValue))
        {
            return;
        }

        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand($"""
INSERT INTO {SchemaName}.{TableName} (setting_key, setting_value, updated_at)
VALUES (@setting_key, @setting_value, NOW())
ON CONFLICT (setting_key) DO NOTHING;
""", connection);
        command.Parameters.AddWithValue("setting_key", settingKey.Trim());
        command.Parameters.AddWithValue("setting_value", settingValue.Trim());
        await command.ExecuteNonQueryAsync(cancellationToken);
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

    private static string NormalizeConnectionString(string raw)
    {
        var value = (raw ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        if (!value.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase)
            && !value.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
        {
            return value;
        }

        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri))
        {
            return value;
        }

        var userInfo = (uri.UserInfo ?? string.Empty).Split(':', 2, StringSplitOptions.TrimEntries);
        var username = userInfo.Length > 0 ? Uri.UnescapeDataString(userInfo[0]) : string.Empty;
        var password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : string.Empty;
        var database = uri.AbsolutePath.Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? "postgres";
        var sslMode = ReadQueryValue(uri.Query, "sslmode");
        var pooling = ReadQueryValue(uri.Query, "pooling");
        var trustServerCertificate = ReadQueryValue(uri.Query, "trust_server_certificate");

        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.Port > 0 ? uri.Port : 5432,
            Username = username,
            Password = password,
            Database = database
        };

        if (!string.IsNullOrWhiteSpace(sslMode)
            && Enum.TryParse<SslMode>(sslMode, true, out var parsedSslMode))
        {
            builder.SslMode = parsedSslMode;
        }

        if (!string.IsNullOrWhiteSpace(pooling) && bool.TryParse(pooling, out var parsedPooling))
        {
            builder.Pooling = parsedPooling;
        }

        if (!string.IsNullOrWhiteSpace(trustServerCertificate)
            && bool.TryParse(trustServerCertificate, out var parsedTrust))
        {
            builder.TrustServerCertificate = parsedTrust;
        }

        return builder.ConnectionString;
    }

    private static string ReadQueryValue(string query, string key)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            return string.Empty;
        }

        var trimmed = query.TrimStart('?');
        foreach (var pair in trimmed.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var parts = pair.Split('=', 2);
            if (parts.Length == 0)
            {
                continue;
            }

            if (!string.Equals(parts[0], key, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            return parts.Length > 1 ? Uri.UnescapeDataString(parts[1]) : string.Empty;
        }

        return string.Empty;
    }
}
