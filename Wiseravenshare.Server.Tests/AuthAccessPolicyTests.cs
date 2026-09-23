using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Wiseravenshare.Server.Controllers;
using Wiseravenshare.Server.Services;
using Xunit;

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

    [Fact]
    public void MetricsController_RejectsNonAdminUsers()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Admin:Emails:0"] = "admin@wise-ravens.com"
            })
            .Build();

        var controller = new MetricsController(new PerformanceMetricsService(), configuration)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(
                        new[] { new Claim(ClaimTypes.Email, "staff@wise-ravens.com") },
                        authenticationType: "Test"))
                }
            }
        };

        var result = controller.GetPerformanceSnapshot();

        Assert.IsType<ForbidResult>(result);
    }
}
