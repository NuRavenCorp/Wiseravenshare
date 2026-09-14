// Wiseravenshare.Server/Controllers/AiAssistantController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.Timeouts;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using System.Text;
using Wiseravenshare.Server.Services.AiAssistant;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class AiAssistantController : ControllerBase
{
    private readonly IOllamaChatService _chatService;
    private readonly IAiJobQueue _jobQueue;
    private readonly ISiteCrawlerService _siteCrawlerService;
    private readonly IContentCrawlerService _contentCrawlerService;
    private readonly IConfiguration _configuration;
    private readonly ILogger<AiAssistantController> _logger;

    public AiAssistantController(
        IOllamaChatService chatService,
        IAiJobQueue jobQueue,
        ISiteCrawlerService siteCrawlerService,
        IContentCrawlerService contentCrawlerService,
        IConfiguration configuration,
        ILogger<AiAssistantController> logger)
    {
        _chatService = chatService;
        _jobQueue = jobQueue;
        _siteCrawlerService = siteCrawlerService;
        _contentCrawlerService = contentCrawlerService;
        _configuration = configuration;
        _logger = logger;
    }

    /// <summary>Health check + initializes Ollama connection. Called when AI Assistant page loads.</summary>
    [HttpGet("health")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> Health()
    {
        try
        {
            var models = await _chatService.GetModelsAsync();
            var isOnline = models.Count > 0;
            
            if (!isOnline)
            {
                _logger.LogWarning("Ollama health check: no models available");
                return StatusCode(503, new 
                { 
                    online = false, 
                    message = "Ollama is not ready yet. Please wait or ensure Ollama is running." 
                });
            }

            return Ok(new 
            { 
                online = true, 
                message = "Ollama is online and ready", 
                modelCount = models.Count,
                models = models
            });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Ollama health check failed");
            return StatusCode(503, new 
            { 
                online = false, 
                message = "Ollama is offline. Please start Ollama and try again.",
                error = ex.Message 
            });
        }
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

        var enrichedRequest = await BuildCrawlerAwareRequestAsync(request, HttpContext.RequestAborted);
        var result = await _chatService.ChatAsync(enrichedRequest);
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

        var enrichedRequest = await BuildCrawlerAwareRequestAsync(request, ct);
        await foreach (var token in _chatService.ChatStreamAsync(enrichedRequest, ct))
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
            var enrichedRequest = BuildCrawlerAwareRequestAsync(request, HttpContext.RequestAborted).GetAwaiter().GetResult();
            var jobId = _jobQueue.Enqueue(enrichedRequest);
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

    private async Task<AiChatRequest> BuildCrawlerAwareRequestAsync(AiChatRequest request, CancellationToken ct)
    {
        var contextBlock = await BuildCrawlerContextBlockAsync(ct);
        if (string.IsNullOrWhiteSpace(contextBlock))
        {
            return request;
        }

        return new AiChatRequest
        {
            Message = $"{contextBlock}\n\nUser question:\n{request.Message}",
            History = request.History,
            Model = request.Model
        };
    }

    private async Task<string> BuildCrawlerContextBlockAsync(CancellationToken ct)
    {
        try
        {
            var sb = new StringBuilder();
            sb.AppendLine("Use this live Wiseravenshare crawler context when answering:");

            if (IsAdminRequest())
            {
                var siteSummary = await _siteCrawlerService.GetSummaryAsync(null, "core", ct);
                AppendSiteSummary(sb, siteSummary);
            }

            var contentSummary = await _contentCrawlerService.GetTrendingAsync(null, null, 6, ct);
            if (contentSummary.TrendingContent.Count > 0)
            {
                sb.AppendLine("- Trending content:");
                foreach (var item in contentSummary.TrendingContent.Take(5))
                {
                    sb.AppendLine($"  - {item.ContentType}: {item.Title} (engagement={item.EngagementCount}, score={item.TrendingScore:0.###})");
                }
            }

            if (contentSummary.EmergingTopics.Count > 0)
            {
                sb.AppendLine($"- Emerging topics: {string.Join(", ", contentSummary.EmergingTopics.Take(8))}");
            }

            return sb.ToString().Trim();
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Unable to enrich AI request with crawler context.");
            return string.Empty;
        }
    }

    private static void AppendSiteSummary(StringBuilder sb, SiteCrawlerSummaryDto? summary)
    {
        if (summary is null)
        {
            return;
        }

        sb.AppendLine($"- Site crawler indexed pages: {summary.TotalIndexedPages}");
        if (summary.TopConnectedPages.Count > 0)
        {
            sb.AppendLine("- Top connected pages:");
            foreach (var page in summary.TopConnectedPages.Take(5))
            {
                sb.AppendLine($"  - {page.PageId}: {page.Label} [{page.Category}] score={page.Score:0.###}");
            }
        }

        if (summary.RelatedInCategory.Count > 0)
        {
            sb.AppendLine("- Related pages:");
            foreach (var page in summary.RelatedInCategory.Take(4))
            {
                sb.AppendLine($"  - {page.PageId}: {page.Label} [{page.Category}]");
            }
        }
    }

    private bool IsAdminRequest()
    {
        var email = User.FindFirstValue(ClaimTypes.Email)
            ?? User.FindFirstValue("email")
            ?? string.Empty;

        if (string.IsNullOrWhiteSpace(email))
        {
            return false;
        }

        var configuredAdminEmails = _configuration.GetSection("Admin:Emails").Get<string[]>() ?? [];
        if (configuredAdminEmails.Any(value => string.Equals(value?.Trim(), email, StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        var configuredAuthUsers = _configuration.GetSection("Authentication:Users").GetChildren()
            .Select(section => section["Email"]?.Trim())
            .Where(value => !string.IsNullOrWhiteSpace(value));

        return configuredAuthUsers.Any(value => string.Equals(value, email, StringComparison.OrdinalIgnoreCase));
    }
}
