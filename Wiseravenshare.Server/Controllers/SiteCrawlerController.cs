using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/sitecrawler")]
[Authorize]
public sealed class SiteCrawlerController : ControllerBase
{
    private readonly ISiteCrawlerService _siteCrawlerService;
    private readonly IConfiguration _configuration;

    public SiteCrawlerController(ISiteCrawlerService siteCrawlerService, IConfiguration configuration)
    {
        _siteCrawlerService = siteCrawlerService;
        _configuration = configuration;
    }

    [HttpGet("overview")]
    [ProducesResponseType(typeof(SiteCrawlerOverviewDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetOverview([FromQuery] string? countryCode = null, CancellationToken ct = default)
    {
        if (!IsAdminRequest()) return Forbid();

        var overview = await _siteCrawlerService.GetOverviewAsync(countryCode, ct);
        return Ok(overview);
    }

    [HttpGet("sitemaps")]
    [ProducesResponseType(typeof(IReadOnlyList<SiteCrawlerNodeDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetSiteMaps([FromQuery] string? countryCode = null, CancellationToken ct = default)
    {
        if (!IsAdminRequest()) return Forbid();

        var nodes = await _siteCrawlerService.GetNodesAsync(countryCode, ct);
        return Ok(nodes);
    }

    [HttpGet("graph/dependencies")]
    [ProducesResponseType(typeof(IReadOnlyList<SiteCrawlerEdgeDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetDependencyGraph([FromQuery] string? countryCode = null, CancellationToken ct = default)
    {
        if (!IsAdminRequest()) return Forbid();

        var edges = await _siteCrawlerService.GetEdgesAsync(countryCode, ct);
        return Ok(edges);
    }

    [HttpGet("apis")]
    [ProducesResponseType(typeof(IReadOnlyList<SiteCrawlerApiEndpointDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetApiMap(CancellationToken ct = default)
    {
        if (!IsAdminRequest()) return Forbid();

        var apis = await _siteCrawlerService.GetApiEndpointsAsync(ct);
        return Ok(apis);
    }

    private bool IsAdminRequest()
    {
        var email = User.FindFirstValue(ClaimTypes.Email)
            ?? User.FindFirstValue("email")
            ?? string.Empty;

        if (string.IsNullOrWhiteSpace(email))
        {
            return false;
        }

        var configuredAdminEmails = _configuration.GetSection("Admin:Emails").Get<string[]>() ?? [];
        if (configuredAdminEmails.Any(value => string.Equals(value?.Trim(), email, StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        var configuredAuthUsers = _configuration.GetSection("Authentication:Users").GetChildren()
            .Select(section => section["Email"]?.Trim())
            .Where(value => !string.IsNullOrWhiteSpace(value));

        return configuredAuthUsers.Any(value => string.Equals(value, email, StringComparison.OrdinalIgnoreCase));
    }
}
