using System;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Wiseravenshare.Server.Controllers;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services;
using Wiseravenshare.Server.Services.Currency;
using Xunit;

namespace Wiseravenshare.Server.Tests;

public class AvatarAndSocialAuthTests
{
    private (UsersController controller, UserStore store, string rootDir) CreateUsersController()
    {
        var tempDir = Path.Combine(Path.GetTempPath(), $"wr_avatar_test_{Guid.NewGuid():N}");
        Directory.CreateDirectory(tempDir);
        var webRoot = Path.Combine(tempDir, "wwwroot");
        var appData = Path.Combine(tempDir, "App_Data");
        Directory.CreateDirectory(Path.Combine(webRoot, "uploads", "avatars"));
        Directory.CreateDirectory(Path.Combine(appData, "avatars"));

        var testEnv = new TestWebHostEnvironment
        {
            ContentRootPath = tempDir,
            WebRootPath = webRoot
        };

        var config = new ConfigurationBuilder().Build();
        var store = new UserStore(testEnv, config);

        var dbOptions = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: $"AvatarDb_{Guid.NewGuid():N}")
            .Options;
        var dbContext = new AppDbContext(dbOptions);

        var growthService = new GrowthService(new NullLogger<GrowthService>(), store);
        var wiseCoinService = new WiseCoinService(dbContext, new NullLogger<WiseCoinService>());
        var blobStorage = new BlobStorageService(config, new NullLogger<BlobStorageService>());

        var controller = new UsersController(
            config,
            store,
            growthService,
            wiseCoinService,
            new NullLogger<UsersController>(),
            dbContext,
            blobStorage,
            testEnv);

        return (controller, store, tempDir);
    }

    [Fact]
    public async Task GetSavedAvatars_ReturnsFilesFromUploadsAndAppData()
    {
        var (controller, store, rootDir) = CreateUsersController();

        try
        {
            var uploadsAvatarsDir = Path.Combine(rootDir, "wwwroot", "uploads", "avatars");
            var testFile1 = Path.Combine(uploadsAvatarsDir, "test_pic_1.jpg");
            var testFile2 = Path.Combine(uploadsAvatarsDir, "test_pic_2.png");
            File.WriteAllText(testFile1, "dummy image bytes");
            File.WriteAllText(testFile2, "dummy image bytes 2");

            var result = controller.GetSavedAvatars("me") as OkObjectResult;
            Assert.NotNull(result);

            var items = result.Value as System.Collections.IEnumerable;
            Assert.NotNull(items);

            var list = items.Cast<object>().ToList();
            Assert.True(list.Count >= 2);
        }
        finally
        {
            try { Directory.Delete(rootDir, true); } catch {}
        }
    }

    [Fact]
    public async Task SelectAvatar_UpdatesUserProfileAndActiveStatus()
    {
        var (controller, store, rootDir) = CreateUsersController();

        try
        {
            var user = store.CreateUser("Avatar Fan", "fan@example.com", "Password#123", "", "", "", "");
            var avatarUrl = "/uploads/avatars/new_chosen_avatar.png";

            var selectReq = new SelectAvatarRequest
            {
                AvatarUrl = avatarUrl,
                FileName = "new_chosen_avatar.png"
            };

            var result = await controller.SelectAvatar(user.Id, selectReq, CancellationToken.None) as OkObjectResult;
            Assert.NotNull(result);

            Assert.True(store.TryGetById(user.Id, out var updatedUser));
            Assert.NotNull(updatedUser);
            Assert.Equal(avatarUrl, updatedUser.Avatar);
        }
        finally
        {
            try { Directory.Delete(rootDir, true); } catch {}
        }
    }

    [Fact]
    public void DeleteSavedAvatar_RemovesFileFromDisk()
    {
        var (controller, store, rootDir) = CreateUsersController();

        try
        {
            var uploadsAvatarsDir = Path.Combine(rootDir, "wwwroot", "uploads", "avatars");
            var fileName = "to_delete.jpg";
            var filePath = Path.Combine(uploadsAvatarsDir, fileName);
            File.WriteAllText(filePath, "dummy data");
            Assert.True(File.Exists(filePath));

            var result = controller.DeleteSavedAvatar("me", fileName) as OkObjectResult;
            Assert.NotNull(result);
            Assert.False(File.Exists(filePath));
        }
        finally
        {
            try { Directory.Delete(rootDir, true); } catch {}
        }
    }
}
