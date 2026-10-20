using System.Text;
using System.Text.Json;
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
}
