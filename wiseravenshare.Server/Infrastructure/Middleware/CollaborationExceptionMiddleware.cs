// Wiseravenshare.Server/Infrastructure/Middleware/CollaborationExceptionMiddleware.cs
using System.Text.Json;
using Wiseravenshare.Server.DTOs.Collaboration;

namespace Wiseravenshare.Server.Infrastructure.Middleware;

/// <summary>
/// Translates domain exceptions from the collaboration module into consistent JSON error responses,
/// and logs correlation ids for every failure.
/// </summary>
public class CollaborationExceptionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<CollaborationExceptionMiddleware> _logger;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public CollaborationExceptionMiddleware(RequestDelegate next, ILogger<CollaborationExceptionMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex) when (ex is Exceptions.NotFoundException or Exceptions.UnauthorizedException or InvalidOperationException)
        {
            var (status, title) = ex switch
            {
                Exceptions.NotFoundException => (StatusCodes.Status404NotFound, "Not found"),
                Exceptions.UnauthorizedException => (StatusCodes.Status403Forbidden, "Forbidden"),
                _ => (StatusCodes.Status400BadRequest, "Invalid operation")
            };

            var correlationId = context.TraceIdentifier;
            _logger.LogWarning(ex, "Collaboration request failed [{Status}] {CorrelationId}: {Message}", status, correlationId, ex.Message);

            if (context.Response.HasStarted)
                throw;

            context.Response.Clear();
            context.Response.StatusCode = status;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync(JsonSerializer.Serialize(new ErrorResponse
            {
                Error = title,
                Message = ex.Message,
                CorrelationId = correlationId
            }, JsonOptions));
        }
        catch (Exception ex)
        {
            var correlationId = context.TraceIdentifier;
            _logger.LogError(ex, "Unhandled exception {CorrelationId}: {Message}", correlationId, ex.Message);
            throw; // let the default exception handler / developer page handle it
        }
    }
}

public static class CollaborationExceptionMiddlewareExtensions
{
    public static IApplicationBuilder UseCollaborationExceptionHandling(this IApplicationBuilder app)
        => app.UseMiddleware<CollaborationExceptionMiddleware>();
}
