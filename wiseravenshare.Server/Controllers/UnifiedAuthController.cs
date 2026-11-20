using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/unified-auth")]
public sealed class UnifiedAuthController : ControllerBase
{
    // Lightweight health endpoint so this controller remains valid and discoverable.
    [HttpGet("status")]
    [AllowAnonymous]
    public IActionResult Status() => Ok(new { status = "ok" });
}
