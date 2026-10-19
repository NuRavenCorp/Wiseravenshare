using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Text;
using System.Text.RegularExpressions;
using Wiseravenshare.Server.DTOs.FM;
using Wiseravenshare.Server.Exceptions;
using Wiseravenshare.Server.Services.FM;
using Wiseravenshare.Server.Shared;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/fmtuner")]
[Authorize]
[Produces("application/json")]
public sealed class FMTunerController : ControllerBase
{
    private readonly IFMStationService _stationService;
    private readonly IHttpClientFactory _httpClientFactory;

    private const string RadioBrowserBaseUrl = "https://de1.api.radio-browser.info";
    private const string RadioBrowserUserAgent = "WiseRavenFM/1.0 (https://wise-ravens.com)";

    public FMTunerController(IFMStationService stationService, IHttpClientFactory httpClientFactory)
    {
        _stationService = stationService;
        _httpClientFactory = httpClientFactory;
    }

    // ── Radio Browser API proxy endpoints ──────────────────────────────────────
    // These routes call the Radio Browser API server-side so that:
    //  - The User-Agent header can be set correctly (browsers block it in fetch).
    //  - Responses are always HTTPS — no mixed-content issues for the client.
    //  - The client never needs to discover or rotate Radio Browser servers.

    private HttpClient CreateRadioBrowserClient()
    {
        var client = _httpClientFactory.CreateClient();
        client.DefaultRequestHeaders.UserAgent.ParseAdd(RadioBrowserUserAgent);
        client.DefaultRequestHeaders.Add("Accept", "application/json");
        client.Timeout = TimeSpan.FromSeconds(15);
        return client;
    }

