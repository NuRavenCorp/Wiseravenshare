using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Services.Interfaces;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/auth-v2")]
[Route("auth-v2")]
public sealed class AuthV2Controller : ControllerBase
{
    private readonly IAuthV2Service _authService;

    public AuthV2Controller(IAuthV2Service authService)
    {
        _authService = authService;
    }

    [HttpGet("status")]
    [AllowAnonymous]
    public IActionResult Status()
    {
        var status = _authService.GetStatus();
        return Ok(new
        {
            selfRegistrationEnabled = status.SelfRegistrationEnabled,
            adminOnlyLogin = status.AdminOnlyLogin,
            teamInviteLoginEnabled = status.TeamInviteLoginEnabled,
            jwt = new
            {
                issuerConfigured = status.Jwt.IssuerConfigured,
                audienceConfigured = status.Jwt.AudienceConfigured,
                keyConfigured = status.Jwt.KeyConfigured
            }
        });
    }

    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<IActionResult> Register([FromBody] AuthV2RegisterRequest request)
    {
        try
        {
            var result = await _authService.RegisterAsync(request);
            return Ok(new { token = result.Token, refreshToken = result.RefreshToken, user = result.User });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            if (ex.Message.Contains("already exists", StringComparison.OrdinalIgnoreCase))
            {
                return Conflict(new { message = ex.Message });
            }

            return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
        }
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login([FromBody] AuthV2LoginRequest request)
    {
        try
        {
            var result = await _authService.LoginAsync(request);
            return Ok(new { token = result.Token, refreshToken = result.RefreshToken, user = result.User });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
    }

    [HttpPost("refresh-token")]
    [AllowAnonymous]
    public async Task<IActionResult> RefreshToken([FromBody] AuthV2RefreshRequest request)
    {
        try
        {
            var result = await _authService.RefreshAsync(request.RefreshToken);
            return Ok(new { token = result.Token, refreshToken = result.RefreshToken, user = result.User });
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
    }

    [HttpPost("verify")]
    [AllowAnonymous]
    public async Task<IActionResult> Verify([FromBody] AuthV2VerifyRequest? request)
    {
        var token = request?.Token ?? string.Empty;
        if (string.IsNullOrWhiteSpace(token) && Request.Headers.TryGetValue("Authorization", out var authHeader))
        {
            var auth = authHeader.ToString();
            if (auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            {
                token = auth["Bearer ".Length..].Trim();
            }
        }

        var result = await _authService.VerifyAsync(token);
        if (!result.Valid || result.User is null)
        {
            return Unauthorized(new { valid = false, message = result.Message });
        }

        return Ok(new { valid = true, user = result.User, adminPassActive = string.Equals(result.User.Role, "Admin", StringComparison.OrdinalIgnoreCase) });
    }

    [HttpPost("logout")]
    [Authorize]
    public async Task<IActionResult> Logout()
    {
        var userIdValue = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue("sub")
            ?? string.Empty;
        if (Guid.TryParse(userIdValue, out var userId))
        {
            await _authService.LogoutAsync(userId);
        }

        return Ok(new { success = true, message = "Logged out successfully" });
    }
}

public sealed class AuthV2RefreshRequest
{
    public string RefreshToken { get; set; } = string.Empty;
}

public sealed class AuthV2VerifyRequest
{
    public string Token { get; set; } = string.Empty;
}
