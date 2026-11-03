using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NuRavenCorpLLM.Infrastructure.Security;
using System.Collections.Concurrent;
using System.Security.Cryptography;

namespace NuRavenCorpLLM.Controllers;

[ApiController]
[Route("api/clients")]
[Authorize]
public class ClientsController : ControllerBase
{
    private static readonly ConcurrentDictionary<Guid, ClientEntry> Clients = new();
    private static readonly ConcurrentDictionary<Guid, ConcurrentDictionary<Guid, ClientKeyEntry>> KeysByClient = new();

    [HttpGet]
    public IActionResult List()
    {
        var userId = User.GetUserId();
        var items = Clients.Values
            .Where(c => c.OwnerUserId == userId)
            .OrderByDescending(c => c.CreatedAt)
            .Select(c => new
            {
                c.Id,
                c.Name,
                c.Description,
                c.ContactEmail,
                c.IsActive,
                c.CreatedAt,
                apiKeyCount = KeysByClient.TryGetValue(c.Id, out var keys) ? keys.Count : 0
            });

        return Ok(items);
    }

    [HttpPost]
    public IActionResult Create([FromBody] CreateClientRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest(new { message = "Client name is required." });
        }

        var userId = User.GetUserId();
        var now = DateTime.UtcNow;
        var client = new ClientEntry(
            Id: Guid.NewGuid(),
            OwnerUserId: userId,
            Name: request.Name.Trim(),
            Description: request.Description?.Trim() ?? string.Empty,
            ContactEmail: request.ContactEmail?.Trim() ?? string.Empty,
            IsActive: true,
            CreatedAt: now);

        Clients[client.Id] = client;
        KeysByClient.TryAdd(client.Id, new ConcurrentDictionary<Guid, ClientKeyEntry>());

        return Ok(new
        {
            client.Id,
            client.Name,
            client.Description,
            client.ContactEmail,
            client.IsActive,
            client.CreatedAt,
            apiKeyCount = 0
        });
    }

    [HttpGet("{clientId:guid}/keys")]
    public IActionResult ListKeys(Guid clientId)
    {
        var client = GetOwnedClient(clientId);
        if (client is null)
        {
            return NotFound(new { message = "Client not found." });
        }

        if (!KeysByClient.TryGetValue(clientId, out var keys))
        {
            return Ok(Array.Empty<object>());
        }

        var items = keys.Values
            .OrderByDescending(k => k.CreatedAt)
            .Select(k => new
            {
                k.Id,
                k.Label,
                k.Prefix,
                k.CreatedAt,
                k.LastUsedAt
            });

        return Ok(items);
    }

    [HttpPost("{clientId:guid}/keys")]
    public IActionResult IssueKey(Guid clientId, [FromBody] IssueKeyRequest request)
    {
        var client = GetOwnedClient(clientId);
        if (client is null)
        {
            return NotFound(new { message = "Client not found." });
        }

        var plainText = $"nrk_{Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant()}";
        var key = new ClientKeyEntry(
            Id: Guid.NewGuid(),
            Label: string.IsNullOrWhiteSpace(request.Label) ? "Default" : request.Label.Trim(),
            Prefix: plainText[..Math.Min(8, plainText.Length)],
            CreatedAt: DateTime.UtcNow,
            LastUsedAt: null);

        var keyBag = KeysByClient.GetOrAdd(clientId, _ => new ConcurrentDictionary<Guid, ClientKeyEntry>());
        keyBag[key.Id] = key;

        return Ok(new
        {
            key.Id,
            key.Label,
            key.Prefix,
            key.CreatedAt,
            key.LastUsedAt,
            plaintextKey = plainText
        });
    }

    [HttpDelete("{clientId:guid}/keys/{keyId:guid}")]
    public IActionResult RevokeKey(Guid clientId, Guid keyId)
    {
        var client = GetOwnedClient(clientId);
        if (client is null)
        {
            return NotFound(new { message = "Client not found." });
        }

        if (KeysByClient.TryGetValue(clientId, out var keys))
        {
            keys.TryRemove(keyId, out _);
        }

        return NoContent();
    }

    private ClientEntry? GetOwnedClient(Guid clientId)
    {
        if (!Clients.TryGetValue(clientId, out var client))
        {
            return null;
        }

        return client.OwnerUserId == User.GetUserId() ? client : null;
    }

    public sealed record CreateClientRequest(string Name, string? Description, string? ContactEmail);
    public sealed record IssueKeyRequest(string? Label);
    private sealed record ClientEntry(
        Guid Id,
        Guid OwnerUserId,
        string Name,
        string Description,
        string ContactEmail,
        bool IsActive,
        DateTime CreatedAt);
    private sealed record ClientKeyEntry(
        Guid Id,
        string Label,
        string Prefix,
        DateTime CreatedAt,
        DateTime? LastUsedAt);
}
