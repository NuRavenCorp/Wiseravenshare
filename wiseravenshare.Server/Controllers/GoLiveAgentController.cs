using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Wiseravenshare.Server.Controllers;

/// <summary>
/// Proxies GoLive sessions to NuRavenCorpLLM (platform = GoLive).
/// WiseRavenShare's existing LiveController continues to own overlays,
/// stream control, and all real-time additions — this controller only
/// manages the agent session lifecycle and event loop.
/// </summary>
[ApiController]
[Route("api/live/agent")]
[Authorize]
public sealed class GoLiveAgentController : ControllerBase
{
    private static readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web);

    private readonly IHttpClientFactory _http;
    private readonly IConfiguration _cfg;
    private readonly ILogger<GoLiveAgentController> _logger;

    public GoLiveAgentController(
        IHttpClientFactory http,
        IConfiguration cfg,
        ILogger<GoLiveAgentController> logger)
    {
        _http = http;
        _cfg = cfg;
        _logger = logger;
    }

    // ── POST /api/live/agent/sessions ─────────────────────────────────────────
    [HttpPost("sessions")]
    public async Task<IActionResult> StartSession(
        [FromBody] StartGoLiveAgentSessionRequest request,
        CancellationToken ct)
    {
        var agentToken = await ExchangeCrossAppTokenAsync(ct);
        if (agentToken is null)
        {
            _logger.LogWarning("NuRavenCorpLLM unreachable; issuing offline stub GoLive session.");
            return Ok(new { sessionId = $"offline-{Guid.NewGuid():N}", offline = true });
        }

        var body = JsonSerializer.Serialize(new
        {
            platform     = "GoLive",
            externalRef  = request.BroadcastId?.Trim(),
            extensionKey = "wiseravenshare"
        });

        try
        {
            using var resp = await PostNuRavenAsync("/api/media-agent/sessions", body, agentToken, ct);

            if (!resp.IsSuccessStatusCode)
            {
                var err = await resp.Content.ReadAsStringAsync(ct);
                _logger.LogWarning("NuRavenCorpLLM GoLive session start returned {Status}: {Err}",
                    resp.StatusCode, err);
                return Ok(new { sessionId = $"offline-{Guid.NewGuid():N}", offline = true });
            }

            var payload = await resp.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(payload);
            var sessionId = doc.RootElement.TryGetProperty("sessionId", out var sid)
                ? sid.GetString() : null;

            if (string.IsNullOrWhiteSpace(sessionId))
            {
                _logger.LogWarning("NuRavenCorpLLM returned no sessionId for GoLive; using offline stub.");
                return Ok(new { sessionId = $"offline-{Guid.NewGuid():N}", offline = true });
            }

            await BootstrapInternalAsync(sessionId, agentToken, ct);
            return Ok(new { sessionId, offline = false });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "NuRavenCorpLLM GoLive session start failed; using offline stub.");
            return Ok(new { sessionId = $"offline-{Guid.NewGuid():N}", offline = true });
        }
    }

    // ── POST /api/live/agent/sessions/{id}/event ──────────────────────────────
    [HttpPost("sessions/{sessionId}/event")]
    public async Task<IActionResult> SendEvent(
        string sessionId,
        [FromBody] GoLiveAgentEventRequest request,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Input))
            return BadRequest(new { message = "input is required." });

        if (sessionId.StartsWith("offline-", StringComparison.Ordinal))
            return Ok(new { text = (string?)null, toolResults = Array.Empty<object>(), hasError = false, offline = true });

        var agentToken = await ExchangeCrossAppTokenAsync(ct);
        if (agentToken is null)
            return Ok(new { text = (string?)null, toolResults = Array.Empty<object>(), hasError = true });

        var body = JsonSerializer.Serialize(new { input = request.Input.Trim() });

        try
        {
            using var resp = await PostNuRavenAsync(
                $"/api/media-agent/sessions/{Uri.EscapeDataString(sessionId)}/event",
                body, agentToken, ct);

            var payload = await resp.Content.ReadAsStringAsync(ct);

            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogWarning("NuRavenCorpLLM GoLive event returned {Status} for session {SessionId}",
                    resp.StatusCode, sessionId);
                return Ok(new { text = (string?)null, toolResults = Array.Empty<object>(), hasError = true });
            }

            return Content(payload, "application/json");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "NuRavenCorpLLM GoLive event call failed for session {SessionId}", sessionId);
            return Ok(new { text = (string?)null, toolResults = Array.Empty<object>(), hasError = true });
        }
    }

    // ── DELETE /api/live/agent/sessions/{id} ──────────────────────────────────
    [HttpDelete("sessions/{sessionId}")]
    public async Task<IActionResult> EndSession(string sessionId, CancellationToken ct)
    {
        var agentToken = await ExchangeCrossAppTokenAsync(ct);
        if (agentToken is null) return NoContent();

        using var client = CreateNuRavenClient(agentToken);
        var url = $"{NuRavenBaseUrl()}/api/media-agent/sessions/{Uri.EscapeDataString(sessionId)}";
        try { await client.DeleteAsync(url, ct); } catch { /* best-effort */ }
        return NoContent();
    }

    // ── Overlay hook: POST /api/live/agent/sessions/{id}/overlay ─────────────
    /// <summary>
    /// Accepts an overlay command from the frontend and fires it at the agent
    /// as a turn so the LLM can track/augment it. The agent response may
    /// include additional tool calls that modify the overlay further.
    /// </summary>
    [HttpPost("sessions/{sessionId}/overlay")]
    public async Task<IActionResult> TriggerOverlay(
        string sessionId,
        [FromBody] GoLiveOverlayRequest request,
        CancellationToken ct)
    {
        var description = $"Trigger overlay: type={request.OverlayType}, content={request.Content}, duration_ms={request.DurationMs}";

        var agentToken = await ExchangeCrossAppTokenAsync(ct);
        if (agentToken is null || sessionId.StartsWith("offline-", StringComparison.Ordinal))
        {
            // Best-effort: overlay has already fired client-side; just ack.
            return Ok(new { queued = false, offline = true });
        }

        var body = JsonSerializer.Serialize(new { input = description });
        try
        {
            using var resp = await PostNuRavenAsync(
                $"/api/media-agent/sessions/{Uri.EscapeDataString(sessionId)}/event",
                body, agentToken, ct);
            var payload = await resp.Content.ReadAsStringAsync(ct);
            return resp.IsSuccessStatusCode
                ? Content(payload, "application/json")
                : Ok(new { queued = false, error = "Agent unavailable" });
        }
        catch
        {
            return Ok(new { queued = false, offline = true });
        }
    }

    // ── Internals ─────────────────────────────────────────────────────────────

    private async Task BootstrapInternalAsync(string sessionId, string agentToken, CancellationToken ct)
    {
        try
        {
            var url = $"/api/media-agent/sessions/{Uri.EscapeDataString(sessionId)}/bootstrap/wiseravenshare-golive";
            using var resp = await PostNuRavenAsync(url, "{}", agentToken, ct);
            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogWarning("GoLive bootstrap returned {Status} for session {Id}",
                    resp.StatusCode, sessionId);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "GoLive session bootstrap failed (non-fatal).");
        }
    }

    private async Task<string?> ExchangeCrossAppTokenAsync(CancellationToken ct)
    {
        var crossAppKey = _cfg["NuRavenCorpLlm:CrossAppKey"]
                          ?? _cfg["NuRavenCorpLlm:AccessToken"]
                          ?? string.Empty;

        if (string.IsNullOrWhiteSpace(crossAppKey))
        {
            _logger.LogWarning("NuRavenCorpLlm:CrossAppKey is not configured; GoLive agent features disabled.");
            return null;
        }

        try
        {
            using var client = _http.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(8);
            using var req = new HttpRequestMessage(HttpMethod.Post,
                $"{NuRavenBaseUrl()}/api/auth/cross-app-token");
            req.Headers.TryAddWithoutValidation("X-NR-App-Key", crossAppKey);
            req.Content = new StringContent("{}", Encoding.UTF8, "application/json");
            using var resp = await client.SendAsync(req, ct);
            if (!resp.IsSuccessStatusCode) return null;
            var body = await resp.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(body);
            return doc.RootElement.TryGetProperty("token", out var t) ? t.GetString() : null;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Cross-app token exchange failed for GoLive agent.");
            return null;
        }
    }

    private HttpClient CreateNuRavenClient(string token)
    {
        var client = _http.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(15);
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    private async Task<HttpResponseMessage> PostNuRavenAsync(
        string path, string json, string token, CancellationToken ct)
    {
        using var client = CreateNuRavenClient(token);
        var url = $"{NuRavenBaseUrl()}{path}";
        using var content = new StringContent(json, Encoding.UTF8, "application/json");
        return await client.PostAsync(url, content, ct);
    }

    private string NuRavenBaseUrl()
        => (_cfg["NuRavenCorpLlm:BaseUrl"] ?? "http://localhost:5011").TrimEnd('/');
}

public sealed record StartGoLiveAgentSessionRequest(string? BroadcastId);
public sealed record GoLiveAgentEventRequest(string Input);
public sealed record GoLiveOverlayRequest(string OverlayType, string Content, int DurationMs = 5000);
