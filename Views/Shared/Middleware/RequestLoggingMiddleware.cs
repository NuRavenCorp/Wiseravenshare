using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

public class RequestLoggingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<RequestLoggingMiddleware> _logger;

    public RequestLoggingMiddleware(RequestDelegate next, ILogger<RequestLoggingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // Log request details
        _logger.LogInformation("Handling request: {method} {url}", context.Request.Method, context.Request.Path);

        await _next(context);

        // Log response details
        _logger.LogInformation("Finished handling request. Response status: {statusCode}", context.Response.StatusCode);
    }
}