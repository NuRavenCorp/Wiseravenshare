using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
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
    /// Passes https=true so only HTTPS-capable streams are returned, preventing
    /// mixed-content blocks in the browser.
    /// </summary>
    [HttpGet("rb/stations")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetRadioBrowserStations(
        [FromQuery] string? countryCode = null,
        [FromQuery] string? tag = null,
        [FromQuery] int limit = 30,
        CancellationToken cancellationToken = default)
    {
        var client = CreateRadioBrowserClient();

        var query = System.Web.HttpUtility.ParseQueryString(string.Empty);
        query["order"]       = "clickcount";
        query["reverse"]     = "true";
        query["hidebroken"]  = "true";
        query["https"]       = "true";   // ← guarantees HTTPS streams only
        query["limit"]       = limit.ToString();

        if (!string.IsNullOrWhiteSpace(countryCode)) query["countrycode"] = countryCode.Trim().ToUpperInvariant();
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
            using var httpClient = new System.Net.Http.HttpClient();
            httpClient.DefaultRequestHeaders.Add("User-Agent", "WiseRavenFMProxy/1.0");
            httpClient.DefaultRequestHeaders.Add("Accept", "audio/*,*/*");
            httpClient.Timeout = TimeSpan.FromSeconds(30);

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

    private Guid GetUserIdOrDefault()
    {
        var userId = User.GetUserId();
        return userId == Guid.Empty ? Guid.Empty : userId;
    }
}
