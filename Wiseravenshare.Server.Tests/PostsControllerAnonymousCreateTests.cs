using Microsoft.AspNetCore.Authorization;
using Wiseravenshare.Server.Controllers;
using Xunit;

namespace Wiseravenshare.Server.Tests;

public class PostsControllerAnonymousCreateTests
{
    [Fact]
    public void CreatePostAction_AllowsAnonymousAccess()
    {
        var method = typeof(PostsController).GetMethod(nameof(PostsController.CreatePost));

        Assert.NotNull(method);
        Assert.Contains(method!.GetCustomAttributes(typeof(AllowAnonymousAttribute), true), attribute => attribute is AllowAnonymousAttribute);
    }
}
