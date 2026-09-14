using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
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
}
