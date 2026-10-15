using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Entities.Crawler;
using Wiseravenshare.Server.Services;
using Wiseravenshare.Server.Services.Crawler;
using Wiseravenshare.Server.Shared;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/site-crawler")]
[Authorize]
[FeatureCompartment("site-crawler")]
public sealed class SiteAuditCrawlerController : ControllerBase
{
    private readonly ICrawlerOrchestrator _crawlerOrchestrator;
    private readonly IConfiguration _configuration;

    public SiteAuditCrawlerController(ICrawlerOrchestrator crawlerOrchestrator, IConfiguration configuration)
    {
        _crawlerOrchestrator = crawlerOrchestrator;
        _configuration = configuration;
    }

    [HttpPost("jobs")]
    public async Task<IActionResult> StartCrawl([FromBody] StartCrawlRequest request, CancellationToken ct = default)
    {
        if (!IsAdminRequest())
        {
            return Forbid();
        }

        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized();
        }

        var job = await _crawlerOrchestrator.StartCrawlAsync(request, userId, ct);
        return Ok(job);
    }

    [HttpGet("jobs")]
    public async Task<IActionResult> GetJobs([FromQuery] bool all = false, CancellationToken ct = default)
    {
        if (!IsAdminRequest())
        {
            return Forbid();
        }

        var userId = User.GetUserId();
        var jobs = await _crawlerOrchestrator.GetJobsAsync(all ? null : userId, ct);
        return Ok(jobs);
    }

    [HttpGet("jobs/{jobId:guid}")]
    public async Task<IActionResult> GetJob(Guid jobId, CancellationToken ct = default)
    {
        if (!IsAdminRequest())
        {
            return Forbid();
        }

        var job = await _crawlerOrchestrator.GetJobAsync(jobId, ct);
        return Ok(job);
    }

    [HttpGet("jobs/{jobId:guid}/pages")]
    public async Task<IActionResult> GetPages(Guid jobId, [FromQuery] int page = 1, [FromQuery] int pageSize = 100, CancellationToken ct = default)
    {
        if (!IsAdminRequest())
        {
            return Forbid();
        }

        var pages = await _crawlerOrchestrator.GetPagesAsync(jobId, page, pageSize, ct);
        return Ok(pages);
    }

    [HttpGet("pages/{pageId:guid}")]
    public async Task<IActionResult> GetPage(Guid pageId, CancellationToken ct = default)
    {
        if (!IsAdminRequest())
        {
            return Forbid();
        }

        var page = await _crawlerOrchestrator.GetPageAsync(pageId, ct);
        return page is null ? NotFound() : Ok(page);
    }

    [HttpGet("jobs/{jobId:guid}/issues")]
    public async Task<IActionResult> GetIssues(
        Guid jobId,
        [FromQuery] string? category = null,
        [FromQuery] string? severity = null,
        [FromQuery] string? code = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 100,
        CancellationToken ct = default)
    {
        if (!IsAdminRequest())
        {
            return Forbid();
        }

        var issues = await _crawlerOrchestrator.GetIssuesAsync(jobId, category, severity, code, page, pageSize, ct);
        return Ok(issues);
    }

    [HttpGet("jobs/{jobId:guid}/metrics")]
    public async Task<IActionResult> GetMetrics(Guid jobId, CancellationToken ct = default)
    {
        if (!IsAdminRequest())
        {
            return Forbid();
        }

        var metrics = await _crawlerOrchestrator.GetMetricsAsync(jobId, ct);
        return Ok(metrics);
    }

    [HttpGet("jobs/{jobId:guid}/report")]
    public async Task<IActionResult> GetReport(Guid jobId, [FromQuery] ReportFormat format = ReportFormat.Json, CancellationToken ct = default)
    {
        if (!IsAdminRequest())
        {
            return Forbid();
        }

        var report = await _crawlerOrchestrator.GenerateReportAsync(jobId, format, ct);
        if (report.RawData is not null)
        {
            return File(
                report.RawData,
                report.ContentType ?? "application/octet-stream",
                $"crawl-report-{jobId}-{DateTime.UtcNow:yyyyMMdd}.{format.ToString().ToLowerInvariant()}");
        }

        return Ok(report);
    }

    [HttpPost("jobs/{jobId:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid jobId, CancellationToken ct = default)
    {
        if (!IsAdminRequest())
        {
            return Forbid();
        }

        await _crawlerOrchestrator.CancelJobAsync(jobId, ct);
        return NoContent();
    }

    [HttpDelete("jobs/{jobId:guid}")]
    public async Task<IActionResult> Delete(Guid jobId, CancellationToken ct = default)
    {
        if (!IsAdminRequest())
        {
            return Forbid();
        }

        await _crawlerOrchestrator.DeleteJobAsync(jobId, ct);
        return NoContent();
    }

    private bool IsAdminRequest()
    {
        var email = User.FindFirst("email")?.Value
            ?? User.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value
            ?? string.Empty;
        return AuthAccessPolicy.IsConfiguredAdminEmail(_configuration, email);
    }
}
