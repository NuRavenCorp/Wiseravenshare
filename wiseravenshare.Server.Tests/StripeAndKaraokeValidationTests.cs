using System;
using System.Collections.Generic;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Wiseravenshare.Server.Controllers;
using Wiseravenshare.Server.Services;
using Xunit;

namespace Wiseravenshare.Server.Tests;

public class StripeAndKaraokeValidationTests
{
    [Fact]
    public void ResolveStripeSecretKey_AcceptsRestrictedKeyInSecretKeyConfig()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["STRIPE_SECRET_KEY"] = "rk_test_placeholder_restricted123"
            })
            .Build();

        var resolved = SubscriptionService.ResolveStripeSecretKey(config);
        Assert.Equal("rk_test_placeholder_restricted123", resolved);
    }

    [Fact]
    public void ResolveStripeSecretKey_AcceptsRestrictedKeyInRestrictedKeyEnv()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["STRIPE:RESTRICTED:KEY"] = "rk_live_placeholder_restricted456"
            })
            .Build();

        var resolved = SubscriptionService.ResolveStripeSecretKey(config);
        Assert.Equal("rk_live_placeholder_restricted456", resolved);
    }

    [Fact]
    public void KaraokeStreamTokenRequest_DeserializesNonGuidTrackIdGracefully()
    {
        // When the frontend passes an iTunes track id string like "1440857781"
        var json = """{"trackId":"1440857781","songLanguage":"en"}""";
        var request = JsonSerializer.Deserialize<KaraokeStreamTokenRequest>(json, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });

        Assert.NotNull(request);
        Assert.Null(request.TrackId); // gracefully converts to null instead of throwing 400
        Assert.Equal("en", request.SongLanguage);
    }

    [Fact]
    public void KaraokeStreamTokenRequest_DeserializesValidGuidTrackId()
    {
        var expectedGuid = Guid.NewGuid();
        var json = $$"""{"trackId":"{{expectedGuid}}","songLanguage":"fr"}""";
        var request = JsonSerializer.Deserialize<KaraokeStreamTokenRequest>(json, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });

        Assert.NotNull(request);
        Assert.Equal(expectedGuid, request.TrackId);
        Assert.Equal("fr", request.SongLanguage);
    }

    [Fact]
    public void KaraokeStreamTokenRequest_DeserializesNullOrMissingTrackId()
    {
        var json = """{"trackId":null,"songLanguage":""}""";
        var request = JsonSerializer.Deserialize<KaraokeStreamTokenRequest>(json, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });

        Assert.NotNull(request);
        Assert.Null(request.TrackId);
    }
}
