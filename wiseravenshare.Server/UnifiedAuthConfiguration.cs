using System.Text;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;

namespace Wiseravenshare.Server.Shared;

// =========================================================================
// UNIFIED AUTHENTICATION SETUP HELPER FOR WISERAVENSHARE + PLANNER
// =========================================================================
// Knits together WiseRavenShare's web application login (cookies/Identity)
// with API / SPA Planner access (JWT Bearer or Cookies) so users sign in ONCE.
// =========================================================================
public static class UnifiedAuthExtensions
{
    public const string UnifiedAuthScheme = "WiseRavenShare_Unified_Auth";

    public static string ResolveJwtKey(IConfiguration configuration)
    {
        var candidates = new[]
        {
            configuration["JWT_highentropykey"],
            configuration["Authentication:Jwt:Key"],
            configuration["Authentication__Jwt__Key"],
            configuration["Jwt:Key"],
            Environment.GetEnvironmentVariable("JWT_highentropykey"),
            Environment.GetEnvironmentVariable("Authentication__Jwt__Key")
        };

        foreach (var candidate in candidates)
        {
            var value = (candidate ?? string.Empty).Trim();
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value;
            }
        }

        return "WiseRavenShare_Secret_Key_At_Least_32_Chars_Long_12345!";
    }
}
