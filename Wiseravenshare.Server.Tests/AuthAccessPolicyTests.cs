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
}
