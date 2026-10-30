using System.Text;
using System.Text.Json;
using System.Net.WebSockets;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Wiseravenshare.Server.Controllers;

/// <summary>
/// Gateway for the Python matrix microservice.
/// Proxies matrix operations to PythonMatrixService:BaseUrl.
/// </summary>
[ApiController]
[Route("api/python-matrix")]
[AllowAnonymous]
public sealed class PythonMatrixController : ControllerBase
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<PythonMatrixController> _logger;
    private readonly IConfiguration _configuration;

    public PythonMatrixController(
        IHttpClientFactory httpClientFactory,
        ILogger<PythonMatrixController> logger,
        IConfiguration configuration)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
        _configuration = configuration;
    }

    [HttpGet("health")]
    public async Task<IActionResult> Health(CancellationToken cancellationToken)
    {
        try
        {
            using var client = _httpClientFactory.CreateClient("PythonMatrixService");
            var response = await client.GetAsync("health", cancellationToken);
            return await ProxyJsonResponse(response, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Python matrix service health check failed.");
            return StatusCode(503, new { upstream = "unreachable", message = ex.Message });
        }
    }

    [HttpGet("health/db")]
    public async Task<IActionResult> DatabaseHealth(CancellationToken cancellationToken)
    {
        try
        {
            using var client = _httpClientFactory.CreateClient("PythonMatrixService");
            var response = await client.GetAsync("health/db", cancellationToken);
            return await ProxyJsonResponse(response, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Python matrix database health check failed.");
            return StatusCode(503, new { upstream = "unreachable", message = ex.Message });
        }
    }

    [HttpPost("transpose")]
    public async Task<IActionResult> Transpose([FromBody] JsonElement payload, CancellationToken cancellationToken)
    {
        return await ProxyPostAsync("matrix/transpose", payload, cancellationToken);
    }

    [HttpPost("multiply")]
    public async Task<IActionResult> Multiply([FromBody] JsonElement payload, CancellationToken cancellationToken)
    {
        return await ProxyPostAsync("matrix/multiply", payload, cancellationToken);
    }

    [HttpGet("history")]
    public async Task<IActionResult> History([FromQuery] int? limit, CancellationToken cancellationToken)
    {
        try
        {
            using var client = _httpClientFactory.CreateClient("PythonMatrixService");
            var relativeUrl = limit.HasValue
                ? $"matrix/history?limit={Math.Max(1, limit.Value)}"
                : "matrix/history";
            var response = await client.GetAsync(relativeUrl, cancellationToken);
            return await ProxyJsonResponse(response, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Python matrix history request failed.");
            return StatusCode(503, new { message = "Python matrix service is unavailable." });
        }
    }

    [HttpGet("post/feed/ranked")]
    public async Task<IActionResult> RankedPostFeed(
        [FromQuery(Name = "viewer_id")] string viewerId,
        [FromQuery(Name = "page_size")] int pageSize = 40,
        [FromQuery(Name = "window_days")] int windowDays = 30,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(viewerId))
        {
            return BadRequest(new { message = "viewer_id is required." });
        }

        var clampedPageSize = Math.Clamp(pageSize, 1, 100);
        var clampedWindowDays = Math.Clamp(windowDays, 1, 90);

        try
        {
            using var client = _httpClientFactory.CreateClient("PythonMatrixService");
            var relativeUrl =
                $"post/feed/ranked?viewer_id={Uri.EscapeDataString(viewerId.Trim())}&page_size={clampedPageSize}&window_days={clampedWindowDays}";
            var response = await client.GetAsync(relativeUrl, cancellationToken);
            return await ProxyJsonResponse(response, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Python matrix ranked post feed request failed.");
            return StatusCode(503, new { message = "Python matrix post ranking is unavailable." });
        }
    }

    [HttpPost("engagement/action")]
    public async Task<IActionResult> EngagementAction([FromBody] JsonElement payload, CancellationToken cancellationToken)
    {
        return await ProxyPostAsync("engagement/action", payload, cancellationToken);
    }

    [HttpPost("engagement/partials/track")]
    public async Task<IActionResult> EngagementPartialsTrack([FromBody] JsonElement payload, CancellationToken cancellationToken)
    {
        return await ProxyPostAsync("engagement/partials/track", payload, cancellationToken);
    }

    [HttpPost("engagement/posts/score")]
    public async Task<IActionResult> EngagementPostScore([FromBody] JsonElement payload, CancellationToken cancellationToken)
    {
        return await ProxyPostAsync("engagement/posts/score", payload, cancellationToken);
    }

    // ── Predictor endpoints ───────────────────────────────────────────────────

    [HttpGet("predict/health")]
    public async Task<IActionResult> PredictHealth(CancellationToken cancellationToken)
    {
        try
        {
            using var client = _httpClientFactory.CreateClient("PythonMatrixService");
            var response = await client.GetAsync("predict/health", cancellationToken);
            return await ProxyJsonResponse(response, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Predict health check failed.");
            return StatusCode(503, new { upstream = "unreachable", message = ex.Message });
        }
    }

    [HttpPost("predict/engagement/probability")]
    public async Task<IActionResult> PredictEngagementProbability([FromBody] JsonElement payload, CancellationToken cancellationToken)
    {
        return await ProxyPostAsync("predict/engagement/probability", payload, cancellationToken);
    }

    [HttpPost("predict/engagement/learn")]
    [Authorize]
    public async Task<IActionResult> PredictLearnEngagement([FromBody] JsonElement payload, CancellationToken cancellationToken)
    {
        return await ProxyPostAsync("predict/engagement/learn", payload, cancellationToken);
    }

    [HttpGet("predict/churn/{userId}")]
    [Authorize]
    public async Task<IActionResult> PredictChurn(string userId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(userId))
            return BadRequest(new { message = "userId is required." });
        try
        {
            using var client = _httpClientFactory.CreateClient("PythonMatrixService");
            var response = await client.GetAsync($"predict/churn/{Uri.EscapeDataString(userId.Trim())}", cancellationToken);
            return await ProxyJsonResponse(response, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Predict churn check failed.");
            return StatusCode(503, new { message = "Python matrix service is unavailable." });
        }
    }

    [HttpPost("predict/churn/learn")]
    [Authorize]
    public async Task<IActionResult> PredictLearnChurn([FromBody] JsonElement payload, CancellationToken cancellationToken)
    {
        return await ProxyPostAsync("predict/churn/learn", payload, cancellationToken);
    }

    [HttpPost("predict/moderation/risk")]
    public async Task<IActionResult> PredictModerationRisk([FromBody] JsonElement payload, CancellationToken cancellationToken)
    {
        return await ProxyPostAsync("predict/moderation/risk", payload, cancellationToken);
    }

    [HttpPost("predict/moderation/learn")]
    [Authorize]
    public async Task<IActionResult> PredictLearnModeration([FromBody] JsonElement payload, CancellationToken cancellationToken)
    {
        return await ProxyPostAsync("predict/moderation/learn", payload, cancellationToken);
    }

    [HttpPost("predict/impressions/record")]
    public async Task<IActionResult> PredictRecordImpression([FromBody] JsonElement payload, CancellationToken cancellationToken)
    {
        return await ProxyPostAsync("predict/impressions/record", payload, cancellationToken);
    }

    [HttpPost("predict/impressions/engaged")]
    public async Task<IActionResult> PredictMarkImpressionEngaged([FromBody] JsonElement payload, CancellationToken cancellationToken)
    {
        return await ProxyPostAsync("predict/impressions/engaged", payload, cancellationToken);
    }

    [HttpPost("predict/impressions/{userId}/flush-negatives")]
    [Authorize]
    public async Task<IActionResult> PredictFlushNegativeImpressions(string userId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(userId))
            return BadRequest(new { message = "userId is required." });
        try
        {
            using var client = _httpClientFactory.CreateClient("PythonMatrixService");
            using var content = new StringContent("{}", System.Text.Encoding.UTF8, "application/json");
            var response = await client.PostAsync($"predict/impressions/{Uri.EscapeDataString(userId.Trim())}/flush-negatives", content, cancellationToken);
            return await ProxyJsonResponse(response, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Predict flush negatives failed.");
            return StatusCode(503, new { message = "Python matrix service is unavailable." });
        }
    }

    [HttpPost("predict/explain/engagement")]
    public async Task<IActionResult> PredictExplainEngagement([FromBody] JsonElement payload, CancellationToken cancellationToken)
    {
        return await ProxyPostAsync("predict/explain/engagement", payload, cancellationToken);
    }

    [HttpGet("media/render")]
    public async Task<IActionResult> RenderMedia([FromQuery] string source, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(source))
        {
            return BadRequest(new { message = "Missing media source." });
        }

        try
        {
            using var client = _httpClientFactory.CreateClient("PythonMatrixService");
            using var request = new HttpRequestMessage(
                HttpMethod.Get,
                $"media/render?source={Uri.EscapeDataString(source.Trim())}");
            var internalOrigin = (_configuration["PythonMatrixService:InternalAppOrigin"]
                                  ?? _configuration["PythonMatrixService__InternalAppOrigin"]
                                  ?? "http://127.0.0.1:5242").Trim().TrimEnd('/');
            request.Headers.TryAddWithoutValidation("X-Forward-Origin", internalOrigin);

            var authHeader = Request.Headers.Authorization.ToString();
            if (!string.IsNullOrWhiteSpace(authHeader))
            {
                request.Headers.TryAddWithoutValidation("X-Forward-Auth", authHeader);
            }

            var cookieHeader = Request.Headers.Cookie.ToString();
            if (!string.IsNullOrWhiteSpace(cookieHeader))
            {
                request.Headers.TryAddWithoutValidation("X-Forward-Cookie", cookieHeader);
            }

            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return await ProxyJsonResponse(response, cancellationToken);
            }

            var payload = await response.Content.ReadAsByteArrayAsync(cancellationToken);
            var contentType = response.Content.Headers.ContentType?.MediaType ?? "application/octet-stream";
            return File(payload, contentType);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Python media renderer backup failed.");
            return StatusCode(503, new { message = "Python media renderer backup is unavailable." });
        }
    }

    // ── Chat gateway — proxies /api/chat/* → python-matrix /chat/* ──────────

    [HttpPost("chat/dm")]
    public async Task<IActionResult> ChatCreateDm([FromBody] JsonElement payload, CancellationToken ct)
        => await ProxyChatPostAsync("chat/dm", payload, ct);

    [HttpPost("chat/groups")]
    public async Task<IActionResult> ChatCreateGroup([FromBody] JsonElement payload, CancellationToken ct)
        => await ProxyChatPostAsync("chat/groups", payload, ct);

    [HttpGet("chat/conversations")]
    public async Task<IActionResult> ChatListConversations([FromQuery(Name = "user_id")] string userId, CancellationToken ct)
        => await ProxyChatGetAsync($"chat/conversations?user_id={Uri.EscapeDataString(userId ?? "")}", ct);

    [HttpPost("chat/conversations/{convId}/messages")]
    public async Task<IActionResult> ChatSendMessage(string convId, [FromBody] JsonElement payload, [FromQuery(Name = "user_id")] string userId, CancellationToken ct)
        => await ProxyChatPostAsync($"chat/conversations/{Uri.EscapeDataString(convId)}/messages?user_id={Uri.EscapeDataString(userId ?? "")}", payload, ct);

    [HttpGet("chat/conversations/{convId}/messages")]
    public async Task<IActionResult> ChatListMessages(
        string convId,
        [FromQuery(Name = "user_id")] string userId,
        [FromQuery] string? before = null,
        [FromQuery] int limit = 50,
        CancellationToken ct = default)
    {
        var qs = $"user_id={Uri.EscapeDataString(userId ?? "")}&limit={limit}";
        if (!string.IsNullOrWhiteSpace(before)) qs += $"&before={Uri.EscapeDataString(before)}";
        return await ProxyChatGetAsync($"chat/conversations/{Uri.EscapeDataString(convId)}/messages?{qs}", ct);
    }

    [HttpPatch("chat/messages/{msgId}")]
    public async Task<IActionResult> ChatEditMessage(string msgId, [FromBody] JsonElement payload, [FromQuery(Name = "user_id")] string userId, CancellationToken ct)
        => await ProxyChatPatchAsync($"chat/messages/{Uri.EscapeDataString(msgId)}?user_id={Uri.EscapeDataString(userId ?? "")}", payload, ct);

    [HttpDelete("chat/messages/{msgId}")]
    public async Task<IActionResult> ChatDeleteMessage(string msgId, [FromQuery(Name = "user_id")] string userId, CancellationToken ct)
        => await ProxyChatDeleteAsync($"chat/messages/{Uri.EscapeDataString(msgId)}?user_id={Uri.EscapeDataString(userId ?? "")}", ct);

    [HttpPost("chat/messages/{msgId}/react")]
    public async Task<IActionResult> ChatReact(string msgId, [FromBody] JsonElement payload, [FromQuery(Name = "user_id")] string userId, CancellationToken ct)
        => await ProxyChatPostAsync($"chat/messages/{Uri.EscapeDataString(msgId)}/react?user_id={Uri.EscapeDataString(userId ?? "")}", payload, ct);

    [HttpDelete("chat/messages/{msgId}/react")]
    public async Task<IActionResult> ChatRemoveReaction(string msgId, [FromQuery(Name = "user_id")] string userId, CancellationToken ct)
        => await ProxyChatDeleteAsync($"chat/messages/{Uri.EscapeDataString(msgId)}/react?user_id={Uri.EscapeDataString(userId ?? "")}", ct);

    [HttpPost("chat/conversations/{convId}/read")]
    public async Task<IActionResult> ChatMarkRead(string convId, [FromBody] JsonElement payload, [FromQuery(Name = "user_id")] string userId, CancellationToken ct)
        => await ProxyChatPostAsync($"chat/conversations/{Uri.EscapeDataString(convId)}/read?user_id={Uri.EscapeDataString(userId ?? "")}", payload, ct);

    [HttpPost("chat/conversations/{convId}/typing")]
    public async Task<IActionResult> ChatTyping(string convId, [FromBody] JsonElement payload, [FromQuery(Name = "user_id")] string userId, CancellationToken ct)
        => await ProxyChatPostAsync($"chat/conversations/{Uri.EscapeDataString(convId)}/typing?user_id={Uri.EscapeDataString(userId ?? "")}", payload, ct);

    [HttpPost("chat/conversations/{convId}/share-post")]
    public async Task<IActionResult> ChatSharePost(string convId, [FromBody] JsonElement payload, [FromQuery(Name = "user_id")] string userId, CancellationToken ct)
        => await ProxyChatPostAsync($"chat/conversations/{Uri.EscapeDataString(convId)}/share-post?user_id={Uri.EscapeDataString(userId ?? "")}", payload, ct);

    [HttpPost("chat/private-reply")]
    public async Task<IActionResult> ChatPrivateReply([FromBody] JsonElement payload, [FromQuery(Name = "user_id")] string userId, CancellationToken ct)
        => await ProxyChatPostAsync($"chat/private-reply?user_id={Uri.EscapeDataString(userId ?? "")}", payload, ct);

    [HttpGet("chat/notifications")]
    public async Task<IActionResult> ChatNotifications([FromQuery(Name = "user_id")] string userId, [FromQuery(Name = "unread_only")] bool unreadOnly = false, CancellationToken ct = default)
        => await ProxyChatGetAsync($"chat/notifications?user_id={Uri.EscapeDataString(userId ?? "")}&unread_only={unreadOnly}", ct);

    [HttpPost("chat/conversations/{convId}/mute")]
    public async Task<IActionResult> ChatMute(string convId, [FromBody] JsonElement payload, [FromQuery(Name = "user_id")] string userId, CancellationToken ct)
        => await ProxyChatPostAsync($"chat/conversations/{Uri.EscapeDataString(convId)}/mute?user_id={Uri.EscapeDataString(userId ?? "")}", payload, ct);

    [HttpDelete("chat/conversations/{convId}/mute")]
    public async Task<IActionResult> ChatUnmute(string convId, [FromQuery(Name = "user_id")] string userId, CancellationToken ct)
        => await ProxyChatDeleteAsync($"chat/conversations/{Uri.EscapeDataString(convId)}/mute?user_id={Uri.EscapeDataString(userId ?? "")}", ct);

    [HttpPost("karaoke/process")]
    [AllowAnonymous]
    public async Task<IActionResult> KaraokeProcess([FromBody] JsonElement payload, CancellationToken cancellationToken)
        => await ProxyPostAsync("karaoke/process", payload, cancellationToken);

    [HttpGet("karaoke/relay")]
    [HttpGet("karaoke/stream")]
    [AllowAnonymous]
    public async Task KaraokeRelayStream(CancellationToken cancellationToken)
    {
        if (!HttpContext.WebSockets.IsWebSocketRequest)
        {
            HttpContext.Response.StatusCode = StatusCodes.Status400BadRequest;
            await HttpContext.Response.WriteAsync("WebSocket upgrade required.", cancellationToken);
            return;
        }

        using var browserSocket = await HttpContext.WebSockets.AcceptWebSocketAsync();

        var baseUrl = _configuration["PythonMatrixService:BaseUrl"]
            ?? _configuration["PythonMatrixService__BaseUrl"]
            ?? "http://localhost:8004";
        var query = HttpContext.Request.QueryString.HasValue
            ? HttpContext.Request.QueryString.Value
            : string.Empty;
        var relayUri = new Uri(
            baseUrl
                .Replace("http://", "ws://")
                .Replace("https://", "wss://")
                .TrimEnd('/')
            + "/karaoke/relay"
            + query);

        using var relaySocket = new ClientWebSocket();
        try
        {
            await relaySocket.ConnectAsync(relayUri, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed connecting to python-matrix karaoke relay at {RelayUri}.", relayUri);
            await browserSocket.CloseAsync(
                WebSocketCloseStatus.InternalServerError,
                "Karaoke relay unavailable",
                CancellationToken.None);
            return;
        }

        using var relayCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        var relayToken = relayCts.Token;
        var browserToRelay = RelayWebSocketAsync(browserSocket, relaySocket, relayToken);
        var relayToBrowser = RelayWebSocketAsync(relaySocket, browserSocket, relayToken);

        await Task.WhenAny(browserToRelay, relayToBrowser);
        relayCts.Cancel();

        if (browserSocket.State is WebSocketState.Open or WebSocketState.CloseReceived)
        {
            await browserSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Relay closed", CancellationToken.None);
        }
        if (relaySocket.State is WebSocketState.Open or WebSocketState.CloseReceived)
        {
            await relaySocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Relay closed", CancellationToken.None);
        }
    }

    private async Task<IActionResult> ProxyChatGetAsync(string relativeUrl, CancellationToken ct)
    {
        try
        {
            using var client = _httpClientFactory.CreateClient("PythonMatrixService");
            var response = await client.GetAsync(relativeUrl, ct);
            return await ProxyJsonResponse(response, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Chat proxy GET failed for {RelativeUrl}.", relativeUrl);
            return StatusCode(503, new { message = "Chat service is unavailable." });
        }
    }

    private async Task<IActionResult> ProxyChatPostAsync(string relativeUrl, JsonElement payload, CancellationToken ct)
    {
        try
        {
            using var client = _httpClientFactory.CreateClient("PythonMatrixService");
            using var content = new StringContent(payload.GetRawText(), Encoding.UTF8, "application/json");
            var response = await client.PostAsync(relativeUrl, content, ct);
            return await ProxyJsonResponse(response, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Chat proxy POST failed for {RelativeUrl}.", relativeUrl);
            return StatusCode(503, new { message = "Chat service is unavailable." });
        }
    }

    private async Task<IActionResult> ProxyChatPatchAsync(string relativeUrl, JsonElement payload, CancellationToken ct)
    {
        try
        {
            using var client = _httpClientFactory.CreateClient("PythonMatrixService");
            using var content = new StringContent(payload.GetRawText(), Encoding.UTF8, "application/json");
            using var request = new HttpRequestMessage(HttpMethod.Patch, relativeUrl) { Content = content };
            var response = await client.SendAsync(request, ct);
            return await ProxyJsonResponse(response, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Chat proxy PATCH failed for {RelativeUrl}.", relativeUrl);
            return StatusCode(503, new { message = "Chat service is unavailable." });
        }
    }

    private async Task<IActionResult> ProxyChatDeleteAsync(string relativeUrl, CancellationToken ct)
    {
        try
        {
            using var client = _httpClientFactory.CreateClient("PythonMatrixService");
            var response = await client.DeleteAsync(relativeUrl, ct);
            if (response.StatusCode == System.Net.HttpStatusCode.NoContent)
                return NoContent();
            return await ProxyJsonResponse(response, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Chat proxy DELETE failed for {RelativeUrl}.", relativeUrl);
            return StatusCode(503, new { message = "Chat service is unavailable." });
        }
    }

    private async Task<IActionResult> ProxyPostAsync(string relativeUrl, JsonElement payload, CancellationToken cancellationToken)
    {
        try
        {
            using var client = _httpClientFactory.CreateClient("PythonMatrixService");
            using var content = new StringContent(payload.GetRawText(), Encoding.UTF8, "application/json");
            var response = await client.PostAsync(relativeUrl, content, cancellationToken);
            return await ProxyJsonResponse(response, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Python matrix proxy request failed for {RelativeUrl}.", relativeUrl);
            return StatusCode(503, new { message = "Python matrix service is unavailable." });
        }
    }

    private static async Task<IActionResult> ProxyJsonResponse(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        var raw = await response.Content.ReadAsStringAsync(cancellationToken);
        var contentType = response.Content.Headers.ContentType?.MediaType;

        if (string.Equals(contentType, "application/json", StringComparison.OrdinalIgnoreCase))
        {
            using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(raw) ? "{}" : raw);
            return new JsonResult(doc.RootElement.Clone()) { StatusCode = (int)response.StatusCode };
        }

        return new JsonResult(new { detail = raw }) { StatusCode = (int)response.StatusCode };
    }

    private static async Task RelayWebSocketAsync(WebSocket source, WebSocket destination, CancellationToken cancellationToken)
    {
        var buffer = new byte[8192];
        while (source.State == WebSocketState.Open && destination.State == WebSocketState.Open)
        {
            WebSocketReceiveResult result;
            try
            {
                result = await source.ReceiveAsync(buffer, cancellationToken);
            }
            catch
            {
                break;
            }

            if (result.MessageType == WebSocketMessageType.Close)
            {
                if (destination.State == WebSocketState.Open)
                {
                    await destination.CloseAsync(WebSocketCloseStatus.NormalClosure, "Peer closed", cancellationToken);
                }
                break;
            }

            if (destination.State == WebSocketState.Open)
            {
                await destination.SendAsync(
                    new ArraySegment<byte>(buffer, 0, result.Count),
                    result.MessageType,
                    result.EndOfMessage,
                    cancellationToken);
            }
        }
    }
}
