using System.Reflection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Wiseravenshare.Server.Controllers;
using Wiseravenshare.Server.Services;
using Xunit;

namespace Wiseravenshare.Server.Tests;

public sealed class TeamAccessServiceTests
{
    [Fact]
    public void IssueInvite_and_consume_grants_member_access()
    {
        var root = CreateTempRoot();
        try
        {
            var service = CreateService(root);

            var issued = service.IssueInvite(
                actorEmail: "admin@wise-ravens.com",
                inviteeEmail: "member@wise-ravens.com",
                displayName: "Team Member",
                role: "producer",
                ttl: TimeSpan.FromHours(4),
                prearranged: false);

            Assert.False(string.IsNullOrWhiteSpace(issued.InviteToken));

            var accepted = service.TryConsumeInvite(issued.InviteToken, "member@wise-ravens.com");
            Assert.NotNull(accepted);
            Assert.Equal("member@wise-ravens.com", accepted!.Email);
            Assert.Equal("producer", accepted.TeamRole);
            Assert.True(service.IsTeamMemberAllowed("member@wise-ravens.com"));
        }
        finally
        {
            if (Directory.Exists(root))
            {
                Directory.Delete(root, recursive: true);
            }
        }
    }

    [Fact]
    public void ConsumeInvite_rejects_wrong_email_binding()
    {
        var root = CreateTempRoot();
        try
        {
            var service = CreateService(root);

            var issued = service.IssueInvite(
                actorEmail: "admin@wise-ravens.com",
                inviteeEmail: "member@wise-ravens.com",
                displayName: "Team Member",
                role: "member",
                ttl: TimeSpan.FromHours(2),
                prearranged: true);

            var accepted = service.TryConsumeInvite(issued.InviteToken, "intruder@wise-ravens.com");
            Assert.Null(accepted);
            Assert.False(service.IsTeamMemberAllowed("intruder@wise-ravens.com"));
        }
        finally
        {
            if (Directory.Exists(root))
            {
                Directory.Delete(root, recursive: true);
            }
        }
    }

    [Fact]
    public void RevokePendingInvite_prevents_token_consumption()
    {
        var root = CreateTempRoot();
        try
        {
            var service = CreateService(root);

            var issued = service.IssueInvite(
                actorEmail: "admin@wise-ravens.com",
                inviteeEmail: "member@wise-ravens.com",
                displayName: "Team Member",
                role: "member",
                ttl: TimeSpan.FromHours(2),
                prearranged: false);

            var revoked = service.RevokePendingInvite(issued.InviteId, "admin@wise-ravens.com", "Policy adjustment");

            Assert.NotNull(revoked);
            Assert.False(string.IsNullOrWhiteSpace(revoked!.RevokedByEmail));

            var accepted = service.TryConsumeInvite(issued.InviteToken, "member@wise-ravens.com");
            Assert.Null(accepted);
        }
        finally
        {
            if (Directory.Exists(root))
            {
                Directory.Delete(root, recursive: true);
            }
        }
    }

    [Fact]
    public void SetMemberActiveStatus_controls_access()
    {
        var root = CreateTempRoot();
        try
        {
            var service = CreateService(root);

            var issued = service.IssueInvite(
                actorEmail: "admin@wise-ravens.com",
                inviteeEmail: "member@wise-ravens.com",
                displayName: "Team Member",
                role: "producer",
                ttl: TimeSpan.FromHours(4),
                prearranged: false);

            var accepted = service.TryConsumeInvite(issued.InviteToken, "member@wise-ravens.com");
            Assert.NotNull(accepted);
            Assert.True(service.IsTeamMemberAllowed("member@wise-ravens.com"));

            var suspended = service.SetMemberActiveStatus("member@wise-ravens.com", false, "admin@wise-ravens.com", "Security review");
            Assert.NotNull(suspended);
            Assert.False(suspended!.IsActive);
            Assert.False(service.IsTeamMemberAllowed("member@wise-ravens.com"));

            var reactivated = service.SetMemberActiveStatus("member@wise-ravens.com", true, "admin@wise-ravens.com", "Review complete");
            Assert.NotNull(reactivated);
            Assert.True(reactivated!.IsActive);
            Assert.True(service.IsTeamMemberAllowed("member@wise-ravens.com"));
        }
        finally
        {
            if (Directory.Exists(root))
            {
                Directory.Delete(root, recursive: true);
            }
        }
    }

    [Fact]
    public void AuthController_allows_social_login_by_default()
    {
        var controller = new AuthController(
            new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>()).Build(),
            null!,
            null!,
            null!,
            null!,
            NullLogger<AuthController>.Instance);

        var method = typeof(AuthController).GetMethod("IsSelfRegistrationAllowed", BindingFlags.Instance | BindingFlags.NonPublic);
        Assert.NotNull(method);

        var result = method!.Invoke(controller, null);
        Assert.Equal(true, result);
    }

    [Fact]
    public void AuthController_allows_public_accounts_to_log_in_by_default()
    {
        var controller = new AuthController(
            new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>()).Build(),
            null!,
            null!,
            null!,
            new TeamAccessService(new FakeWebHostEnvironment(CreateTempRoot()), NullLogger<TeamAccessService>.Instance),
            NullLogger<AuthController>.Instance);

        var method = typeof(AuthController).GetMethod("IsAuthenticationAllowed", BindingFlags.Instance | BindingFlags.NonPublic);
        Assert.NotNull(method);

        var result = method!.Invoke(controller, new object?[] { "public-user@wise-ravens.com" });
        Assert.Equal(true, result);
    }

    private static TeamAccessService CreateService(string contentRootPath)
    {
        var env = new FakeWebHostEnvironment(contentRootPath);
        return new TeamAccessService(env, NullLogger<TeamAccessService>.Instance);
    }

    private static string CreateTempRoot()
    {
        var root = Path.Combine(Path.GetTempPath(), "TeamAccessServiceTests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        return root;
    }

    private sealed class FakeWebHostEnvironment(string contentRootPath) : IWebHostEnvironment
    {
        public string ApplicationName { get; set; } = "Wiseravenshare.Server.Tests";
        public IFileProvider WebRootFileProvider { get; set; } = null!;
        public string WebRootPath { get; set; } = string.Empty;
        public string ContentRootPath { get; set; } = contentRootPath;
        public IFileProvider ContentRootFileProvider { get; set; } = null!;
        public string EnvironmentName { get; set; } = Environments.Development;
    }
}
