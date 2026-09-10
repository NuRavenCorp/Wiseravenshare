using System.Security.Claims;

namespace Wiseravenshare.Server.Services.Interfaces;

public interface IAuthV2Service
{
    Task<AuthV2Result> RegisterAsync(AuthV2RegisterRequest request);
    Task<AuthV2Result> LoginAsync(AuthV2LoginRequest request);
    Task<AuthV2Result> RefreshAsync(string refreshToken);
    Task<AuthV2VerifyResult> VerifyAsync(string token);
    Task LogoutAsync(Guid userId);
    AuthV2StatusResult GetStatus();
}

public sealed class AuthV2RegisterRequest
{
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string Bio { get; set; } = string.Empty;
    public string Location { get; set; } = string.Empty;
    public string Website { get; set; } = string.Empty;
    public string Avatar { get; set; } = string.Empty;
}

public sealed class AuthV2LoginRequest
{
    public string Email { get; set; } = string.Empty;
    public string? UsernameOrEmail { get; set; }
    public string Password { get; set; } = string.Empty;
}

public sealed class AuthV2Result
{
    public string Token { get; set; } = string.Empty;
    public string RefreshToken { get; set; } = string.Empty;
    public AuthV2User User { get; set; } = new();
}

public sealed class AuthV2User
{
    public string Id { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? AvatarUrl { get; set; }
    public string TeamRole { get; set; } = "member";
    public string Role { get; set; } = "User";
}

public sealed class AuthV2VerifyResult
{
    public bool Valid { get; set; }
    public string Message { get; set; } = string.Empty;
    public AuthV2User? User { get; set; }
}

public sealed class AuthV2StatusResult
{
    public bool SelfRegistrationEnabled { get; set; }
    public bool AdminOnlyLogin { get; set; }
    public bool TeamInviteLoginEnabled { get; set; }
    public AuthV2JwtStatus Jwt { get; set; } = new();
}

public sealed class AuthV2JwtStatus
{
    public bool IssuerConfigured { get; set; }
    public bool AudienceConfigured { get; set; }
    public bool KeyConfigured { get; set; }
}
