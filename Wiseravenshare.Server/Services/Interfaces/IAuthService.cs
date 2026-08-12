using Wiseravenshare.Server.DTOs.Auth;
using Wiseravenshare.Server.DTOs.User;

namespace Wiseravenshare.Server.Services;

public interface IAuthService
{
    Task<AuthResponseDto> LoginAsync(LoginRequestDto request);
    Task<AuthResponseDto> RegisterAsync(RegisterRequestDto request);
    Task<AuthResponseDto> RefreshTokenAsync(RefreshTokenRequestDto request);
    Task LogoutAsync(Guid userId);
    Task<bool> ValidateTokenAsync(string token);
    Task ChangePasswordAsync(Guid userId, ChangePasswordRequestDto request);
    Task<UserDto> GetCurrentUserAsync(Guid userId);
    Task<bool> ForgotPasswordAsync(string email);
    Task<bool> ResetPasswordAsync(string token, string newPassword);
}