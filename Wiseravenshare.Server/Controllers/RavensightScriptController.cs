using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/ravensight/scripts")]
[Authorize]
public sealed class RavensightScriptController : ControllerBase
{
    private readonly VideoFeedCollaborationService _collaborationService;
    private readonly IOpenAIService _openAiService;
    private readonly ILogger<RavensightScriptController> _logger;

    public RavensightScriptController(
        VideoFeedCollaborationService collaborationService,
        IOpenAIService openAiService,
        ILogger<RavensightScriptController> logger)
    {
        _collaborationService = collaborationService;
        _openAiService = openAiService;
        _logger = logger;
    }

    [HttpGet("{feedId}")]
    public IActionResult GetWorkspace(string feedId, [FromQuery] string title = "")
    {
        var workspace = _collaborationService.GetOrCreateWorkspace(feedId, title);
        return Ok(workspace);
    }

    [HttpPost("{feedId}/lines")]
    public IActionResult UpsertLine(string feedId, [FromQuery] string title, [FromBody] UpsertVideoFeedScriptLineRequest request)
    {
        if (request is null)
        {
            return BadRequest(new { message = "Script line payload is required." });
        }

        if (string.IsNullOrWhiteSpace(request.Text))
        {
            return BadRequest(new { message = "Line text is required." });
        }

        ResolveActor(out var actorUserId, out var actorEmail);
        var workspace = _collaborationService.UpsertLine(feedId, title, request, actorUserId, actorEmail);
        return Ok(workspace);
    }

    [HttpDelete("{feedId}/lines/{lineId}")]
    public IActionResult DeleteLine(string feedId, string lineId)
    {
        var workspace = _collaborationService.DeleteLine(feedId, lineId);
        if (workspace is null)
        {
            return NotFound(new { message = "Workspace or line not found." });
        }

        return Ok(workspace);
    }

    [HttpPost("{feedId}/ai-suggest")]
    public async Task<IActionResult> SuggestNextLine(string feedId, [FromBody] VideoFeedAiSuggestRequest request)
    {
        var workspace = _collaborationService.GetOrCreateWorkspace(feedId, request.FeedTitle ?? string.Empty);
        var contextLines = workspace.Lines
            .OrderBy(line => line.Sequence)
            .TakeLast(8)
            .Select(line => $"[{line.Sequence}] {line.Speaker}: {line.Text}")
            .ToList();

        var prompt = BuildScriptPrompt(request, contextLines);
        string generated;

        try
        {
            generated = (await _openAiService.GenerateAsync(prompt))?.Trim() ?? string.Empty;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "AI suggestion generation failed for feed {FeedId}.", feedId);
            generated = string.Empty;
        }

        if (string.IsNullOrWhiteSpace(generated) || generated == "{}")
        {
            generated = BuildFallbackSuggestion(request, workspace);
        }

        ResolveActor(out var actorUserId, out var actorEmail);

        var line = new UpsertVideoFeedScriptLineRequest
        {
            Sequence = workspace.Lines.Count == 0 ? 1 : workspace.Lines.Max(item => item.Sequence) + 1,
            Speaker = string.IsNullOrWhiteSpace(request.SpeakerHint) ? "AI Writer" : request.SpeakerHint.Trim(),
            Text = generated,
            Status = "suggested",
            ContributorName = "AI Writer"
        };

        var updatedWorkspace = _collaborationService.UpsertLine(feedId, request.FeedTitle ?? string.Empty, line, actorUserId, actorEmail);
        return Ok(new
        {
            suggestedLine = generated,
            workspace = updatedWorkspace
        });
    }

    private static string BuildScriptPrompt(VideoFeedAiSuggestRequest request, IReadOnlyList<string> contextLines)
    {
        var topic = string.IsNullOrWhiteSpace(request.Topic) ? "video script" : request.Topic.Trim();
        var tone = string.IsNullOrWhiteSpace(request.Tone) ? "clear and energetic" : request.Tone.Trim();
        var audience = string.IsNullOrWhiteSpace(request.Audience) ? "general audience" : request.Audience.Trim();

        return $"""
You are helping a collaborative video script room.
Write exactly one short line (one sentence) for the next script beat.
Topic: {topic}
Tone: {tone}
Audience: {audience}
Current script context:
{string.Join("\n", contextLines)}
Return plain text only.
""";
    }

    private static string BuildFallbackSuggestion(VideoFeedAiSuggestRequest request, VideoFeedScriptWorkspace workspace)
    {
        var topic = string.IsNullOrWhiteSpace(request.Topic) ? "this segment" : request.Topic.Trim();
        var tone = string.IsNullOrWhiteSpace(request.Tone) ? "clear" : request.Tone.Trim().ToLowerInvariant();
        var lastLine = workspace.Lines.OrderBy(line => line.Sequence).LastOrDefault()?.Text ?? string.Empty;

        if (string.IsNullOrWhiteSpace(lastLine))
        {
            return $"Welcome back, in this part we break down {topic} into one practical step you can use today.";
        }

        return $"Building on that, the next key point about {topic} is to keep the approach {tone} and actionable for the team.";
    }

    private void ResolveActor(out string actorUserId, out string actorEmail)
    {
        actorUserId = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue("sub")
            ?? "unknown-user";
        actorEmail = User.FindFirstValue(ClaimTypes.Email)
            ?? User.FindFirstValue("email")
            ?? "unknown@wise-ravens.com";
    }
}

public sealed class VideoFeedAiSuggestRequest
{
    public string FeedTitle { get; set; } = string.Empty;
    public string Topic { get; set; } = string.Empty;
    public string Tone { get; set; } = string.Empty;
    public string Audience { get; set; } = string.Empty;
    public string SpeakerHint { get; set; } = string.Empty;
}
