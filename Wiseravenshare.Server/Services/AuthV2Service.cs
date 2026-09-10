using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services.Interfaces;

namespace Wiseravenshare.Server.Services;

public sealed class AuthV2Service : IAuthV2Service
{
    private readonly IConfiguration _configuration;
    private readonly UserStore _userStore;
    private readonly RefreshTokenStore _refreshTokenStore;

    public AuthV2Service(
        IConfiguration configuration,
        UserStore userStore,
        RefreshTokenStore refreshTokenStore)
    {
        _configuration = configuration;
        _userStore = userStore;
        _refreshTokenStore = refreshTokenStore;
    }

    public Task<AuthV2Result> RegisterAsync(AuthV2RegisterRequest request)
    {
        EnsureSeeded();

        var email = (request.Email ?? string.Empty).Trim();
        var password = request.Password ?? string.Empty;
        var name = (request.Name ?? string.Empty).Trim();

        if (!IsSelfRegistrationAllowed())
        {
            throw new InvalidOperationException("Admin-only access is enabled. Public sign-up is disabled.");
        }

        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        {
            throw new ArgumentException("Email and password are required.");
        }

        if (!IsValidEmail(email))
        {
            throw new ArgumentException("A valid email address is required.");
        }

        if (!MeetsPasswordPolicy(password))
        {
            throw new ArgumentException("Password must be at least 8 characters and include uppercase, lowercase, number, and special character.");
        }

        if (_userStore.EmailExists(email))
        {
            throw new InvalidOperationException("An account with that email already exists.");
        }

        UserRecord user;
        try
        {
            user = _userStore.CreateUser(
                name,
                email,
                password,
                request.Bio ?? string.Empty,
                request.Location ?? string.Empty,
                request.Website ?? string.Empty,
                request.Avatar ?? string.Empty);
        }
        catch (InvalidOperationException ex)
        {
            if (string.Equals(ex.Message, "An account with that email already exists.", StringComparison.Ordinal))
            {
                throw;
            }

            throw new InvalidOperationException("Signup is temporarily unavailable while account storage reconnects. Please try again shortly.");
        }

        return Task.FromResult(BuildAuthResult(user));
    }

    public Task<AuthV2Result> LoginAsync(AuthV2LoginRequest request)
    {
        EnsureSeeded();

        var login = (request.UsernameOrEmail ?? request.Email ?? string.Empty).Trim();
        var password = request.Password ?? string.Empty;
        if (string.IsNullOrWhiteSpace(login) || string.IsNullOrWhiteSpace(password))
        {
            throw new ArgumentException("Email and password are required.");
        }

        var user = _userStore.FindByLoginIdentifier(login);
        if (user is null || !UserStore.VerifyPassword(password, user.PasswordHash))
        {
            throw new UnauthorizedAccessException("Invalid email or password.");
        }

        if (!_userStore.TryGetById(user.Id, out var refreshed) || refreshed is null)
        {
            throw new UnauthorizedAccessException("Invalid email or password.");
        }

        return Task.FromResult(BuildAuthResult(refreshed));
    }

    public Task<AuthV2Result> RefreshAsync(string refreshToken)
    {
        EnsureSeeded();

        var token = (refreshToken ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(token))
        {
            throw new UnauthorizedAccessException("Refresh token is required.");
        }

        var record = _refreshTokenStore.Find(token);
        if (record is null || record.ExpiresAtUtc <= DateTime.UtcNow)
        {
            _refreshTokenStore.Remove(token);
            throw new UnauthorizedAccessException("Refresh token is invalid or expired.");
        }

        if (!_userStore.TryGetById(record.UserId, out var user) || user is null)
        {
            _refreshTokenStore.Remove(token);
            throw new UnauthorizedAccessException("User not found.");
        }

        _refreshTokenStore.Remove(token);
        return Task.FromResult(BuildAuthResult(user));
    }

    public Task<AuthV2VerifyResult> VerifyAsync(string token)
    {
        EnsureSeeded();

        var jwt = (token ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(jwt))
        {
            return Task.FromResult(new AuthV2VerifyResult { Valid = false, Message = "Token is required." });
        }

        try
        {
            var handler = new JwtSecurityTokenHandler();
            var principal = handler.ValidateToken(jwt, BuildValidationParameters(), out _);
            var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
                ?? string.Empty;
            var email = principal.FindFirstValue(ClaimTypes.Email)
                ?? principal.FindFirstValue(JwtRegisteredClaimNames.Email)
                ?? string.Empty;

            UserRecord? user = null;
            if (!string.IsNullOrWhiteSpace(userId))
            {
                _userStore.TryGetById(userId, out user);
            }

            if (user is null && !string.IsNullOrWhiteSpace(email))
            {
                _userStore.TryGetByEmail(email, out user);
            }

            if (user is null)
            {
                return Task.FromResult(new AuthV2VerifyResult { Valid = false, Message = "User not found." });
            }

            return Task.FromResult(new AuthV2VerifyResult
            {
                Valid = true,
                User = BuildUserResponse(user)
            });
        }
        catch
        {
            return Task.FromResult(new AuthV2VerifyResult { Valid = false, Message = "Invalid token." });
        }
    }

    public Task LogoutAsync(Guid userId)
    {
        _refreshTokenStore.RemoveAllForUser(userId.ToString("N"));
        return Task.CompletedTask;
    }

