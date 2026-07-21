using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using WiseRavenSocial.Models;

namespace WiseRavenSocial.Middleware
{
    public class AdminAccessMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly ILogger<AdminAccessMiddleware> _logger;

        public AdminAccessMiddleware(RequestDelegate next, ILogger<AdminAccessMiddleware> logger)
        {
            _next = next;
            _logger = logger;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            // Check if request is for admin area
            if (context.Request.Path.StartsWithSegments("/admin"))
            {
                var user = context.User;
                
                // Check if user is authenticated
                if (!user.Identity?.IsAuthenticated ?? true)
                {
                    context.Response.Redirect("/Account/Login?returnUrl=" + 
                                              Uri.EscapeDataString(context.Request.Path));
                    return;
                }

                // Check if user has admin role
                if (!user.IsInRole("Administrator") && !user.IsInRole("Moderator"))
                {
                    _logger.LogWarning("Unauthorized access attempt to admin area by user: {UserId}", 
                                       user.FindFirstValue(ClaimTypes.NameIdentifier));
                    
                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    await context.Response.WriteAsync("Access denied. Admin privileges required.");
                    return;
                }

                // Check for admin-specific claims
                if (!user.HasClaim(c => c.Type == "admin_access" && c.Value == "true"))
                {
                    _logger.LogWarning("User missing admin_access claim: {UserId}", 
                                       user.FindFirstValue(ClaimTypes.NameIdentifier));
                    
                    context.Response.Redirect("/Account/AccessDenied");
                    return;
                }

                // Log admin access
                _logger.LogInformation("Admin access granted to {Path} by user {UserId}", 
                                       context.Request.Path, user.FindFirstValue(ClaimTypes.NameIdentifier));
            }

            await _next(context);
        }
    }
}