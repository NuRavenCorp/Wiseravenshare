using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using NuRavenCorpLLM.Entities;
using NuRavenCorpLLM.Infrastructure.Data;

namespace NuRavenCorpLLM.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IConfiguration _config;
    private readonly ApplicationDbContext _db;

    public AuthController(IConfiguration config, ApplicationDbContext db)
    {
        _config = config;
        _db = db;
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login([FromBody] LoginRequest? request)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
        {
            return BadRequest(new { message = "Email and password are required." });
        }

        var configuredEmail = (_config["Authentication:Users:0:Email"] ?? string.Empty).Trim().ToLowerInvariant();
        var configuredPassword = (_config["Authentication:Users:0:Password"] ?? string.Empty).Trim();

        if (string.IsNullOrWhiteSpace(configuredEmail) || string.IsNullOrWhiteSpace(configuredPassword))
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = "Login credentials are not configured." });
        }

        var email = request.Email.Trim().ToLowerInvariant();
        var password = request.Password.Trim();
        if (email != configuredEmail || !SecureEquals(password, configuredPassword))
        {
            return Unauthorized(new { message = "Invalid credentials." });
        }

        var userId = CreateDeterministicUserId(email);
        var user = await _db.Users.FirstOrDefaultAsync(x => x.Id == userId);
        if (user is null)
        {
            user = new User
            {
                Id = userId,
                Email = email,
                DisplayName = "Admin",
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                IsDeleted = false,
            };
            _db.Users.Add(user);
        }
        else
        {
            user.Email = email;
            user.DisplayName = "Admin";
            user.IsDeleted = false;
            user.DeletedAt = null;
            user.UpdatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();
        var token = CreateJwt(userId, email);
        return Ok(new
        {
            token,
            user = new { id = userId, email, name = "Admin", role = "Admin" },
        });
    }

    private string CreateJwt(Guid userId, string email)
    {
        var key = _config["Authentication:Jwt:Key"] ?? "NuRavenCorpLLM_ChangeMe_SigningKey_2026";
        var issuer = _config["Authentication:Jwt:Issuer"] ?? "wiseravenshare.server";
        var audience = _config["Authentication:Jwt:Audience"] ?? "wiseravenshare.client";
        var expiresMinutes = int.TryParse(_config["Authentication:Jwt:ExpiresMinutes"], out var parsed) ? parsed : 1440;

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, userId.ToString()),
            new(ClaimTypes.Email, email),
            new(ClaimTypes.Role, "Admin"),
            new("sub", userId.ToString()),
            new("name", "Admin"),
        };

        var creds = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)), SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims: claims,
            notBefore: DateTime.UtcNow,
            expires: DateTime.UtcNow.AddMinutes(expiresMinutes),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static bool SecureEquals(string a, string b)
    {
        var left = Encoding.UTF8.GetBytes(a);
        var right = Encoding.UTF8.GetBytes(b);
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

    public sealed record LoginRequest(string Email, string Password);
}