    /// <summary>Returns all countries from Radio Browser, sorted by station count.</summary>
    [HttpGet("rb/countries")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetRadioBrowserCountries(CancellationToken cancellationToken)
    {
        var client = CreateRadioBrowserClient();
        var url = $"{RadioBrowserBaseUrl}/json/countries?order=stationcount&reverse=true&hidebroken=false";
        try
        {
            var response = await client.GetAsync(url, cancellationToken);
            if (!response.IsSuccessStatusCode)
                return StatusCode((int)response.StatusCode, "Radio Browser countries unavailable.");

            var content = await response.Content.ReadAsStringAsync(cancellationToken);
            return Content(content, "application/json");
        }
        catch (Exception ex)
        {
            return StatusCode(StatusCodes.Status502BadGateway, $"Radio Browser proxy error: {ex.Message}");
        }
    }

    /// <summary>Returns popular genre tags from Radio Browser, optionally scoped to a country.</summary>
    [HttpGet("rb/tags")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetRadioBrowserTags(
        [FromQuery] string? countrycode = null,
        [FromQuery] int limit = 60,
        CancellationToken cancellationToken = default)
    {
        var client = CreateRadioBrowserClient();
        var queryParts = $"order=stationcount&reverse=true&hidebroken=false&limit={limit}";
        if (!string.IsNullOrWhiteSpace(countrycode))
            queryParts += $"&countrycode={Uri.EscapeDataString(countrycode.Trim())}";

        var url = $"{RadioBrowserBaseUrl}/json/tags?{queryParts}";
        try
        {
            var response = await client.GetAsync(url, cancellationToken);
            if (!response.IsSuccessStatusCode)
                return StatusCode((int)response.StatusCode, "Radio Browser tags unavailable.");

            var content = await response.Content.ReadAsStringAsync(cancellationToken);
            return Content(content, "application/json");
        }
        catch (Exception ex)
        {
            return StatusCode(StatusCodes.Status502BadGateway, $"Radio Browser proxy error: {ex.Message}");
        }
    }

    /// <summary>
    /// Returns stations filtered by country and/or genre tag from Radio Browser.
    /// Passes is_https=true so only HTTPS-capable streams are returned, preventing
    /// mixed-content blocks in the browser.
    /// </summary>
    [HttpGet("rb/stations")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetRadioBrowserStations(
        [FromQuery] string? countryCode = null,
        [FromQuery] string? state = null,
        [FromQuery] string? name = null,
        [FromQuery] string? tag = null,
        [FromQuery] int limit = 30,
        CancellationToken cancellationToken = default)
    {
        var client = CreateRadioBrowserClient();

        var query = System.Web.HttpUtility.ParseQueryString(string.Empty);
        query["order"]       = "clickcount";
        query["reverse"]     = "true";
        query["is_https"]    = "true";
        query["limit"]       = Math.Clamp(limit, 1, 100).ToString();
        query["hidebroken"]  = "true";

        if (!string.IsNullOrWhiteSpace(countryCode)) query["countrycode"] = countryCode.Trim().ToUpperInvariant();
        if (!string.IsNullOrWhiteSpace(state))       query["state"]       = state.Trim();
        if (!string.IsNullOrWhiteSpace(name))        query["name"]        = name.Trim();
        if (!string.IsNullOrWhiteSpace(tag))         query["tag"]         = tag.Trim().ToLowerInvariant();

        var url = $"{RadioBrowserBaseUrl}/json/stations/search?{query}";
        try
        {
            var response = await client.GetAsync(url, cancellationToken);
            if (!response.IsSuccessStatusCode)
                return StatusCode((int)response.StatusCode, "Radio Browser stations unavailable.");

            var content = await response.Content.ReadAsStringAsync(cancellationToken);
            return Content(content, "application/json");
        }
        catch (Exception ex)
        {
            return StatusCode(StatusCodes.Status502BadGateway, $"Radio Browser proxy error: {ex.Message}");
        }
    }

    [HttpPost("search")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IEnumerable<FMStationDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> SearchStations([FromBody] FMStationSearchDto searchDto, CancellationToken cancellationToken)
    {
        var stations = await _stationService.SearchStationsAsync(searchDto ?? new FMStationSearchDto(), GetUserIdOrDefault(), cancellationToken);
        return Ok(stations);
    }

    [HttpGet("featured")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IEnumerable<FMStationDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetFeatured([FromQuery] int count = 10, CancellationToken cancellationToken = default)
    {
        var stations = await _stationService.GetFeaturedStationsAsync(count, GetUserIdOrDefault(), cancellationToken);
        return Ok(stations);
    }

    [HttpGet("popular")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IEnumerable<FMStationDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetPopular([FromQuery] int count = 10, CancellationToken cancellationToken = default)
    {
        var stations = await _stationService.GetPopularStationsAsync(count, GetUserIdOrDefault(), cancellationToken);
        return Ok(stations);
    }

    [HttpGet("recommended")]
    [ProducesResponseType(typeof(IEnumerable<FMStationDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetRecommended([FromQuery] int count = 10, CancellationToken cancellationToken = default)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        var stations = await _stationService.GetRecommendedStationsAsync(userId, count, cancellationToken);
        return Ok(stations);
    }

    [HttpGet("{id:guid}")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(FMStationDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetStation(Guid id, CancellationToken cancellationToken)
    {
        try
        {
            var station = await _stationService.GetStationAsync(id, GetUserIdOrDefault(), cancellationToken);
            return Ok(station);
        }
        catch (NotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPost]
    [Authorize(Roles = "Admin,Moderator")]
    [ProducesResponseType(typeof(FMStationDto), StatusCodes.Status201Created)]
    public async Task<IActionResult> CreateStation([FromBody] CreateFMStationDto dto, CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        try
        {
            var station = await _stationService.CreateStationAsync(dto, userId, cancellationToken);
            return CreatedAtAction(nameof(GetStation), new { id = station.Id }, station);
        }
        catch (BadRequestException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = "Admin,Moderator")]
    [ProducesResponseType(typeof(FMStationDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> UpdateStation(Guid id, [FromBody] UpdateFMStationDto dto, CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        try
        {
            var station = await _stationService.UpdateStationAsync(id, dto, userId, cancellationToken);
            return Ok(station);
        }
        catch (NotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (UnauthorizedException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
        }
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = "Admin,Moderator")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> DeleteStation(Guid id, CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        try
        {
            await _stationService.DeleteStationAsync(id, userId, cancellationToken);
            return NoContent();
        }
        catch (NotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (UnauthorizedException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
        }
    }

    [HttpGet("{id:guid}/play")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(FMStationPlaybackDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetPlaybackInfo(Guid id, CancellationToken cancellationToken)
    {
        try
        {
            var info = await _stationService.GetPlaybackInfoAsync(id, cancellationToken);
            return Ok(info);
        }
        catch (NotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPost("{id:guid}/like")]
    [ProducesResponseType(typeof(FMStationDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> LikeStation(Guid id, CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        var station = await _stationService.LikeStationAsync(id, userId, cancellationToken);
        return Ok(station);
    }

    [HttpDelete("{id:guid}/like")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> UnlikeStation(Guid id, CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        await _stationService.UnlikeStationAsync(id, userId, cancellationToken);
        return NoContent();
    }

    [HttpPost("{id:guid}/bookmark")]
    [ProducesResponseType(typeof(FMStationDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> BookmarkStation(Guid id, CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        var station = await _stationService.BookmarkStationAsync(id, userId, cancellationToken);
        return Ok(station);
    }

    [HttpDelete("{id:guid}/bookmark")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> UnbookmarkStation(Guid id, CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        await _stationService.UnbookmarkStationAsync(id, userId, cancellationToken);
        return NoContent();
    }

    [HttpGet("liked")]
    [ProducesResponseType(typeof(IEnumerable<FMStationDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetLikedStations(CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        var stations = await _stationService.GetUserLikedStationsAsync(userId, cancellationToken);
        return Ok(stations);
    }

    [HttpGet("bookmarked")]
    [ProducesResponseType(typeof(IEnumerable<FMStationDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetBookmarkedStations(CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        var stations = await _stationService.GetUserBookmarkedStationsAsync(userId, cancellationToken);
        return Ok(stations);
    }

    [HttpGet("history")]
    [ProducesResponseType(typeof(IEnumerable<FMStationDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetListeningHistory([FromQuery] int limit = 50, CancellationToken cancellationToken = default)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        var history = await _stationService.GetListeningHistoryAsync(userId, limit, cancellationToken);
        return Ok(history);
    }

    [HttpPost("{id:guid}/track")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> TrackListening(Guid id, [FromBody] int duration, CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        await _stationService.TrackListeningAsync(id, userId, duration, cancellationToken);
        return NoContent();
    }

    [HttpGet("{id:guid}/now-playing")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(FMNowPlayingDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetNowPlaying(Guid id, CancellationToken cancellationToken)
    {
        var nowPlaying = await _stationService.GetNowPlayingAsync(id, cancellationToken);
        return Ok(nowPlaying);
    }

    [HttpGet("preferences")]
    [ProducesResponseType(typeof(FMUserPreferenceDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetPreferences(CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        var preferences = await _stationService.GetUserPreferencesAsync(userId, cancellationToken);
        return Ok(preferences);
    }

    [HttpPut("preferences")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> UpdatePreferences([FromBody] FMUserPreferenceDto preferences, CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        await _stationService.UpdateUserPreferencesAsync(userId, preferences, cancellationToken);
        return NoContent();
    }

    /// <summary>
    /// Proxies an external radio stream through the server to bypass CORS and mixed-content
    /// browser restrictions. Only http:// and https:// audio stream URLs are accepted.
    /// The timeout on the HttpClient is intentionally removed — live radio streams run
    /// indefinitely and are only terminated when the client disconnects.
    /// </summary>
    [HttpGet("stream-proxy")]
    [AllowAnonymous]
    public async Task StreamProxy([FromQuery] string url, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            Response.StatusCode = StatusCodes.Status400BadRequest;
            await Response.WriteAsync("url parameter is required.", cancellationToken);
            return;
        }

        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            Response.StatusCode = StatusCodes.Status400BadRequest;
            await Response.WriteAsync("Only http:// and https:// stream URLs are supported.", cancellationToken);
            return;
        }

        try
        {
            // Use IHttpClientFactory so connections are properly pooled.
            // Timeout.InfiniteTimeSpan is required — live radio streams never end;
            // the request is only terminated when the browser disconnects.
            var httpClient = _httpClientFactory.CreateClient();
            httpClient.Timeout = System.Threading.Timeout.InfiniteTimeSpan;
            httpClient.DefaultRequestHeaders.Add("User-Agent", "WiseRavenFMProxy/1.0");
            httpClient.DefaultRequestHeaders.Add("Accept", "audio/*,*/*");
            httpClient.DefaultRequestHeaders.Add("Icy-MetaData", "1");

            using var upstream = await httpClient.GetAsync(
                uri,
                System.Net.Http.HttpCompletionOption.ResponseHeadersRead,
                cancellationToken);

            if (!upstream.IsSuccessStatusCode)
            {
                Response.StatusCode = (int)upstream.StatusCode;
                await Response.WriteAsync($"Upstream stream returned {(int)upstream.StatusCode}.", cancellationToken);
                return;
            }

            var contentType = upstream.Content.Headers.ContentType?.ToString() ?? "audio/mpeg";
            Response.ContentType = contentType;
            Response.Headers["Cache-Control"] = "no-cache, no-store";
            Response.Headers["Access-Control-Allow-Origin"] = "*";

            // Forward any ICY metadata headers so clients can read song/station info.
            foreach (var header in upstream.Headers)
            {
                if (header.Key.StartsWith("icy-", StringComparison.OrdinalIgnoreCase))
                {
                    Response.Headers[header.Key] = string.Join(",", header.Value);
                }
            }

            await using var upstreamStream = await upstream.Content.ReadAsStreamAsync(cancellationToken);
            await upstreamStream.CopyToAsync(Response.Body, cancellationToken);
        }
        catch (OperationCanceledException)
        {
            // Client disconnected — normal for live streams.
        }
        catch (Exception ex)
        {
            if (!Response.HasStarted)
            {
                Response.StatusCode = StatusCodes.Status502BadGateway;
                await Response.WriteAsync($"Proxy error: {ex.Message}", cancellationToken);
            }
        }
    }

    /// <summary>Same-origin HLS proxy for iHeart playlists and their nested segments/keys.</summary>
    [HttpGet("hls-proxy")]
    [AllowAnonymous]
    public async Task HlsProxy([FromQuery] string url, CancellationToken cancellationToken)
    {
        if (!TryAllowedIHeartUri(url, out var uri))
        {
            Response.StatusCode = StatusCodes.Status400BadRequest;
            await Response.WriteAsync("Only iHeart Revma HLS URLs are supported.", cancellationToken);
            return;
        }

        try
        {
            using var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(30);
            client.DefaultRequestHeaders.UserAgent.ParseAdd("WiseRavenFMProxy/1.0");
            client.DefaultRequestHeaders.Accept.ParseAdd("*/*");
            using var request = new HttpRequestMessage(HttpMethod.Get, uri);
            if (Request.Headers.TryGetValue("Range", out var rangeValue)
                && System.Net.Http.Headers.RangeHeaderValue.TryParse(rangeValue.ToString(), out var range))
                request.Headers.Range = range;

            using var upstream = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            var finalUri = upstream.RequestMessage?.RequestUri ?? uri;
            if (!IsAllowedIHeartUri(finalUri))
            {
                Response.StatusCode = StatusCodes.Status502BadGateway;
                await Response.WriteAsync("The HLS provider redirected to an unsupported host.", cancellationToken);
                return;
            }
            if (!upstream.IsSuccessStatusCode)
            {
                Response.StatusCode = (int)upstream.StatusCode;
                await Response.WriteAsync($"HLS provider returned {(int)upstream.StatusCode}.", cancellationToken);
                return;
            }

            Response.Headers["Cache-Control"] = "no-store";
            var contentType = upstream.Content.Headers.ContentType?.MediaType ?? "application/octet-stream";
            if (contentType.Contains("mpegurl", StringComparison.OrdinalIgnoreCase)
                || finalUri.AbsolutePath.EndsWith(".m3u8", StringComparison.OrdinalIgnoreCase))
            {
                var playlist = await upstream.Content.ReadAsStringAsync(cancellationToken);
                if (!playlist.TrimStart().StartsWith("#EXTM3U", StringComparison.Ordinal))
                {
                    Response.StatusCode = StatusCodes.Status502BadGateway;
                    await Response.WriteAsync("The HLS provider returned an invalid playlist.", cancellationToken);
                    return;
                }

                playlist = Regex.Replace(playlist, "URI=\"([^\"]+)\"", match =>
                    $"URI=\"{ProxyHlsReference(match.Groups[1].Value, finalUri)}\"");
                playlist = string.Join("\n", playlist.Split('\n').Select(line =>
                {
                    var trimmed = line.Trim();
                    return trimmed.Length == 0 || trimmed.StartsWith('#')
                        ? line
                        : ProxyHlsReference(trimmed, finalUri);
                }));
                Response.ContentType = "application/vnd.apple.mpegurl";
                await Response.WriteAsync(playlist, Encoding.UTF8, cancellationToken);
                return;
            }

            Response.StatusCode = (int)upstream.StatusCode;
            Response.ContentType = contentType;
            if (upstream.Content.Headers.ContentLength is long length)
                Response.ContentLength = length;
            if (upstream.Content.Headers.ContentRange is not null)
                Response.Headers.ContentRange = upstream.Content.Headers.ContentRange.ToString();
            await using var stream = await upstream.Content.ReadAsStreamAsync(cancellationToken);
            await stream.CopyToAsync(Response.Body, cancellationToken);
        }
        catch (OperationCanceledException)
        {
            // Normal when the browser stops playback or changes station.
        }
        catch (Exception ex)
        {
            if (!Response.HasStarted)
            {
                Response.StatusCode = StatusCodes.Status502BadGateway;
                await Response.WriteAsync($"HLS proxy error: {ex.Message}", cancellationToken);
            }
        }
    }

    private static bool TryAllowedIHeartUri(string rawUrl, out Uri uri)
    {
        return Uri.TryCreate(rawUrl, UriKind.Absolute, out uri!) && IsAllowedIHeartUri(uri);
    }

    private static bool IsAllowedIHeartUri(Uri uri)
    {
        return uri.Scheme == Uri.UriSchemeHttps
            && (uri.Host.Equals("revma.ihrhls.com", StringComparison.OrdinalIgnoreCase)
                || uri.Host.EndsWith(".revma.ihrhls.com", StringComparison.OrdinalIgnoreCase));
    }

    private static string ProxyHlsReference(string reference, Uri playlistUri)
    {
        if (reference.StartsWith("data:", StringComparison.OrdinalIgnoreCase)) return reference;
        var resolved = Uri.TryCreate(playlistUri, reference, out var candidate) ? candidate : null;
        if (resolved is null || !IsAllowedIHeartUri(resolved)) return reference;
        var localUrl = $"/api/fmtuner/hls-proxy?url={Uri.EscapeDataString(resolved.ToString())}";
        return localUrl;
    }

    private Guid GetUserIdOrDefault()
    {
        var userId = User.GetUserId();
        return userId == Guid.Empty ? Guid.Empty : userId;
    }
}
