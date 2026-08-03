using System.Collections.Concurrent;
using System.ComponentModel.DataAnnotations;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Interfaces.Repositories;
using Wiseravenshare.Server.Models;
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
    private readonly IUserRepository _userRepository;
    private readonly GrowthService _growthService;
    private readonly ILogger<AuthController> _logger;

    public AuthController(
        IConfiguration configuration,
        UserStore userStore,
        IUserRepository userRepository,
        GrowthService growthService,
        ILogger<AuthController> logger)
    {
        _configuration = configuration;
        _userStore = userStore;
        _userRepository = userRepository;
        _growthService = growthService;
        _logger = logger;
    }

    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request)
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

        UserRecord user;
        try
        {
            user = _userStore.CreateUser(
                request.Name,
                request.Email,
                request.Password,
                request.Bio,
                request.Location,
                request.Website,
                request.Avatar);
        }
        catch (InvalidOperationException ex) when (string.Equals(ex.Message, "Database persistence is unavailable. Profile and social feed changes were not saved.", StringComparison.Ordinal))
        {
            if (!_userStore.TryGetByEmail(request.Email.Trim(), out var createdUser) || createdUser is null)
            {
                throw;
            }

            user = createdUser;
            _logger.LogWarning(ex, "Proceeding with signup despite persistence availability warning for {Email}.", user.Email);
        }

        try
        {
            _growthService.TrackEvent(user.Id, user.Email, "signup_completed");
            if (!string.IsNullOrWhiteSpace(request.ReferralCode))
            {
                _growthService.TryRedeemInvite(request.ReferralCode, user.Id);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Growth tracking failed during signup for {Email}.", user.Email);
        }

        var domainUserId = await EnsureDomainUserAsync(user);
        var token = GenerateToken(domainUserId.ToString("N"), user.Email, user.Name);

        var responseUser = UserStore.ToResponse(user);
        responseUser.Id = domainUserId.ToString("N");
        return Ok(new { token, user = responseUser });
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
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

        try
        {
            _growthService.TrackEvent(user.Id, user.Email, "login_success");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Growth tracking failed during login for {Email}.", user.Email);
        }

        var domainUserId = await EnsureDomainUserAsync(user);
        var token = GenerateToken(domainUserId.ToString("N"), user.Email, user.Name);

        var responseUser = UserStore.ToResponse(user);
        responseUser.Id = domainUserId.ToString("N");
        return Ok(new { token, user = responseUser });
    }

    [HttpPost("verify")]
    [AllowAnonymous]
    public async Task<IActionResult> Verify([FromBody] VerifyRequest? request)
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

            var domainUserId = await EnsureDomainUserAsync(user);
            var responseUser = UserStore.ToResponse(user);
            responseUser.Id = domainUserId.ToString("N");
            return Ok(new { valid = true, user = responseUser });
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

    private async Task<Guid> EnsureDomainUserAsync(UserRecord authUser)
    {
        if (!Guid.TryParse(authUser.Id, out var parsedId))
        {
            parsedId = Guid.NewGuid();
            _logger.LogWarning("Auth user id '{AuthUserId}' is not a valid GUID. Generated a replacement domain user id for {Email}.", authUser.Id, authUser.Email);
        }

        var existingById = await _userRepository.GetByIdAsync(parsedId);
        if (existingById is not null)
        {
            return existingById.Id;
        }

        var existingByEmail = await _userRepository.GetByEmailAsync(authUser.Email);
        if (existingByEmail is not null)
        {
            if (!existingByEmail.IsActive)
            {
                existingByEmail.IsActive = true;
                await _userRepository.UpdateAsync(existingByEmail);
            }

            return existingByEmail.Id;
        }

        var normalizedEmail = (authUser.Email ?? string.Empty).Trim();
        var displayName = string.IsNullOrWhiteSpace(authUser.Name)
            ? normalizedEmail.Split('@')[0]
            : authUser.Name.Trim();
        var usernameSeed = string.IsNullOrWhiteSpace(authUser.Handle)
            ? normalizedEmail.Split('@')[0]
            : authUser.Handle.Trim().TrimStart('@');
        var sanitizedUsername = new string(usernameSeed.Where(char.IsLetterOrDigit).ToArray());
        if (string.IsNullOrWhiteSpace(sanitizedUsername))
        {
            sanitizedUsername = $"user{parsedId.ToString("N")[..8]}";
        }

        var newUser = new Wiseravenshare.Server.Entities.User
        {
            Id = parsedId,
            Email = normalizedEmail,
            Username = sanitizedUsername.ToLowerInvariant(),
            DisplayName = displayName,
            PasswordHash = authUser.PasswordHash ?? string.Empty,
            Bio = string.IsNullOrWhiteSpace(authUser.Bio) ? null : authUser.Bio.Trim(),
            AvatarUrl = string.IsNullOrWhiteSpace(authUser.Avatar) ? null : authUser.Avatar.Trim(),
            Location = string.IsNullOrWhiteSpace(authUser.Location) ? null : authUser.Location.Trim(),
            Website = string.IsNullOrWhiteSpace(authUser.Website) ? null : authUser.Website.Trim(),
            IsActive = true,
            TruthScore = 50.00m
        };

        await _userRepository.AddAsync(newUser);
        _logger.LogInformation("Provisioned EF user record for auth user {Email} ({UserId}).", newUser.Email, newUser.Id);
        return newUser.Id;
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
    public string ReferralCode { get; set; } = string.Empty;
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
