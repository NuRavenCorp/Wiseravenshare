using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public sealed class MetricsController : ControllerBase
{
    private readonly PerformanceMetricsService _metricsService;
    private readonly IConfiguration _configuration;

    public MetricsController(PerformanceMetricsService metricsService, IConfiguration configuration)
    {
        _metricsService = metricsService;
        _configuration = configuration;
    }

    [HttpGet("performance")]
    public IActionResult GetPerformanceSnapshot([FromQuery] int top = 20)
    {
        if (!IsAdminRequest())
        {
            return Forbid();
        }

        var safeTop = Math.Clamp(top, 1, 100);
        var snapshot = _metricsService.GetSnapshot(safeTop);
        return Ok(snapshot);
    }

    private bool IsAdminRequest()
    {
        var email = User.FindFirstValue(ClaimTypes.Email)
            ?? User.FindFirstValue("email")
            ?? string.Empty;

        return AuthAccessPolicy.IsConfiguredAdminEmail(_configuration, email);
    }
}
