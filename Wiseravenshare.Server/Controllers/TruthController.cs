// Wiseravenshare.Server/Controllers/EvolutionController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.ComponentModel.DataAnnotations;
using Wiseravenshare.Server.DTOs.Agent;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Admin,Moderator")]
[Produces("application/json")]
public class EvolutionController : ControllerBase
{
    private readonly IEvolutionService _evolutionService;

    public EvolutionController(IEvolutionService evolutionService)
    {
        _evolutionService = evolutionService;
    }

    [HttpGet("agents")]
    [ProducesResponseType(typeof(IEnumerable<AgentDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAgents()
    {
        var agents = await _evolutionService.GetAgentsAsync();
        return Ok(agents);
    }

    [HttpGet("agents/{id}")]
    [ProducesResponseType(typeof(AgentDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetAgent(Guid id)
    {
        var agent = await _evolutionService.GetAgentAsync(id);
        return Ok(agent);
    }

    [HttpPost("agents")]
    [ProducesResponseType(typeof(AgentDto), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> CreateAgent([FromBody] CreateAgentRequestDto request)
    {
        var agent = await _evolutionService.CreateAgentAsync(
            Enum.Parse<AgentType>(request.Type, true),
            request.Name,
            request.Description);

        return CreatedAtAction(nameof(GetAgent), new { id = agent.Id }, agent);
    }

    [HttpPost("agents/{id}/evolve")]
    [ProducesResponseType(typeof(AgentDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> EvolveAgent(Guid id, [FromBody] TriggerEvolutionDto? dto = null)
    {
        var agent = await _evolutionService.EvolveAgentAsync(id, dto);
        return Ok(agent);
    }

    [HttpPatch("agents/{id}/status")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UpdateAgentStatus(Guid id, [FromBody] UpdateAgentStatusRequestDto request)
    {
        await _evolutionService.UpdateAgentStatusAsync(id, request.IsActive);
        return NoContent();
    }

    [HttpGet("suggestions")]
    [ProducesResponseType(typeof(IEnumerable<EvolutionSuggestionDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetEvolutionSuggestions()
    {
        var suggestions = await _evolutionService.GetEvolutionSuggestionsAsync();
        return Ok(suggestions);
    }

    [HttpGet("history")]
    [ProducesResponseType(typeof(IEnumerable<AgentEvolutionDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetEvolutionHistory([FromQuery] Guid? agentId = null)
    {
        var history = await _evolutionService.GetEvolutionHistoryAsync(agentId);
        return Ok(history);
    }

    [HttpGet("metrics")]
    [ProducesResponseType(typeof(SystemMetricsDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetSystemMetrics()
    {
        var metrics = await _evolutionService.GetSystemMetricsAsync();
        return Ok(metrics);
    }

    [HttpGet("agents/{id}/should-evolve")]
    [ProducesResponseType(typeof(bool), StatusCodes.Status200OK)]
    public async Task<IActionResult> ShouldEvolve(Guid id)
    {
        var shouldEvolve = await _evolutionService.ShouldEvolveAsync(id);
        return Ok(shouldEvolve);
    }

    public class CreateAgentRequestDto
    {
        [Required]
        [MaxLength(100)]
        public string Name { get; set; } = string.Empty;

        [Required]
        [MaxLength(500)]
        public string Description { get; set; } = string.Empty;

        [Required]
        public string Type { get; set; } = "TruthSeeker";
    }

    public class UpdateAgentStatusRequestDto
    {
        [Required]
        public bool IsActive { get; set; }
    }
}