    public AuthV2StatusResult GetStatus()
    {
        var key = ResolveJwtKeyFromConfiguration();
        return new AuthV2StatusResult
        {
            SelfRegistrationEnabled = IsSelfRegistrationAllowed(),
            AdminOnlyLogin = false,
            TeamInviteLoginEnabled = true,
            Jwt = new AuthV2JwtStatus
            {
                IssuerConfigured = !string.IsNullOrWhiteSpace(GetJwtIssuer()),
                AudienceConfigured = !string.IsNullOrWhiteSpace(GetJwtAudience()),
                KeyConfigured = !string.IsNullOrWhiteSpace(key) && key.Length >= 32
            }
        };
    }

    private AuthV2Result BuildAuthResult(UserRecord user)
    {
        var refreshToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        _refreshTokenStore.Save(refreshToken, user.Id, DateTime.UtcNow.AddDays(365));
        return new AuthV2Result
        {
            Token = GenerateToken(user),
            RefreshToken = refreshToken,
            User = BuildUserResponse(user)
        };
    }

    private static AuthV2User BuildUserResponse(UserRecord user)
    {
        return new AuthV2User
        {
            Id = user.Id,
            Email = user.Email,
            Username = user.Handle,
            Name = user.Name,
            DisplayName = user.Name,
            AvatarUrl = user.Avatar,
            TeamRole = "member",
            Role = "User"
        };
    }

    private string GenerateToken(UserRecord user)
    {
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id),
            new Claim(ClaimTypes.NameIdentifier, user.Id),
            new Claim(JwtRegisteredClaimNames.Email, user.Email),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(JwtRegisteredClaimNames.UniqueName, user.Handle),
            new Claim(ClaimTypes.Name, user.Name),
            new Claim(ClaimTypes.Role, "User"),
            new Claim("teamRole", "member"),
            new Claim("access_scope", "team"),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        var token = new JwtSecurityToken(
            issuer: GetJwtIssuer(),
            audience: GetJwtAudience(),
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(GetAccessTokenMinutes()),
            signingCredentials: new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(GetJwtKey())), SecurityAlgorithms.HmacSha256));

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private TokenValidationParameters BuildValidationParameters()
    {
        return new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(GetJwtKey())),
            ValidateIssuer = true,
            ValidIssuer = GetJwtIssuer(),
            ValidateAudience = true,
            ValidAudience = GetJwtAudience(),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1)
        };
    }

    private void EnsureSeeded()
    {
        _userStore.EnsureSeeded(ReadConfiguredUsers());
    }

    private IEnumerable<(string Name, string Email, string Password)> ReadConfiguredUsers()
    {
        foreach (var entry in _configuration.GetSection("Authentication:Users").GetChildren())
        {
            var email = (entry["Email"] ?? string.Empty).Trim();
            var password = (entry["Password"] ?? string.Empty).Trim();
            var name = (entry["Name"] ?? string.Empty).Trim();

            if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
            {
                continue;
            }

            yield return (name, email, password);
        }
    }

    private int GetAccessTokenMinutes()
    {
        if (int.TryParse(_configuration["Authentication:Jwt:ExpiresMinutes"], out var minutes) && minutes > 0)
        {
            return minutes;
        }

        return 60;
    }

    private bool IsSelfRegistrationAllowed()
    {
        var raw = _configuration["Authentication:AllowSelfRegistration"];
        if (string.IsNullOrWhiteSpace(raw))
        {
            return true;
        }

        if (bool.TryParse(raw, out var parsed))
        {
            return parsed;
        }

        if (string.Equals(raw, "1", StringComparison.Ordinal))
        {
            return true;
        }

        if (string.Equals(raw, "0", StringComparison.Ordinal))
        {
            return false;
        }

        return true;
    }

    private string GetJwtKey()
    {
        var key = ResolveJwtKeyFromConfiguration();
        if (string.IsNullOrWhiteSpace(key))
        {
            throw new InvalidOperationException("Authentication:Jwt:Key or JWT_highentropykey is not configured.");
        }

        return key;
    }

    private string ResolveJwtKeyFromConfiguration()
    {
        var candidates = new[]
        {
            _configuration["JWT_highentropykey"],
            _configuration["Authentication:Jwt:Key"],
            _configuration["Authentication__Jwt__Key"],
            Environment.GetEnvironmentVariable("JWT_highentropykey"),
            Environment.GetEnvironmentVariable("Authentication__Jwt__Key")
        };

        foreach (var candidate in candidates)
        {
            var value = (candidate ?? string.Empty).Trim();
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value;
            }
        }

        return string.Empty;
    }

    private string GetJwtIssuer()
    {
        return string.IsNullOrWhiteSpace(_configuration["Authentication:Jwt:Issuer"])
            ? "wiseravenshare.com"
            : _configuration["Authentication:Jwt:Issuer"]!;
    }

    private string GetJwtAudience()
    {
        return string.IsNullOrWhiteSpace(_configuration["Authentication:Jwt:Audience"])
            ? "wiseravenshare.com"
            : _configuration["Authentication:Jwt:Audience"]!;
    }

    private static bool IsValidEmail(string email)
    {
        try
        {
            _ = new System.Net.Mail.MailAddress(email);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static bool MeetsPasswordPolicy(string password)
    {
        return password.Length >= 8
               && password.Any(char.IsUpper)
               && password.Any(char.IsLower)
               && password.Any(char.IsDigit)
               && password.Any(ch => !char.IsLetterOrDigit(ch));
    }
}
