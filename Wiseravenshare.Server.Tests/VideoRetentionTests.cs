using Wiseravenshare.Server.Services;
using Xunit;

namespace Wiseravenshare.Server.Tests;

public class VideoRetentionTests
{
    [Fact]
    public void TemporaryVideosExpireAfterThirtyDays()
    {
        var createdAt = DateTime.UtcNow.AddDays(-31);
        var status = VideoRetentionPolicy.GetStorageStatus(createdAt, isPermanent: false);

        Assert.Equal("expired", status);
    }

    [Fact]
    public void PermanentVideosRemainAvailableBeyondThirtyDays()
    {
        var createdAt = DateTime.UtcNow.AddDays(-31);
        var status = VideoRetentionPolicy.GetStorageStatus(createdAt, isPermanent: true);

        Assert.Equal("active", status);
    }
}
