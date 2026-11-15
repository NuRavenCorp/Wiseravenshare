using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Wiseravenshare.Server.Controllers;

/// <summary>
/// Proxies Karaoke sessions to NuravenCorpLLM so the client never holds
/// cross-app credentials. All calls are authenticated server-to-server.
/// </summary>
[ApiController]
[Route("api/karaoke/agent")]
[Authorize]
public sealed class KaraokeAgentController : ControllerBase
{
    private static readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web);

    private readonly IHttpClientFactory _http;
    private readonly IConfiguration _cfg;
    private readonly ILogger<KaraokeAgentController> _logger;

    public KaraokeAgentController(
        IHttpClientFactory http,
        IConfiguration cfg,
        ILogger<KaraokeAgentController> logger)
    {
        _http = http;
        _cfg = cfg;
        _logger = logger;
    }

    // ── POST /api/karaoke/agent/sessions ─────────────────────────────────────
    [HttpPost("sessions")]
    public async Task<IActionResult> StartSession(
        [FromBody] StartAgentSessionRequest request,
        CancellationToken ct)
    {
        var agentToken = await ExchangeCrossAppTokenAsync(ct);
        if (agentToken is null)
            return StatusCode(503, new { message = "NuravenCorpLLM is not reachable." });

        var body = JsonSerializer.Serialize(new
        {
            platform     = "Karaoke",
            externalRef  = request.PerformanceId?.Trim(),
            extensionKey = "wiseravenshare"
        });

        using var resp = await PostNuRavenAsync(
            "/api/media-agent/sessions", body, agentToken, ct);

        if (!resp.IsSuccessStatusCode)
        {
            var err = await resp.Content.ReadAsStringAsync(ct);
            _logger.LogWarning("NuRavenCorpLLM session start returned {Status}: {Err}",
                resp.StatusCode, err);
            return StatusCode((int)resp.StatusCode, new { message = "Could not create agent session." });
        }

        var payload = await resp.Content.ReadAsStringAsync(ct);
        using var doc = JsonDocument.Parse(payload);
        var sessionId = doc.RootElement.TryGetProperty("sessionId", out var sid)
            ? sid.GetString() : null;

        if (string.IsNullOrWhiteSpace(sessionId))
            return StatusCode(502, new { message = "Agent returned no sessionId." });

        // Bootstrap the session with the Karaoke policy directive
        await BootstrapInternalAsync(sessionId, agentToken, ct);

        return Ok(new { sessionId });
    }

    // ── POST /api/karaoke/agent/sessions/{id}/event ──────────────────────────
    [HttpPost("sessions/{sessionId}/event")]
    public async Task<IActionResult> SendEvent(
        string sessionId,
        [FromBody] AgentEventRequest request,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Input))
            return BadRequest(new { message = "input is required." });

        var agentToken = await ExchangeCrossAppTokenAsync(ct);
        if (agentToken is null)
            return StatusCode(503, new { message = "NuravenCorpLLM is not reachable." });

        var body = JsonSerializer.Serialize(new { input = request.Input.Trim() });

        using var resp = await PostNuRavenAsync(
            $"/api/media-agent/sessions/{Uri.EscapeDataString(sessionId)}/event",
            body, agentToken, ct);

        var payload = await resp.Content.ReadAsStringAsync(ct);

        if (!resp.IsSuccessStatusCode)
        {
            _logger.LogWarning("NuRavenCorpLLM event returned {Status} for session {SessionId}",
                resp.StatusCode, sessionId);
            return Ok(new { text = (string?)null, toolResults = Array.Empty<object>(), hasError = true });
        }

        // Pass agent response straight through to the client
        return Content(payload, "application/json");
    }

    // ── DELETE /api/karaoke/agent/sessions/{id} ───────────────────────────────
    [HttpDelete("sessions/{sessionId}")]
    public async Task<IActionResult> EndSession(string sessionId, CancellationToken ct)
    {
        var agentToken = await ExchangeCrossAppTokenAsync(ct);
        if (agentToken is null) return NoContent(); // best-effort

        using var client = CreateNuRavenClient(agentToken);
        var url = $"{NuRavenBaseUrl()}/api/media-agent/sessions/{Uri.EscapeDataString(sessionId)}";
        try { await client.DeleteAsync(url, ct); } catch { /* best-effort */ }
        return NoContent();
    }

    // ── Internals ─────────────────────────────────────────────────────────────

    private async Task BootstrapInternalAsync(
        string sessionId, string agentToken, CancellationToken ct)
    {
        try
        {
            var url = $"/api/media-agent/sessions/{Uri.EscapeDataString(sessionId)}/bootstrap/wiseravenshare-karaoke";
            using var resp = await PostNuRavenAsync(url, "{}", agentToken, ct);
            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogWarning("Karaoke bootstrap returned {Status} for session {Id}",
                    resp.StatusCode, sessionId);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Karaoke session bootstrap failed (non-fatal).");
        }
    }

    private async Task<string?> ExchangeCrossAppTokenAsync(CancellationToken ct)
    {
        var crossAppKey = _cfg["NuRavenCorpLlm:CrossAppKey"]
                          ?? _cfg["NuRavenCorpLlm:AccessToken"]
                          ?? string.Empty;

        if (string.IsNullOrWhiteSpace(crossAppKey))
        {
            _logger.LogWarning("NuRavenCorpLlm:CrossAppKey is not configured; agent features disabled.");
            return null;
        }

        var baseUrl = NuRavenBaseUrl();

        try
        {
            using var client = _http.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(8);
            using var req = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/api/auth/cross-app-token");
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
            _logger.LogWarning(ex, "Cross-app token exchange failed.");
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

public sealed record StartAgentSessionRequest(string? PerformanceId);
public sealed record AgentEventRequest(string Input);
