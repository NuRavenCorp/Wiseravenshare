using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Shared;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/journalism-agent")]
[Authorize]
[Produces("application/json")]
public sealed class JournalismAgentController : ControllerBase
{
    private readonly IJournalismIntegrityAgentService _agent;
    private readonly ILogger<JournalismAgentController> _logger;

    public JournalismAgentController(
        IJournalismIntegrityAgentService agent,
        ILogger<JournalismAgentController> logger)
    {
        _agent = agent;
        _logger = logger;
    }

    /// <summary>
    /// Evaluates whether journalism content should be approved for publication
    /// based on integrity factors such as repetition, precedent, source evidence,
    /// language profile, and linked truth status.
    /// </summary>
    [HttpPost("evaluate")]
    public async Task<IActionResult> Evaluate(
        [FromBody] JournalismIntegrityEvaluationRequest request,
        CancellationToken cancellationToken)
    {
        if (request is null)
        {
            return BadRequest(new { message = "request body is required." });
        }

        // Must provide either report id, post id, or explicit content fields.
        var hasDirectContent = !string.IsNullOrWhiteSpace(request.Headline)
                               || !string.IsNullOrWhiteSpace(request.Description);
        if (string.IsNullOrWhiteSpace(request.ReportId)
            && string.IsNullOrWhiteSpace(request.PostId)
            && !hasDirectContent)
        {
            return BadRequest(new
            {
                message = "Provide reportId, postId, or content fields (headline/description)."
            });
        }

        var canApplyDecision = AuthAccessPolicy.IsAllAccessAdmin(User) || User.IsInRole("Admin");

        try
        {
            var result = request.ApplyDecision
                ? await _agent.EvaluateAndApplyAsync(request, canApplyDecision, cancellationToken)
                : await _agent.EvaluateAsync(request, cancellationToken);

            return Ok(new
            {
                reportId = result.ReportId,
                postId = result.PostId,
                overallScore = result.OverallScore,
                approvedForPublication = result.ApprovedForPublication,
                recommendedStatus = result.RecommendedStatus,
                reasons = result.Reasons,
                factors = result.Factors.Select(f => new
                {
                    name = f.Name,
                    weight = f.Weight,
                    reason = f.Reason
                }),
                messages = result.Messages,
                appliedToReport = result.AppliedToReport,
                evaluatedAtUtc = result.EvaluatedAtUtc
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Journalism integrity evaluation failed.");
            return StatusCode(StatusCodes.Status500InternalServerError, new
            {
                message = "Journalism integrity evaluation failed."
            });
        }
    }
}
