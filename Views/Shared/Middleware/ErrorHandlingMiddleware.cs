using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace WiseRavenSocial.Middleware
{
	public class ErrorHandlingMiddleware
	{
		private readonly RequestDelegate _next;
		private readonly ILogger<ErrorHandlingMiddleware> _logger;

		public ErrorHandlingMiddleware(RequestDelegate next, ILogger<ErrorHandlingMiddleware> logger)
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
			catch (Exception ex)
			{
				_logger.LogError(ex, "Unhandled exception while processing {Path}", context.Request.Path);

				if (context.Response.HasStarted)
				{
					throw;
				}

				context.Response.Clear();
				context.Response.StatusCode = StatusCodes.Status500InternalServerError;
				context.Response.ContentType = "application/json";

				var payload = JsonSerializer.Serialize(new
				{
					error = "An unexpected server error occurred.",
					traceId = context.TraceIdentifier
				});

				await context.Response.WriteAsync(payload);
			}
		}
	}
}