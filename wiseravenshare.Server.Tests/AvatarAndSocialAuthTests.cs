using System;
using System.IO;
using System.Linq;
using Microsoft.Extensions.Configuration;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Infrastructure.Data.Repositories;
using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services;
using Wiseravenshare.Server.Services.Simulation;
using Xunit;

namespace Wiseravenshare.Server.Tests;

public class AvatarAndSocialAuthTests
{
    [Fact]
    public void UserStore_UpdateProfile_PersistsAvatarSelection()
    {
        var tempDir = Path.Combine(Path.GetTempPath(), $"wr_avatar_test_{Guid.NewGuid():N}");
        Directory.CreateDirectory(tempDir);
        try
        {
            var testEnv = new TestWebHostEnvironment { ContentRootPath = tempDir };
            var config = new ConfigurationBuilder().Build();
            var store = new UserStore(testEnv, config);

            var user = store.CreateUser("Avatar User", "avatar@example.com", "Password#123", "Bio", "Location", "https://example.com", "");
            Assert.True(string.IsNullOrEmpty(user.Avatar));

            var newAvatarUrl = "/uploads/avatars/avatar_user_123.jpg";
            var updated = store.UpdateProfile(user.Id, new UpdateUserProfileRequest { Avatar = newAvatarUrl });

            Assert.Equal(newAvatarUrl, updated.Avatar);

            Assert.True(store.TryGetById(user.Id, out var reloaded));
            Assert.NotNull(reloaded);
            Assert.Equal(newAvatarUrl, reloaded.Avatar);
        }
        finally
        {
            try { Directory.Delete(tempDir, true); } catch {}
        }
    }

    [Fact]
    public void EngagementPersonaState_IncludesDisplayNameArchetypeAndAvatar()
    {
        var state = new EngagementPersonaState
        {
            Key = "marcus_vance",
            UserId = Guid.NewGuid(),
            Username = "marcus_vance",
            DisplayName = "Dr. Marcus Vance",
            Archetype = "Tech Philosopher & AI Ethicist",
            AvatarUrl = "https://images.unsplash.com/photo-1534528741775-53994a69daeb",
            Bio = "AI ethics researcher & systems philosopher.",
            Email = "marcus.vance@wiseravenshare.ai",
            Password = "Password#123",
            IsResting = false,
            PostsInCycle = 2,
            LifetimePosts = 5
        };

        Assert.Equal("Dr. Marcus Vance", state.DisplayName);
        Assert.Equal("Tech Philosopher & AI Ethicist", state.Archetype);
        Assert.False(string.IsNullOrEmpty(state.AvatarUrl));
        Assert.False(state.IsResting);
    }

    [Fact]
    public void EngagementPersonaCatalog_AllPersonasHaveUniqueDisplayNamesAndAvatars()
    {
        var personas = EngagementPersonaCatalog.Personas;
        Assert.True(personas.Count >= 10);

        var displayNames = personas.Select(p => p.DisplayName).Distinct().ToList();
        Assert.Equal(personas.Count, displayNames.Count);

        // Every persona must have an avatar and post pool for authentic discussion
        foreach (var persona in personas)
        {
            Assert.False(string.IsNullOrWhiteSpace(persona.AvatarUrl));
            Assert.True(persona.PostPool.Count >= 5);
            Assert.True(persona.ReplyPool.Count >= 3);
        }
    }
}
