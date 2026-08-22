using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services;
using Xunit;

namespace Wiseravenshare.Server.Tests;

public class UserAvatarPersistenceTests
{
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
}
