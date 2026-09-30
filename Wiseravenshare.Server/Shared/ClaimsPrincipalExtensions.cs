using System.Security.Claims;

namespace Wiseravenshare.Server.Shared;

public static class ClaimsPrincipalExtensions
{
    public static Guid GetUserId(this ClaimsPrincipal user)
    {
        var id = user.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? user.FindFirstValue("sub")
            ?? user.FindFirstValue("id");

        return Guid.TryParse(id, out var parsed) ? parsed : Guid.Empty;
    }
}
