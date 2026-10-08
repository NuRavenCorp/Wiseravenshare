using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Text.Json;
using Wiseravenshare.Server.Entities.Personalization;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/news")]
public sealed class NewsController : ControllerBase
{
    private readonly INewsAggregationService _newsAggregationService;
    private readonly AppDbContext _dbContext;

    public NewsController(INewsAggregationService newsAggregationService, AppDbContext dbContext)
    {
        _newsAggregationService = newsAggregationService;
        _dbContext = dbContext;
    }

    [HttpGet("search")]
    public async Task<IActionResult> Search(
        [FromQuery(Name = "q")] string? query,
        [FromQuery] string? language = "en",
        [FromQuery] int limit = 15,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            return BadRequest(new { message = "Query parameter q is required." });
        }

        var response = await _newsAggregationService.SearchNewsAsync(query, language, limit, cancellationToken);
        return Ok(response);
    }

    [HttpGet("trending")]
    public async Task<IActionResult> Trending(
        [FromQuery] string? language = "en",
        [FromQuery] int limit = 15,
        CancellationToken cancellationToken = default)
    {
        var response = await _newsAggregationService.SearchNewsAsync("breaking news", language, limit, cancellationToken);
        return Ok(response);
    }

    [HttpGet("languages")]
    public async Task<IActionResult> Languages(CancellationToken cancellationToken = default)
    {
        var response = await _newsAggregationService.GetBbcSupportedLanguagesAsync(cancellationToken);
        return Ok(new { provider = "bbcapi", languages = response });
    }

    [Authorize]
    [HttpGet("markers")]
    public async Task<IActionResult> GetMarkers([FromQuery] string? type = null, CancellationToken cancellationToken = default)
    {
        var userId = ResolveUserId();
        if (!userId.HasValue)
        {
            return Unauthorized(new { message = "Sign in required." });
        }

        var normalizedType = NormalizeMarkerType(type);
        var query = _dbContext.UserInteractions
            .AsNoTracking()
            .Where(entry => entry.UserId == userId.Value && entry.TargetType == NewsMarkerTargetType);

        if (normalizedType.HasValue)
        {
            query = query.Where(entry => entry.Type == normalizedType.Value);
        }

        var items = await query
            .OrderByDescending(entry => entry.UpdatedAt)
            .Take(500)
            .ToListAsync(cancellationToken);

        var markers = items
            .Select(ToMarkerDto)
            .Where(marker => !string.IsNullOrWhiteSpace(marker.MarkerKey))
            .ToList();

        return Ok(new { markers });
    }

    [Authorize]
    [HttpPost("markers")]
    public async Task<IActionResult> SetMarker([FromBody] NewsMarkerMutationRequest request, CancellationToken cancellationToken = default)
    {
        var userId = ResolveUserId();
        if (!userId.HasValue)
        {
            return Unauthorized(new { message = "Sign in required." });
        }

        var markerType = NormalizeMarkerType(request.MarkerType);
        if (!markerType.HasValue)
        {
            return BadRequest(new { message = "markerType must be 'liked' or 'bookmarked'." });
        }

        var markerKey = NormalizeMarkerKey(request.MarkerKey);
        if (string.IsNullOrWhiteSpace(markerKey))
        {
            return BadRequest(new { message = "markerKey is required." });
        }

        var existing = await _dbContext.UserInteractions
            .Where(entry =>
                entry.UserId == userId.Value &&
                entry.TargetType == NewsMarkerTargetType &&
                entry.Type == markerType.Value)
            .ToListAsync(cancellationToken);

        var match = existing.FirstOrDefault(entry =>
            string.Equals(ExtractMarkerKey(entry.ContextData), markerKey, StringComparison.OrdinalIgnoreCase));

        if (request.Marked)
        {
            if (match is null)
            {
                _dbContext.UserInteractions.Add(new UserInteraction
                {
                    UserId = userId.Value,
                    Type = markerType.Value,
                    TargetType = NewsMarkerTargetType,
                    TargetTitle = string.IsNullOrWhiteSpace(request.Title) ? "News Article" : request.Title.Trim(),
                    TargetCategory = request.Source?.Trim(),
                    ContextData = BuildMarkerContextDocument(markerKey, request),
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                });
            }
            else
            {
                match.TargetTitle = string.IsNullOrWhiteSpace(request.Title) ? match.TargetTitle : request.Title.Trim();
                match.TargetCategory = string.IsNullOrWhiteSpace(request.Source) ? match.TargetCategory : request.Source.Trim();
                match.ContextData = BuildMarkerContextDocument(markerKey, request);
                match.UpdatedAt = DateTime.UtcNow;
            }
        }
        else if (match is not null)
        {
            _dbContext.UserInteractions.Remove(match);
        }

        await _dbContext.SaveChangesAsync(cancellationToken);

        return Ok(new
        {
            markerKey,
            markerType = ToMarkerTypeLabel(markerType.Value),
            marked = request.Marked
        });
    }

    private Guid? ResolveUserId()
    {
        var value = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return Guid.TryParse(value, out var userId) ? userId : null;
    }

    private static JsonDocument BuildMarkerContextDocument(string markerKey, NewsMarkerMutationRequest request)
    {
        var payload = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["markerKey"] = markerKey,
            ["title"] = request.Title?.Trim() ?? string.Empty,
            ["url"] = request.Url?.Trim() ?? string.Empty,
            ["provider"] = request.Provider?.Trim() ?? string.Empty,
            ["source"] = request.Source?.Trim() ?? string.Empty,
            ["imageUrl"] = request.ImageUrl?.Trim() ?? string.Empty
        };

        return JsonDocument.Parse(JsonSerializer.Serialize(payload));
    }

    private static NewsMarkerDto ToMarkerDto(UserInteraction interaction)
    {
        return new NewsMarkerDto
        {
            MarkerKey = ExtractMarkerKey(interaction.ContextData),
            MarkerType = ToMarkerTypeLabel(interaction.Type),
            Title = interaction.TargetTitle ?? string.Empty,
            Source = interaction.TargetCategory ?? string.Empty,
            Url = ExtractContextValue(interaction.ContextData, "url"),
            Provider = ExtractContextValue(interaction.ContextData, "provider"),
            ImageUrl = ExtractContextValue(interaction.ContextData, "imageUrl"),
            UpdatedAtUtc = interaction.UpdatedAt
        };
    }

    private static string ExtractMarkerKey(JsonDocument? context)
    {
        return NormalizeMarkerKey(ExtractContextValue(context, "markerKey"));
    }

    private static string ExtractContextValue(JsonDocument? context, string key)
    {
        if (context is null)
        {
            return string.Empty;
        }

        if (context.RootElement.ValueKind != JsonValueKind.Object)
        {
            return string.Empty;
        }

        if (!context.RootElement.TryGetProperty(key, out var node))
        {
            return string.Empty;
        }

        return node.GetString()?.Trim() ?? string.Empty;
    }

    private static Wiseravenshare.Server.Entities.Personalization.InteractionType? NormalizeMarkerType(string? markerType)
    {
        var value = markerType?.Trim().ToLowerInvariant();
        return value switch
        {
            "liked" or "like" => Wiseravenshare.Server.Entities.Personalization.InteractionType.Like,
            "bookmarked" or "bookmark" => Wiseravenshare.Server.Entities.Personalization.InteractionType.Bookmark,
            null or "" => null,
            _ => null
        };
    }

    private static string ToMarkerTypeLabel(Wiseravenshare.Server.Entities.Personalization.InteractionType markerType)
    {
        return markerType == Wiseravenshare.Server.Entities.Personalization.InteractionType.Like ? "liked" : "bookmarked";
    }

    private static string NormalizeMarkerKey(string? markerKey)
    {
        return string.IsNullOrWhiteSpace(markerKey) ? string.Empty : markerKey.Trim().ToLowerInvariant();
    }

    private const string NewsMarkerTargetType = "news_article";
}

public sealed class NewsMarkerMutationRequest
{
    public string MarkerType { get; set; } = string.Empty;
    public string MarkerKey { get; set; } = string.Empty;
    public bool Marked { get; set; }
    public string? Title { get; set; }
    public string? Source { get; set; }
    public string? Provider { get; set; }
    public string? Url { get; set; }
    public string? ImageUrl { get; set; }
}

public sealed class NewsMarkerDto
{
    public string MarkerKey { get; set; } = string.Empty;
    public string MarkerType { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Source { get; set; } = string.Empty;
    public string Provider { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public string ImageUrl { get; set; } = string.Empty;
    public DateTime UpdatedAtUtc { get; set; }
}
