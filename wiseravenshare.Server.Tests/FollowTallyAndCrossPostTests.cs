using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Linq.Expressions;
using Task = System.Threading.Tasks.Task;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Wiseravenshare.Server.DTOs.Social;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Interfaces.Repositories;
using Wiseravenshare.Server.Services;
using Wiseravenshare.Server.Services.CrossPlatform;
using Xunit;

namespace Wiseravenshare.Server.Tests;

public class FollowTallyAndCrossPostTests : IDisposable
{
    private readonly string _testDir;
    private readonly TestWebHostEnvironment _env;

    public FollowTallyAndCrossPostTests()
    {
        _testDir = Path.Combine(Path.GetTempPath(), "wr_follow_test_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_testDir);
        _env = new TestWebHostEnvironment { ContentRootPath = _testDir };
    }

    public void Dispose()
    {
        try
        {
            if (Directory.Exists(_testDir))
            {
                Directory.Delete(_testDir, true);
            }
        }
        catch { }
    }

    [Fact]
    public void FollowStore_InitializesWithPersonaBaselines()
    {
        var services = new ServiceCollection().BuildServiceProvider();
        var store = new FollowStore(_env, services, NullLogger<FollowStore>.Instance);

        var marcusTally = store.GetFollowersCount(Guid.Empty, "marcus_vance");
        var novaTally = store.GetFollowersCount(Guid.Empty, "novapulse");

        Assert.True(marcusTally > 0, "Marcus Vance should have a positive baseline follower count.");
        Assert.True(novaTally > 0, "Nova Sterling should have a positive baseline follower count.");
    }

    [Fact]
    public void FollowStore_ToggleFollow_TalliesCorrectly()
    {
        var services = new ServiceCollection().BuildServiceProvider();
        var store = new FollowStore(_env, services, NullLogger<FollowStore>.Instance);

        var userId = Guid.NewGuid();
        var initialMarcusTally = store.GetFollowersCount(Guid.Empty, "marcus_vance");
        var initialFollowingCount = store.GetFollowingCount(userId);

        Assert.Equal(0, initialFollowingCount);

        // Follow Marcus Vance
        var ok = store.ToggleFollow(userId, Guid.Empty, "marcus_vance", out var nowFollowing, out var nextFollowers, out var nextFollowing);
        Assert.True(ok);
        Assert.True(nowFollowing);
        Assert.Equal(initialMarcusTally + 1, nextFollowers);
        Assert.Equal(1, nextFollowing);
        Assert.True(store.IsFollowing(userId, Guid.Empty, "marcus_vance"));

        // Unfollow Marcus Vance
        var ok2 = store.ToggleFollow(userId, Guid.Empty, "marcus_vance", out var nowFollowing2, out var nextFollowers2, out var nextFollowing2);
        Assert.True(ok2);
        Assert.False(nowFollowing2);
        Assert.Equal(initialMarcusTally, nextFollowers2);
        Assert.Equal(0, nextFollowing2);
        Assert.False(store.IsFollowing(userId, Guid.Empty, "marcus_vance"));
    }

    [Fact]
    public void FollowStore_GetTally_ReturnsFullTallyAndStatus()
    {
        var services = new ServiceCollection().BuildServiceProvider();
        var store = new FollowStore(_env, services, NullLogger<FollowStore>.Instance);

        var user = Guid.NewGuid();
        store.ToggleFollow(user, Guid.Empty, "novapulse", out _, out _, out _);
        store.ToggleFollow(user, Guid.Empty, "cipher_chen", out _, out _, out _);

        var tally = store.GetTally(user);

        Assert.Equal(2, tally.FollowingCount);
        Assert.True(tally.Personas.ContainsKey("novapulse"));
        Assert.True(tally.Personas["novapulse"].IsFollowing);
        Assert.True(tally.Personas["cipher_chen"].IsFollowing);
        Assert.False(tally.Personas["marcus_vance"].IsFollowing);
        Assert.True(tally.TotalFlockFollowers > 1000);
    }

    [Fact]
    public void FollowStore_HaveBotsFollowUser_EnsuresAllBotsFollowUser()
    {
        var services = new ServiceCollection().BuildServiceProvider();
        var store = new FollowStore(_env, services, NullLogger<FollowStore>.Instance);

        var userId = Guid.NewGuid();
        Assert.Equal(0, store.GetFollowersCount(userId));

        var followed = store.HaveBotsFollowUser(userId);

        Assert.Equal(14, followed);
        Assert.Equal(14, store.GetFollowersCount(userId));

        var tally = store.GetTally(userId);
        Assert.Equal(14, tally.FollowersCount);
    }

    [Fact]
    public void FollowStore_HaveBotsFollowAllUsers_ProcessesMultipleUsers()
    {
        var services = new ServiceCollection().BuildServiceProvider();
        var store = new FollowStore(_env, services, NullLogger<FollowStore>.Instance);

        var user1 = Guid.NewGuid();
        var user2 = Guid.NewGuid();

        var total = store.HaveBotsFollowAllUsers(new[] { user1, user2 });

        Assert.Equal(28, total);
        Assert.Equal(14, store.GetFollowersCount(user1));
        Assert.Equal(14, store.GetFollowersCount(user2));
    }

    [Fact]
    public async System.Threading.Tasks.Task CrossPlatformPublishService_DispatchesToAllRequestedPlatforms()
    {
        var repo = new StubCrossPostRepo();
        var user = Guid.NewGuid();

        var stubFb = new StubPublisher(SocialPlatforms.Facebook);
        var stubTw = new StubPublisher(SocialPlatforms.Twitter);
        var stubBs = new StubPublisher(SocialPlatforms.Bluesky);

        var service = new CrossPlatformPublishService(
            new[] { stubFb, stubTw, stubBs },
            repo,
            NullLogger<CrossPlatformPublishService>.Instance);

        var response = await service.PublishAsync(user, new CrossPlatformPublishRequest
        {
            PostId = Guid.NewGuid(),
            UserId = user,
            Message = "Test cross-platform post to all",
            Platforms = new List<string> { SocialPlatforms.Facebook, SocialPlatforms.Twitter, SocialPlatforms.Bluesky }
        });

        Assert.Equal(3, response.Results.Count);
        Assert.All(response.Results, r => Assert.True(r.Success));
        Assert.True(stubFb.Called);
        Assert.True(stubTw.Called);
        Assert.True(stubBs.Called);
    }

    private class StubPublisher : ICrossPlatformPublisher
    {
        public string Platform { get; }
        public bool Called { get; private set; }

        public StubPublisher(string platform) => Platform = platform;

        public bool IsConfigured() => true;
        public bool IsConfigured(Guid userId) => true;

        public System.Threading.Tasks.Task<CrossPlatformPublishResultDto> PublishAsync(CrossPlatformPublishRequest request)
        {
            Called = true;
            return System.Threading.Tasks.Task.FromResult(new CrossPlatformPublishResultDto
            {
                Platform = Platform,
                Success = true,
                ExternalPostId = $"{Platform}_123"
            });
        }
    }

    private class StubCrossPostRepo : ISocialCrossPostRepository
    {
        public Task<IEnumerable<SocialCrossPost>> GetByPostIdAsync(Guid postId) => Task.FromResult<IEnumerable<SocialCrossPost>>(Array.Empty<SocialCrossPost>());
        public Task<IEnumerable<SocialCrossPost>> GetByUserIdAsync(Guid userId, int page = 1, int pageSize = 50) => Task.FromResult<IEnumerable<SocialCrossPost>>(Array.Empty<SocialCrossPost>());
        public Task<SocialCrossPost?> GetByPostAndPlatformAsync(Guid postId, string platform) => Task.FromResult<SocialCrossPost?>(null);
        public Task UpsertAsync(SocialCrossPost crossPost) => Task.CompletedTask;

        public Task<SocialCrossPost?> GetByIdAsync(Guid id) => Task.FromResult<SocialCrossPost?>(null);
        public Task<IEnumerable<SocialCrossPost>> GetAllAsync() => Task.FromResult<IEnumerable<SocialCrossPost>>(Array.Empty<SocialCrossPost>());
        public Task<IEnumerable<SocialCrossPost>> FindAsync(Expression<Func<SocialCrossPost, bool>> predicate) => Task.FromResult<IEnumerable<SocialCrossPost>>(Array.Empty<SocialCrossPost>());
        public Task<SocialCrossPost> AddAsync(SocialCrossPost entity) => Task.FromResult(entity);
        public Task<IEnumerable<SocialCrossPost>> AddRangeAsync(IEnumerable<SocialCrossPost> entities) => Task.FromResult(entities);
        public Task UpdateAsync(SocialCrossPost entity) => Task.CompletedTask;
        public Task DeleteAsync(SocialCrossPost entity) => Task.CompletedTask;
        public Task DeleteRangeAsync(IEnumerable<SocialCrossPost> entities) => Task.CompletedTask;
        public Task<bool> ExistsAsync(Expression<Func<SocialCrossPost, bool>> predicate) => Task.FromResult(false);
        public Task<int> CountAsync(Expression<Func<SocialCrossPost, bool>>? predicate = null) => Task.FromResult(0);
        public Task<IEnumerable<SocialCrossPost>> GetPagedAsync(int page, int pageSize, Expression<Func<SocialCrossPost, bool>>? predicate = null, Func<IQueryable<SocialCrossPost>, IOrderedQueryable<SocialCrossPost>>? orderBy = null) => Task.FromResult<IEnumerable<SocialCrossPost>>(Array.Empty<SocialCrossPost>());
    }
}
