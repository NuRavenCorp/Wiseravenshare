using System.Collections.Concurrent;
using System.ComponentModel.DataAnnotations;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Route("[controller]")]
public class AuthController : ControllerBase
{
    private static readonly ConcurrentDictionary<string, UserRecord> UsersByEmail = new(StringComparer.OrdinalIgnoreCase);
    private static readonly ConcurrentDictionary<string, PasswordResetRecord> PasswordResetsByToken = new(StringComparer.Ordinal);
    private static readonly object SeedLock = new();
    private static readonly object PersistenceLock = new();
    private static bool _seeded;
    private readonly IConfiguration _configuration;
    private readonly IWebHostEnvironment _environment;

    public AuthController(IConfiguration configuration, IWebHostEnvironment environment)
    {
        _configuration = configuration;
        _environment = environment;
    }

    [HttpPost("register")]
    [AllowAnonymous]
    public IActionResult Register([FromBody] RegisterRequest request)
    {
        EnsureConfiguredUsersSeeded();

        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
        {
            return BadRequest(new { message = "Email and password are required." });
        }

        if (!IsValidEmail(request.Email))
        {
            return BadRequest(new { message = "A valid email address is required." });
        }

        if (request.Password.Length < 8)
        {
            return BadRequest(new { message = "Password must be at least 8 characters." });
        }

        if (UsersByEmail.ContainsKey(request.Email))
        {
            return Conflict(new { message = "An account with that email already exists." });
        }

        var user = new UserRecord
        {
            Id = Guid.NewGuid().ToString("N"),
            Email = request.Email.Trim(),
            Name = string.IsNullOrWhiteSpace(request.Name) ? request.Email.Split('@')[0] : request.Name.Trim(),
            Handle = string.IsNullOrWhiteSpace(request.Name)
                ? request.Email.Split('@')[0]
                : request.Name.Trim().ToLowerInvariant().Replace(" ", string.Empty),
            PasswordHash = HashPassword(request.Password)
        };

        if (!UsersByEmail.TryAdd(user.Email, user))
        {
            return Conflict(new { message = "An account with that email already exists." });
        }

        try
        {
            PersistUsers();
        }
        catch
        {
            // Keep signup/login functional even when local file persistence is unavailable.
        }

        var token = GenerateToken(user);
        return Ok(new { token, user = ToResponse(user) });
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

        var loginIdentifier = request.Email.Trim();
        UserRecord? user = null;

        if (loginIdentifier.Contains('@'))
        {
            UsersByEmail.TryGetValue(loginIdentifier, out user);
        }
        else
        {
            user = UsersByEmail.Values.FirstOrDefault(u =>
                string.Equals(u.Handle, loginIdentifier, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(u.Name, loginIdentifier, StringComparison.OrdinalIgnoreCase));
        }

        if (user is null || !VerifyPassword(request.Password, user.PasswordHash))
        {
            return Unauthorized(new { message = "Invalid email or password." });
        }

        var token = GenerateToken(user);
        return Ok(new { token, user = ToResponse(user) });
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
                providedToken = auth.Substring("Bearer ".Length).Trim();
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

            if (!UsersByEmail.TryGetValue(email, out var user))
            {
                // In stateless/multi-instance deployments, token may be valid even if local memory cache is cold.
                // Reconstruct a minimal user object from token claims to keep session continuity.
                var nameFromClaims = claimsPrincipal.FindFirstValue(ClaimTypes.Name) ?? email.Split('@')[0];
                user = new UserRecord
                {
                    Id = claimsPrincipal.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? Guid.NewGuid().ToString("N"),
                    Email = email,
                    Name = nameFromClaims,
                    Handle = nameFromClaims.ToLowerInvariant().Replace(" ", string.Empty),
                    PasswordHash = string.Empty
                };
                UsersByEmail.TryAdd(user.Email, user);
            }

            return Ok(new { valid = true, user = ToResponse(user) });
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

        if (!UsersByEmail.ContainsKey(email))
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

        return Ok(new
        {
            success = true,
            message = "Use the reset token to set a new password.",
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

        if (request.NewPassword.Length < 8)
        {
            return BadRequest(new { message = "Password must be at least 8 characters." });
        }

        var token = request.Token.Trim();
        if (!PasswordResetsByToken.TryGetValue(token, out var record) || record.ExpiresAtUtc < DateTime.UtcNow)
        {
            PasswordResetsByToken.TryRemove(token, out _);
            return Unauthorized(new { message = "Reset token is invalid or expired." });
        }

        if (!UsersByEmail.TryGetValue(record.Email, out var user))
        {
            PasswordResetsByToken.TryRemove(token, out _);
            return Unauthorized(new { message = "Reset token is invalid or expired." });
        }

        user.PasswordHash = HashPassword(request.NewPassword);

        try
        {
            PersistUsers();
        }
        catch
        {
            // Keep reset flow functional if local file persistence is unavailable.
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

    private string GenerateToken(UserRecord user)
    {
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id),
            new(JwtRegisteredClaimNames.Email, user.Email),
            new(ClaimTypes.Name, user.Name),
            new(ClaimTypes.Email, user.Email)
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

    private static UserResponse ToResponse(UserRecord user)
    {
        return new UserResponse
        {
            Id = user.Id,
            Name = user.Name,
            Email = user.Email,
            Handle = user.Handle
        };
    }

    private static string HashPassword(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, 100_000, HashAlgorithmName.SHA256, 32);
        return $"{Convert.ToBase64String(salt)}.{Convert.ToBase64String(hash)}";
    }

    private static bool VerifyPassword(string password, string stored)
    {
        var parts = stored.Split('.', 2);
        if (parts.Length != 2)
        {
            return false;
        }

        var salt = Convert.FromBase64String(parts[0]);
        var expectedHash = Convert.FromBase64String(parts[1]);
        var actualHash = Rfc2898DeriveBytes.Pbkdf2(password, salt, 100_000, HashAlgorithmName.SHA256, 32);
        return CryptographicOperations.FixedTimeEquals(expectedHash, actualHash);
    }

    private sealed class UserRecord
    {
        public string Id { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string Handle { get; set; } = string.Empty;
        public string PasswordHash { get; set; } = string.Empty;
    }

    private sealed class PasswordResetRecord
    {
        public string Email { get; set; } = string.Empty;
        public DateTime ExpiresAtUtc { get; set; }
    }

    private static bool IsValidEmail(string email)
    {
        return new EmailAddressAttribute().IsValid(email?.Trim());
    }

    private void EnsureConfiguredUsersSeeded()
    {
        if (_seeded)
        {
            return;
        }

        lock (SeedLock)
        {
            if (_seeded)
            {
                return;
            }

            var configuredUsers = _configuration.GetSection("Authentication:Users").Get<List<ConfiguredUser>>() ?? new List<ConfiguredUser>();
            LoadPersistedUsersUnsafe();

            foreach (var configuredUser in configuredUsers)
            {
                if (string.IsNullOrWhiteSpace(configuredUser.Email) || string.IsNullOrWhiteSpace(configuredUser.Password) || !IsValidEmail(configuredUser.Email))
                {
                    continue;
                }

                var email = configuredUser.Email.Trim();
                var name = string.IsNullOrWhiteSpace(configuredUser.Name)
                    ? email.Split('@')[0]
                    : configuredUser.Name.Trim();

                var user = new UserRecord
                {
                    Id = Guid.NewGuid().ToString("N"),
                    Email = email,
                    Name = name,
                    Handle = name.ToLowerInvariant().Replace(" ", string.Empty),
                    PasswordHash = HashPassword(configuredUser.Password)
                };

                UsersByEmail.TryAdd(user.Email, user);
            }

            _seeded = true;
        }
    }

    private string GetUsersFilePath()
    {
        var appDataDir = Path.Combine(_environment.ContentRootPath, "App_Data");
        Directory.CreateDirectory(appDataDir);
        return Path.Combine(appDataDir, "users.json");
    }

    private void LoadPersistedUsersUnsafe()
    {
        var path = GetUsersFilePath();
        if (!System.IO.File.Exists(path))
        {
            return;
        }

        try
        {
            var json = System.IO.File.ReadAllText(path);
            var persistedUsers = JsonSerializer.Deserialize<List<UserRecord>>(json) ?? new List<UserRecord>();
            foreach (var persistedUser in persistedUsers)
            {
                if (string.IsNullOrWhiteSpace(persistedUser.Email) || string.IsNullOrWhiteSpace(persistedUser.PasswordHash))
                {
                    continue;
                }

                UsersByEmail.TryAdd(persistedUser.Email, persistedUser);
            }
        }
        catch
        {
            // Keep auth available even if persistence file is malformed.
        }
    }

    private void PersistUsers()
    {
        lock (PersistenceLock)
        {
            var users = UsersByEmail.Values
                .OrderBy(u => u.Email, StringComparer.OrdinalIgnoreCase)
                .ToList();
            var json = JsonSerializer.Serialize(users, new JsonSerializerOptions { WriteIndented = true });
            System.IO.File.WriteAllText(GetUsersFilePath(), json);
        }
    }

    private sealed class ConfiguredUser
    {
        public string Name { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
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

public sealed class UserResponse
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Handle { get; set; } = string.Empty;
}
