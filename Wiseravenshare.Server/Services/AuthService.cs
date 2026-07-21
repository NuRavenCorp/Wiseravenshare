// Wiseravenshare.Server/Services/AuthService.cs
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Wiseravenshare.Server.DTOs.Auth;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Exceptions;
using Wiseravenshare.Server.Interfaces.Repositories;
using Wiseravenshare.Server.DTOs.User;
using Wiseravenshare.Server.Shared;

namespace Wiseravenshare.Server.Services
{

    public interface IAuthService
    {
        Task<AuthResponseDto> LoginAsync(LoginRequestDto request);
        Task<AuthResponseDto> RegisterAsync(RegisterRequestDto request);
        Task<AuthResponseDto> RefreshTokenAsync(RefreshTokenRequestDto request);
        Task LogoutAsync(Guid userId);
        Task<bool> ValidateTokenAsync(string token);
        Task ChangePasswordAsync(Guid userId, ChangePasswordRequestDto request);
        Task<UserDto> GetCurrentUserAsync(Guid userId);
    }

    public class AuthService : IAuthService
    {
        private readonly IUserRepository _userRepository;
        private readonly IConfiguration _configuration;
        private readonly ILogger<AuthService> _logger;
        private readonly IEmailService _emailService;

        public AuthService(
            IUserRepository userRepository,
            IConfiguration configuration,
            ILogger<AuthService> logger,
            IEmailService emailService)
        {
            _userRepository = userRepository;
            _configuration = configuration;
            _logger = logger;
            _emailService = emailService;
        }

        public async Task<AuthResponseDto> LoginAsync(LoginRequestDto request)
        {
            var user = await _userRepository.GetByEmailAsync(request.Email);
            if (user == null || !user.IsActive)
            {
                throw new UnauthorizedException("Invalid email or password");
            }

            // Verify password
            if (!PasswordHelper.VerifyPassword(request.Password, user.PasswordHash))
            {
                _logger.LogWarning($"Failed login attempt for user: {request.Email}");
                throw new UnauthorizedException("Invalid email or password");
            }

            // Update last login
            user.LastLoginAt = DateTime.UtcNow;
            await _userRepository.UpdateAsync(user);

            // Generate tokens
            var accessToken = GenerateJwtToken(user);
            var refreshToken = GenerateRefreshToken();

            _logger.LogInformation($"User {user.Email} logged in successfully");

            return new AuthResponseDto
            {
                AccessToken = accessToken,
                RefreshToken = refreshToken,
                User = MapToUserDto(user),
                ExpiresAt = DateTime.UtcNow.AddMinutes(15)
            };
        }

        public async Task<AuthResponseDto> RegisterAsync(RegisterRequestDto request)
        {
            // Check if user exists
            if (await _userRepository.GetByEmailAsync(request.Email) != null)
            {
                throw new BadRequestException("Email already registered");
            }

            if (await _userRepository.GetByUsernameAsync(request.Username) != null)
            {
                throw new BadRequestException("Username already taken");
            }

            // Create user
            var user = new User
            {
                Email = request.Email,
                Username = request.Username,
                DisplayName = request.DisplayName ?? request.Username,
                PasswordHash = PasswordHelper.HashPassword(request.Password),
                AvatarUrl = request.AvatarUrl,
                IsActive = true,
                TruthScore = 50.00m
            };

            await _userRepository.AddAsync(user);

            // Initialize user settings
            var settings = new UserSettings { UserId = user.Id };
            // Add settings to context

            _logger.LogInformation($"New user registered: {user.Email}");

            // Send welcome email
            await _emailService.SendWelcomeEmailAsync(user.Email, user.DisplayName);

            // Generate tokens
            var accessToken = GenerateJwtToken(user);
            var refreshToken = GenerateRefreshToken();

            return new AuthResponseDto
            {
                AccessToken = accessToken,
                RefreshToken = refreshToken,
                User = MapToUserDto(user),
                ExpiresAt = DateTime.UtcNow.AddMinutes(15)
            };
        }

