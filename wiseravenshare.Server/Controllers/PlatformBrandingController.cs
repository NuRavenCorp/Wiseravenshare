using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/platform/branding")]
public sealed class PlatformBrandingController : ControllerBase
{
    private const string DefaultBrandLogoUrl = "/assets/branding/th-512.jpg";
    private const string BrandLogoSettingKey = "brand_logo_url";

    private readonly PlatformBrandingStore _brandingStore;
    private readonly ILogger<PlatformBrandingController> _logger;

    public PlatformBrandingController(
        PlatformBrandingStore brandingStore,
        ILogger<PlatformBrandingController> logger)
    {
        _brandingStore = brandingStore;
        _logger = logger;
    }

    [HttpGet]
    [AllowAnonymous]
    public async Task<IActionResult> GetBranding(CancellationToken cancellationToken)
    {
        try
        {
            var storedLogoUrl = await _brandingStore.GetValueAsync(BrandLogoSettingKey, cancellationToken);
            var logoUrl = string.IsNullOrWhiteSpace(storedLogoUrl) ? DefaultBrandLogoUrl : storedLogoUrl.Trim();
            return Ok(new
            {
                brand_logo_url = logoUrl
            });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to read platform branding from database.");
            return Ok(new
            {
                brand_logo_url = DefaultBrandLogoUrl
            });
        }
    }
}
