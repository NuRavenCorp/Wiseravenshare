using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Wiseravenshare.Server.Models;

namespace Wiseravenshare.Server.Filters;

public class ValidationFilter : IActionFilter
{
    public void OnActionExecuting(ActionExecutingContext context)
    {
        if (!context.ModelState.IsValid)
        {
            var errors = context.ModelState
                .Where(kvp => kvp.Value?.Errors.Count > 0)
                .SelectMany(kvp => kvp.Value!.Errors.Select(err => $"{kvp.Key}: {err.ErrorMessage}"))
                .ToArray();

            context.Result = new BadRequestObjectResult(new ErrorResponse
            {
                Message = "Validation failed",
                Details = string.Join("; ", errors)
            });
        }
    }

    public void OnActionExecuted(ActionExecutedContext context) { }
}