        public async Task<AuthResponseDto> RefreshTokenAsync(RefreshTokenRequestDto request)
        {
            // Validate refresh token (simplified - store in database in production)
            if (string.IsNullOrEmpty(request.RefreshToken))
            {
                throw new UnauthorizedException("Invalid refresh token");
            }

            // Get user from token (simplified)
            // In production, store refresh tokens in database with expiration

            throw new NotImplementedException("Refresh token validation not implemented");
        }

        public async Task LogoutAsync(Guid userId)
        {
            // Clear refresh token from database
            _logger.LogInformation($"User {userId} logged out");
            await Task.CompletedTask;
        }

        public async Task<bool> ValidateTokenAsync(string token)
        {
            try
            {
                var tokenHandler = new JwtSecurityTokenHandler();
                var key = Encoding.UTF8.GetBytes(_configuration["Jwt:Key"] ?? "default-secret-key-32-chars-minimum");
                var validationParameters = new TokenValidationParameters
                {
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(key),
                    ValidateIssuer = true,
                    ValidIssuer = _configuration["Jwt:Issuer"],
                    ValidateAudience = true,
                    ValidAudience = _configuration["Jwt:Audience"],
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.Zero
                };

                var principal = tokenHandler.ValidateToken(token, validationParameters, out _);
                return principal != null;
            }
            catch
            {
                return false;
            }
        }

        public async Task ChangePasswordAsync(Guid userId, ChangePasswordRequestDto request)
        {
            var user = await _userRepository.GetByIdAsync(userId);
            if (user == null)
            {
                throw new NotFoundException("User not found");
            }

            if (!PasswordHelper.VerifyPassword(request.CurrentPassword, user.PasswordHash))
            {
                throw new BadRequestException("Current password is incorrect");
            }

            user.PasswordHash = PasswordHelper.HashPassword(request.NewPassword);
            await _userRepository.UpdateAsync(user);

            _logger.LogInformation($"Password changed for user {user.Email}");
        }

        public async Task<UserDto> GetCurrentUserAsync(Guid userId)
        {
            var user = await _userRepository.GetByIdAsync(userId);
            if (user == null)
            {
                throw new NotFoundException("User not found");
            }

            return MapToUserDto(user);
        }

        private string GenerateJwtToken(User user)
        {
            var key = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(_configuration["Jwt:Key"] ?? "default-secret-key-32-chars-minimum"));
            var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var claims = new[]
            {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, user.Email),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(JwtRegisteredClaimNames.UniqueName, user.Username),
            new Claim(ClaimTypes.Name, user.Username),
            new Claim("role", user.Role.ToString()),
            new Claim(ClaimTypes.Role, user.Role.ToString()),
            new Claim("truthScore", user.TruthScore.ToString()),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new Claim(
                JwtRegisteredClaimNames.Iat,
                DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(),
                ClaimValueTypes.Integer64)
        };

            var token = new JwtSecurityToken(
                issuer: _configuration["Jwt:Issuer"] ?? "wiseravenshare.com",
                audience: _configuration["Jwt:Audience"] ?? "wiseravenshare.com",
                claims: claims,
                expires: DateTime.UtcNow.AddMinutes(15),
                signingCredentials: credentials
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        private string GenerateRefreshToken()
        {
            return Convert.ToBase64String(Guid.NewGuid().ToByteArray());
        }

        private UserDto MapToUserDto(User user)
        {
            return new UserDto
            {
                Id = user.Id,
                Email = user.Email,
                Username = user.Username,
                DisplayName = user.DisplayName,
                Bio = user.Bio,
                AvatarUrl = user.AvatarUrl,
                CoverPhotoUrl = user.CoverPhotoUrl,
                Location = user.Location,
                Website = user.Website,
                IsVerified = user.IsVerified,
                IsPrivate = user.IsPrivate,
                Role = user.Role.ToString(),
                TruthScore = user.TruthScore,
                ReputationPoints = user.ReputationPoints,
                CreatedAt = user.CreatedAt,
                LastActiveAt = user.LastActiveAt
            };
        }
    }
}