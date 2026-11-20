using System;
using System.Text;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
namespace WiseRavenShare.Journalism
{
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
            var jwtKey = config["Jwt:Key"] ?? "WiseRavenShare_Secret_Key_At_Least_32_Chars_Long_12345!";
            var jwtIssuer = config["Jwt:Issuer"] ?? "WiseRavenShare";
            var jwtAudience = config["Jwt:Audience"] ?? "WiseRavenShare_Clients";
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
