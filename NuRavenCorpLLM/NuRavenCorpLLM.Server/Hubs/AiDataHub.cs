using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using NuRavenCorpLLM.Application.Services.Ai;
using NuRavenCorpLLM.Infrastructure.Security;

namespace NuRavenCorpLLM.Hubs;

[Authorize]
public class AiDataHub : Hub
{
    private readonly IAiDataOrchestrator _orchestrator;

    public AiDataHub(IAiDataOrchestrator orchestrator)
    {
        _orchestrator = orchestrator;
    }

    public async Task Ask(string prompt)
    {
        var userId = Context.User?.GetUserId() ?? Guid.Empty;
        await foreach (var evt in _orchestrator.StreamAsync(userId, prompt, Context.ConnectionAborted))
        {
            await Clients.Caller.SendAsync("event", evt);
        }
    }
}
