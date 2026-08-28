// Wiseravenshare.Server/Controllers/AiAssistantController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.Timeouts;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Services.AiAssistant;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class AiAssistantController : ControllerBase
{
    private readonly IOllamaChatService _chatService;
    private readonly IAiJobQueue _jobQueue;
    private readonly ILogger<AiAssistantController> _logger;

    public AiAssistantController(IOllamaChatService chatService, IAiJobQueue jobQueue, ILogger<AiAssistantController> logger)
    {
        _chatService = chatService;
        _jobQueue = jobQueue;
        _logger = logger;
    }

    /// <summary>Lists models available on the configured Ollama backend.</summary>
    [HttpGet("models")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetModels()
    {
        var models = await _chatService.GetModelsAsync();
        return Ok(new { models });
    }

    /// <summary>Sends a chat message (with optional history) to the AI assistant.</summary>
    [Authorize]
    [HttpPost("chat")]
    [ProducesResponseType(typeof(AiChatResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Chat([FromBody] AiChatRequest request)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.Message))
        {
            return BadRequest(new { message = "Message is required." });
        }

        var result = await _chatService.ChatAsync(request);
        return Ok(result);
    }

    /// <summary>
    /// Streams a chat reply token-by-token as server-sent events
    /// (text/event-stream). Each event body is a JSON string fragment.
    /// </summary>
    [Authorize]
    [HttpPost("chat/stream")]
    [RequestTimeout("StreamingPolicy")]
    [ProducesResponseType(typeof(void), StatusCodes.Status200OK)]
    public async Task ChatStream([FromBody] AiChatRequest request, CancellationToken ct)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.Message))
        {
            Response.StatusCode = StatusCodes.Status400BadRequest;
            await Response.WriteAsJsonAsync(new { message = "Message is required." }, ct);
            return;
        }

        Response.StatusCode = StatusCodes.Status200OK;
        Response.ContentType = "text/event-stream";

        await foreach (var token in _chatService.ChatStreamAsync(request, ct))
        {
            await Response.WriteAsync($"data: {System.Text.Json.JsonSerializer.Serialize(token)}\n\n", ct);
        }

        await Response.WriteAsync("data: [DONE]\n\n", ct);
    }

    // ---- Background AI jobs (queue + poll) — for bursty creator features ----

    /// <summary>Enqueues a background AI generation and returns the job id to poll.</summary>
    [Authorize]
    [HttpPost("jobs")]
    [ProducesResponseType(typeof(object), StatusCodes.Status202Accepted)]
    public IActionResult EnqueueJob([FromBody] AiChatRequest request)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.Message))
        {
            return BadRequest(new { message = "Message is required." });
        }

        try
        {
            var jobId = _jobQueue.Enqueue(request);
            var snapshot = _jobQueue.Get(jobId)!;
            // 202 Accepted; cached jobs are already Succeeded and carry their reply.
            return AcceptedAtAction(nameof(GetJob), new { jobId }, snapshot);
        }
        catch (ArgumentException)
        {
            return BadRequest(new { message = "Message is required." });
        }
    }

    /// <summary>Polls the status/result of a background AI job.</summary>
    [Authorize]
    [HttpGet("jobs/{jobId:guid}")]
    [ProducesResponseType(typeof(AiJobSnapshot), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public IActionResult GetJob(Guid jobId)
    {
        var snapshot = _jobQueue.Get(jobId);
        return snapshot is null ? NotFound() : Ok(snapshot);
    }
}
