using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NuRavenCorpLLM.Core.Interfaces.Repositories.Assistant;
using NuRavenCorpLLM.Entities;
using NuRavenCorpLLM.Infrastructure.Security;
using System.Security.Cryptography;
using System.Text;

namespace NuRavenCorpLLM.Controllers;

[ApiController]
[Route("api/knowledge")]
[Authorize]
public class KnowledgeController : ControllerBase
{
    private readonly IAssistantKnowledgeRepository _knowledgeRepository;

    public KnowledgeController(IAssistantKnowledgeRepository knowledgeRepository)
    {
        _knowledgeRepository = knowledgeRepository;
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? q = null, [FromQuery] int limit = 100, CancellationToken ct = default)
    {
        var boundedLimit = Math.Clamp(limit, 1, 500);
        var items = string.IsNullOrWhiteSpace(q)
            ? await _knowledgeRepository.ListAsync(boundedLimit, ct)
            : await _knowledgeRepository.SearchAsync(q, boundedLimit, ct);

        return Ok(items.Select(ToDto));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateKnowledgeRequest request, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.Title))
        {
            return BadRequest(new { message = "Title is required." });
        }

        if (string.IsNullOrWhiteSpace(request.Content))
        {
            return BadRequest(new { message = "Content is required." });
        }

        var now = DateTime.UtcNow;
        var userId = User.GetUserId();
        var cleanContent = request.Content.Trim();
        var knowledge = new AssistantKnowledge
        {
            Id = Guid.NewGuid(),
            Title = request.Title.Trim(),
            Content = cleanContent,
            ContentHash = ComputeSha256(cleanContent),
            Source = string.IsNullOrWhiteSpace(request.Source) ? "manual" : request.Source.Trim(),
            SourceUrl = string.IsNullOrWhiteSpace(request.SourceUrl) ? null : request.SourceUrl.Trim(),
            Category = string.IsNullOrWhiteSpace(request.Category) ? null : request.Category.Trim(),
            Tags = request.Tags?
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Select(x => x.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Take(20)
                .ToArray(),
            IsPublic = request.IsPublic,
            IsApproved = true,
            ApprovedBy = userId,
            TokenCount = EstimateTokenCount(cleanContent),
            CreatedAt = now,
            UpdatedAt = now
        };

        await _knowledgeRepository.AddAsync(knowledge, ct);
        return Ok(ToDto(knowledge));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct = default)
    {
        var existing = await _knowledgeRepository.GetByIdAsync(id, ct);
        if (existing is null || existing.IsDeleted)
        {
            return NotFound(new { message = "Knowledge record not found." });
        }

        await _knowledgeRepository.DeleteAsync(id, ct);
        return NoContent();
    }

    private static object ToDto(AssistantKnowledge item) => new
    {
        item.Id,
        item.Title,
        item.Content,
        item.Source,
        item.SourceUrl,
        item.Category,
        item.Tags,
        item.IsPublic,
        item.IsApproved,
        item.TokenCount,
        item.CreatedAt,
        item.UpdatedAt
    };

    private static string ComputeSha256(string input)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private static int EstimateTokenCount(string content)
    {
        var wordCount = content
            .Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Length;

        return Math.Max(1, (int)Math.Ceiling(wordCount * 1.3));
    }

    public sealed record CreateKnowledgeRequest(
        string Title,
        string Content,
        string? Source,
        string? SourceUrl,
        string? Category,
        string[]? Tags,
        bool IsPublic = true);
}
