using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/news")]
public sealed class NewsController : ControllerBase
{
    private readonly INewsAggregationService _newsAggregationService;

    public NewsController(INewsAggregationService newsAggregationService)
    {
        _newsAggregationService = newsAggregationService;
    }

    [HttpGet("search")]
    public async Task<IActionResult> Search(
        [FromQuery(Name = "q")] string? query,
        [FromQuery] string? language = "en",
        [FromQuery] int limit = 15,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            return BadRequest(new { message = "Query parameter q is required." });
        }

        var response = await _newsAggregationService.SearchNewsAsync(query, language, limit, cancellationToken);
        var providerConfigured = response.ProviderStatuses.Any(s => s.Configured);
        if (!providerConfigured)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                message = "No news providers are configured. Set NewsApis keys in environment or user-secrets.",
                response.ProviderStatuses
            });
        }

        return Ok(response);
    }

    [HttpGet("trending")]
    public async Task<IActionResult> Trending(
        [FromQuery] string? language = "en",
        [FromQuery] int limit = 15,
        CancellationToken cancellationToken = default)
    {
        var response = await _newsAggregationService.SearchNewsAsync("breaking news", language, limit, cancellationToken);
        return Ok(response);
    }
}
