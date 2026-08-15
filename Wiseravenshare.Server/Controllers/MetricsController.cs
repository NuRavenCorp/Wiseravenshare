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

    public MetricsController(PerformanceMetricsService metricsService)
    {
        _metricsService = metricsService;
    }

    [HttpGet("performance")]
    public IActionResult GetPerformanceSnapshot([FromQuery] int top = 20)
    {
        var safeTop = Math.Clamp(top, 1, 100);
        var snapshot = _metricsService.GetSnapshot(safeTop);
        return Ok(snapshot);
    }
}
