using Npgsql;

namespace Wiseravenshare.Server.Infrastructure.Data;

public static class DatabasePrivilegeBootstrap
{
    public static string BuildAppDataPrivilegeSql()
    {
        return @"
CREATE SCHEMA IF NOT EXISTS app_data;

DO $$
DECLARE
    current_role TEXT := current_user;
BEGIN
    EXECUTE format('GRANT USAGE, CREATE ON SCHEMA app_data TO %I', current_role);
    EXECUTE format('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA app_data TO %I', current_role);
    EXECUTE format('GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA app_data TO %I', current_role);
    EXECUTE format('GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA app_data TO %I', current_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA app_data GRANT ALL ON TABLES TO %I', current_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA app_data GRANT ALL ON SEQUENCES TO %I', current_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA app_data GRANT ALL ON FUNCTIONS TO %I', current_role);
END $$;
";
    }

    public static async Task EnsureAppDataPrivilegesAsync(string connectionString, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            return;
        }

        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(BuildAppDataPrivilegeSql(), connection);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }
}
