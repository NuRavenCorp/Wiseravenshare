using System.Security.Claims;

namespace NuRavenCorpLLM.Infrastructure.Security;

public static class ClaimsPrincipalExtensions
{
    public static Guid GetUserId(this ClaimsPrincipal principal)
    {
        var value =
            principal.FindFirstValue(ClaimTypes.NameIdentifier) ??
            principal.FindFirstValue("sub") ??
            principal.FindFirstValue("oid");

        return Guid.TryParse(value, out var parsed) ? parsed : Guid.Empty;
    }
}
