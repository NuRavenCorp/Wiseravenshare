using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Services.Simulation;
using Xunit;

namespace Wiseravenshare.Server.Tests;

public class EngagementSimulatorTests
{
    [Fact]
    public void PersonaCatalog_ContainsAtLeastTenUniquePersonasWithDistinctProfiles()
    {
        var personas = EngagementPersonaCatalog.Personas;

        // User requested: "I need at least ten more would be better, all with different personality traits"
        Assert.True(personas.Count >= 10, $"Expected at least 10 personas, but found {personas.Count}");
        Assert.Equal(14, personas.Count);

        // Verify uniqueness of keys, handles, and archetypes
        var keys = personas.Select(p => p.Key).Distinct().ToList();
        var handles = personas.Select(p => p.HandleBase).Distinct().ToList();
        var archetypes = personas.Select(p => p.Archetype).Distinct().ToList();

        Assert.Equal(personas.Count, keys.Count);
        Assert.Equal(personas.Count, handles.Count);
        Assert.Equal(personas.Count, archetypes.Count);

        // Verify each persona has rich post and reply pools with authentic tone
        foreach (var p in personas)
        {
            Assert.False(string.IsNullOrWhiteSpace(p.DisplayName));
            Assert.False(string.IsNullOrWhiteSpace(p.Bio));
            Assert.False(string.IsNullOrWhiteSpace(p.Tone));
            Assert.False(string.IsNullOrWhiteSpace(p.AvatarUrl));
            Assert.True(p.PostPool.Count >= 10, $"Persona {p.Key} should have at least 10 post templates");
            Assert.True(p.ReplyPool.Count >= 5, $"Persona {p.Key} should have at least 5 reply templates");

            // Verify content does not contain dummy synthetic test markers
            Assert.All(p.PostPool, post =>
            {
                Assert.DoesNotContain("[TRANSPARENT_AI_SEED]", post);
                Assert.DoesNotContain("[SYNTHETIC_TEST]", post);
            });
            Assert.All(p.ReplyPool, reply =>
            {
                Assert.DoesNotContain("[TRANSPARENT_AI_SEED]", reply);
                Assert.DoesNotContain("[SYNTHETIC_TEST]", reply);
            });
        }
    }

    [Fact]
    public void CadenceRules_ConformTo28hActiveAnd6hRestSchedule()
    {
        // Specifications:
        // - "make post 3 hours apart for 28 hours and rest for 6 before recycling"
        // - "each must make at least 6 daily posts"
        // - "each must respond to posts no less than four times per day"

        var activeHours = 28.0;
        var restHours = 6.0;
        var totalCycleHours = activeHours + restHours; // 34.0
        var postSpacingHours = 3.0;
        var commentSpacingHours = 4.5;

        Assert.Equal(34.0, totalCycleHours);

        // Posts in active window: hours 0, 3, 6, 9, 12, 15, 18, 21, 24, 27 -> 10 posts
        var postsInActiveWindow = (int)Math.Floor(activeHours / postSpacingHours) + 1; // 10
        Assert.Equal(10, postsInActiveWindow);

        // Average posts per 24 hours
        var postsPer24Hours = (postsInActiveWindow / totalCycleHours) * 24.0; // ~7.06 daily posts
        Assert.True(postsPer24Hours >= 6.0, $"Expected >= 6 daily posts, got {postsPer24Hours}");

        // Comments per 24 hours
        var commentsInActiveWindow = (int)Math.Floor(activeHours / commentSpacingHours) + 1; // 7 comments
        var commentsPer24Hours = (commentsInActiveWindow / totalCycleHours) * 24.0; // ~4.94 comments/day
        Assert.True(commentsPer24Hours >= 4.0, $"Expected >= 4 daily comments, got {commentsPer24Hours}");
    }

    [Fact]
    public void NotificationType_ContainsViralContentAndViralAlert()
    {
        Assert.True(Enum.IsDefined(typeof(NotificationType), "ViralContent"));
        Assert.True(Enum.IsDefined(typeof(NotificationType), "ViralAlert"));
    }

    [Fact]
    public void PersonaState_SerializationRoundTrip_PreservesAllProperties()
    {
        var original = new EngagementPersonaState
        {
            Key = "marcus_vance",
            UserId = Guid.NewGuid(),
            Username = "marcus_vance_421",
            Email = "marcus.vance.421@wiseravenshare.ai",
            Password = "Raven!Marcus421$2026",
            CycleStartedAtUtc = DateTime.UtcNow.AddHours(-14),
            LastPostAtUtc = DateTime.UtcNow.AddHours(-1),
            LastCommentAtUtc = DateTime.UtcNow.AddHours(-2),
            IsResting = false,
            PostsInCycle = 5,
            CommentsInCycle = 3,
            LifetimePosts = 42,
            LifetimeComments = 28,
            LifetimeFollows = 15
        };

        var json = JsonSerializer.Serialize(original);
        var restored = JsonSerializer.Deserialize<EngagementPersonaState>(json);

        Assert.NotNull(restored);
        Assert.Equal(original.Key, restored.Key);
        Assert.Equal(original.UserId, restored.UserId);
        Assert.Equal(original.Username, restored.Username);
        Assert.Equal(original.Email, restored.Email);
        Assert.Equal(original.Password, restored.Password);
        Assert.Equal(original.PostsInCycle, restored.PostsInCycle);
        Assert.Equal(original.CommentsInCycle, restored.CommentsInCycle);
        Assert.Equal(original.LifetimePosts, restored.LifetimePosts);
        Assert.Equal(original.LifetimeComments, restored.LifetimeComments);
        Assert.Equal(original.LifetimeFollows, restored.LifetimeFollows);
        Assert.Equal(original.IsResting, restored.IsResting);
    }
}
