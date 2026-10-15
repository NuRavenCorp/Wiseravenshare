// Wiseravenshare.Server/Controllers/CostTrackingController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Services.Communication;
using System.Security.Claims;

namespace Wiseravenshare.Server.Controllers;

/// <summary>
/// Controller for SMS/WhatsApp cost tracking and metrics
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize(AuthenticationSchemes = "Bearer")]
public class CostTrackingController : ControllerBase
{
    private readonly ICostTrackingService _costTrackingService;
    private readonly ILogger<CostTrackingController> _logger;

    public CostTrackingController(
        ICostTrackingService costTrackingService,
        ILogger<CostTrackingController> logger)
    {
        _costTrackingService = costTrackingService;
        _logger = logger;
    }

    /// <summary>
    /// Get monthly cost summary
    /// </summary>
    /// <param name="year">Year (default: current year)</param>
    /// <param name="month">Month (default: current month)</param>
    /// <returns>Cost summary for the month</returns>
    [HttpGet("monthly")]
    [ProducesResponseType(typeof(CostSummaryDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> GetMonthlyCost(int? year = null, int? month = null)
    {
        try
        {
            var userId = GetCurrentUserId();
            var summary = await _costTrackingService.GetMonthlyCostAsync(
                userId,
                year ?? DateTime.UtcNow.Year,
                month ?? DateTime.UtcNow.Month
            );
            return Ok(summary);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting monthly cost");
            return StatusCode(StatusCodes.Status500InternalServerError, 
                new { error = "Failed to retrieve monthly cost" });
        }
    }

    /// <summary>
    /// Get usage metrics for a timeframe
    /// </summary>
    /// <param name="timeframe">Timeframe: day, week, month, quarter, year</param>
    /// <returns>Usage metrics</returns>
    [HttpGet("metrics")]
    [ProducesResponseType(typeof(UsageMetricsDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> GetMetrics(string timeframe = "month")
    {
        try
        {
            if (!IsValidTimeframe(timeframe))
            {
                return BadRequest(new { error = "Invalid timeframe. Use: day, week, month, quarter, year" });
            }

            var metrics = await _costTrackingService.GetMetricsAsync(timeframe);
            return Ok(metrics);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting metrics for timeframe {Timeframe}", timeframe);
            return StatusCode(StatusCodes.Status500InternalServerError, 
                new { error = "Failed to retrieve metrics" });
        }
    }

    /// <summary>
    /// Get cost breakdown by notification type
    /// </summary>
    /// <param name="days">Number of days to look back (default: 30)</param>
    /// <returns>Cost breakdown by SMS, WhatsApp, and Verify</returns>
    [HttpGet("breakdown")]
    [ProducesResponseType(typeof(CostBreakdownDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> GetCostBreakdown(int days = 30)
    {
        try
        {
            if (days <= 0 || days > 365)
            {
                return BadRequest(new { error = "Days must be between 1 and 365" });
            }

            var userId = GetCurrentUserId();
            var breakdown = await _costTrackingService.GetCostBreakdownAsync(userId, days);
            return Ok(breakdown);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting cost breakdown");
            return StatusCode(StatusCodes.Status500InternalServerError, 
                new { error = "Failed to retrieve cost breakdown" });
        }
    }

    /// <summary>
    /// Helper method to get current user ID from JWT claims
    /// </summary>
    private string GetCurrentUserId()
    {
        return User.FindFirstValue(ClaimTypes.NameIdentifier) 
               ?? User.FindFirstValue("sub") 
               ?? User.FindFirstValue("user_id") 
               ?? throw new InvalidOperationException("User ID not found in claims");
    }

    /// <summary>
    /// Validate timeframe parameter
    /// </summary>
    private bool IsValidTimeframe(string timeframe)
    {
        var validTimeframes = new[] { "day", "week", "month", "quarter", "year" };
        return validTimeframes.Contains(timeframe.ToLower());
    }
}
