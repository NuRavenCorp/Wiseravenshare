using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/admin/synthetic-engagement")]
[Authorize]
public sealed class SyntheticEngagementController : ControllerBase
{
    private readonly SyntheticEngagementService _syntheticEngagementService;
    private readonly IConfiguration _configuration;

    public SyntheticEngagementController(
        SyntheticEngagementService syntheticEngagementService,
        IConfiguration configuration)
    {
        _syntheticEngagementService = syntheticEngagementService;
        _configuration = configuration;
    }

    [HttpPost("bootstrap")]
    public async Task<IActionResult> Bootstrap([FromBody] SyntheticBootstrapRequest? request, CancellationToken cancellationToken)
    {
        if (!IsFeatureEnabled())
        {
            return StatusCode(StatusCodes.Status403Forbidden, new
            {
                message = "Synthetic engagement is disabled. Set SyntheticEngagement:Enabled=true to allow this endpoint."
            });
        }

        if (!IsAdminRequest())
        {
            return Forbid();
        }

        var payload = request ?? new SyntheticBootstrapRequest();
        ApplyDefaults(payload);
        var result = await _syntheticEngagementService.EnsurePersonasAsync(payload, cancellationToken);
        return Ok(result);
    }

    [HttpPost("run")]
    public async Task<IActionResult> Run([FromBody] SyntheticRunRequest? request, CancellationToken cancellationToken)
    {
        if (!IsFeatureEnabled())
        {
            return StatusCode(StatusCodes.Status403Forbidden, new
            {
                message = "Synthetic engagement is disabled. Set SyntheticEngagement:Enabled=true to allow this endpoint."
            });
        }

        if (!IsAdminRequest())
        {
            return Forbid();
        }

        var payload = request ?? new SyntheticRunRequest();
        ApplyDefaults(payload);
        var result = await _syntheticEngagementService.GenerateActivityAsync(payload, cancellationToken);
        return Ok(result);
    }

    [HttpGet("status")]
    public async Task<IActionResult> Status([FromQuery] string? prefix, [FromQuery] string? emailDomain, CancellationToken cancellationToken)
    {
        if (!IsAdminRequest())
        {
            return Forbid();
        }

        var statusRequest = new SyntheticStatusRequest
        {
            Prefix = prefix,
            EmailDomain = emailDomain
        };
        ApplyDefaults(statusRequest);

        var result = await _syntheticEngagementService.GetStatusAsync(statusRequest, cancellationToken);

        return Ok(result);
    }

    private bool IsFeatureEnabled()
    {
        var configured = _configuration["SyntheticEngagement:Enabled"];
        return bool.TryParse(configured, out var enabled) && enabled;
    }

    private void ApplyDefaults(SyntheticBootstrapRequest request)
    {
        request.Prefix = ResolveDefault(request.Prefix, "SyntheticEngagement:DefaultPrefix");
        request.EmailDomain = ResolveDefault(request.EmailDomain, "SyntheticEngagement:DefaultEmailDomain");
    }

    private void ApplyDefaults(SyntheticRunRequest request)
    {
        request.Prefix = ResolveDefault(request.Prefix, "SyntheticEngagement:DefaultPrefix");
        request.EmailDomain = ResolveDefault(request.EmailDomain, "SyntheticEngagement:DefaultEmailDomain");
    }

    private void ApplyDefaults(SyntheticStatusRequest request)
    {
        request.Prefix = ResolveDefault(request.Prefix, "SyntheticEngagement:DefaultPrefix");
        request.EmailDomain = ResolveDefault(request.EmailDomain, "SyntheticEngagement:DefaultEmailDomain");
    }

    private string? ResolveDefault(string? currentValue, string configKey)
    {
        if (!string.IsNullOrWhiteSpace(currentValue))
        {
            return currentValue;
        }

        var configured = _configuration[configKey];
        return string.IsNullOrWhiteSpace(configured) ? currentValue : configured.Trim();
    }

    private bool IsAdminRequest()
    {
        var email = User.FindFirstValue(ClaimTypes.Email)
            ?? User.FindFirstValue("email")
            ?? string.Empty;

        if (string.IsNullOrWhiteSpace(email))
        {
            return false;
        }

        var configuredAdminEmails = _configuration.GetSection("Admin:Emails").Get<string[]>() ?? [];
        if (configuredAdminEmails.Any(value => string.Equals(value?.Trim(), email, StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        var configuredAuthUsers = _configuration.GetSection("Authentication:Users").GetChildren()
            .Select(section => section["Email"]?.Trim())
            .Where(value => !string.IsNullOrWhiteSpace(value));

        return configuredAuthUsers.Any(value => string.Equals(value, email, StringComparison.OrdinalIgnoreCase));
    }
}