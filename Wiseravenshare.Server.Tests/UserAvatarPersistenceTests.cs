using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services;
using Wiseravenshare.Server.Services.Interfaces;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Wiseravenshare.Server.Tests;

public class UserAvatarPersistenceTests
{
    private sealed class TestWebHostEnvironment : IWebHostEnvironment
    {
        public string ApplicationName { get; set; } = "Wiseravenshare.Server";
        public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
        public string WebRootPath { get; set; } = string.Empty;
        public string ContentRootPath { get; set; } = string.Empty;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
        public string EnvironmentName { get; set; } = Environments.Production;
    }

    [Fact]
    public void ToResponse_PreservesDataUrlAvatarUpTo2MB()
    {
        var sampleDataUrl = "data:image/jpeg;base64," + new string('A', 50000);
        var record = new UserRecord
        {
            Id = "user123",
            Name = "Jane Raven",
            Email = "jane@example.com",
            Handle = "janeraven",
            Avatar = sampleDataUrl
        };

        var response = UserStore.ToResponse(record);

        Assert.Equal(sampleDataUrl, response.Avatar);
        Assert.Equal(sampleDataUrl, response.AvatarUrl);
        Assert.Equal("Jane Raven", response.DisplayName);
    }

    [Fact]
    public void CreateUser_PersistsToFileFallback_WhenDatabaseIsUnavailable()
    {
        var tempRoot = Path.Combine(Path.GetTempPath(), "wrs-userstore-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempRoot);

        try
        {
            var config = new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["DATABASE_URL"] = "postgresql://invalid.example.com:5432/wiseravenshare",
                    ["Persistence:RequireDatabase"] = "true"
                })
                .Build();

            var store = new UserStore(new TestWebHostEnvironment { ContentRootPath = tempRoot, EnvironmentName = Environments.Production }, config);

            var user = store.CreateUser("Alice Raven", "alice@example.com", "P@ssword123", string.Empty, string.Empty, string.Empty, string.Empty);

            Assert.Equal("alice@example.com", user.Email);
            Assert.True(store.EmailExists("alice@example.com"));
            Assert.True(File.Exists(Path.Combine(tempRoot, "App_Data", "users.json")));
        }
        finally
        {
            if (Directory.Exists(tempRoot))
            {
                Directory.Delete(tempRoot, recursive: true);
            }
        }
    }

    [Fact]
    public void CreateUser_AvoidsOpaqueHexLikeHandles()
    {
        var tempRoot = Path.Combine(Path.GetTempPath(), "wrs-userstore-handle-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempRoot);

        try
        {
            var config = new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["DATABASE_URL"] = "postgresql://invalid.example.com:5432/wiseravenshare",
                    ["Persistence:RequireDatabase"] = "true"
                })
                .Build();

            var store = new UserStore(new TestWebHostEnvironment { ContentRootPath = tempRoot, EnvironmentName = Environments.Production }, config);

            var user = store.CreateUser("13b999db297d46ec", "realperson@example.com", "P@ssword123", string.Empty, string.Empty, string.Empty, string.Empty);

            Assert.Equal("realperson", user.Handle);
            Assert.DoesNotMatch(@"^[a-f0-9]{12,}$", user.Handle);
            Assert.DoesNotContain("13b999db297d46ec", user.Handle, StringComparison.OrdinalIgnoreCase);
        }
        finally
        {
            if (Directory.Exists(tempRoot))
            {
                Directory.Delete(tempRoot, recursive: true);
            }
        }
    }

    [Fact]
    public async Task AuthV2Service_LoginAsync_AllowsCreatedUser_ToAuthenticateByEmail()
    {
        var tempRoot = Path.Combine(Path.GetTempPath(), "wrs-authv2-login-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempRoot);

        try
        {
            var config = new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["DATABASE_URL"] = "postgresql://invalid.example.com:5432/wiseravenshare",
                    ["Persistence:RequireDatabase"] = "true",
                    ["Authentication:Jwt:Key"] = "ThisIsAValidJwtKeyForLocalTesting1234567890",
                    ["Authentication:Jwt:Issuer"] = "Wiseravenshare",
                    ["Authentication:Jwt:Audience"] = "WiseravenshareClient"
                })
                .Build();

            var userStore = new UserStore(new TestWebHostEnvironment { ContentRootPath = tempRoot, EnvironmentName = Environments.Production }, config);
            var refreshStore = new RefreshTokenStore(config, NullLogger<RefreshTokenStore>.Instance);
            var service = new AuthV2Service(config, userStore, refreshStore);

            var created = userStore.CreateUser("Alice Raven", "alice@example.com", "P@ssword123", string.Empty, string.Empty, string.Empty, string.Empty);
            var result = await service.LoginAsync(new AuthV2LoginRequest
            {
                Email = "alice@example.com",
                UsernameOrEmail = string.Empty,
                Password = "P@ssword123"
            });

            Assert.Equal(created.Id, result.User.Id);
            Assert.NotEmpty(result.Token);
            Assert.Equal("alice@example.com", result.User.Email);
        }
        finally
        {
            if (Directory.Exists(tempRoot))
            {
                Directory.Delete(tempRoot, recursive: true);
            }
        }
    }
}
