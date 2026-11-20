using System;
using System.Text;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
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

    public static IServiceCollection AddWiseRavenShareUnifiedAuth(
        this IServiceCollection services, 
        IConfiguration config)
    {
        var jwtKey = config["Jwt:Key"] ?? config["Authentication:Jwt:Key"] ?? "WiseRavenShare_Secret_Key_At_Least_32_Chars_Long_12345!";
        var jwtIssuer = config["Jwt:Issuer"] ?? config["Authentication:Jwt:Issuer"] ?? "WiseRavenShare";
        var jwtAudience = config["Jwt:Audience"] ?? config["Authentication:Jwt:Audience"] ?? "WiseRavenShare_Clients";

        // Add Authentication with a Smart Policy Scheme
        // If an "Authorization: Bearer ..." header is present -> Use JWT Bearer
        // Otherwise -> Use Cookie Authentication
        services.AddAuthentication(options =>
        {
            options.DefaultScheme = UnifiedAuthScheme;
            options.DefaultChallengeScheme = UnifiedAuthScheme;
        })
        .AddPolicyScheme(UnifiedAuthScheme, "Bearer or Cookie", options =>
        {
            options.ForwardDefaultSelector = context =>
            {
                var authHeader = context.Request.Headers["Authorization"].ToString();
                if (!string.IsNullOrEmpty(authHeader) && authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
                {
                    return JwtBearerDefaults.AuthenticationScheme;
                }
                return CookieAuthenticationDefaults.AuthenticationScheme;
            };
        })
        .AddCookie(CookieAuthenticationDefaults.AuthenticationScheme, options =>
        {
            options.Cookie.Name = "WiseRavenShare.Auth";
            options.Cookie.HttpOnly = true;
            options.Cookie.SameSite = Microsoft.AspNetCore.Http.SameSiteMode.Lax;
            options.Cookie.SecurePolicy = Microsoft.AspNetCore.Http.CookieSecurePolicy.SameAsRequest;
            options.LoginPath = "/login";
            options.LogoutPath = "/logout";
            options.ExpireTimeSpan = TimeSpan.FromDays(30);
            options.SlidingExpiration = true;
        })
        .AddJwtBearer(JwtBearerDefaults.AuthenticationScheme, options =>
        {
            options.RequireHttpsMetadata = false; // Set to true in strict production SSL
            options.SaveToken = true;
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuer = jwtIssuer,
                ValidateAudience = true,
                ValidAudience = jwtAudience,
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
                ValidateLifetime = true,
                ClockSkew = TimeSpan.FromMinutes(5)
            };
        });

        services.AddAuthorization();

        // Configure CORS with credentials so cookies and Authorization headers
        // are accepted seamlessly from localhost dev ports (3000, 5173, etc.)
        services.AddCors(options =>
        {
            options.AddPolicy("AllowWiseRavenShareClients", builder =>
            {
                builder.SetIsOriginAllowed(_ => true)
                       .AllowAnyMethod()
                       .AllowAnyHeader()
                       .AllowCredentials(); // REQUIRED FOR COOKIE / AUTH HEADER
            });
        });

        return services;
    }
}
