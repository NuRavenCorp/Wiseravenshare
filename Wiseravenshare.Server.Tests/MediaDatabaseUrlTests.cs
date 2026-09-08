using Wiseravenshare.Server.Services.Media;
using Xunit;

namespace Wiseravenshare.Server.Tests;

public class MediaDatabaseUrlTests
{
    [Fact]
    public void CreateDatabaseMediaUrl_ReturnsStableApiRoute()
    {
        var mediaId = Guid.Parse("11111111-2222-3333-4444-555555666666");

        var url = MediaUrlResolver.CreateDatabaseMediaUrl(mediaId);

        Assert.Equal($"/api/media-library/{mediaId}/stream", url);
    }
}
