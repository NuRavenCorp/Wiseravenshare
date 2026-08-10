using Wiseravenshare.Server.Infrastructure.Data;
using Xunit;

namespace Wiseravenshare.Server.Tests;

public class DatabasePrivilegeBootstrapTests
{
    [Fact]
    public void BuildAppDataPrivilegeSql_ContainsGrantStatementsForCurrentRole()
    {
        var sql = DatabasePrivilegeBootstrap.BuildAppDataPrivilegeSql();

        Assert.Contains("CREATE SCHEMA IF NOT EXISTS app_data", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("GRANT USAGE, CREATE ON SCHEMA app_data", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA app_data", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("ALTER DEFAULT PRIVILEGES IN SCHEMA app_data", sql, StringComparison.OrdinalIgnoreCase);
    }
}
