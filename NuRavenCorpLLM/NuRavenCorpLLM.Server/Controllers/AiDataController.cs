using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NuRavenCorpLLM.Application.Services.Ai;
using NuRavenCorpLLM.Application.Services.Ai.Repositories;
using NuRavenCorpLLM.Infrastructure.Security;

namespace NuRavenCorpLLM.Controllers;

[ApiController]
[Route("api/ai-data")]
[Authorize]
[Produces("application/json")]
public class AiDataController : ControllerBase
{
    private readonly IAiDataOrchestrator _orchestrator;
    private readonly IDataSourceRegistryRepository _registry;
    private readonly IDataQueryTemplateRepository _templates;
    private readonly IDataQueryRepository _queries;

    public AiDataController(
        IAiDataOrchestrator orchestrator,
        IDataSourceRegistryRepository registry,
        IDataQueryTemplateRepository templates,
        IDataQueryRepository queries)
    {
        _orchestrator = orchestrator;
        _registry = registry;
        _templates = templates;
        _queries = queries;
    }

    [HttpPost("ask")]
    public async Task<IActionResult> Ask([FromBody] AskDto dto, CancellationToken ct)
        => Ok(await _orchestrator.AskAsync(User.GetUserId(), dto.Prompt, ct));

    [HttpGet("sources")]
    [AllowAnonymous]
    public async Task<IActionResult> Sources(CancellationToken ct)
        => Ok(await _registry.GetEnabledAsync(ct));

    [HttpGet("templates")]
    [AllowAnonymous]
    public async Task<IActionResult> Templates(CancellationToken ct)
        => Ok(await _templates.GetAllOrderedAsync(ct));

    [HttpGet("history")]
    public async Task<IActionResult> History([FromQuery] int limit = 50, CancellationToken ct = default)
        => Ok(await _queries.GetByUserAsync(User.GetUserId(), limit, ct));

    public record AskDto(string Prompt);
}
