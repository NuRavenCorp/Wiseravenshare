using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Wiseravenshare.Server.Exceptions;
using Wiseravenshare.Server.Models;

namespace Wiseravenshare.Server.Filters;

public class GlobalExceptionFilter : IExceptionFilter
{
    public void OnException(ExceptionContext context)
    {
        var (statusCode, message) = context.Exception switch
        {
            NotFoundException => (StatusCodes.Status404NotFound, context.Exception.Message),
            BadRequestException => (StatusCodes.Status400BadRequest, context.Exception.Message),
            UnauthorizedException => (StatusCodes.Status401Unauthorized, context.Exception.Message),
            _ => (StatusCodes.Status500InternalServerError, "An unexpected error occurred")
        };

        context.Result = new ObjectResult(new ErrorResponse
        {
            Message = message,
            Details = context.Exception.Message
        })
        {
            StatusCode = statusCode
        };

        context.ExceptionHandled = true;
    }
}
