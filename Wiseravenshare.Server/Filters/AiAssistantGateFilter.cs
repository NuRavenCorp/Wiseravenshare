using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Wiseravenshare.Server.Filters;

/// <summary>
/// Blocks all AI assistant endpoints while Features:AiAssistantGated = true.
/// To lift the gate, set "Features:AiAssistantGated": false in appsettings.json
/// (or the environment override) and redeploy / hot-reload.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class AiAssistantGateAttribute : Attribute, IResourceFilter
{
    public void OnResourceExecuting(ResourceExecutingContext context)
    {
        var config = context.HttpContext.RequestServices.GetRequiredService<IConfiguration>();
        if (config.GetValue<bool>("Features:AiAssistantGated"))
        {
            context.Result = new ObjectResult(new
            {
                gated = true,
                message = "The AI Assistant is temporarily unavailable. Please check back later."
            })
            {
                StatusCode = StatusCodes.Status503ServiceUnavailable
            };
        }
    }

    public void OnResourceExecuted(ResourceExecutedContext context) { }
}
