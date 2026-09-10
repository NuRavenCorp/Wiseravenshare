using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Interfaces.Repositories;
using Wiseravenshare.Server.Services.Interfaces;
using Wiseravenshare.Server.Shared;

namespace Wiseravenshare.Server.Services;

public sealed class AuthV2Service : IAuthV2Service
{
    private readonly IUserRepository _userRepository;
    private readonly IConfiguration _configuration;
    private readonly ILogger<AuthV2Service> _logger;

    public AuthV2Service(
        IUserRepository userRepository,
        IConfiguration configuration,
        ILogger<AuthV2Service> logger)
    {
        _userRepository = userRepository;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<AuthV2Result> RegisterAsync(AuthV2RegisterRequest request)
    {
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

        var existing = await _userRepository.GetByEmailAsync(email);
        if (existing is not null)
        {
            throw new InvalidOperationException("An account with that email already exists.");
        }

        var username = BuildUsernameFromEmail(email);
        var usernameOwner = await _userRepository.GetByUsernameAsync(username);
        if (usernameOwner is not null)
        {
            username = $"{username}_{Guid.NewGuid():N}"[..Math.Min(50, username.Length + 9)];
        }

        var user = new User
        {
            Email = email,
            Username = username,
            DisplayName = string.IsNullOrWhiteSpace(name) ? username : name,
            PasswordHash = PasswordHelper.HashPassword(password),
            Bio = string.IsNullOrWhiteSpace(request.Bio) ? null : request.Bio.Trim(),
            Location = string.IsNullOrWhiteSpace(request.Location) ? null : request.Location.Trim(),
            Website = string.IsNullOrWhiteSpace(request.Website) ? null : request.Website.Trim(),
            AvatarUrl = string.IsNullOrWhiteSpace(request.Avatar) ? null : request.Avatar.Trim(),
            IsActive = true,
            Role = UserRole.User,
            TruthScore = 50.0m,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        await _userRepository.AddAsync(user);
        await SetAndPersistRefreshTokenAsync(user);
        return BuildAuthResult(user);
    }

    public async Task<AuthV2Result> LoginAsync(AuthV2LoginRequest request)
    {
        var login = (request.UsernameOrEmail ?? request.Email ?? string.Empty).Trim();
        var password = request.Password ?? string.Empty;

        if (string.IsNullOrWhiteSpace(login) || string.IsNullOrWhiteSpace(password))
        {
            throw new ArgumentException("Email/username and password are required.");
        }

        User? user = null;
        if (login.Contains('@'))
        {
            user = await _userRepository.GetByEmailAsync(login);
        }
        else
        {
            user = await _userRepository.GetByUsernameAsync(login) ?? await _userRepository.GetByEmailAsync(login);
        }

        if (user is null || !user.IsActive || user.IsDeleted)
        {
            throw new UnauthorizedAccessException("Invalid email or password.");
        }

        if (!PasswordHelper.VerifyPassword(password, user.PasswordHash))
        {
            _logger.LogWarning("Auth V2 failed login for {Login}.", login);
            throw new UnauthorizedAccessException("Invalid email or password.");
        }

        user.LastLoginAt = DateTime.UtcNow;
        user.UpdatedAt = DateTime.UtcNow;
        await SetAndPersistRefreshTokenAsync(user);
        return BuildAuthResult(user);
    }

    public async Task<AuthV2Result> RefreshAsync(string refreshToken)
    {
        var token = (refreshToken ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(token))
        {
            throw new UnauthorizedAccessException("Refresh token is required.");
        }

        var matches = await _userRepository.FindAsync(u => u.RefreshToken == token && !u.IsDeleted);
        var user = matches.FirstOrDefault();
        if (user is null || !user.IsActive || user.RefreshTokenExpiryTime is null || user.RefreshTokenExpiryTime <= DateTime.UtcNow)
        {
            throw new UnauthorizedAccessException("Refresh token is invalid or expired.");
        }

        user.UpdatedAt = DateTime.UtcNow;
        await SetAndPersistRefreshTokenAsync(user);
        return BuildAuthResult(user);
    }

    public async Task<AuthV2VerifyResult> VerifyAsync(string token)
    {
        var jwt = (token ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(jwt))
        {
            return new AuthV2VerifyResult { Valid = false, Message = "Token is required." };
        }

        try
        {
            var handler = new JwtSecurityTokenHandler();
            var principal = handler.ValidateToken(jwt, BuildValidationParameters(), out _);
            var email = principal.FindFirstValue(ClaimTypes.Email)
                ?? principal.FindFirstValue(JwtRegisteredClaimNames.Email)
                ?? string.Empty;
            if (string.IsNullOrWhiteSpace(email))
            {
                return new AuthV2VerifyResult { Valid = false, Message = "Invalid token claims." };
            }

            var user = await _userRepository.GetByEmailAsync(email);
            if (user is null || !user.IsActive || user.IsDeleted)
            {
                return new AuthV2VerifyResult { Valid = false, Message = "User not found." };
            }

            return new AuthV2VerifyResult
            {
                Valid = true,
                User = BuildUserResponse(user)
            };
        }
        catch
        {
            return new AuthV2VerifyResult { Valid = false, Message = "Invalid token." };
        }
    }

    public async Task LogoutAsync(Guid userId)
    {
        var user = await _userRepository.GetByIdAsync(userId);
        if (user is null)
        {
            return;
        }

        user.RefreshToken = null;
        user.RefreshTokenExpiryTime = null;
        user.UpdatedAt = DateTime.UtcNow;
        await _userRepository.UpdateAsync(user);
    }

    public AuthV2StatusResult GetStatus()
    {
        var issuer = GetJwtIssuer();
        var audience = GetJwtAudience();
        var key = GetJwtKey();
        return new AuthV2StatusResult
        {
            SelfRegistrationEnabled = IsSelfRegistrationAllowed(),
            AdminOnlyLogin = false,
            TeamInviteLoginEnabled = true,
            Jwt = new AuthV2JwtStatus
            {
                IssuerConfigured = !string.IsNullOrWhiteSpace(issuer),
                AudienceConfigured = !string.IsNullOrWhiteSpace(audience),
                KeyConfigured = !string.IsNullOrWhiteSpace(key) && key.Length >= 32
            }
        };
    }

    private async Task SetAndPersistRefreshTokenAsync(User user)
    {
        user.RefreshToken = GenerateRefreshToken();
        user.RefreshTokenExpiryTime = DateTime.UtcNow.AddDays(30);
        await _userRepository.UpdateAsync(user);
    }

    private AuthV2Result BuildAuthResult(User user)
    {
        return new AuthV2Result
        {
            Token = GenerateToken(user),
            RefreshToken = user.RefreshToken ?? string.Empty,
            User = BuildUserResponse(user)
        };
    }

    private AuthV2User BuildUserResponse(User user)
    {
        return new AuthV2User
        {
            Id = user.Id.ToString("N"),
            Email = user.Email,
            Username = user.Username,
            Name = string.IsNullOrWhiteSpace(user.DisplayName) ? user.Username : user.DisplayName,
            DisplayName = string.IsNullOrWhiteSpace(user.DisplayName) ? user.Username : user.DisplayName,
            AvatarUrl = user.AvatarUrl,
            TeamRole = user.Role == UserRole.Admin ? "owner" : "member",
            Role = user.Role.ToString()
        };
    }

    private string GenerateToken(User user)
    {
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString("N")),
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString("N")),
            new Claim(JwtRegisteredClaimNames.Email, user.Email),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(JwtRegisteredClaimNames.UniqueName, user.Username),
            new Claim(ClaimTypes.Name, string.IsNullOrWhiteSpace(user.DisplayName) ? user.Username : user.DisplayName),
            new Claim(ClaimTypes.Role, user.Role.ToString()),
            new Claim("teamRole", user.Role == UserRole.Admin ? "owner" : "member"),
            new Claim("access_scope", user.Role == UserRole.Admin ? "admin" : "team"),
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

        return string.Equals(raw, "1", StringComparison.Ordinal);
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

    private static string GenerateRefreshToken()
    {
        return Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
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

    private static string BuildUsernameFromEmail(string email)
    {
        var localPart = email.Split('@')[0].Trim();
        if (string.IsNullOrWhiteSpace(localPart))
        {
            localPart = $"user{Guid.NewGuid():N}"[..12];
        }

        var sanitized = new string(localPart.Select(ch => char.IsLetterOrDigit(ch) || ch == '_' ? ch : '_').ToArray());
        sanitized = sanitized.Trim('_');
        if (string.IsNullOrWhiteSpace(sanitized))
        {
            sanitized = $"user{Guid.NewGuid():N}"[..12];
        }

        if (sanitized.Length > 50)
        {
            sanitized = sanitized[..50];
        }

        return sanitized;
    }
}
