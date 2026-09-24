using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

/// <summary>
/// Admin-only user management: list users, view/set privileges, approve stream content.
/// All endpoints require the admin pass token or admin role.
/// </summary>
[ApiController]
[Route("api/admin/users")]
[Authorize]
public sealed class AdminUsersController : ControllerBase
{
    private readonly UserStore _userStore;
    private readonly IConfiguration _config;
    private readonly ILogger<AdminUsersController> _logger;

    // Known privilege keys
    public static readonly IReadOnlyList<string> KnownPrivileges = new[]
    {
        "pro_user",           // Full Pro-tier feature access
        "stream.publish",     // Authorised to send content to WiseRavenStream without gatekeeper review
        "stream.gatekeeper",  // Can review and approve other users' stream queue
        "moderator",          // Content moderation privileges
        "beta_features",      // Early access to unreleased features
    };

    public AdminUsersController(
        UserStore userStore,
        IConfiguration config,
        ILogger<AdminUsersController> logger)
    {
        _userStore = userStore;
        _config = config;
        _logger = logger;
    }

    // ── List ─────────────────────────────────────────────────────────────────

    [HttpGet]
    public IActionResult GetUsers([FromQuery] string? q, [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        if (!IsAdmin()) return Forbid();

        var all = _userStore.GetAllUsersSnapshot();
        var filtered = string.IsNullOrWhiteSpace(q)
            ? all
            : all.Where(u =>
                u.Name.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                u.Email.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                u.Handle.Contains(q, StringComparison.OrdinalIgnoreCase));

        var totalCount = filtered.Count();
        var items = filtered
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(u => new
            {
                id            = u.Id,
                name          = u.Name,
                email         = u.Email,
                handle        = u.Handle,
                avatar        = u.Avatar,
                privileges    = u.Privileges,
                createdAtUtc  = u.CreatedAtUtc,
                updatedAtUtc  = u.UpdatedAtUtc,
            })
            .ToList();

        return Ok(new { totalCount, page, pageSize, items });
    }

    // ── Get single user ───────────────────────────────────────────────────────

    [HttpGet("{id}")]
    public IActionResult GetUser(string id)
    {
        if (!IsAdmin()) return Forbid();

        if (!_userStore.TryGetById(id, out var user) || user is null)
            return NotFound(new { error = "User not found." });

        return Ok(new
        {
            id            = user.Id,
            name          = user.Name,
            email         = user.Email,
            handle        = user.Handle,
            avatar        = user.Avatar,
            privileges    = user.Privileges,
            createdAtUtc  = user.CreatedAtUtc,
            updatedAtUtc  = user.UpdatedAtUtc,
        });
    }

    // ── Set privileges ────────────────────────────────────────────────────────

    [HttpPut("{id}/privileges")]
    public IActionResult SetPrivileges(string id, [FromBody] SetPrivilegesRequest req)
    {
        if (!IsAdmin()) return Forbid();

        var unknown = req.Privileges
            .Select(p => p.Trim().ToLowerInvariant())
            .Where(p => !KnownPrivileges.Contains(p))
            .ToList();

        if (unknown.Any())
            return BadRequest(new { error = $"Unknown privilege(s): {string.Join(", ", unknown)}. Known: {string.Join(", ", KnownPrivileges)}" });

        try
        {
            var updated = _userStore.SetPrivileges(id, req.Privileges);
            _logger.LogInformation("Admin {Actor} set privileges [{Privs}] for user {UserId}",
                ActorEmail(), string.Join(",", updated.Privileges), id);

            return Ok(new
            {
                id         = updated.Id,
                email      = updated.Email,
                privileges = updated.Privileges,
            });
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { error = "User not found." });
        }
    }

    // ── Grant single privilege ────────────────────────────────────────────────

    [HttpPost("{id}/privileges/{privilege}")]
    public IActionResult GrantPrivilege(string id, string privilege)
    {
        if (!IsAdmin()) return Forbid();

        var key = privilege.Trim().ToLowerInvariant();
        if (!KnownPrivileges.Contains(key))
            return BadRequest(new { error = $"Unknown privilege '{key}'." });

        if (!_userStore.TryGetById(id, out var user) || user is null)
            return NotFound(new { error = "User not found." });

        var updated = user.Privileges.Contains(key)
            ? user
            : _userStore.SetPrivileges(id, user.Privileges.Append(key));

        _logger.LogInformation("Admin {Actor} granted privilege [{Priv}] to user {UserId}", ActorEmail(), key, id);
        return Ok(new { id = updated.Id, email = updated.Email, privileges = updated.Privileges });
    }

    // ── Revoke single privilege ───────────────────────────────────────────────

    [HttpDelete("{id}/privileges/{privilege}")]
    public IActionResult RevokePrivilege(string id, string privilege)
    {
        if (!IsAdmin()) return Forbid();

        var key = privilege.Trim().ToLowerInvariant();

        if (!_userStore.TryGetById(id, out var user) || user is null)
            return NotFound(new { error = "User not found." });

        var updated = _userStore.SetPrivileges(id, user.Privileges.Where(p => p != key));
        _logger.LogInformation("Admin {Actor} revoked privilege [{Priv}] from user {UserId}", ActorEmail(), key, id);
        return Ok(new { id = updated.Id, email = updated.Email, privileges = updated.Privileges });
    }

    // ── Known privileges catalogue ────────────────────────────────────────────

    [HttpGet("privilege-catalogue")]
    public IActionResult GetPrivilegeCatalogue()
    {
        if (!IsAdmin()) return Forbid();
        return Ok(new { privileges = KnownPrivileges });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private bool IsAdmin()
    {
        var email = User.FindFirstValue(ClaimTypes.Email) ?? User.FindFirstValue("email") ?? string.Empty;
        if (string.IsNullOrWhiteSpace(email)) return false;

        var adminEmails = new[]
        {
            _config["ADMIN__EMAIL__0"], _config["ADMIN__EMAIL__1"], _config["ADMIN__EMAIL__2"],
            _config["Admin__Emails"],
        };

        if (adminEmails.Any(a => string.Equals(a?.Trim(), email, StringComparison.OrdinalIgnoreCase)))
            return true;

        var adminPass = User.FindFirstValue("admin_pass") ?? string.Empty;
        return !string.IsNullOrWhiteSpace(adminPass);
    }

    private string ActorEmail() =>
        User.FindFirstValue(ClaimTypes.Email) ?? User.FindFirstValue("email") ?? "unknown";
}

public sealed class SetPrivilegesRequest
{
    public List<string> Privileges { get; set; } = new();
}
