using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("agent")]
[AllowAnonymous]
public sealed class AgentGatewayController : ControllerBase
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<AgentGatewayController> _logger;

    public AgentGatewayController(
        IHttpClientFactory httpClientFactory,
        ILogger<AgentGatewayController> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    // Contract expected by NuravenCorpLLM integrations.
    [HttpGet("tools/schema")]
    [HttpGet("router/schemas")]
    public async Task<IActionResult> GetToolsSchema(CancellationToken cancellationToken)
    {
        try
        {
            using var client = _httpClientFactory.CreateClient("PythonMatrixService");
            using var request = new HttpRequestMessage(HttpMethod.Get, "agent/router/schemas");
            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            return await ProxyJsonResponse(response, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Agent schema proxy failed.");
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                message = "Agent schema service is unavailable."
            });
        }
    }

    // Contract expected by NuravenCorpLLM integrations.
    [HttpPost("router/execute")]
    public async Task<IActionResult> ExecuteTool(
        [FromBody] JsonElement payload,
        CancellationToken cancellationToken)
    {
        try
        {
            var normalizedPayload = NormalizeExecutePayload(payload);
            using var client = _httpClientFactory.CreateClient("PythonMatrixService");
            using var request = new HttpRequestMessage(HttpMethod.Post, "agent/router/execute")
            {
                Content = new StringContent(normalizedPayload, Encoding.UTF8, "application/json")
            };

            ForwardHeaderIfPresent("X-NR-App-Key", request);
            ForwardHeaderIfPresent("X-Agent-Session", request);

            if (!Request.Headers.ContainsKey("X-Agent-Session")
                && payload.TryGetProperty("session", out var sessionElement)
                && sessionElement.ValueKind == JsonValueKind.String
                && !string.IsNullOrWhiteSpace(sessionElement.GetString()))
            {
                request.Headers.TryAddWithoutValidation("X-Agent-Session", sessionElement.GetString());
            }

            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            return await ProxyJsonResponse(response, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Agent execute proxy failed.");
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                message = "Agent execute service is unavailable."
            });
        }
    }

    private void ForwardHeaderIfPresent(string headerName, HttpRequestMessage outbound)
    {
        if (!Request.Headers.TryGetValue(headerName, out var value))
        {
            return;
        }

        var raw = value.ToString();
        if (!string.IsNullOrWhiteSpace(raw))
        {
            outbound.Headers.TryAddWithoutValidation(headerName, raw);
        }
    }

    private static string NormalizeExecutePayload(JsonElement payload)
    {
        if (payload.ValueKind != JsonValueKind.Object)
        {
            return "{\"tool_name\":\"\",\"arguments\":{}}";
        }

        // Already in python-matrix shape.
        if (payload.TryGetProperty("tool_name", out _))
        {
            return payload.GetRawText();
        }

        // Convert executor shape: { tool, session, args } -> { tool_name, arguments }
        var toolName = payload.TryGetProperty("tool", out var toolElement)
            && toolElement.ValueKind == JsonValueKind.String
            ? toolElement.GetString()
            : null;

        var args = payload.TryGetProperty("args", out var argsElement)
            && argsElement.ValueKind == JsonValueKind.Object
            ? argsElement
            : default;

        var normalized = new Dictionary<string, object?>
        {
            ["tool_name"] = toolName ?? string.Empty,
            ["arguments"] = args.ValueKind == JsonValueKind.Object
                ? JsonSerializer.Deserialize<Dictionary<string, object?>>(args.GetRawText())
                    ?? new Dictionary<string, object?>()
                : new Dictionary<string, object?>()
        };

        return JsonSerializer.Serialize(normalized);
    }

    private static async Task<IActionResult> ProxyJsonResponse(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        var raw = await response.Content.ReadAsStringAsync(cancellationToken);
        var contentType = response.Content.Headers.ContentType?.MediaType;

        if (string.Equals(contentType, "application/json", StringComparison.OrdinalIgnoreCase))
        {
            return new ContentResult
            {
                StatusCode = (int)response.StatusCode,
                ContentType = "application/json",
                Content = string.IsNullOrWhiteSpace(raw) ? "{}" : raw
            };
        }

        return new JsonResult(new { detail = raw })
        {
            StatusCode = (int)response.StatusCode
        };
    }
}

