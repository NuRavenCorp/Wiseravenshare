using System.Collections.Concurrent;
using System.ComponentModel.DataAnnotations;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Route("[controller]")]
public class AuthController : ControllerBase
{
    private static readonly ConcurrentDictionary<string, PasswordResetRecord> PasswordResetsByToken = new(StringComparer.Ordinal);
    private static readonly ConcurrentDictionary<string, LoginAttemptRecord> LoginAttemptsByKey = new(StringComparer.OrdinalIgnoreCase);
    private static readonly TimeSpan LoginAttemptWindow = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan LoginLockoutDuration = TimeSpan.FromMinutes(15);
    private const int MaxFailedLoginAttempts = 5;

    private readonly IConfiguration _configuration;
    private readonly UserStore _userStore;

    public AuthController(IConfiguration configuration, UserStore userStore)
    {
        _configuration = configuration;
        _userStore = userStore;
    }

    [HttpPost("register")]
    [AllowAnonymous]
    public IActionResult Register([FromBody] RegisterRequest request)
    {
        EnsureConfiguredUsersSeeded();

        if (!IsSelfRegistrationAllowed())
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "Self-registration is disabled." });
        }

        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
        {
            return BadRequest(new { message = "Email and password are required." });
        }

        if (!IsValidEmail(request.Email))
        {
            return BadRequest(new { message = "A valid email address is required." });
        }

        if (!MeetsPasswordPolicy(request.Password))
        {
            return BadRequest(new { message = "Password must be at least 8 characters and include uppercase, lowercase, number, and special character." });
        }

        if (_userStore.EmailExists(request.Email))
        {
            return Conflict(new { message = "An account with that email already exists." });
        }

        var user = _userStore.CreateUser(
            request.Name,
            request.Email,
            request.Password,
            request.Bio,
            request.Location,
            request.Website,
            request.Avatar);

        var token = GenerateToken(user.Id, user.Email, user.Name);
        return Ok(new { token, user = UserStore.ToResponse(user) });
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public IActionResult Login([FromBody] LoginRequest request)
    {
        EnsureConfiguredUsersSeeded();

        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
        {
            return BadRequest(new { message = "Email and password are required." });
        }

        var attemptKey = BuildAttemptKey(request.Email);
        if (IsLockedOut(attemptKey, out var retryAfter))
        {
            Response.Headers["Retry-After"] = Math.Max((int)Math.Ceiling(retryAfter.TotalSeconds), 1).ToString();
            return StatusCode(StatusCodes.Status429TooManyRequests, new { message = "Too many failed login attempts. Please try again later." });
        }

        var user = _userStore.FindByLoginIdentifier(request.Email);
        if (user is null || !UserStore.VerifyPassword(request.Password, user.PasswordHash))
        {
            RecordFailedLogin(attemptKey);
            return Unauthorized(new { message = "Invalid email or password." });
        }

        ClearFailedLogins(attemptKey);

        var token = GenerateToken(user.Id, user.Email, user.Name);
        return Ok(new { token, user = UserStore.ToResponse(user) });
    }

    [HttpPost("verify")]
    [AllowAnonymous]
    public IActionResult Verify([FromBody] VerifyRequest? request)
    {
        EnsureConfiguredUsersSeeded();

        var providedToken = request?.Token;
        if (string.IsNullOrWhiteSpace(providedToken) && Request.Headers.TryGetValue("Authorization", out var authorizationHeader))
        {
            var auth = authorizationHeader.ToString();
            if (auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            {
                providedToken = auth["Bearer ".Length..].Trim();
            }
        }

        if (string.IsNullOrWhiteSpace(providedToken))
        {
            return Unauthorized(new { valid = false, message = "Token is required." });
        }

        var tokenHandler = new JwtSecurityTokenHandler();

        try
        {
            var claimsPrincipal = tokenHandler.ValidateToken(providedToken, BuildTokenValidationParameters(), out _);
            var email = claimsPrincipal.FindFirstValue(ClaimTypes.Email);
            if (string.IsNullOrWhiteSpace(email))
            {
                return Unauthorized(new { valid = false, message = "Invalid token claims." });
            }

            if (!_userStore.TryGetByEmail(email, out var user) || user is null)
            {
                var nameFromClaims = claimsPrincipal.FindFirstValue(ClaimTypes.Name) ?? email.Split('@')[0];
                var subFromClaims = claimsPrincipal.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? string.Empty;
                user = _userStore.UpsertFromToken(subFromClaims, email, nameFromClaims);
            }

            return Ok(new { valid = true, user = UserStore.ToResponse(user) });
        }
        catch
        {
            return Unauthorized(new { valid = false, message = "Invalid token." });
        }
    }

    [HttpPost("logout")]
    [Authorize]
    public IActionResult Logout()
    {
        return Ok(new { success = true });
    }

    [HttpPost("forgot-password")]
    [AllowAnonymous]
    public IActionResult ForgotPassword([FromBody] ForgotPasswordRequest request)
    {
        EnsureConfiguredUsersSeeded();

        var email = request.Email?.Trim() ?? string.Empty;
        if (!IsValidEmail(email))
        {
            return BadRequest(new { message = "A valid email address is required." });
        }

        if (!_userStore.EmailExists(email))
        {
            return Ok(new
            {
                success = true,
                message = "If an account exists for that email, a reset token has been generated."
            });
        }

        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(24));
        var expiresAtUtc = DateTime.UtcNow.AddMinutes(30);
        PasswordResetsByToken[token] = new PasswordResetRecord
        {
            Email = email,
            ExpiresAtUtc = expiresAtUtc
        };

        if (!HttpContext.RequestServices.GetRequiredService<IWebHostEnvironment>().IsDevelopment())
        {
            return Ok(new
            {
                success = true,
                message = "If an account exists for that email, reset instructions have been sent."
            });
        }

        return Ok(new
        {
            success = true,
            message = "Development mode: use the reset token to set a new password.",
            resetToken = token,
            expiresAtUtc
        });
    }

    [HttpPost("reset-password")]
    [AllowAnonymous]
    public IActionResult ResetPassword([FromBody] ResetPasswordRequest request)
    {
        EnsureConfiguredUsersSeeded();

        if (string.IsNullOrWhiteSpace(request.Token) || string.IsNullOrWhiteSpace(request.NewPassword))
        {
            return BadRequest(new { message = "Token and new password are required." });
        }

        if (!MeetsPasswordPolicy(request.NewPassword))
        {
            return BadRequest(new { message = "Password must be at least 8 characters and include uppercase, lowercase, number, and special character." });
        }

        var token = request.Token.Trim();
        if (!PasswordResetsByToken.TryGetValue(token, out var record) || record.ExpiresAtUtc < DateTime.UtcNow)
        {
            PasswordResetsByToken.TryRemove(token, out _);
            return Unauthorized(new { message = "Reset token is invalid or expired." });
        }

        try
        {
            _userStore.UpdatePassword(record.Email, request.NewPassword);
        }
        catch (KeyNotFoundException)
        {
            PasswordResetsByToken.TryRemove(token, out _);
            return Unauthorized(new { message = "Reset token is invalid or expired." });
        }

        foreach (var pair in PasswordResetsByToken.Where(p => string.Equals(p.Value.Email, record.Email, StringComparison.OrdinalIgnoreCase)).ToList())
        {
            PasswordResetsByToken.TryRemove(pair.Key, out _);
        }

        return Ok(new { success = true, message = "Password reset successful." });
    }

    private TokenValidationParameters BuildTokenValidationParameters()
    {
        return new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(GetJwtKey())),
            ValidateIssuer = true,
            ValidIssuer = _configuration["Authentication:Jwt:Issuer"],
            ValidateAudience = true,
            ValidAudience = _configuration["Authentication:Jwt:Audience"],
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1)
        };
    }

    private string GenerateToken(string id, string email, string name)
    {
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, id),
            new(ClaimTypes.NameIdentifier, id),
            new(JwtRegisteredClaimNames.Email, email),
            new(ClaimTypes.Name, name),
            new(ClaimTypes.Email, email)
        };

        var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(GetJwtKey()));
        var credentials = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);
        var expiresMinutes = int.TryParse(_configuration["Authentication:Jwt:ExpiresMinutes"], out var minutes)
            ? Math.Max(minutes, 5)
            : 60;

        var token = new JwtSecurityToken(
            issuer: _configuration["Authentication:Jwt:Issuer"],
            audience: _configuration["Authentication:Jwt:Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(expiresMinutes),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private string GetJwtKey()
    {
        var key = _configuration["Authentication:Jwt:Key"];
        if (string.IsNullOrWhiteSpace(key))
        {
            throw new InvalidOperationException("Authentication:Jwt:Key is not configured.");
        }

        return key;
    }

    private static bool IsValidEmail(string email)
    {
        return new EmailAddressAttribute().IsValid(email?.Trim());
    }

    private bool IsSelfRegistrationAllowed()
    {
        return _configuration.GetValue("Authentication:AllowSelfRegistration", false);
    }

    private static bool MeetsPasswordPolicy(string password)
    {
        if (string.IsNullOrWhiteSpace(password) || password.Length < 8)
        {
            return false;
        }

        var hasUpper = password.Any(char.IsUpper);
        var hasLower = password.Any(char.IsLower);
        var hasDigit = password.Any(char.IsDigit);
        var hasSpecial = password.Any(c => !char.IsLetterOrDigit(c));
        return hasUpper && hasLower && hasDigit && hasSpecial;
    }

    private string BuildAttemptKey(string identifier)
    {
        var normalizedIdentifier = (identifier ?? string.Empty).Trim().ToLowerInvariant();
        var remoteIp = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return $"{remoteIp}|{normalizedIdentifier}";
    }

    private static bool IsLockedOut(string key, out TimeSpan retryAfter)
    {
        retryAfter = TimeSpan.Zero;
        if (!LoginAttemptsByKey.TryGetValue(key, out var record))
        {
            return false;
        }

        if (record.LockedOutUntilUtc is null || record.LockedOutUntilUtc <= DateTime.UtcNow)
        {
            LoginAttemptsByKey.TryRemove(key, out _);
            return false;
        }

        retryAfter = record.LockedOutUntilUtc.Value - DateTime.UtcNow;
        return true;
    }

    private static void RecordFailedLogin(string key)
    {
        var now = DateTime.UtcNow;
        LoginAttemptsByKey.AddOrUpdate(
            key,
            _ => new LoginAttemptRecord
            {
                FirstAttemptUtc = now,
                FailedCount = 1
            },
            (_, existing) =>
            {
                if (existing.LockedOutUntilUtc is not null && existing.LockedOutUntilUtc > now)
                {
                    return existing;
                }

                if (now - existing.FirstAttemptUtc > LoginAttemptWindow)
                {
                    existing.FirstAttemptUtc = now;
                    existing.FailedCount = 1;
                    existing.LockedOutUntilUtc = null;
                    return existing;
                }

                existing.FailedCount++;
                if (existing.FailedCount >= MaxFailedLoginAttempts)
                {
                    existing.LockedOutUntilUtc = now.Add(LoginLockoutDuration);
                }

                return existing;
            });
    }

    private static void ClearFailedLogins(string key)
    {
        LoginAttemptsByKey.TryRemove(key, out _);
    }

    private void EnsureConfiguredUsersSeeded()
    {
        var configuredUsers = (_configuration.GetSection("Authentication:Users").Get<List<ConfiguredUser>>() ?? new List<ConfiguredUser>())
            .Select(u => (u.Name, u.Email, u.Password));
        _userStore.EnsureSeeded(configuredUsers);
    }

    private sealed class ConfiguredUser
    {
        public string Name { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }

    private sealed class PasswordResetRecord
    {
        public string Email { get; set; } = string.Empty;
        public DateTime ExpiresAtUtc { get; set; }
    }

    private sealed class LoginAttemptRecord
    {
        public DateTime FirstAttemptUtc { get; set; }
        public int FailedCount { get; set; }
        public DateTime? LockedOutUntilUtc { get; set; }
    }
}

public sealed class LoginRequest
{
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public sealed class RegisterRequest
{
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string Bio { get; set; } = string.Empty;
    public string Location { get; set; } = string.Empty;
    public string Website { get; set; } = string.Empty;
    public string Avatar { get; set; } = string.Empty;
}

public sealed class VerifyRequest
{
    public string Token { get; set; } = string.Empty;
}

public sealed class ForgotPasswordRequest
{
    public string Email { get; set; } = string.Empty;
}

public sealed class ResetPasswordRequest
{
    public string Token { get; set; } = string.Empty;
    public string NewPassword { get; set; } = string.Empty;
}
