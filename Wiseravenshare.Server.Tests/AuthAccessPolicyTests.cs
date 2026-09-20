using Wiseravenshare.Server.Services;
using Xunit;
using Microsoft.Extensions.Configuration;

namespace Wiseravenshare.Server.Tests;

public class AuthAccessPolicyTests
{
    [Fact]
    public void IsAdminLoginAllowed_RejectsNonConfiguredUser()
    {
        var configuredEmails = new[] { "admin@wise-ravens.com" };

        Assert.False(AuthAccessPolicy.IsAdminLoginAllowed("staff@wise-ravens.com", configuredEmails));
    }

    [Fact]
    public void IsAdminLoginAllowed_AllowsConfiguredAdminUser()
    {
        var configuredEmails = new[] { "admin@wise-ravens.com" };

        Assert.True(AuthAccessPolicy.IsAdminLoginAllowed("admin@wise-ravens.com", configuredEmails));
    }

    [Fact]
    public void ResolveConfiguredAdminEmails_IncludesScalarAndIndexedEnvValues()
    {
        var values = new Dictionary<string, string?>
        {
            ["Admin:Emails"] = "ops@wise-ravens.com,owner@wise-ravens.com",
            ["Admin:Emails:0"] = "lead@wise-ravens.com"
        };

        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(values)
            .Build();

        var admins = AuthAccessPolicy.ResolveConfiguredAdminEmails(configuration);

        Assert.Contains("ops@wise-ravens.com", admins);
        Assert.Contains("owner@wise-ravens.com", admins);
        Assert.Contains("lead@wise-ravens.com", admins);
    }

    [Fact]
    public void IsConfiguredAdminEmail_AllowsAuthenticationUsersFallback()
    {
        var values = new Dictionary<string, string?>
        {
            ["Authentication:Users:0:Email"] = "admin2@wise-ravens.com"
        };

        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(values)
            .Build();

        Assert.True(AuthAccessPolicy.IsConfiguredAdminEmail(configuration, "admin2@wise-ravens.com"));
    }
}
