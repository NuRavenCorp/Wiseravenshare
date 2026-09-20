// Wiseravenshare.Server/Controllers/AiAssistantController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.Timeouts;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services;
using Wiseravenshare.Server.Services.AiAssistant;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class AiAssistantController : ControllerBase
{
    private readonly IOllamaChatService _defaultChatService;
    private readonly IUserAiConnectorChatService _userConnectorChatService;
    private readonly UserStore _userStore;
    private readonly IAiJobQueue _jobQueue;
    private readonly ILogger<AiAssistantController> _logger;

    public AiAssistantController(
        IOllamaChatService defaultChatService,
        IUserAiConnectorChatService userConnectorChatService,
        UserStore userStore,
        IAiJobQueue jobQueue,
        ILogger<AiAssistantController> logger)
    {
        _defaultChatService = defaultChatService;
        _userConnectorChatService = userConnectorChatService;
        _userStore = userStore;
        _jobQueue = jobQueue;
        _logger = logger;
    }

    [Authorize]
    [HttpGet("connector")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public IActionResult GetConnectorSettings()
    {
        var userId = CurrentUserId();
        if (string.IsNullOrWhiteSpace(userId))
        {
            return Unauthorized();
        }

        try
        {
            var settings = _userStore.GetAiConnectorSettings(userId);
            return Ok(new
            {
                settings.Enabled,
                settings.Provider,
                settings.BaseUrl,
                settings.DefaultModel,
                hasApiKey = settings.HasApiKey,
                apiKeyMasked = settings.ApiKeyMasked,
                settings.UpdatedAtUtc
            });
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "User not found." });
        }
    }

    [Authorize]
    [HttpPut("connector")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public IActionResult UpdateConnectorSettings([FromBody] UpdateUserAiConnectorRequest request)
    {
        var userId = CurrentUserId();
        if (string.IsNullOrWhiteSpace(userId))
        {
            return Unauthorized();
        }

        if (request is null)
        {
            return BadRequest(new { message = "Connector settings payload is required." });
        }

        if (request.Enabled && string.IsNullOrWhiteSpace(request.BaseUrl))
        {
            return BadRequest(new { message = "Base URL is required when connector is enabled." });
        }

        try
        {
            var settings = _userStore.UpdateAiConnectorSettings(userId, request);
            return Ok(new
            {
                settings.Enabled,
                settings.Provider,
                settings.BaseUrl,
                settings.DefaultModel,
                hasApiKey = settings.HasApiKey,
                apiKeyMasked = settings.ApiKeyMasked,
                settings.UpdatedAtUtc
            });
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "User not found." });
        }
        catch (InvalidOperationException ex)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = ex.Message });
        }
    }

    /// <summary>Health check + initializes Ollama connection. Called when AI Assistant page loads.</summary>
    [HttpGet("health")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> Health()
    {
        var connector = ResolveCurrentUserConnectorSettings();
        var usingConnector = _userConnectorChatService.IsConfigured(connector);

        try
        {
            var models = usingConnector
                ? await _userConnectorChatService.GetModelsAsync(connector!)
                : await _defaultChatService.GetModelsAsync();

            var isOnline = models.Count > 0;
            var provider = usingConnector
                ? (connector?.Provider ?? "user-ai")
                : "platform-default";
            
            if (!isOnline)
            {
                _logger.LogWarning("AI health check: no models available for provider {Provider}", provider);
                return StatusCode(503, new 
                { 
                    online = false, 
                    message = usingConnector
                        ? "Your AI connector is not ready yet."
                        : "AI backend is not ready yet.",
                    provider,
                    usingUserConnector = usingConnector
                });
            }

            return Ok(new 
            { 
                online = true, 
                message = usingConnector ? "Your AI connector is online and ready" : "AI backend is online and ready", 
                modelCount = models.Count,
                models = models,
                provider,
                usingUserConnector = usingConnector
            });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "AI health check failed");
            return StatusCode(503, new 
            { 
                online = false, 
                message = usingConnector
                    ? "Your AI connector is offline. Check your URL/key and try again."
                    : "AI backend is offline. Please try again.",
                provider = usingConnector ? (connector?.Provider ?? "user-ai") : "platform-default",
                usingUserConnector = usingConnector,
                error = ex.Message 
            });
        }
    }

    /// <summary>Lists models available on the configured Ollama backend.</summary>
    [HttpGet("models")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetModels()
    {
        var connector = ResolveCurrentUserConnectorSettings();
        var usingConnector = _userConnectorChatService.IsConfigured(connector);
        var models = usingConnector
            ? await _userConnectorChatService.GetModelsAsync(connector!)
            : await _defaultChatService.GetModelsAsync();
        return Ok(new
        {
            models,
            provider = usingConnector ? (connector?.Provider ?? "user-ai") : "platform-default",
            usingUserConnector = usingConnector
        });
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

        var connector = ResolveCurrentUserConnectorSettings();
        var usingConnector = _userConnectorChatService.IsConfigured(connector);
        AiChatResponse result;

        if (usingConnector)
        {
            result = await _userConnectorChatService.ChatAsync(request, connector!);
            if (!result.Success)
            {
                _logger.LogWarning("User AI connector chat failed. Falling back to platform provider.");
                result = await _defaultChatService.ChatAsync(request);
            }
        }
        else
        {
            result = await _defaultChatService.ChatAsync(request);
        }

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

        var connector = ResolveCurrentUserConnectorSettings();
        var usingConnector = _userConnectorChatService.IsConfigured(connector);

        var stream = usingConnector
            ? _userConnectorChatService.ChatStreamAsync(request, connector!, ct)
            : _defaultChatService.ChatStreamAsync(request, ct);

        await foreach (var token in stream)
        {
            await Response.WriteAsync($"data: {System.Text.Json.JsonSerializer.Serialize(token)}\n\n", ct);
        }

        await Response.WriteAsync("data: [DONE]\n\n", ct);
    }

    private string CurrentUserId()
    {
        return User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue("sub")
            ?? string.Empty;
    }

    private UserAiConnectorSettings? ResolveCurrentUserConnectorSettings()
    {
        var userId = CurrentUserId();
        if (string.IsNullOrWhiteSpace(userId))
        {
            return null;
        }

        try
        {
            return _userStore.GetAiConnectorSettingsInternal(userId);
        }
        catch
        {
            return null;
        }
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
