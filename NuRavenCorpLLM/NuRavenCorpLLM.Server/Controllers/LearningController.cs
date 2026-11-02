using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NuRavenCorpLLM.Application.Services.Learning;
using NuRavenCorpLLM.Infrastructure.Security;

namespace NuRavenCorpLLM.Controllers;

[ApiController]
[Route("api/learning")]
[Produces("application/json")]
public class LearningController : ControllerBase
{
    private readonly ILearningPipelineConduit _conduit;

    public LearningController(ILearningPipelineConduit conduit)
    {
        _conduit = conduit;
    }

    [HttpPost("conduit")]
    [AllowAnonymous]
    public async Task<IActionResult> Submit([FromBody] LearningConduitRequestDto dto, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(dto.Section))
        {
            return BadRequest("Section is required.");
        }

        if (string.IsNullOrWhiteSpace(dto.Message))
        {
            return BadRequest("Message is required.");
        }

        var submission = new LearningConduitSubmission(
            SubmissionId: Guid.NewGuid(),
            UserId: User.GetUserId(),
            Name: dto.Name?.Trim(),
            Section: dto.Section.Trim(),
            Message: dto.Message.Trim(),
            CreatedAtUtc: DateTime.UtcNow);

        await _conduit.QueueAsync(submission, ct);
        return Accepted(new { submissionId = submission.SubmissionId });
    }

    public record LearningConduitRequestDto(string? Name, string Section, string Message);
}
