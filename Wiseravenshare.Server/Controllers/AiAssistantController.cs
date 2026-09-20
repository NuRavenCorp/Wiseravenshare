// Wiseravenshare.Server/Controllers/AiAssistantController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.Timeouts;
using Microsoft.AspNetCore.Mvc;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services;
using Wiseravenshare.Server.Services.AiAssistant;

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
    private readonly UserStore _userStore;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<AiAssistantController> _logger;

    public AiAssistantController(
        IOllamaChatService chatService,
        IAiJobQueue jobQueue,
        ISiteCrawlerService siteCrawlerService,
        IContentCrawlerService contentCrawlerService,
        IConfiguration configuration,
        UserStore userStore,
        IHttpClientFactory httpClientFactory,
        ILogger<AiAssistantController> logger)
    {
        _chatService = chatService;
        _jobQueue = jobQueue;
        _siteCrawlerService = siteCrawlerService;
        _contentCrawlerService = contentCrawlerService;
        _configuration = configuration;
        _userStore = userStore;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    /// <summary>Health check for the active AI provider. Called when the AI Assistant page loads.</summary>
    [HttpGet("health")]
    [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> Health()
    {
        try
        {
            var provider = (_configuration["AiProvider"] ?? "digitalocean").Trim();
            var models = await _chatService.GetModelsAsync();
            var isOnline = models.Count > 0;
            
            if (!isOnline)
            {
                var hasPlatformConfig = IsPlatformAiConfigured(provider);
                if (hasPlatformConfig)
                {
                    _logger.LogWarning("AI provider model discovery returned no models for provider {Provider}, but configuration is present.", provider);
                    return Ok(new
                    {
                        online = true,
                        message = "AI connector is configured. Model discovery may still be warming up.",
                        provider,
                        modelCount = 0,
                        models = Array.Empty<string>(),
                        degraded = true
                    });
                }

                // Platform key not configured — check if this user has their own connector set up.
                var userConnector = TryGetUserConnector();
                if (userConnector is { Enabled: true, HasApiKey: true })
                {
                    return Ok(new
                    {
                        online = true,
                        message = "Using your personal AI connector.",
                        provider = userConnector.Provider,
                        usingUserConnector = true,
                        modelCount = 1,
                        models = new[] { userConnector.DefaultModel.Length > 0 ? userConnector.DefaultModel : "custom" }
                    });
                }

                _logger.LogWarning("AI provider health check: no models available for provider {Provider}", provider);
                return StatusCode(503, new 
                { 
                    online = false, 
                    message = "AI backend is not configured. Add an API key in Settings → AI Connector, or ask your admin to set DO_GRADIENT_INFERENCE_KEY and redeploy.",
                    provider,
                    configured = false
                });
            }

            return Ok(new 
            { 
                online = true, 
                message = "AI assistant is online and ready",
                provider,
                modelCount = models.Count,
                models = models
            });
        }
        catch (Exception ex)
        {
            var provider = (_configuration["AiProvider"] ?? "digitalocean").Trim();
            _logger.LogWarning(ex, "AI provider health check failed for provider {Provider}", provider);
            return StatusCode(503, new 
            { 
                online = false, 
                message = "The AI assistant is unavailable right now. Please try again in a moment.",
                provider,
                error = ex.Message 
            });
        }
    }

    private bool IsPlatformAiConfigured(string provider)
    {
        var normalized = (provider ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized is "gradient" or "deepseek" or "digitalocean" or "dochatbot" or "do-chatbot")
        {
            var key = FirstNonEmpty(
                _configuration["Gradient:InferenceKey"],
                _configuration["DO_GRADIENT_INFERENCE_KEY"],
                _configuration["GRADIENT_INFERENCE_KEY"],
                _configuration["DIGITALOCEAN_AI_INFERENCE_KEY"],
                _configuration["OPENAI_API_KEY"]);
            return !string.IsNullOrWhiteSpace(key);
        }

        if (normalized is "llamacpp" or "llama.cpp" or "llama-cpp" or "local")
        {
            var baseUrl = FirstNonEmpty(_configuration["Ollama:BaseUrl"], _configuration["OLLAMA_BASE_URL"]);
            return !string.IsNullOrWhiteSpace(baseUrl);
        }

        return false;
    }

    private static string FirstNonEmpty(params string?[] values)
    {
        foreach (var value in values)
        {
            var trimmed = (value ?? string.Empty).Trim();
            if (!string.IsNullOrWhiteSpace(trimmed))
            {
                return trimmed;
            }
        }

        return string.Empty;
    }

    /// <summary>Lists models available on the configured AI backend.</summary>
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

        // If platform AI is not configured, fall back to the user's own connector.
        if (!result.Success && TryGetUserConnector() is { Enabled: true, HasApiKey: true } connector)
        {
            result = await UserConnectorChatAsync(connector, enrichedRequest, HttpContext.RequestAborted);
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

        var enrichedRequest = await BuildCrawlerAwareRequestAsync(request, ct);
        var emittedAny = false;

        try
        {
            await foreach (var token in _chatService.ChatStreamAsync(enrichedRequest, ct))
            {
                if (string.IsNullOrWhiteSpace(token))
                    continue;

                emittedAny = true;
                await Response.WriteAsync($"data: {JsonSerializer.Serialize(token)}\n\n", ct);
                await Response.Body.FlushAsync(ct);
            }

            if (!emittedAny)
            {
                // Try platform non-streaming fallback first.
                var fallback = await _chatService.ChatAsync(enrichedRequest);

                // If platform has no key, try the user's own connector.
                if (!fallback.Success && TryGetUserConnector() is { Enabled: true, HasApiKey: true } connector)
                {
                    fallback = await UserConnectorChatAsync(connector, enrichedRequest, ct);
                }

                if (!string.IsNullOrWhiteSpace(fallback.Reply))
                {
                    emittedAny = true;
                    await Response.WriteAsync($"data: {JsonSerializer.Serialize(fallback.Reply)}\n\n", ct);
                    await Response.Body.FlushAsync(ct);
                }
                else if (!string.IsNullOrWhiteSpace(fallback.Error))
                {
                    emittedAny = true;
                    await Response.WriteAsync($"data: {JsonSerializer.Serialize(fallback.Error)}\n\n", ct);
                    await Response.Body.FlushAsync(ct);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // client disconnected or request aborted
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "AI stream request failed.");
            if (!Response.HasStarted)
            {
                Response.StatusCode = StatusCodes.Status500InternalServerError;
            }
            else
            {
                await Response.WriteAsync($"data: {JsonSerializer.Serialize("The AI assistant is unavailable right now.")}\n\n", ct);
                await Response.Body.FlushAsync(ct);
            }
        }
        finally
        {
            if (!ct.IsCancellationRequested)
            {
                await Response.WriteAsync("data: [DONE]\n\n", ct);
                await Response.Body.FlushAsync(ct);
            }
        }
    }

    // ---- Background AI jobs (queue + poll) — for bursty creator features ----

    /// <summary>Enqueues a background AI generation and returns the job id to poll.</summary>
    [Authorize]
    [HttpPost("jobs")]
    [ProducesResponseType(typeof(object), StatusCodes.Status202Accepted)]
    public async Task<IActionResult> EnqueueJob([FromBody] AiChatRequest request)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.Message))
        {
            return BadRequest(new { message = "Message is required." });
        }

        try
        {
            var enrichedRequest = await BuildCrawlerAwareRequestAsync(request, HttpContext.RequestAborted);
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
        if (!request.UseCrawlerContext)
        {
            return request;
        }

        var contextBlock = await BuildCrawlerContextBlockAsync(ct);
        if (string.IsNullOrWhiteSpace(contextBlock))
        {
            return request;
        }

        return new AiChatRequest
        {
            Message = $"{contextBlock}\n\nUser question:\n{request.Message}",
            History = request.History,
            Model = request.Model,
            UseCrawlerContext = request.UseCrawlerContext
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

        sb.AppendLine($"- Site crawler indexed pages: {summary.TotalPages}");
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

        return AuthAccessPolicy.IsConfiguredAdminEmail(_configuration, email);
    }

    // ---- User AI connector (personal API key support) ----

    /// <summary>Returns the current user's AI connector settings (API key is masked).</summary>
    [Authorize]
    [HttpGet("connector")]
    public IActionResult GetConnector()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (string.IsNullOrWhiteSpace(userId))
            return Unauthorized();

        try
        {
            var settings = _userStore.GetAiConnectorSettings(userId);
            return Ok(new
            {
                enabled = settings.Enabled,
                provider = settings.Provider,
                baseUrl = settings.BaseUrl,
                defaultModel = settings.DefaultModel,
                hasApiKey = settings.HasApiKey,
                apiKeyMasked = settings.ApiKeyMasked
            });
        }
        catch (KeyNotFoundException)
        {
            return Ok(new { enabled = false, provider = "openai", baseUrl = "", defaultModel = "", hasApiKey = false, apiKeyMasked = "" });
        }
    }

    /// <summary>Saves the current user's AI connector settings.</summary>
    [Authorize]
    [HttpPut("connector")]
    public IActionResult UpdateConnector([FromBody] UpdateUserAiConnectorRequest request)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (string.IsNullOrWhiteSpace(userId))
            return Unauthorized();

        try
        {
            var updated = _userStore.UpdateAiConnectorSettings(userId, request);
            return Ok(new
            {
                enabled = updated.Enabled,
                provider = updated.Provider,
                baseUrl = updated.BaseUrl,
                defaultModel = updated.DefaultModel,
                hasApiKey = updated.HasApiKey,
                apiKeyMasked = updated.ApiKeyMasked
            });
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "User not found." });
        }
    }

    /// <summary>Returns the user's AI connector settings if they are configured and enabled.</summary>
    private UserAiConnectorSettings? TryGetUserConnector()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (string.IsNullOrWhiteSpace(userId))
            return null;

        try
        {
            var settings = _userStore.GetAiConnectorSettingsInternal(userId);
            if (settings is { Enabled: true, HasApiKey: true })
                return settings;
        }
        catch { /* user not found or store unavailable */ }

        return null;
    }

    /// <summary>
    /// Makes a single non-streaming chat request to the user's own OpenAI-compatible connector.
    /// </summary>
    private async Task<AiChatResponse> UserConnectorChatAsync(
        UserAiConnectorSettings connector,
        AiChatRequest request,
        CancellationToken ct)
    {
        try
        {
            var baseUrl = connector.BaseUrl.TrimEnd('/');
            if (string.IsNullOrWhiteSpace(baseUrl))
                baseUrl = "https://api.openai.com/v1";

            var model = string.IsNullOrWhiteSpace(request.Model)
                ? (string.IsNullOrWhiteSpace(connector.DefaultModel) ? "gpt-4o-mini" : connector.DefaultModel)
                : request.Model;

            var messages = new List<object>
            {
                new { role = "system", content = "You are the Wiseravenshare Assistant. Help users with platform questions about posting, feeds, profiles, and features. Be concise and practical." }
            };

            if (request.History is { Count: > 0 })
            {
                foreach (var h in request.History.TakeLast(12))
                {
                    var role = h.Role?.ToLowerInvariant() is "assistant" or "ai" ? "assistant" : "user";
                    messages.Add(new { role, content = h.Content ?? "" });
                }
            }
            messages.Add(new { role = "user", content = request.Message ?? "" });

            var payload = new { model, messages, stream = false, temperature = 0.6, max_tokens = 700 };

            var http = _httpClientFactory.CreateClient();
            using var httpRequest = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/chat/completions")
            {
                Content = JsonContent.Create(payload)
            };
            httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", connector.ApiKey);
            httpRequest.Headers.Add("User-Agent", "Wiseravenshare/1.0");

            using var response = await http.SendAsync(httpRequest, ct);
            var body = await response.Content.ReadAsStringAsync(ct);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("User connector chat failed ({Status}): {Body}", (int)response.StatusCode, body);
                return new AiChatResponse { Success = false, Error = "Your AI connector returned an error. Check your API key and endpoint." };
            }

            using var doc = JsonDocument.Parse(body);
            var reply = doc.RootElement.TryGetProperty("choices", out var choices)
                && choices.ValueKind == JsonValueKind.Array
                && choices.GetArrayLength() > 0
                && choices[0].TryGetProperty("message", out var msg)
                && msg.TryGetProperty("content", out var content)
                ? content.GetString() ?? string.Empty
                : string.Empty;

            return new AiChatResponse { Success = true, Reply = reply.Trim(), Model = model };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "User connector chat threw unexpectedly.");
            return new AiChatResponse { Success = false, Error = "User AI connector request failed." };
        }
    }
}
