using Microsoft.AspNetCore.Authorization;
using Wiseravenshare.Server.Controllers;
using Xunit;

namespace Wiseravenshare.Server.Tests;

public class PostsControllerAuthorizationTests
{
    [Fact]
    public void GetFeedAction_AllowsAnonymousAccess()
    {
        var method = typeof(PostsController).GetMethod(nameof(PostsController.GetFeed));

        Assert.NotNull(method);
        Assert.Contains(method!.GetCustomAttributes(typeof(AllowAnonymousAttribute), true), attribute => attribute is AllowAnonymousAttribute);
    }
}
