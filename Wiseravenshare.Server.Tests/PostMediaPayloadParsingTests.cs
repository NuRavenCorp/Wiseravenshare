using System.Text.Json;
using Wiseravenshare.Server.Services;
using Xunit;

namespace Wiseravenshare.Server.Tests;

public class PostMediaPayloadParsingTests
{
    [Fact]
    public void ParseMediaUrls_SupportsStringAndArrayPayloads()
    {
        var stringPayload = JsonSerializer.SerializeToElement("https://cdn.example.com/primary.jpg");
        var arrayPayload = JsonSerializer.SerializeToElement(new[]
        {
            "https://cdn.example.com/secondary.jpg",
            "https://cdn.example.com/tertiary.jpg"
        });

        var parsed = PostMediaPayloadParser.ParseMediaUrls("https://cdn.example.com/primary.jpg", stringPayload, arrayPayload);

        Assert.Equal(3, parsed.Length);
        Assert.Contains("https://cdn.example.com/primary.jpg", parsed);
        Assert.Contains("https://cdn.example.com/secondary.jpg", parsed);
        Assert.Contains("https://cdn.example.com/tertiary.jpg", parsed);
    }

    [Fact]
    public void ParseMediaUrls_IgnoresBlankAndNullValues()
    {
        var parsed = PostMediaPayloadParser.ParseMediaUrls(null, JsonSerializer.SerializeToElement(new[] { "", "   ", null! }));

        Assert.Empty(parsed);
    }
}
