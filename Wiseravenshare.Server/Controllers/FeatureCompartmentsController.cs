using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/admin/feature-compartments")]
[Authorize]
public sealed class FeatureCompartmentsController : ControllerBase
{
    private readonly IFeatureCompartmentService _featureCompartmentService;
    private readonly IConfiguration _configuration;

    public FeatureCompartmentsController(
        IFeatureCompartmentService featureCompartmentService,
        IConfiguration configuration)
    {
        _featureCompartmentService = featureCompartmentService;
        _configuration = configuration;
    }

    [HttpGet]
    public async Task<IActionResult> GetInventory(CancellationToken cancellationToken)
    {
        if (!IsAdminRequest())
        {
            return Forbid();
        }

        var compartments = await _featureCompartmentService.GetInventoryAsync(cancellationToken);
        return Ok(new
        {
            compartments,
            totalCount = compartments.Count
        });
    }

    [HttpGet("{compartmentKey}")]
    public async Task<IActionResult> GetCompartment(string compartmentKey, CancellationToken cancellationToken)
    {
        if (!IsAdminRequest())
        {
            return Forbid();
        }

        var compartment = await _featureCompartmentService.GetStatusAsync(compartmentKey, cancellationToken);
        if (compartment is null)
        {
            return NotFound(new { message = $"Feature compartment '{compartmentKey}' was not found." });
        }

        return Ok(compartment);
    }

    [HttpPut("{compartmentKey}/lock")]
    public async Task<IActionResult> UpdateCompartmentLock(
        string compartmentKey,
        [FromBody] FeatureCompartmentLockRequest request,
        CancellationToken cancellationToken)
    {
        if (!IsAdminRequest())
        {
            return Forbid();
        }

        var email = User.FindFirstValue(ClaimTypes.Email)
            ?? User.FindFirstValue("email")
            ?? string.Empty;

        var compartment = await _featureCompartmentService.SetLockAsync(
            compartmentKey,
            request.Locked,
            request.Reason,
            email,
            cancellationToken);

        return Ok(new
        {
            compartment,
            message = request.Locked
                ? $"Feature compartment '{compartmentKey}' locked."
                : $"Feature compartment '{compartmentKey}' unlocked."
        });
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