using System;
using System.IO;
using System.Linq;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services;
using Xunit;

namespace Wiseravenshare.Server.Tests;

public class SocialConnectionAndUserStoreTests
{
    [Fact]
    public void UserStore_TryGetById_ResolvesHyphenatedAndUnhyphenatedGuidsAndEmail()
    {
        var testEnv = new TestWebHostEnvironment();
        var config = new ConfigurationBuilder().Build();
        var store = new UserStore(testEnv, config);

        var rawGuid = Guid.NewGuid();
        var hyphenatedId = rawGuid.ToString();
        var unhyphenatedId = rawGuid.ToString("N");
        var email = $"social_test_{rawGuid:N}@example.com";

        // Create user
        var created = store.CreateUser("Social Tester", email, "SecurePassword123!", "Bio", "Location", "Website", "avatar.png");
        store.TryAlignUserId(email, unhyphenatedId);

        // 1. Should resolve by unhyphenated 32-hex ID
        Assert.True(store.TryGetById(unhyphenatedId, out var user1));
        Assert.NotNull(user1);
        Assert.Equal(email, user1.Email);

        // 2. Should resolve by hyphenated standard GUID format
        Assert.True(store.TryGetById(hyphenatedId, out var user2));
        Assert.NotNull(user2);
        Assert.Equal(email, user2.Email);

        // 3. Should resolve when email is passed as ID
        Assert.True(store.TryGetById(email, out var user3));
        Assert.NotNull(user3);
        Assert.Equal(email, user3.Email);
    }

    [Fact]
    public void UserStore_UpdateSocialFeeds_PersistsCredentialsAcrossLookups()
    {
        var testEnv = new TestWebHostEnvironment();
        var config = new ConfigurationBuilder().Build();
        var store = new UserStore(testEnv, config);

        var email = $"feed_persist_{Guid.NewGuid():N}@example.com";
        var user = store.CreateUser("Feed User", email, "Password123!", "", "", "", "");

        var twitterConnection = new SocialFeedConnection
        {
            Enabled = true,
            Site = "twitter",
            Username = "wr_creator",
            ProfileUrl = "https://twitter.com/wr_creator",
            AccessToken = "sec_tok_12345",
            DestinationId = "wr_creator",
            AllowCrossPosting = true,
            AllowContentImport = true
        };

        store.UpdateSocialFeeds(user.Id, new UpdateSocialFeedsRequest
        {
            Twitter = twitterConnection
        });

        // Lookup with hyphenated Guid format of user.Id
        var hyphenated = Guid.Parse(user.Id).ToString();
        Assert.True(store.TryGetById(hyphenated, out var foundUser));
        Assert.NotNull(foundUser);
        Assert.NotNull(foundUser.SocialFeeds?.Twitter);
        Assert.True(foundUser.SocialFeeds.Twitter.Enabled);
        Assert.Equal("wr_creator", foundUser.SocialFeeds.Twitter.Username);
    }
}
