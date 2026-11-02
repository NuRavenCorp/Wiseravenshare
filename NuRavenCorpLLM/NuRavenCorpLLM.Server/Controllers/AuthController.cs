using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using NuRavenCorpLLM.Infrastructure.Security;

namespace NuRavenCorpLLM.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly BootstrapLoginOptions _bootstrapLogin;
    private readonly IJwtTokenFactory _tokenFactory;

    public AuthController(
        IOptions<BootstrapLoginOptions> bootstrapLogin,
        IJwtTokenFactory tokenFactory)
    {
        _bootstrapLogin = bootstrapLogin.Value;
        _tokenFactory = tokenFactory;
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public IActionResult Login([FromBody] LoginRequest? request)
    {
        if (request is null ||
            string.IsNullOrWhiteSpace(request.Email) ||
            string.IsNullOrWhiteSpace(request.Password))
        {
            return BadRequest(new { message = "Email and password are required." });
        }

        var configuredEmails = GetConfiguredAdminEmails(_bootstrapLogin);
        if (configuredEmails.Count == 0 || string.IsNullOrWhiteSpace(_bootstrapLogin.AdminPassword))
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                message = "Bootstrap login is not configured. Set BootstrapLogin:AdminEmails (or AdminEmail) and BootstrapLogin:AdminPassword."
            });
        }

        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var normalizedPassword = request.Password.Trim();

        var matchesEmail = configuredEmails.Contains(normalizedEmail);
        var matchesPassword = SecureEquals(normalizedPassword, _bootstrapLogin.AdminPassword);

        if (!matchesEmail || !matchesPassword)
        {
            return Unauthorized(new { message = "Invalid credentials." });
        }

        var userId = CreateDeterministicUserId(normalizedEmail);

        var token = _tokenFactory.Create(userId, normalizedEmail, "Admin", isAdmin: true);
        return Ok(new
        {
            token,
            name = "Admin",
            user = new
            {
                id = userId,
                email = normalizedEmail,
                name = "Admin",
                role = "Admin"
            }
        });
    }

    private static bool SecureEquals(string provided, string configured)
    {
        var left = Encoding.UTF8.GetBytes(provided);
        var right = Encoding.UTF8.GetBytes(configured);
        return CryptographicOperations.FixedTimeEquals(left, right);
    }

    private static Guid CreateDeterministicUserId(string email)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(email));
        Span<byte> guidBytes = stackalloc byte[16];
        hash.AsSpan(0, 16).CopyTo(guidBytes);
        guidBytes[6] = (byte)((guidBytes[6] & 0x0F) | 0x50);
        guidBytes[8] = (byte)((guidBytes[8] & 0x3F) | 0x80);
        return new Guid(guidBytes);
    }

    private static HashSet<string> GetConfiguredAdminEmails(BootstrapLoginOptions options)
    {
        var emails = new HashSet<string>(StringComparer.Ordinal);

        if (!string.IsNullOrWhiteSpace(options.AdminEmail))
        {
            emails.Add(options.AdminEmail.Trim().ToLowerInvariant());
        }

        foreach (var email in options.AdminEmails)
        {
            if (!string.IsNullOrWhiteSpace(email))
            {
                emails.Add(email.Trim().ToLowerInvariant());
            }
        }

        return emails;
    }

    public sealed record LoginRequest(string Email, string Password);
}
