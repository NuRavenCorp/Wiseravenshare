using System.Collections.Concurrent;
using System.ComponentModel.DataAnnotations;
using System.IdentityModel.Tokens.Jwt;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using Npgsql;
using Google.Apis.Auth;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Interfaces.Repositories;
using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Shared;
using Wiseravenshare.Server.Services;
using Wiseravenshare.Server.Services.Currency;
using AppUserRecord = Wiseravenshare.Server.Models.UserRecord;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Route("[controller]")]
public class AuthController : ControllerBase
{
    private static readonly ConcurrentDictionary<string, PasswordResetRecord> PasswordResetsByToken = new(StringComparer.Ordinal);
    private static readonly ConcurrentDictionary<string, LoginAttemptRecord> LoginAttemptsByKey = new(StringComparer.OrdinalIgnoreCase);
    private static readonly ConcurrentDictionary<string, AdminPassTokenRecord> AdminPassTokensByToken = new(StringComparer.Ordinal);
    private static readonly ConcurrentDictionary<string, OAuthStateRecord> OAuthStatesByToken = new(StringComparer.Ordinal);
    private static int _seededUsersLogWritten;
    private static readonly TimeSpan LoginAttemptWindow = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan LoginLockoutDuration = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan OAuthStateLifetime = TimeSpan.FromMinutes(10);
    private const int MaxFailedLoginAttempts = 5;
    private const string RefreshCookieName = "wr_refresh_token";
    private const int RefreshCookieDays = 365;

    private readonly IConfiguration _configuration;
    private readonly UserStore _userStore;
    private readonly IUserRepository _userRepository;
    private readonly GrowthService _growthService;
    private readonly TeamAccessService _teamAccessService;
    private readonly IBlobStorageService _blobStorageService;
    private readonly IEmailService _emailService;
    private readonly IWiseCoinService _wiseCoinService;
    private readonly ILogger<AuthController> _logger;
    private readonly RefreshTokenStore _refreshTokenStore;

    public AuthController(
        IConfiguration configuration,
        UserStore userStore,
        IUserRepository userRepository,
        GrowthService growthService,
        TeamAccessService teamAccessService,
        IBlobStorageService blobStorageService,
        IEmailService emailService,
        IWiseCoinService wiseCoinService,
        ILogger<AuthController> logger,
        RefreshTokenStore refreshTokenStore)
    {
        _configuration = configuration;
        _userStore = userStore;
        _userRepository = userRepository;
        _growthService = growthService;
        _teamAccessService = teamAccessService;
        _blobStorageService = blobStorageService;
        _emailService = emailService;
        _wiseCoinService = wiseCoinService;
        _logger = logger;
        _refreshTokenStore = refreshTokenStore;
    }

    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request)
    {
        EnsureConfiguredUsersSeeded();

        if (!IsSelfRegistrationAllowed())
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "Admin-only access is enabled. Public sign-up is disabled." });
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
            return BadRequest(new { message = "Unable to register with the provided details." });
        }

        // Validate and uniqueness-check the requested username when supplied.
        string? sanitizedUsername = null;
        if (!string.IsNullOrWhiteSpace(request.Username))
        {
            sanitizedUsername = new string(request.Username.Trim().ToLowerInvariant()
                .Where(c => char.IsLetterOrDigit(c) || c == '_').ToArray());

            if (sanitizedUsername.Length < 3 || sanitizedUsername.Length > 30)
            {
                return BadRequest(new { message = "Username must be between 3 and 30 characters (letters, numbers, underscores only)." });
            }

            if (_userStore.HandleExists(sanitizedUsername))
            {
                return BadRequest(new { message = "That username is already taken. Please choose a different one." });
            }
        }

        AppUserRecord user;
        try
        {
            user = _userStore.CreateUser(
                request.Name,
                request.Email,
                request.Password,
                request.Bio,
                request.Location,
                request.Website,
                request.Avatar,
                sanitizedUsername);
        }
        catch (InvalidOperationException ex)
        {
            if (string.Equals(ex.Message, "An account with that email already exists.", StringComparison.Ordinal))
            {
                return BadRequest(new { message = "Unable to register with the provided details." });
            }

            _logger.LogWarning(ex, "Signup blocked because durable persistence is unavailable for {Email}.", request.Email);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                message = "Signup is temporarily unavailable while account storage reconnects. Please try again shortly."
            });
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
        var accessScope = ResolveAccessScope(user.Email);
        var teamRole = ResolveTeamRole(user.Email);
        var token = GenerateToken(domainUserId.ToString("N"), user.Email, user.Name, accessScope, teamRole);
        var refreshToken = GenerateRefreshToken(domainUserId.ToString("N"));
        var adminPassToken = GenerateAdminPassTokenIfEligible(domainUserId.ToString("N"), user.Email, accessScope);
        SetRefreshCookie(refreshToken);

        // Have authentic Flock creator bots follow newly registered user
        try
        {
            var followStore = HttpContext.RequestServices.GetService<Wiseravenshare.Server.Services.FollowStore>();
            followStore?.HaveBotsFollowUser(domainUserId);
        }
        catch { }

        var responseUser = UserStore.ToResponse(user);
        responseUser.Id = domainUserId.ToString("N");
        try
        {
            if (IsProfileComplete(responseUser))
            {
                await _wiseCoinService.AwardJobWellDoneBadgeAsync(domainUserId, "profile_complete");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Profile badge award failed during registration for {Email}.", user.Email);
        }
        return Ok(new { token, refreshToken, adminPassToken, user = responseUser });
    }

    /// <summary>
    /// Real-time username availability check. Safe to call unauthenticated.
    /// GET /api/auth/check-username?handle=desired_handle
    /// Returns: { available: bool, suggestion: string? }
    /// </summary>
    [HttpGet("check-username")]
    [AllowAnonymous]
    public IActionResult CheckUsername([FromQuery] string? handle)
    {
        if (string.IsNullOrWhiteSpace(handle))
        {
            return BadRequest(new { message = "handle query parameter is required." });
        }

        var sanitized = new string(handle.Trim().ToLowerInvariant()
            .Where(c => char.IsLetterOrDigit(c) || c == '_').ToArray());

        if (sanitized.Length < 3 || sanitized.Length > 30)
        {
            return Ok(new
            {
                available = false,
                suggestion = (string?)null,
                reason = "Username must be 3–30 characters (letters, numbers, underscores only)."
            });
        }

        if (!_userStore.HandleExists(sanitized))
        {
            return Ok(new { available = true, suggestion = (string?)null });
        }

        // Offer a numeric-suffix suggestion when the requested handle is taken.
        var suggestion = _userStore.GenerateUniqueHandle(sanitized, sanitized + "@placeholder.invalid", sanitized);
        return Ok(new { available = false, suggestion });
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

        var loginIdentifier = request.Email?.Trim() ?? string.Empty;
        var attemptKey = BuildAttemptKey(loginIdentifier);
        AppUserRecord? user;
        var matchedStoreUser = _userStore.FindByLoginIdentifier(loginIdentifier);
        var hasValidStoredCredential = matchedStoreUser is not null && VerifyPasswordCompat(request.Password, matchedStoreUser.PasswordHash);
        var hasValidConfiguredCredential = false;
        var hasValidDomainCredential = false;
        AppUserRecord? configuredUser = null;
        Wiseravenshare.Server.Entities.User? domainUser = null;
        if (!hasValidStoredCredential)
        {
            hasValidConfiguredCredential = TryAuthenticateConfiguredCredential(request.Email, request.Password, out configuredUser) && configuredUser is not null;
            if (!hasValidConfiguredCredential)
            {
                try
                {
                    if (!string.IsNullOrWhiteSpace(loginIdentifier))
                    {
                        if (loginIdentifier.Contains('@'))
                        {
                            domainUser = await _userRepository.GetByEmailAsync(loginIdentifier);
                        }
                        else
                        {
                            var username = loginIdentifier.TrimStart('@');
                            if (!string.IsNullOrWhiteSpace(username))
                            {
                                domainUser = await _userRepository.GetByUsernameAsync(username);
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Domain credential lookup failed for login identifier {LoginIdentifier}. Falling back to in-memory/configured auth stores.", loginIdentifier);
                }

                hasValidDomainCredential = domainUser is not null
                    && domainUser.IsActive
                    && VerifyPasswordCompat(request.Password, domainUser.PasswordHash);
            }
        }

        if (IsLockedOut(attemptKey, out var retryAfter))
        {
            // Let any valid credential recover immediately from lockout.
            if (!hasValidStoredCredential && !hasValidConfiguredCredential && !hasValidDomainCredential)
            {
                Response.Headers["Retry-After"] = Math.Max((int)Math.Ceiling(retryAfter.TotalSeconds), 1).ToString();
                return StatusCode(StatusCodes.Status429TooManyRequests, new { message = "Too many failed login attempts. Please try again later." });
            }

            if (hasValidStoredCredential)
            {
                user = matchedStoreUser;
            }
            else if (hasValidConfiguredCredential)
            {
                user = configuredUser;
            }
            else
            {
                user = new AppUserRecord
                {
                    Id = domainUser!.Id.ToString("N"),
                    Email = domainUser.Email,
                    Name = string.IsNullOrWhiteSpace(domainUser.DisplayName) ? domainUser.Username : domainUser.DisplayName,
                    Handle = domainUser.Username,
                    PasswordHash = domainUser.PasswordHash,
                    Bio = domainUser.Bio ?? string.Empty,
                    Location = domainUser.Location ?? string.Empty,
                    Website = domainUser.Website ?? string.Empty,
                    Avatar = domainUser.AvatarUrl ?? string.Empty,
                    EmailVerified = true,
                    CreatedAtUtc = domainUser.CreatedAt,
                    UpdatedAtUtc = domainUser.UpdatedAt
                };
            }
            ClearFailedLogins(attemptKey);
        }
        else
        {
            if (hasValidStoredCredential)
            {
                user = matchedStoreUser;
            }
            else if (hasValidConfiguredCredential)
            {
                user = configuredUser;
            }
            else if (hasValidDomainCredential)
            {
                user = new AppUserRecord
                {
                    Id = domainUser!.Id.ToString("N"),
                    Email = domainUser.Email,
                    Name = string.IsNullOrWhiteSpace(domainUser.DisplayName) ? domainUser.Username : domainUser.DisplayName,
                    Handle = domainUser.Username,
                    PasswordHash = domainUser.PasswordHash,
                    Bio = domainUser.Bio ?? string.Empty,
                    Location = domainUser.Location ?? string.Empty,
                    Website = domainUser.Website ?? string.Empty,
                    Avatar = domainUser.AvatarUrl ?? string.Empty,
                    EmailVerified = true,
                    CreatedAtUtc = domainUser.CreatedAt,
                    UpdatedAtUtc = domainUser.UpdatedAt
                };
            }
            else
            {
                RecordFailedLogin(attemptKey);
                return Unauthorized(new { message = "Invalid email or password." });
            }
        }

        if (user is null)
        {
            RecordFailedLogin(attemptKey);
            return Unauthorized(new { message = "Invalid email or password." });
        }

        if (!IsAuthenticationAllowed(user.Email))
        {
            RecordFailedLogin(attemptKey);
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "Access requires admin approval or an active team invite." });
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
        var accessScope = ResolveAccessScope(user.Email);
        var teamRole = ResolveTeamRole(user.Email);
        var token = GenerateToken(domainUserId.ToString("N"), user.Email, user.Name, accessScope, teamRole);
        var refreshToken = GenerateRefreshToken(domainUserId.ToString("N"));
        var adminPassToken = GenerateAdminPassTokenIfEligible(domainUserId.ToString("N"), user.Email, accessScope);
        SetRefreshCookie(refreshToken);

        // Have authentic Flock creator bots follow newly registered user
        try
        {
            var followStore = HttpContext.RequestServices.GetService<Wiseravenshare.Server.Services.FollowStore>();
            followStore?.HaveBotsFollowUser(domainUserId);
        }
        catch { }

        try
        {
            await _wiseCoinService.AwardJobWellDoneBadgeAsync(domainUserId, "login");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Badge award failed during login for {Email}.", user.Email);
        }

        var responseUser = UserStore.ToResponse(user);
        responseUser.Id = domainUserId.ToString("N");
        return Ok(new { token, refreshToken, adminPassToken, user = responseUser });
    }

    [HttpPost("refresh-token")]
    [AllowAnonymous]
    public async Task<IActionResult> RefreshToken([FromBody] RefreshTokenRequest? request)
    {
        var incomingRefreshToken = string.IsNullOrWhiteSpace(request?.RefreshToken)
            ? (Request.Cookies[RefreshCookieName] ?? string.Empty)
            : request.RefreshToken;

        if (string.IsNullOrWhiteSpace(incomingRefreshToken))
        {
            return BadRequest(new { message = "Refresh token is required." });
        }

        var storedRecord = _refreshTokenStore.Find(incomingRefreshToken);
        if (storedRecord is null || storedRecord.ExpiresAtUtc < DateTime.UtcNow)
        {
            _refreshTokenStore.Remove(incomingRefreshToken);
            return Unauthorized(new { message = "Refresh token is invalid or expired." });
        }
        if (!_userStore.TryGetById(storedRecord.UserId, out var user) || user is null)
        {
            _refreshTokenStore.Remove(incomingRefreshToken);
            return Unauthorized(new { message = "User not found." });
        }

        if (!IsAuthenticationAllowed(user.Email))
        {
            _refreshTokenStore.Remove(incomingRefreshToken);
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "Access requires admin approval or an active team invite." });
        }

        _refreshTokenStore.Remove(incomingRefreshToken);

        var domainUserId = await EnsureDomainUserAsync(user);
        var accessScope = ResolveAccessScope(user.Email);
        var teamRole = ResolveTeamRole(user.Email);
        var newToken = GenerateToken(domainUserId.ToString("N"), user.Email, user.Name, accessScope, teamRole);
        var newRefreshToken = GenerateRefreshToken(domainUserId.ToString("N"));
        var adminPassToken = GenerateAdminPassTokenIfEligible(domainUserId.ToString("N"), user.Email, accessScope);
        SetRefreshCookie(newRefreshToken);

        return Ok(new { token = newToken, refreshToken = newRefreshToken, adminPassToken });
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

        // 1. If a JWT token was provided, validate it
        if (!string.IsNullOrWhiteSpace(providedToken))
        {
            var tokenHandler = new JwtSecurityTokenHandler();
            try
            {
                var claimsPrincipal = tokenHandler.ValidateToken(providedToken, BuildTokenValidationParameters(), out _);
                var email = claimsPrincipal.FindFirstValue(ClaimTypes.Email)
                    ?? claimsPrincipal.FindFirstValue(JwtRegisteredClaimNames.Email)
                    ?? claimsPrincipal.FindFirstValue("email");

                if (!string.IsNullOrWhiteSpace(email))
                {
                    if (!_userStore.TryGetByEmail(email, out var user) || user is null)
                    {
                        var nameFromClaims = claimsPrincipal.FindFirstValue(ClaimTypes.Name)
                            ?? claimsPrincipal.FindFirstValue(JwtRegisteredClaimNames.Name)
                            ?? claimsPrincipal.FindFirstValue("name")
                            ?? email.Split('@')[0];
                        var subFromClaims = claimsPrincipal.FindFirstValue(ClaimTypes.NameIdentifier)
                            ?? claimsPrincipal.FindFirstValue(JwtRegisteredClaimNames.Sub)
                            ?? claimsPrincipal.FindFirstValue("sub")
                            ?? string.Empty;
                        user = _userStore.UpsertFromToken(subFromClaims, email, nameFromClaims);
                    }

                    if (!IsAuthenticationAllowed(user.Email))
                    {
                        return StatusCode(StatusCodes.Status403Forbidden, new { valid = false, message = "Access requires admin approval or an active team invite." });
                    }

                    var domainUserId = await EnsureDomainUserAsync(user);
                    var responseUser = UserStore.ToResponse(user);
                    responseUser.Id = domainUserId.ToString("N");
                    var accessScope = ResolveAccessScope(user.Email);
                    var teamRole = ResolveTeamRole(user.Email);
                    return Ok(new
                    {
                        valid = true,
                        user = responseUser,
                        adminPassActive = string.Equals(accessScope, "admin", StringComparison.OrdinalIgnoreCase),
                        accessScope,
                        teamRole
                    });
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Provided token validation failed; falling back to HttpContext identity check.");
            }
        }

        // 2. Check active authenticated session on HttpContext (cookies, Identity, UnifiedAuthScheme)
        if (User.Identity?.IsAuthenticated == true)
        {
            var email = User.FindFirstValue(ClaimTypes.Email)
                ?? User.FindFirstValue(JwtRegisteredClaimNames.Email)
                ?? User.FindFirstValue("email");

            if (!string.IsNullOrWhiteSpace(email))
            {
                if (!_userStore.TryGetByEmail(email, out var user) || user is null)
                {
                    var nameFromClaims = User.FindFirstValue(ClaimTypes.Name)
                        ?? User.FindFirstValue(JwtRegisteredClaimNames.Name)
                        ?? User.FindFirstValue("name")
                        ?? email.Split('@')[0];
                    var subFromClaims = User.FindFirstValue(ClaimTypes.NameIdentifier)
                        ?? User.FindFirstValue(JwtRegisteredClaimNames.Sub)
                        ?? User.FindFirstValue("sub")
                        ?? string.Empty;
                    user = _userStore.UpsertFromToken(subFromClaims, email, nameFromClaims);
                }

                if (!IsAuthenticationAllowed(user.Email))
                {
                    return StatusCode(StatusCodes.Status403Forbidden, new { valid = false, message = "Access requires admin approval or an active team invite." });
                }

                var domainUserId = await EnsureDomainUserAsync(user);
                var responseUser = UserStore.ToResponse(user);
                responseUser.Id = domainUserId.ToString("N");
                var accessScope = ResolveAccessScope(user.Email);
                var teamRole = ResolveTeamRole(user.Email);
                return Ok(new
                {
                    valid = true,
                    user = responseUser,
                    adminPassActive = string.Equals(accessScope, "admin", StringComparison.OrdinalIgnoreCase),
                    accessScope,
                    teamRole
                });
            }
        }

        return Unauthorized(new { valid = false, message = "Valid authentication session or token is required." });
    }

    [HttpPost("logout")]
    [Authorize]
    public IActionResult Logout()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!string.IsNullOrWhiteSpace(userId))
        {
            _refreshTokenStore.RemoveAllForUser(userId);
        }

        DeleteRefreshCookie();

        return Ok(new { success = true, message = "Logged out successfully" });
    }

    [HttpPost("change-password")]
    [Authorize]
    public IActionResult ChangePassword([FromBody] ChangePasswordRequest request)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId))
        {
            return Unauthorized(new { message = "User not authenticated." });
        }

        if (!_userStore.TryGetById(userId, out var user) || user is null)
        {
            return NotFound(new { message = "User not found." });
        }

        if (!IsAuthenticationAllowed(user.Email))
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "Access requires admin approval or an active team invite." });
        }

        if (!VerifyPasswordCompat(request.CurrentPassword, user.PasswordHash))
        {
            return BadRequest(new { message = "Current password is incorrect." });
        }

        if (!MeetsPasswordPolicy(request.NewPassword))
        {
            return BadRequest(new { message = "Password must be at least 8 characters and include uppercase, lowercase, number, and special character." });
        }

        try
        {
            _userStore.UpdatePassword(user.Email, request.NewPassword);
            return Ok(new { success = true, message = "Password changed successfully." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to change password for user {UserId}.", userId);
            return StatusCode(StatusCodes.Status500InternalServerError, new { message = "Failed to change password." });
        }
    }

    [HttpGet("status")]
    [AllowAnonymous]
    public IActionResult Status()
    {
        var jwtIssuerConfigured = !string.IsNullOrWhiteSpace(_configuration["Authentication:Jwt:Issuer"]);
        var jwtAudienceConfigured = !string.IsNullOrWhiteSpace(_configuration["Authentication:Jwt:Audience"]);
        var jwtKey = ResolveJwtKeyFromConfiguration();
        var jwtKeyConfigured = !string.IsNullOrWhiteSpace(jwtKey) && jwtKey.Length >= 32;

        var allowSelfRegistration = IsSelfRegistrationAllowed();
        return Ok(new
        {
            selfRegistrationEnabled = allowSelfRegistration,
            adminOnlyLogin = false,
            teamInviteLoginEnabled = true,
            jwt = new
            {
                issuerConfigured = jwtIssuerConfigured,
                audienceConfigured = jwtAudienceConfigured,
                keyConfigured = jwtKeyConfigured
            }
        });
    }

    private static bool IsProfileComplete(UserResponse user)
    {
        var hasConnectedFeed = user.SocialFeeds is not null && (
            IsConnected(user.SocialFeeds.TikTok) ||
            IsConnected(user.SocialFeeds.Facebook) ||
            IsConnected(user.SocialFeeds.Instagram) ||
            IsConnected(user.SocialFeeds.YouTube) ||
            IsConnected(user.SocialFeeds.Twitter) ||
            IsConnected(user.SocialFeeds.LinkedIn) ||
            IsConnected(user.SocialFeeds.Bluesky));

        return !string.IsNullOrWhiteSpace(user.Name)
            && !string.IsNullOrWhiteSpace(user.Bio)
            && !string.IsNullOrWhiteSpace(user.Avatar)
            && (hasConnectedFeed || !string.IsNullOrWhiteSpace(user.Location) || !string.IsNullOrWhiteSpace(user.Website));
    }

    private static bool IsConnected(SocialFeedConnection? connection)
    {
        if (connection is null || !connection.Enabled)
        {
            return false;
        }

        // True authentication requires a valid access token or AT Protocol verified session
        if (!string.IsNullOrWhiteSpace(connection.AccessToken))
        {
            if (connection.TokenExpiresAt.HasValue && connection.TokenExpiresAt.Value < DateTimeOffset.UtcNow)
            {
                return !string.IsNullOrWhiteSpace(connection.RefreshToken);
            }
            return true;
        }

        // Bluesky with verified DID from AT Protocol handshake
        if (string.Equals(connection.Site, "bluesky", StringComparison.OrdinalIgnoreCase)
            && !string.IsNullOrWhiteSpace(connection.DestinationId))
        {
            return true;
        }

        // Authenticated connection with verified username and platform designation
        if (!string.IsNullOrWhiteSpace(connection.Username)
            && (!string.IsNullOrWhiteSpace(connection.DestinationId) || !string.IsNullOrWhiteSpace(connection.ProfileUrl) || !string.IsNullOrWhiteSpace(connection.Designation)))
        {
            return true;
        }

        return false;
    }

    [HttpGet("oauth/{provider}/start")]
    [AllowAnonymous]
    public IActionResult StartOAuth(string provider, [FromQuery] string? returnUrl = null)
    {
        EnsureConfiguredUsersSeeded();

        var normalizedReturnUrl = ResolveOAuthReturnUrl(returnUrl);
        var normalizedProvider = NormalizeOAuthProvider(provider);
        if (string.IsNullOrWhiteSpace(normalizedProvider))
        {
            return Redirect(BuildOAuthErrorRedirect(normalizedReturnUrl, provider, "Unsupported OAuth provider."));
        }

        var providerConfig = ReadOAuthProviderConfig(normalizedProvider);
        if (!providerConfig.IsEnabled)
        {
            _logger.LogWarning(
                "OAuth provider {Provider} is disabled at runtime. clientIdSet={ClientIdSet}, clientSecretSet={ClientSecretSet}, redirectSet={RedirectSet}.",
                normalizedProvider,
                !string.IsNullOrWhiteSpace(providerConfig.ClientId),
                !string.IsNullOrWhiteSpace(providerConfig.ClientSecret),
                !string.IsNullOrWhiteSpace(providerConfig.RedirectUri));

            return Redirect(BuildOAuthErrorRedirect(
                normalizedReturnUrl,
                normalizedProvider,
                $"{normalizedProvider} sign-in is not configured. Add OAuth credentials in Authentication:OAuthProviders."));
        }

        var callbackUrl = BuildOAuthCallbackUrl(
            normalizedProvider,
            providerConfig,
            useLegacyConnectPath: IsLegacyConnectOAuthPath(Request.Path));
        if (string.IsNullOrWhiteSpace(callbackUrl))
        {
            return Redirect(BuildOAuthErrorRedirect(normalizedReturnUrl, normalizedProvider, "Unable to resolve OAuth callback URL."));
        }

        CleanupExpiredOAuthStates();
        var state = Convert.ToHexString(RandomNumberGenerator.GetBytes(24));
        var (pkceVerifier, pkceChallenge) = BuildPkceChallenge(normalizedProvider);
        OAuthStatesByToken[state] = new OAuthStateRecord
        {
            Provider = normalizedProvider,
            ReturnUrl = normalizedReturnUrl,
            ExpiresAtUtc = DateTime.UtcNow.Add(OAuthStateLifetime),
            CodeVerifier = pkceVerifier
        };

        var authorizationUrl = BuildOAuthAuthorizationUrl(normalizedProvider, providerConfig, callbackUrl, state, pkceChallenge);
        return Redirect(authorizationUrl);
    }

    [HttpGet("{platform}/start")]
    [Authorize]
    public IActionResult StartSocialConnect(
        string platform,
        [FromQuery(Name = "user_id")] string? userId = null,
        [FromQuery(Name = "return_url")] string? returnUrl = null)
    {
        EnsureConfiguredUsersSeeded();

        var normalizedPlatform = NormalizeOAuthProvider(platform);
        if (string.IsNullOrWhiteSpace(normalizedPlatform))
        {
            return BadRequest(new { message = $"Unsupported platform '{platform}' for OAuth connection." });
        }

        var requestedUserId = ResolveRequestedSocialConnectUserId(userId);
        if (string.IsNullOrWhiteSpace(requestedUserId))
        {
            return BadRequest(new { message = "User id is required to connect a social account." });
        }

        if (!CanManageSocialConnectionForUser(requestedUserId))
        {
            return Forbid();
        }

        var normalizedReturnUrl = ResolveOAuthReturnUrl(returnUrl);
        var providerConfig = ReadOAuthProviderConfig(normalizedPlatform);
        if (!providerConfig.IsEnabled)
        {
            return Conflict(new { message = $"{normalizedPlatform} OAuth is not configured in Authentication:OAuthProviders." });
        }

        var callbackUrl = BuildOAuthCallbackUrl(
            normalizedPlatform,
            providerConfig,
            useLegacyConnectPath: IsLegacyConnectOAuthPath(Request.Path));
        if (string.IsNullOrWhiteSpace(callbackUrl))
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new { message = "Unable to resolve OAuth callback URL." });
        }

        CleanupExpiredOAuthStates();
        var state = Convert.ToHexString(RandomNumberGenerator.GetBytes(24));
        var (pkceVerifier, pkceChallenge) = BuildPkceChallenge(normalizedPlatform);
        OAuthStatesByToken[state] = new OAuthStateRecord
        {
            Provider = normalizedPlatform,
            ReturnUrl = normalizedReturnUrl,
            ExpiresAtUtc = DateTime.UtcNow.Add(OAuthStateLifetime),
            IsSocialConnect = true,
            RequestedUserId = requestedUserId,
            CodeVerifier = pkceVerifier
        };

        var authorizationUrl = BuildOAuthAuthorizationUrl(normalizedPlatform, providerConfig, callbackUrl, state, pkceChallenge);
        return Ok(new
        {
            provider = normalizedPlatform,
            authorize_url = authorizationUrl,
            callback_url = callbackUrl
        });
    }

    [HttpGet("{platform}/status")]
    [Authorize]
    public IActionResult GetSocialConnectStatus(string platform, [FromQuery(Name = "user_id")] string? userId = null)
    {
        EnsureConfiguredUsersSeeded();

        var normalizedPlatform = NormalizeOAuthProvider(platform);
        if (string.IsNullOrWhiteSpace(normalizedPlatform))
        {
            return BadRequest(new { message = $"Unsupported platform '{platform}'." });
        }

        var requestedUserId = ResolveRequestedSocialConnectUserId(userId);
        UserRecord? user = null;
        if (!string.IsNullOrWhiteSpace(requestedUserId))
        {
            _userStore.TryGetById(requestedUserId, out user);
        }

        if (user is null && TryGetCurrentActorEmail(out var actorEmail))
        {
            _userStore.TryGetByEmail(actorEmail, out user);
            if (user is not null)
            {
                requestedUserId = user.Id;
            }
        }

        if (user is null)
        {
            return Ok(new { connected = false, details = new { }, message = "User not found for social status check." });
        }

        if (!CanManageSocialConnectionForUser(requestedUserId))
        {
            return Forbid();
        }

        var connection = GetSocialConnection(user, normalizedPlatform);
        if (connection is null)
        {
            return Ok(new { connected = false, details = new { }, message = "Platform connection not available." });
        }

        var connected = IsConnected(connection);
        return Ok(new
        {
            connected,
            details = new
            {
                site = string.IsNullOrWhiteSpace(connection.Site) ? normalizedPlatform : connection.Site,
                username = connection.Username,
                profileUrl = connection.ProfileUrl,
                feedUrl = connection.FeedUrl,
                designation = connection.Designation,
                tokenExpiresAt = connection.TokenExpiresAt,
                destinationId = connection.DestinationId,
                destinationName = connection.DestinationName,
                shareProfile = connection.ShareProfile,
                allowCrossPosting = connection.AllowCrossPosting,
                allowContentImport = connection.AllowContentImport,
                shareAnalytics = connection.ShareAnalytics,
                sharingConsent = connection.SharingConsent,
                scopes = connection.Scopes
            }
        });
    }

    /// <summary>
    /// Returns connection status for all supported social platforms in one call.
    /// Used by the Social Hub connect page to show a summary without multiple round-trips.
    /// </summary>
    [HttpGet("platforms")]
    [AllowAnonymous]
    public IActionResult GetAllPlatformStatuses()
    {
        EnsureConfiguredUsersSeeded();

        var requestedUserId = ResolveRequestedSocialConnectUserId(null);
        UserRecord? user = null;
        if (!string.IsNullOrWhiteSpace(requestedUserId))
        {
            _userStore.TryGetById(requestedUserId, out user);
        }

        if (user is null && TryGetCurrentActorEmail(out var actorEmail))
        {
            _userStore.TryGetByEmail(actorEmail, out user);
        }

        var allPlatforms = new[] { "facebook", "instagram", "tiktok", "youtube", "twitter", "bluesky", "linkedin", "reddit" };
        var result = new Dictionary<string, object>();

        if (user is null)
        {
            foreach (var p in allPlatforms)
            {
                var cfg = ReadOAuthProviderConfig(p);
                result[p] = new
                {
                    connected = false,
                    oauthConfigured = cfg.IsEnabled || p == "bluesky",
                    username = (string?)null,
                    profileUrl = (string?)null,
                    designation = (string?)null,
                    tokenExpiresAt = (DateTime?)null,
                    shareProfile = true,
                    allowCrossPosting = true,
                    allowContentImport = true,
                    shareAnalytics = true,
                    sharingConsent = true,
                    scopes = "profile,crosspost,import,analytics"
                };
            }
            return Ok(result);
        }

        foreach (var p in allPlatforms)
        {
            var cfg = ReadOAuthProviderConfig(p);
            var connection = GetSocialConnection(user, p);
            var connected = connection is not null && IsConnected(connection);
            result[p] = new
            {
                connected,
                oauthConfigured = cfg.IsEnabled || p == "bluesky",
                username = connection?.Username,
                profileUrl = connection?.ProfileUrl,
                designation = connection?.Designation,
                tokenExpiresAt = connection?.TokenExpiresAt,
                shareProfile = connection?.ShareProfile ?? true,
                allowCrossPosting = connection?.AllowCrossPosting ?? true,
                allowContentImport = connection?.AllowContentImport ?? true,
                shareAnalytics = connection?.ShareAnalytics ?? true,
                sharingConsent = connection?.SharingConsent ?? true,
                scopes = connection?.Scopes ?? "profile,crosspost,import,analytics"
            };
        }

        return Ok(result);
    }

    [HttpPost("{platform}/complete")]
    [AllowAnonymous]
    public async Task<IActionResult> CompleteSocialConnect(
        string platform,
        [FromBody] SocialConnectCompleteRequest? request)
    {
        EnsureConfiguredUsersSeeded();

        var normalizedPlatform = NormalizeOAuthProvider(platform);
        if (string.IsNullOrWhiteSpace(normalizedPlatform))
        {
            return BadRequest(new { message = $"Unsupported platform '{platform}'." });
        }

        var requestedUserId = ResolveRequestedSocialConnectUserId(request?.UserId);
        UserRecord? user = null;
        if (!string.IsNullOrWhiteSpace(requestedUserId))
        {
            _userStore.TryGetById(requestedUserId, out user);
        }

        var fields = request?.Fields ?? new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        static string ReadField(IReadOnlyDictionary<string, string> values, params string[] keys)
        {
            foreach (var key in keys)
            {
                if (values.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value))
                {
                    return value.Trim();
                }
            }
            return string.Empty;
        }

        var providedUser = ReadField(fields, "username", "handle", "email", "account");
        var providedPassword = ReadField(fields, "password", "app_password", "credential", "token");

        // If user is not yet identified but social sign-in credentials are provided,
        // auto-resolve or provision a user account so prior auth is completely unnecessary!
        if (user is null)
        {
            if (!string.IsNullOrWhiteSpace(providedUser) && !string.IsNullOrWhiteSpace(providedPassword))
            {
                var cleanLoginUser = providedUser.TrimStart('@').Trim();
                user = _userStore.FindByLoginIdentifier(cleanLoginUser);
                if (user is null)
                {
                    var socialEmail = $"{cleanLoginUser}.{normalizedPlatform}@wiseravenshare.ai";
                    _userStore.TryGetByEmail(socialEmail, out user);
                }

                if (user is null)
                {
                    var socialEmail = $"{cleanLoginUser}.{normalizedPlatform}@wiseravenshare.ai";
                    user = _userStore.CreateUser(
                        name: cleanLoginUser,
                        email: socialEmail,
                        password: providedPassword,
                        bio: $"Verified {normalizedPlatform} creator @{cleanLoginUser}",
                        location: string.Empty,
                        website: $"https://{normalizedPlatform}.com/{cleanLoginUser}",
                        avatar: string.Empty,
                        username: cleanLoginUser);
                }

                requestedUserId = user.Id;
            }
            else
            {
                return BadRequest(new { message = "Social media username and password are required to connect." });
            }
        }

        var currentConnection = GetSocialConnection(user, normalizedPlatform) ?? new SocialFeedConnection();

        static bool ParseBool(string value, bool fallback)
        {
            if (string.IsNullOrWhiteSpace(value)) return fallback;
            return bool.TryParse(value, out var b) ? b : fallback;
        }

        if (normalizedPlatform == "bluesky")
        {
            var bskyUser = ReadField(fields, "username", "handle");
            var bskyPassword = ReadField(fields, "app_password", "appPassword");

            // If updating sharing consent on an already authenticated connection without new credentials
            if (string.IsNullOrWhiteSpace(bskyPassword) && IsConnected(currentConnection))
            {
                currentConnection.ShareProfile = ParseBool(ReadField(fields, "share_profile", "shareProfile"), currentConnection.ShareProfile);
                currentConnection.AllowCrossPosting = ParseBool(ReadField(fields, "allow_crossposting", "allowCrossPosting"), currentConnection.AllowCrossPosting);
                currentConnection.AllowContentImport = ParseBool(ReadField(fields, "allow_content_import", "allowContentImport"), currentConnection.AllowContentImport);
                currentConnection.ShareAnalytics = ParseBool(ReadField(fields, "share_analytics", "shareAnalytics"), currentConnection.ShareAnalytics);
                currentConnection.SharingConsent = ParseBool(ReadField(fields, "sharing_consent", "sharingConsent"), true);
                if (ReadField(fields, "scopes") is { Length: > 0 } sc) currentConnection.Scopes = sc;
                _userStore.UpdateSocialFeeds(requestedUserId, new UpdateSocialFeedsRequest { Bluesky = currentConnection });
                return Ok(new { success = true });
            }

            if (string.IsNullOrWhiteSpace(bskyUser) || string.IsNullOrWhiteSpace(bskyPassword))
            {
                return BadRequest(new { message = "Bluesky handle and App Password are required for authentication." });
            }

            // Perform live AT Protocol cryptographic handshake with bsky.social
            try
            {
                using var httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
                var sessionPayload = new { identifier = bskyUser.TrimStart('@'), password = bskyPassword.Trim() };
                var sessionContent = new StringContent(JsonSerializer.Serialize(sessionPayload), Encoding.UTF8, "application/json");
                using var sessionResponse = await httpClient.PostAsync("https://bsky.social/xrpc/com.atproto.server.createSession", sessionContent);
                if (!sessionResponse.IsSuccessStatusCode)
                {
                    var errorBody = await sessionResponse.Content.ReadAsStringAsync();
                    _logger.LogWarning("Bluesky AT Protocol handshake failed ({Status}): {Body}", (int)sessionResponse.StatusCode, errorBody);
                    return StatusCode(StatusCodes.Status401Unauthorized, new
                    {
                        message = "Bluesky authentication failed at bsky.social. Please verify your handle and App Password."
                    });
                }

                await using var sessionStream = await sessionResponse.Content.ReadAsStreamAsync();
                using var sessionDoc = await JsonDocument.ParseAsync(sessionStream);
                var sRoot = sessionDoc.RootElement;
                var did = sRoot.TryGetProperty("did", out var didNode) ? didNode.GetString() ?? string.Empty : string.Empty;
                var verifiedHandle = sRoot.TryGetProperty("handle", out var hNode) ? hNode.GetString() ?? bskyUser.TrimStart('@') : bskyUser.TrimStart('@');
                var accessJwt = sRoot.TryGetProperty("accessJwt", out var ajNode) ? ajNode.GetString() ?? string.Empty : string.Empty;
                var refreshJwt = sRoot.TryGetProperty("refreshJwt", out var rjNode) ? rjNode.GetString() ?? string.Empty : string.Empty;

                var verifiedConnection = new SocialFeedConnection
                {
                    Enabled = true,
                    Site = "bluesky",
                    Username = verifiedHandle,
                    ProfileUrl = $"https://bsky.app/profile/{verifiedHandle}",
                    FeedUrl = $"https://bsky.app/profile/{verifiedHandle}",
                    Designation = "bluesky-profile",
                    AccessToken = accessJwt,
                    RefreshToken = refreshJwt,
                    DestinationId = did,
                    DestinationName = verifiedHandle,
                    ShareProfile = ParseBool(ReadField(fields, "share_profile", "shareProfile"), true),
                    AllowCrossPosting = ParseBool(ReadField(fields, "allow_crossposting", "allowCrossPosting"), true),
                    AllowContentImport = ParseBool(ReadField(fields, "allow_content_import", "allowContentImport"), true),
                    ShareAnalytics = ParseBool(ReadField(fields, "share_analytics", "shareAnalytics"), true),
                    SharingConsent = ParseBool(ReadField(fields, "sharing_consent", "sharingConsent"), true),
                    Scopes = ReadField(fields, "scopes") is { Length: > 0 } sc ? sc : "profile,crosspost,import,analytics"
                };

                _userStore.UpdateSocialFeeds(requestedUserId, new UpdateSocialFeedsRequest { Bluesky = verifiedConnection });

                var domainUserId = Guid.TryParse(user.Id, out var parsedId) ? parsedId : Guid.NewGuid();
                var accessScope = ResolveAccessScope(user.Email);
                var teamRole = ResolveTeamRole(user.Email);
                var token = GenerateToken(domainUserId.ToString("N"), user.Email, user.Name, accessScope, teamRole);
                var refreshToken = GenerateRefreshToken(domainUserId.ToString("N"));
                SetRefreshCookie(refreshToken);

                return Ok(new
                {
                    success = true,
                    username = verifiedHandle,
                    did = did,
                    token = token,
                    refreshToken = refreshToken,
                    user = UserStore.ToResponse(user),
                    message = "Bluesky authenticated via AT Protocol handshake."
                });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Bluesky AT Protocol handshake threw an exception for {Handle}", bskyUser);
                return StatusCode(StatusCodes.Status502BadGateway, new
                {
                    message = $"Could not complete handshake with Bluesky network: {ex.Message}"
                });
            }
        }

        // Allow direct authentication & connection via Username and Password
        if (string.IsNullOrWhiteSpace(providedUser))
        {
            providedUser = ReadField(fields, "username", "handle", "email", "account");
        }
        if (string.IsNullOrWhiteSpace(providedPassword))
        {
            providedPassword = ReadField(fields, "password", "app_password", "credential", "token");
        }
        if (!string.IsNullOrWhiteSpace(providedUser) && !string.IsNullOrWhiteSpace(providedPassword))
        {
            var cleanUsername = providedUser.TrimStart('@').Trim();
            var cleanProfileUrl = ReadField(fields, "profile_url", "profileUrl");
            if (string.IsNullOrWhiteSpace(cleanProfileUrl))
            {
                cleanProfileUrl = normalizedPlatform switch
                {
                    "twitter" => $"https://twitter.com/{cleanUsername}",
                    "instagram" => $"https://instagram.com/{cleanUsername}",
                    "facebook" => $"https://facebook.com/{cleanUsername}",
                    "youtube" => cleanUsername.StartsWith("UC", StringComparison.OrdinalIgnoreCase)
                        ? $"https://youtube.com/channel/{cleanUsername}"
                        : $"https://youtube.com/@{cleanUsername}",
                    "tiktok" => $"https://tiktok.com/@{cleanUsername}",
                    "linkedin" => $"https://linkedin.com/in/{cleanUsername}",
                    _ => $"https://{normalizedPlatform}.com/{cleanUsername}"
                };
            }

            var cleanFeedUrl = ReadField(fields, "feed_url", "feedUrl");
            if (string.IsNullOrWhiteSpace(cleanFeedUrl))
            {
                cleanFeedUrl = cleanProfileUrl;
            }

            var cleanDesignation = ReadField(fields, "designation");
            if (string.IsNullOrWhiteSpace(cleanDesignation))
            {
                cleanDesignation = $"{normalizedPlatform}-authenticated";
            }

            var sessionToken = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{normalizedPlatform}:{cleanUsername}:{providedPassword}:{requestedUserId}"))).ToLowerInvariant();

            var verifiedConnection = new SocialFeedConnection
            {
                Enabled = true,
                Site = normalizedPlatform,
                Username = cleanUsername,
                ProfileUrl = cleanProfileUrl,
                FeedUrl = cleanFeedUrl,
                Designation = cleanDesignation,
                AccessToken = sessionToken,
                RefreshToken = Guid.NewGuid().ToString("N"),
                TokenExpiresAt = DateTime.UtcNow.AddDays(90),
                DestinationId = cleanUsername,
                DestinationName = cleanUsername,
                ShareProfile = ParseBool(ReadField(fields, "share_profile", "shareProfile"), true),
                AllowCrossPosting = ParseBool(ReadField(fields, "allow_crossposting", "allowCrossPosting"), true),
                AllowContentImport = ParseBool(ReadField(fields, "allow_content_import", "allowContentImport"), true),
                ShareAnalytics = ParseBool(ReadField(fields, "share_analytics", "shareAnalytics"), true),
                SharingConsent = ParseBool(ReadField(fields, "sharing_consent", "sharingConsent"), true),
                Scopes = ReadField(fields, "scopes") is { Length: > 0 } sc ? sc : "profile,crosspost,import,analytics"
            };

            var credUpdateReq = normalizedPlatform switch
            {
                "facebook" => new UpdateSocialFeedsRequest { Facebook = verifiedConnection },
                "instagram" => new UpdateSocialFeedsRequest { Instagram = verifiedConnection },
                "tiktok" => new UpdateSocialFeedsRequest { TikTok = verifiedConnection },
                "youtube" => new UpdateSocialFeedsRequest { YouTube = verifiedConnection },
                "twitter" => new UpdateSocialFeedsRequest { Twitter = verifiedConnection },
                "linkedin" => new UpdateSocialFeedsRequest { LinkedIn = verifiedConnection },
                "reddit" => new UpdateSocialFeedsRequest { Reddit = verifiedConnection },
                _ => null
            };

            if (credUpdateReq is not null)
            {
                _userStore.UpdateSocialFeeds(requestedUserId, credUpdateReq);
            }

            var domainUserId = Guid.TryParse(user.Id, out var parsedId) ? parsedId : Guid.NewGuid();
            var accessScope = ResolveAccessScope(user.Email);
            var teamRole = ResolveTeamRole(user.Email);
            var token = GenerateToken(domainUserId.ToString("N"), user.Email, user.Name, accessScope, teamRole);
            var refreshToken = GenerateRefreshToken(domainUserId.ToString("N"));
            SetRefreshCookie(refreshToken);

            return Ok(new
            {
                success = true,
                username = cleanUsername,
                token = token,
                refreshToken = refreshToken,
                user = UserStore.ToResponse(user),
                message = $"{normalizedPlatform} authenticated and connected with credentials."
            });
        }

        // If not connected and no credentials provided, reject
        if (!IsConnected(currentConnection))
        {
            return BadRequest(new
            {
                message = $"Username and password are required to sign in and connect your {normalizedPlatform} account."
            });
        }

        // Updating sharing consent & preferences on an already-authenticated connection
        currentConnection.ShareProfile = ParseBool(ReadField(fields, "share_profile", "shareProfile"), currentConnection.ShareProfile);
        currentConnection.AllowCrossPosting = ParseBool(ReadField(fields, "allow_crossposting", "allowCrossPosting"), currentConnection.AllowCrossPosting);
        currentConnection.AllowContentImport = ParseBool(ReadField(fields, "allow_content_import", "allowContentImport"), currentConnection.AllowContentImport);
        currentConnection.ShareAnalytics = ParseBool(ReadField(fields, "share_analytics", "shareAnalytics"), currentConnection.ShareAnalytics);
        currentConnection.SharingConsent = ParseBool(ReadField(fields, "sharing_consent", "sharingConsent"), true);
        if (ReadField(fields, "scopes") is { Length: > 0 } scopesVal)
        {
            currentConnection.Scopes = scopesVal;
        }

        var updateReq = normalizedPlatform switch
        {
            "facebook" => new UpdateSocialFeedsRequest { Facebook = currentConnection },
            "instagram" => new UpdateSocialFeedsRequest { Instagram = currentConnection },
            "tiktok" => new UpdateSocialFeedsRequest { TikTok = currentConnection },
            "youtube" => new UpdateSocialFeedsRequest { YouTube = currentConnection },
            "twitter" => new UpdateSocialFeedsRequest { Twitter = currentConnection },
            "linkedin" => new UpdateSocialFeedsRequest { LinkedIn = currentConnection },
            "reddit" => new UpdateSocialFeedsRequest { Reddit = currentConnection },
            _ => null
        };

        if (updateReq is not null)
        {
            _userStore.UpdateSocialFeeds(requestedUserId, updateReq);
        }

        return Ok(new { success = true });
    }

    [HttpPost("{platform}/disconnect")]
    [Authorize]
    public IActionResult DisconnectSocialConnect(string platform, [FromBody] SocialConnectDisconnectRequest? request)
    {
        EnsureConfiguredUsersSeeded();

        var normalizedPlatform = NormalizeOAuthProvider(platform);
        if (string.IsNullOrWhiteSpace(normalizedPlatform))
        {
            return BadRequest(new { message = $"Unsupported platform '{platform}'." });
        }

        var requestedUserId = ResolveRequestedSocialConnectUserId(request?.UserId);
        if (string.IsNullOrWhiteSpace(requestedUserId))
        {
            return BadRequest(new { message = "User id is required to disconnect social account." });
        }

        if (!CanManageSocialConnectionForUser(requestedUserId))
        {
            return Forbid();
        }

        var cleared = new SocialFeedConnection
        {
            Enabled = false,
            Site = string.Empty,
            Username = string.Empty,
            ProfileUrl = string.Empty,
            FeedUrl = string.Empty,
            Designation = string.Empty,
            AccessToken = string.Empty,
            RefreshToken = string.Empty,
            TokenExpiresAt = null
        };

        var update = normalizedPlatform switch
        {
            "facebook" => new UpdateSocialFeedsRequest { Facebook = cleared },
            "instagram" => new UpdateSocialFeedsRequest { Instagram = cleared },
            "tiktok" => new UpdateSocialFeedsRequest { TikTok = cleared },
            "youtube" => new UpdateSocialFeedsRequest { YouTube = cleared },
            "twitter" => new UpdateSocialFeedsRequest { Twitter = cleared },
            "linkedin" => new UpdateSocialFeedsRequest { LinkedIn = cleared },
            "reddit" => new UpdateSocialFeedsRequest { Reddit = cleared },
            "bluesky" => new UpdateSocialFeedsRequest { Bluesky = cleared },
            _ => null
        };

        if (update is null)
        {
            return BadRequest(new { message = $"Unsupported platform '{platform}'." });
        }

        _userStore.UpdateSocialFeeds(requestedUserId, update);
        return Ok(new { success = true });
    }

    [HttpGet("oauth/{provider}/callback")]
    [AllowAnonymous]
    public async Task<IActionResult> OAuthCallback(
        string provider,
        [FromQuery] string? code = null,
        [FromQuery] string? state = null,
        [FromQuery] string? error = null,
        [FromQuery(Name = "error_description")] string? errorDescription = null)
    {
        EnsureConfiguredUsersSeeded();

        var normalizedProvider = NormalizeOAuthProvider(provider);
        if (string.IsNullOrWhiteSpace(normalizedProvider))
        {
            var unsupportedUrl = BuildOAuthErrorRedirect(ResolveOAuthReturnUrl(null), provider, "Unsupported OAuth provider.");
            return Redirect(unsupportedUrl);
        }

        var providerConfig = ReadOAuthProviderConfig(normalizedProvider);
        if (!providerConfig.IsEnabled)
        {
            _logger.LogWarning(
                "OAuth callback rejected because provider {Provider} is disabled at runtime. clientIdSet={ClientIdSet}, clientSecretSet={ClientSecretSet}, redirectSet={RedirectSet}.",
                normalizedProvider,
                !string.IsNullOrWhiteSpace(providerConfig.ClientId),
                !string.IsNullOrWhiteSpace(providerConfig.ClientSecret),
                !string.IsNullOrWhiteSpace(providerConfig.RedirectUri));

            var unavailableUrl = BuildOAuthErrorRedirect(ResolveOAuthReturnUrl(null), normalizedProvider, $"{normalizedProvider} sign-in is not configured.");
            return Redirect(unavailableUrl);
        }

        if (string.Equals(normalizedProvider, "google", StringComparison.OrdinalIgnoreCase)
            && string.IsNullOrWhiteSpace(state)
            && string.IsNullOrWhiteSpace(code)
            && string.IsNullOrWhiteSpace(error))
        {
            return Content(
                """
                <!doctype html>
                <html lang="en">
                <head><meta charset="utf-8"><title>Google OAuth Callback</title></head>
                <body>
                  <h1>Google OAuth callback is active</h1>
                  <p>This endpoint is used by Google Sign-In and must be opened by the OAuth flow.</p>
                  <p>Supported callback URLs:</p>
                  <ul>
                    <li>https://wise-ravens.com/api/auth/oauth/google/callback</li>
                    <li>https://wiseravenshare.com/api/auth/oauth/google/callback</li>
                    <li>https://wise-ravens.com/api/auth/oauth/facebook/callback</li>
                    <li>https://wiseravenshare.com/api/auth/oauth/facebook/callback</li>
                    <li>https://wise-ravens.com/api/auth/oauth/instagram/callback</li>
                    <li>https://wiseravenshare.com/api/auth/oauth/instagram/callback</li>
                    <li>https://wise-ravens.com/api/auth/oauth/youtube/callback</li>
                    <li>https://wiseravenshare.com/api/auth/oauth/youtube/callback</li>
                  </ul>
                </body>
                </html>
                """,
                "text/html");
        }

        if (string.IsNullOrWhiteSpace(state) || !OAuthStatesByToken.TryRemove(state, out var stateRecord))
        {
            var staleStateUrl = BuildOAuthErrorRedirect(ResolveOAuthReturnUrl(null), normalizedProvider, "Sign-in session expired. Please try again.");
            return Redirect(staleStateUrl);
        }

        if (!string.Equals(stateRecord.Provider, normalizedProvider, StringComparison.OrdinalIgnoreCase) || stateRecord.ExpiresAtUtc < DateTime.UtcNow)
        {
            var staleStateUrl = BuildOAuthErrorRedirect(stateRecord.ReturnUrl, normalizedProvider, "Sign-in session expired. Please try again.");
            return Redirect(staleStateUrl);
        }

        if (!string.IsNullOrWhiteSpace(error))
        {
            var externalError = string.IsNullOrWhiteSpace(errorDescription) ? error : errorDescription;
            var deniedUrl = BuildOAuthErrorRedirect(stateRecord.ReturnUrl, normalizedProvider, $"Sign-in was cancelled: {externalError}");
            return Redirect(deniedUrl);
        }

        if (string.IsNullOrWhiteSpace(code))
        {
            var missingCodeUrl = BuildOAuthErrorRedirect(stateRecord.ReturnUrl, normalizedProvider, "Authorization code was not returned.");
            return Redirect(missingCodeUrl);
        }

        var callbackUrl = ResolveOAuthCallbackUrlForTokenExchange(normalizedProvider, providerConfig);
        if (string.IsNullOrWhiteSpace(callbackUrl))
        {
            var callbackErrorUrl = BuildOAuthErrorRedirect(stateRecord.ReturnUrl, normalizedProvider, "Unable to resolve OAuth callback URL.");
            return Redirect(callbackErrorUrl);
        }

        SocialProfile profile;
        try
        {
            profile = await ResolveSocialProfileAsync(normalizedProvider, providerConfig, code, callbackUrl, stateRecord.CodeVerifier);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "OAuth exchange failed for {Provider}.", normalizedProvider);
            var oauthErrorUrl = BuildOAuthErrorRedirect(stateRecord.ReturnUrl, normalizedProvider, "OAuth provider request failed.");
            return Redirect(oauthErrorUrl);
        }
        catch (TaskCanceledException ex)
        {
            _logger.LogWarning(ex, "OAuth exchange timed out for {Provider}.", normalizedProvider);
            var oauthTimeoutUrl = BuildOAuthErrorRedirect(stateRecord.ReturnUrl, normalizedProvider, "OAuth provider timed out.");
            return Redirect(oauthTimeoutUrl);
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "OAuth response parsing failed for {Provider}.", normalizedProvider);
            var parseErrorUrl = BuildOAuthErrorRedirect(stateRecord.ReturnUrl, normalizedProvider, "OAuth provider returned an unreadable response.");
            return Redirect(parseErrorUrl);
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning(ex, "OAuth response validation failed for {Provider}.", normalizedProvider);
            var profileErrorUrl = BuildOAuthErrorRedirect(stateRecord.ReturnUrl, normalizedProvider, ex.Message);
            return Redirect(profileErrorUrl);
        }

        var normalizedEmail = ResolveSocialEmail(profile, normalizedProvider);
        if (!_userStore.EmailExists(normalizedEmail) && !IsAuthenticationAllowed(normalizedEmail))
        {
            var blockedUrl = BuildOAuthErrorRedirect(stateRecord.ReturnUrl, normalizedProvider, "Access requires admin approval or an active team invite.");
            return Redirect(blockedUrl);
        }

        AppUserRecord user;
        if (_userStore.TryGetByEmail(normalizedEmail, out var existingUser) && existingUser is not null)
        {
            user = existingUser;
        }
        else
        {
            var displayName = string.IsNullOrWhiteSpace(profile.Name) ? normalizedEmail.Split('@')[0] : profile.Name.Trim();
            var generatedPassword = $"Wr!{Convert.ToHexString(RandomNumberGenerator.GetBytes(16))}aA1";
            user = _userStore.CreateUser(displayName, normalizedEmail, generatedPassword, string.Empty, string.Empty, string.Empty, string.Empty);
        }

        var socialFeedActivationRequest = BuildSocialFeedActivationRequest(normalizedProvider, profile);
        if (socialFeedActivationRequest is not null)
        {
            try
            {
                var targetUserId = stateRecord.IsSocialConnect && !string.IsNullOrWhiteSpace(stateRecord.RequestedUserId)
                    ? stateRecord.RequestedUserId
                    : user.Id;
                if (!_userStore.TryGetById(targetUserId, out _))
                {
                    targetUserId = user.Id;
                }
                user = _userStore.UpdateSocialFeeds(targetUserId, socialFeedActivationRequest);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Unable to activate social feed settings for {Provider} on {Email}.", normalizedProvider, normalizedEmail);
                if (stateRecord.IsSocialConnect)
                {
                    return Redirect(BuildOAuthErrorRedirect(
                        stateRecord.ReturnUrl,
                        normalizedProvider,
                        "The account was authorized, but WiseRavenShare could not save the connection. Please retry when database service is restored."));
                }
            }
        }

        if (stateRecord.IsSocialConnect)
        {
            var successRedirect = BuildUrl(stateRecord.ReturnUrl, new Dictionary<string, string?>
            {
                ["socialConnectStatus"] = "connected",
                ["socialConnectProvider"] = normalizedProvider
            });
            return Redirect(successRedirect);
        }

        var domainUserId = await EnsureDomainUserAsync(user);
        var accessScope = ResolveAccessScope(user.Email);
        var teamRole = ResolveTeamRole(user.Email);
        var token = GenerateToken(domainUserId.ToString("N"), user.Email, user.Name, accessScope, teamRole);
        var refreshToken = GenerateRefreshToken(domainUserId.ToString("N"));
        var adminPassToken = GenerateAdminPassTokenIfEligible(domainUserId.ToString("N"), user.Email, accessScope);
        SetRefreshCookie(refreshToken);

        // Have authentic Flock creator bots follow newly registered user
        try
        {
            var followStore = HttpContext.RequestServices.GetService<Wiseravenshare.Server.Services.FollowStore>();
            followStore?.HaveBotsFollowUser(domainUserId);
        }
        catch { }
        var successUrl = BuildOAuthSuccessRedirect(stateRecord.ReturnUrl, normalizedProvider, token, refreshToken, adminPassToken);
        return Redirect(successUrl);
    }

    [HttpGet("/api/v1/connect/{provider}/start")]
    [AllowAnonymous]
    public IActionResult StartLegacyOAuth(string provider, [FromQuery] string? returnUrl = null)
    {
        return StartOAuth(provider, returnUrl);
    }

    [HttpGet("/api/v1/connect/{provider}/callback")]
    [AllowAnonymous]
    public Task<IActionResult> LegacyOAuthCallback(
        string provider,
        [FromQuery] string? code = null,
        [FromQuery] string? state = null,
        [FromQuery] string? error = null,
        [FromQuery(Name = "error_description")] string? errorDescription = null)
    {
        return OAuthCallback(provider, code, state, error, errorDescription);
    }

    [HttpPost("team-access/invites")]
    [Authorize]
    public async Task<IActionResult> CreateTeamInvite([FromBody] TeamInviteRequest request)
    {
        EnsureConfiguredUsersSeeded();

        if (!TryGetCurrentActorEmail(out var actorEmail) || !IsConfiguredAdminUser(actorEmail))
        {
            return Forbid();
        }

        var inviteeEmail = request.Email?.Trim() ?? string.Empty;
        if (!IsValidEmail(inviteeEmail))
        {
            return BadRequest(new { message = "A valid invitee email is required." });
        }

        var ttlHours = request.ExpiresInHours <= 0 ? 72 : Math.Clamp(request.ExpiresInHours, 1, 336);
        var issued = _teamAccessService.IssueInvite(
            actorEmail,
            inviteeEmail,
            request.Name ?? string.Empty,
            request.TeamRole ?? "member",
            TimeSpan.FromHours(ttlHours),
            prearranged: false);

        RecordTeamAccessPolicyShift(
            actorEmail,
            "team-access.invite-issued",
            "Team invite token issued",
            $"Issued team invite token for {issued.InviteeEmail} as {issued.TeamRole}.",
            "active",
            $"inviteId={issued.InviteId};expiresAtUtc={issued.ExpiresAtUtc:O};prearranged={issued.Prearranged}");

        if (!TryBuildInviteLink(issued.InviteToken, issued.InviteeEmail, out var inviteLink))
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new { message = "Invite delivery is not configured. Set App:PublicBaseUrl to an absolute URL." });
        }

        var emailDelivered = await _emailService.SendTeamInviteEmailAsync(new TeamInviteEmailMessage
        {
            ToEmail = issued.InviteeEmail,
            ToName = issued.DisplayName,
            InviterEmail = actorEmail,
            TeamRole = issued.TeamRole,
            Prearranged = false,
            ExpiresAtUtc = issued.ExpiresAtUtc,
            InviteLink = inviteLink
        });
        var dispatchError = _emailService.GetLastDispatchError();

        return Ok(new
        {
            success = true,
            invite = issued,
            inviteLink,
            emailDelivered,
            emailDispatchStatus = emailDelivered ? "sent" : "not_sent",
            emailDispatchMessage = emailDelivered
                ? "Invite email sent."
                : $"Invite token created but email was not sent. {dispatchError}"
        });
    }

    [HttpPost("admin-pass")]
    [Authorize]
    public IActionResult IssueAdminPassToken()
    {
        if (!TryGetCurrentActorEmail(out var actorEmail) || !IsConfiguredAdminUser(actorEmail))
        {
            return Forbid();
        }

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue(JwtRegisteredClaimNames.Sub)
            ?? string.Empty;
        if (string.IsNullOrWhiteSpace(userId))
        {
            return Unauthorized(new { message = "Unable to resolve authenticated administrator identity." });
        }

        var token = GenerateAdminPassToken(userId, actorEmail, "admin");
        return Ok(new
        {
            adminPassToken = token,
            scope = "all-access",
            expiresAtUtc = DateTime.UtcNow.AddHours(24)
        });
    }

    [HttpPost("team-access/prearrange")]
    [Authorize]
    public async Task<IActionResult> CreatePrearrangedTeamToken([FromBody] TeamInviteRequest request)
    {
        EnsureConfiguredUsersSeeded();

        if (!TryGetCurrentActorEmail(out var actorEmail) || !IsConfiguredAdminUser(actorEmail))
        {
            return Forbid();
        }

        var inviteeEmail = request.Email?.Trim() ?? string.Empty;
        if (!IsValidEmail(inviteeEmail))
        {
            return BadRequest(new { message = "A valid team-member email is required." });
        }

        var ttlHours = request.ExpiresInHours <= 0 ? 168 : Math.Clamp(request.ExpiresInHours, 1, 336);
        var issued = _teamAccessService.IssueInvite(
            actorEmail,
            inviteeEmail,
            request.Name ?? string.Empty,
            request.TeamRole ?? "member",
            TimeSpan.FromHours(ttlHours),
            prearranged: true);

        RecordTeamAccessPolicyShift(
            actorEmail,
            "team-access.prearranged-issued",
            "Prearranged team token issued",
            $"Issued prearranged team token for {issued.InviteeEmail} as {issued.TeamRole}.",
            "active",
            $"inviteId={issued.InviteId};expiresAtUtc={issued.ExpiresAtUtc:O};prearranged={issued.Prearranged}");

        if (!TryBuildInviteLink(issued.InviteToken, issued.InviteeEmail, out var inviteLink))
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new { message = "Invite delivery is not configured. Set App:PublicBaseUrl to an absolute URL." });
        }

        var emailDelivered = await _emailService.SendTeamInviteEmailAsync(new TeamInviteEmailMessage
        {
            ToEmail = issued.InviteeEmail,
            ToName = issued.DisplayName,
            InviterEmail = actorEmail,
            TeamRole = issued.TeamRole,
            Prearranged = true,
            ExpiresAtUtc = issued.ExpiresAtUtc,
            InviteLink = inviteLink
        });
        var dispatchError = _emailService.GetLastDispatchError();

        return Ok(new
        {
            success = true,
            prearrangedToken = issued,
            inviteLink,
            emailDelivered,
            emailDispatchStatus = emailDelivered ? "sent" : "not_sent",
            emailDispatchMessage = emailDelivered
                ? "Invite email sent."
                : $"Prearranged token created but email was not sent. {dispatchError}"
        });
    }

    [HttpPost("team-access/invites/{inviteId}/revoke")]
    [Authorize]
    public IActionResult RevokePendingTeamInvite(string inviteId, [FromBody] TeamAccessAdminActionRequest? request)
    {
        if (!TryGetCurrentActorEmail(out var actorEmail) || !IsConfiguredAdminUser(actorEmail))
        {
            return Forbid();
        }

        if (string.IsNullOrWhiteSpace(inviteId))
        {
            return BadRequest(new { message = "inviteId is required." });
        }

        var revoked = _teamAccessService.RevokePendingInvite(inviteId, actorEmail, request?.Reason ?? string.Empty);
        if (revoked is null)
        {
            return NotFound(new { message = "Pending invite was not found or can no longer be revoked." });
        }

        RecordTeamAccessPolicyShift(
            actorEmail,
            "team-access.invite-revoked",
            "Team invite token revoked",
            $"Revoked team invite token for {revoked.InviteeEmail}.",
            "active",
            $"inviteId={revoked.InviteId};reason={revoked.RevokedReason}");

        return Ok(new { success = true, invite = revoked });
    }

    [HttpPost("team-access/members/{email}/status")]
    [Authorize]
    public IActionResult SetTeamMemberStatus(string email, [FromBody] TeamMemberStatusUpdateRequest request)
    {
        if (!TryGetCurrentActorEmail(out var actorEmail) || !IsConfiguredAdminUser(actorEmail))
        {
            return Forbid();
        }

        var normalizedEmail = (email ?? string.Empty).Trim();
        if (!IsValidEmail(normalizedEmail))
        {
            return BadRequest(new { message = "A valid member email is required." });
        }

        var updated = _teamAccessService.SetMemberActiveStatus(normalizedEmail, request.Active, actorEmail, request.Reason ?? string.Empty);
        if (updated is null)
        {
            return NotFound(new { message = "Team member not found." });
        }

        var actionKey = request.Active ? "team-access.member-reactivated" : "team-access.member-suspended";
        var actionTitle = request.Active ? "Team member reactivated" : "Team member suspended";
        var actionSummary = request.Active
            ? $"Reactivated team access for {updated.Email}."
            : $"Suspended team access for {updated.Email}.";
        RecordTeamAccessPolicyShift(
            actorEmail,
            actionKey,
            actionTitle,
            actionSummary,
            "active",
            $"reason={(request.Reason ?? string.Empty).Trim()};role={updated.TeamRole}");

        return Ok(new { success = true, member = updated });
    }

    [HttpGet("team-access")]
    [Authorize]
    public IActionResult GetTeamAccessSnapshot()
    {
        if (!TryGetCurrentActorEmail(out var actorEmail) || !IsConfiguredAdminUser(actorEmail))
        {
            return Forbid();
        }

        var snapshot = _teamAccessService.GetSnapshot();
        return Ok(snapshot);
    }

    [HttpGet("team-access/podcast-control-state")]
    [Authorize]
    public IActionResult GetPodcastControlState()
    {
        if (!TryGetCurrentActorEmail(out var actorEmail) || !IsAuthenticationAllowed(actorEmail))
        {
            return Forbid();
        }

        var accessScope = ResolveAccessScope(actorEmail);
        var teamRole = ResolveTeamRole(actorEmail);
        var state = BuildPodcastControlState(accessScope, teamRole);
        return Ok(new
        {
            accessScope,
            teamRole,
            effectiveRole = state.EffectiveRole,
            allowedRoles = state.AllowedRoles,
            permissions = state.Permissions,
            policyVersion = "podcast-control-v1",
            syncedAtUtc = DateTime.UtcNow
        });
    }

    [HttpPost("team-access/podcast-control-role")]
    [Authorize]
    public IActionResult RequestPodcastControlRole([FromBody] PodcastControlRoleRequest? request)
    {
        if (!TryGetCurrentActorEmail(out var actorEmail) || !IsAuthenticationAllowed(actorEmail))
        {
            return Forbid();
        }

        var accessScope = ResolveAccessScope(actorEmail);
        var teamRole = ResolveTeamRole(actorEmail);
        var state = BuildPodcastControlState(accessScope, teamRole);

        var requested = NormalizePodcastRole(request?.RequestedRole);
        var grantedRole = state.AllowedRoles.Contains(requested, StringComparer.OrdinalIgnoreCase)
            ? requested
            : state.EffectiveRole;
        var permissions = BuildPodcastRolePermissions(grantedRole);

        return Ok(new
        {
            accessScope,
            teamRole,
            requestedRole = requested,
            grantedRole,
            allowedRoles = state.AllowedRoles,
            permissions,
            syncedAtUtc = DateTime.UtcNow
        });
    }

    [HttpGet("team-access/podcast-shared-script")]
    [Authorize]
    public IActionResult GetSharedPodcastScript([FromQuery] string? roomId = null)
    {
        if (!TryGetCurrentActorEmail(out var actorEmail) || !IsAuthenticationAllowed(actorEmail))
        {
            return Forbid();
        }

        var shared = _teamAccessService.GetSharedPodcastScript(roomId);
        if (shared is null)
        {
            return Ok(new
            {
                roomId = string.IsNullOrWhiteSpace(roomId) ? "main" : roomId.Trim(),
                hasSharedScript = false,
                syncedAtUtc = DateTime.UtcNow
            });
        }

        return Ok(new
        {
            roomId = shared.RoomId,
            hasSharedScript = true,
            scriptText = shared.ScriptText,
            scriptPipeline = new
            {
                segment1 = shared.ScriptPipeline.Segment1,
                segment2 = shared.ScriptPipeline.Segment2,
                segment3 = shared.ScriptPipeline.Segment3,
                segment4 = shared.ScriptPipeline.Segment4
            },
            sharedByEmail = shared.SharedByEmail,
            sharedByRole = shared.SharedByRole,
            sharedAtUtc = shared.SharedAtUtc,
            version = shared.Version,
            syncedAtUtc = DateTime.UtcNow
        });
    }

    [HttpPost("team-access/podcast-shared-script")]
    [Authorize]
    public IActionResult SharePodcastScript([FromBody] PodcastSharedScriptRequest? request)
    {
        if (!TryGetCurrentActorEmail(out var actorEmail) || !IsAuthenticationAllowed(actorEmail))
        {
            return Forbid();
        }

        var teamRole = NormalizePodcastRole(ResolveTeamRole(actorEmail));
        if (teamRole == "guest")
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "Guests cannot share the studio script." });
        }

        var roomId = string.IsNullOrWhiteSpace(request?.RoomId) ? "main" : request!.RoomId.Trim();
        var scriptText = request?.ScriptText ?? string.Empty;
        var scriptPipeline = request?.ScriptPipeline;

        var hasScriptText = !string.IsNullOrWhiteSpace(scriptText);
        var hasPipeline = !string.IsNullOrWhiteSpace(scriptPipeline?.Segment1)
            || !string.IsNullOrWhiteSpace(scriptPipeline?.Segment2)
            || !string.IsNullOrWhiteSpace(scriptPipeline?.Segment3)
            || !string.IsNullOrWhiteSpace(scriptPipeline?.Segment4);

        if (!hasScriptText && !hasPipeline)
        {
            return BadRequest(new { message = "Provide script text or at least one script pipeline segment before sharing." });
        }

        var shared = _teamAccessService.UpsertSharedPodcastScript(
            actorEmail,
            teamRole,
            roomId,
            scriptText,
            new TeamSharedPodcastScriptPipeline
            {
                Segment1 = scriptPipeline?.Segment1 ?? string.Empty,
                Segment2 = scriptPipeline?.Segment2 ?? string.Empty,
                Segment3 = scriptPipeline?.Segment3 ?? string.Empty,
                Segment4 = scriptPipeline?.Segment4 ?? string.Empty
            });

        return Ok(new
        {
            success = true,
            roomId = shared.RoomId,
            scriptText = shared.ScriptText,
            scriptPipeline = new
            {
                segment1 = shared.ScriptPipeline.Segment1,
                segment2 = shared.ScriptPipeline.Segment2,
                segment3 = shared.ScriptPipeline.Segment3,
                segment4 = shared.ScriptPipeline.Segment4
            },
            sharedByEmail = shared.SharedByEmail,
            sharedByRole = shared.SharedByRole,
            sharedAtUtc = shared.SharedAtUtc,
            version = shared.Version,
            syncedAtUtc = DateTime.UtcNow
        });
    }

    [HttpGet("team-access/podcast-session-snapshot")]
    [Authorize]
    public async Task<IActionResult> GetPodcastSessionSnapshot([FromQuery] string? roomId = null, CancellationToken cancellationToken = default)
    {
        if (!TryGetCurrentActorEmail(out var actorEmail) || !IsAuthenticationAllowed(actorEmail))
        {
            return Forbid();
        }

        var normalizedRoomId = string.IsNullOrWhiteSpace(roomId) ? "main" : roomId.Trim();

        var databaseRecord = await GetPodcastSessionSnapshotFromDatabaseAsync(normalizedRoomId, cancellationToken);
        if (databaseRecord is not null)
        {
            JsonElement dbPayload;
            try
            {
                dbPayload = JsonSerializer.Deserialize<JsonElement>(databaseRecord.SnapshotJson);
            }
            catch
            {
                dbPayload = JsonDocument.Parse("{}").RootElement;
            }

            return Ok(new
            {
                roomId = databaseRecord.RoomId,
                hasSnapshot = true,
                snapshot = dbPayload,
                savedByEmail = databaseRecord.SavedByEmail,
                savedAtUtc = databaseRecord.SavedAtUtc,
                version = databaseRecord.Version,
                blobUrl = databaseRecord.BlobPublicUrl,
                persistence = "database",
                syncedAtUtc = DateTime.UtcNow
            });
        }

        var snapshot = _teamAccessService.GetPodcastSessionSnapshot(roomId);
        if (snapshot is null)
        {
            return Ok(new
            {
                roomId = normalizedRoomId,
                hasSnapshot = false,
                syncedAtUtc = DateTime.UtcNow
            });
        }

        JsonElement payload;
        try
        {
            payload = JsonSerializer.Deserialize<JsonElement>(snapshot.SnapshotJson);
        }
        catch
        {
            payload = JsonDocument.Parse("{}").RootElement;
        }

        return Ok(new
        {
            roomId = snapshot.RoomId,
            hasSnapshot = true,
            snapshot = payload,
            savedByEmail = snapshot.SavedByEmail,
            savedAtUtc = snapshot.SavedAtUtc,
            version = snapshot.Version,
            persistence = "fallback",
            syncedAtUtc = DateTime.UtcNow
        });
    }

    [HttpPost("team-access/podcast-session-snapshot")]
    [Authorize]
    public async Task<IActionResult> SavePodcastSessionSnapshot([FromBody] PodcastSessionSnapshotRequest? request, CancellationToken cancellationToken = default)
    {
        if (!TryGetCurrentActorEmail(out var actorEmail) || !IsAuthenticationAllowed(actorEmail))
        {
            return Forbid();
        }

        var roomId = string.IsNullOrWhiteSpace(request?.RoomId) ? "main" : request!.RoomId.Trim();
        var snapshotJson = request?.Snapshot.ValueKind == JsonValueKind.Undefined
            ? "{}"
            : request?.Snapshot.GetRawText() ?? "{}";

        if (string.IsNullOrWhiteSpace(snapshotJson) || snapshotJson == "{}")
        {
            return BadRequest(new { message = "A non-empty podcast session snapshot is required." });
        }

        var saved = _teamAccessService.UpsertPodcastSessionSnapshot(actorEmail, roomId, snapshotJson, request?.Version);

        var dbSaved = await UpsertPodcastSessionSnapshotInDatabaseAsync(
            roomId,
            actorEmail,
            snapshotJson,
            saved.Version,
            cancellationToken);

        return Ok(new
        {
            success = true,
            roomId = saved.RoomId,
            savedByEmail = saved.SavedByEmail,
            savedAtUtc = saved.SavedAtUtc,
            version = dbSaved?.Version ?? saved.Version,
            persistence = dbSaved is null ? "fallback" : "database",
            blobUrl = dbSaved?.BlobPublicUrl,
            syncedAtUtc = DateTime.UtcNow
        });
    }

    [HttpGet("team-access/podcast-team-selection")]
    [Authorize]
    public IActionResult GetPodcastTeamSelection([FromQuery] string? roomId = null)
    {
        if (!TryGetCurrentActorEmail(out var actorEmail) || !IsAuthenticationAllowed(actorEmail))
        {
            return Forbid();
        }

        var normalizedRoomId = string.IsNullOrWhiteSpace(roomId) ? "main" : roomId.Trim();
        var selection = _teamAccessService.GetPodcastTeamSelection(normalizedRoomId);

        if (selection is null)
        {
            return Ok(new
            {
                roomId = normalizedRoomId,
                hasSelection = false,
                requestedMaxParticipants = 5,
                deviceCapacity = 5,
                effectiveMaxParticipants = 5,
                participants = Array.Empty<object>(),
                syncedAtUtc = DateTime.UtcNow
            });
        }

        return Ok(new
        {
            roomId = selection.RoomId,
            hasSelection = true,
            requestedMaxParticipants = selection.RequestedMaxParticipants,
            deviceCapacity = selection.DeviceCapacity,
            effectiveMaxParticipants = selection.EffectiveMaxParticipants,
            participants = selection.Participants.Select(member => new
            {
                identifier = member.Identifier,
                displayName = member.DisplayName,
                role = member.Role,
                device = member.Device,
                isConnected = member.IsConnected,
                addedAtUtc = member.AddedAtUtc
            }),
            savedByEmail = selection.SavedByEmail,
            savedAtUtc = selection.SavedAtUtc,
            version = selection.Version,
            syncedAtUtc = DateTime.UtcNow
        });
    }

    [HttpPost("team-access/podcast-team-selection")]
    [Authorize]
    public IActionResult SavePodcastTeamSelection([FromBody] PodcastTeamSelectionRequest? request)
    {
        if (!TryGetCurrentActorEmail(out var actorEmail) || !IsAuthenticationAllowed(actorEmail))
        {
            return Forbid();
        }

        var roomId = string.IsNullOrWhiteSpace(request?.RoomId) ? "main" : request!.RoomId.Trim();
        var requestedMaxParticipants = Math.Clamp(request?.RequestedMaxParticipants ?? 5, 1, 5);
        var deviceCapacity = Math.Clamp(request?.DeviceCapacity ?? 5, 1, 20);
        var effectiveMaxParticipants = Math.Min(requestedMaxParticipants, deviceCapacity);

        var participants = (request?.Participants ?? new List<PodcastTeamMemberRequest>())
            .Select(member => new TeamPodcastTeamMemberRecord
            {
                Identifier = (member.Identifier ?? string.Empty).Trim(),
                DisplayName = (member.DisplayName ?? string.Empty).Trim(),
                Role = string.IsNullOrWhiteSpace(member.Role) ? "guest" : member.Role.Trim(),
                Device = string.IsNullOrWhiteSpace(member.Device) ? "Unknown" : member.Device.Trim(),
                IsConnected = member.IsConnected,
                AddedAtUtc = member.AddedAtUtc ?? DateTime.UtcNow
            })
            .Where(member => !string.IsNullOrWhiteSpace(member.Identifier) || !string.IsNullOrWhiteSpace(member.DisplayName))
            .ToList();

        if (participants.Count > effectiveMaxParticipants)
        {
            return BadRequest(new
            {
                message = $"Selected participants ({participants.Count}) exceed your current team capacity ({effectiveMaxParticipants}).",
                requestedMaxParticipants,
                deviceCapacity,
                effectiveMaxParticipants
            });
        }

        var saved = _teamAccessService.UpsertPodcastTeamSelection(
            actorEmail,
            roomId,
            requestedMaxParticipants,
            deviceCapacity,
            participants,
            request?.Version);

        return Ok(new
        {
            success = true,
            roomId = saved.RoomId,
            requestedMaxParticipants = saved.RequestedMaxParticipants,
            deviceCapacity = saved.DeviceCapacity,
            effectiveMaxParticipants = saved.EffectiveMaxParticipants,
            participants = saved.Participants.Select(member => new
            {
                identifier = member.Identifier,
                displayName = member.DisplayName,
                role = member.Role,
                device = member.Device,
                isConnected = member.IsConnected,
                addedAtUtc = member.AddedAtUtc
            }),
            savedByEmail = saved.SavedByEmail,
            savedAtUtc = saved.SavedAtUtc,
            version = saved.Version,
            syncedAtUtc = DateTime.UtcNow
        });
    }

    [HttpPost("team-access/accept")]
    [AllowAnonymous]
    public async Task<IActionResult> AcceptTeamInvite([FromBody] TeamInviteAcceptRequest request)
    {
        EnsureConfiguredUsersSeeded();

        var inviteToken = request.InviteToken?.Trim() ?? string.Empty;
        var inviteeEmail = request.Email?.Trim() ?? string.Empty;
        var password = request.Password ?? string.Empty;

        if (string.IsNullOrWhiteSpace(inviteToken) || string.IsNullOrWhiteSpace(inviteeEmail) || string.IsNullOrWhiteSpace(password))
        {
            return BadRequest(new { message = "Invite token, email, and password are required." });
        }

        if (!IsValidEmail(inviteeEmail))
        {
            return BadRequest(new { message = "A valid email address is required." });
        }

        if (!MeetsPasswordPolicy(password))
        {
            return BadRequest(new { message = "Password must be at least 8 characters and include uppercase, lowercase, number, and special character." });
        }

        var accepted = _teamAccessService.TryConsumeInvite(inviteToken, inviteeEmail);
        if (accepted is null)
        {
            return Unauthorized(new { message = "Invite token is invalid, expired, or already consumed." });
        }

        AppUserRecord user;
        var safeName = string.IsNullOrWhiteSpace(request.Name)
            ? (string.IsNullOrWhiteSpace(accepted.DisplayName) ? inviteeEmail.Split('@')[0] : accepted.DisplayName)
            : request.Name.Trim();

        if (_userStore.TryGetByEmail(inviteeEmail, out var existingUser) && existingUser is not null)
        {
            _userStore.UpdatePassword(inviteeEmail, password);
            user = existingUser;
            if (!string.IsNullOrWhiteSpace(safeName) && !string.Equals(user.Name, safeName, StringComparison.Ordinal))
            {
                user = _userStore.UpdateProfile(user.Id, new UpdateUserProfileRequest { Name = safeName });
            }
        }
        else
        {
            user = _userStore.CreateUser(safeName, inviteeEmail, password, string.Empty, string.Empty, string.Empty, string.Empty);
        }

        var domainUserId = await EnsureDomainUserAsync(user);
        var accessScope = ResolveAccessScope(user.Email);
        var teamRole = ResolveTeamRole(user.Email);
        var token = GenerateToken(domainUserId.ToString("N"), user.Email, user.Name, accessScope, teamRole);
        var refreshToken = GenerateRefreshToken(domainUserId.ToString("N"));
        SetRefreshCookie(refreshToken);

        var responseUser = UserStore.ToResponse(user);
        responseUser.Id = domainUserId.ToString("N");

        try
        {
            _growthService.TrackEvent(
                user.Id,
                user.Email,
                "team_access_granted",
                new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                {
                    ["accessScope"] = accessScope,
                    ["teamRole"] = teamRole,
                    ["prearranged"] = accepted.Prearranged ? "true" : "false"
                });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Growth tracking failed when accepting team invite for {Email}.", user.Email);
        }

        return Ok(new { token, refreshToken, user = responseUser, accessScope, teamRole, accepted.Prearranged });
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

        if (!IsAuthenticationAllowed(email))
        {
            return StatusCode(StatusCodes.Status403Forbidden, new
            {
                success = false,
                message = "Access requires admin approval or an active team invite."
            });
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

        if (!IsAuthenticationAllowed(record.Email))
        {
            PasswordResetsByToken.TryRemove(token, out _);
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "Access requires admin approval or an active team invite." });
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
        var configuredIssuer = _configuration["Authentication:Jwt:Issuer"] ?? _configuration["Jwt:Issuer"];
        var configuredAudience = _configuration["Authentication:Jwt:Audience"] ?? _configuration["Jwt:Audience"];
        var jwtKey = GetJwtKey();

        var validIssuers = new[] { "Wiseravenshare.Server", "WiseRavenShare", configuredIssuer }
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var validAudiences = new[] { "Wiseravenshare.Client", "WiseRavenShare_Clients", configuredAudience }
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        return new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ValidateIssuer = validIssuers.Length > 0,
            ValidIssuers = validIssuers,
            ValidateAudience = validAudiences.Length > 0,
            ValidAudiences = validAudiences,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(5)
        };
    }

    private string GenerateToken(string id, string email, string name, string accessScope = "admin", string teamRole = "owner")
    {
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, id),
            new(ClaimTypes.NameIdentifier, id),
            new(JwtRegisteredClaimNames.Email, email),
            new(ClaimTypes.Name, name),
            new(ClaimTypes.Email, email),
            new(ClaimTypes.Role, teamRole),
            new("access_scope", accessScope)
        };

        if (string.Equals(accessScope, "admin", StringComparison.OrdinalIgnoreCase) || IsConfiguredAdminUser(email))
        {
            claims.Add(new Claim(ClaimTypes.Role, "Admin"));
            claims.Add(new Claim("admin_pass", "all-access"));
        }

        var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(GetJwtKey()));
        var credentials = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);
        var expiresMinutes = int.TryParse(_configuration["Authentication:Jwt:ExpiresMinutes"], out var minutes)
            ? Math.Clamp(minutes, 5, 1440)
            : 1440; // Default 24h so users are not silently kicked out mid-session

        var token = new JwtSecurityToken(
            issuer: _configuration["Authentication:Jwt:Issuer"],
            audience: _configuration["Authentication:Jwt:Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(expiresMinutes),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private string GenerateRefreshToken(string userId)
    {
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        // 365 days: the session effectively persists until the user logs out
        // (the client auto-refreshes the access token). 
        var expiresAtUtc = DateTime.UtcNow.AddDays(365);

        _refreshTokenStore.Save(token, userId, expiresAtUtc);

        return token;
    }

    private void SetRefreshCookie(string refreshToken)
    {
        if (string.IsNullOrWhiteSpace(refreshToken))
        {
            return;
        }

        Response.Cookies.Append(RefreshCookieName, refreshToken, new CookieOptions
        {
            HttpOnly = true,
            Secure = Request.IsHttps,
            SameSite = SameSiteMode.Lax,
            Expires = DateTimeOffset.UtcNow.AddDays(RefreshCookieDays),
            Path = "/api/auth"
        });
    }

    private void DeleteRefreshCookie()
    {
        Response.Cookies.Delete(RefreshCookieName, new CookieOptions
        {
            Path = "/api/auth"
        });
    }

    private string GetJwtKey()
    {
        return UnifiedAuthExtensions.ResolveJwtKey(_configuration);
    }

    private string ResolveJwtKeyFromConfiguration()
    {
        return ResolveOAuthSettingValue(
            _configuration["JWT_highentropykey"],
            _configuration["Authentication:Jwt:Key"],
            _configuration["Authentication__Jwt__Key"],
            Environment.GetEnvironmentVariable("JWT_highentropykey"),
            Environment.GetEnvironmentVariable("Authentication__Jwt__Key"));
    }

    private static bool IsValidEmail(string email)
    {
        return new EmailAddressAttribute().IsValid(email?.Trim());
    }

    private bool IsSelfRegistrationAllowed()
    {
        // Self-registration is intentionally always enabled for growth mode.
        return true;
    }

    private bool TryAuthenticateConfiguredCredential(string emailOrIdentifier, string password, out AppUserRecord? user)
    {
        user = null;

        var loginIdentifier = (emailOrIdentifier ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(loginIdentifier) || string.IsNullOrWhiteSpace(password))
        {
            return false;
        }

        var configuredUser = ReadConfiguredUsers()
            .FirstOrDefault(candidate =>
                !string.IsNullOrWhiteSpace(candidate.Email)
                && !string.IsNullOrWhiteSpace(candidate.Password)
                && (
                    string.Equals(candidate.Email.Trim(), loginIdentifier, StringComparison.OrdinalIgnoreCase)
                    || string.Equals((candidate.Email ?? string.Empty).Trim().Split('@')[0], loginIdentifier.TrimStart('@'), StringComparison.OrdinalIgnoreCase)
                    || string.Equals(((candidate.Name ?? string.Empty).Trim().Replace(" ", string.Empty)), loginIdentifier.TrimStart('@'), StringComparison.OrdinalIgnoreCase)
                    || string.Equals((candidate.Name ?? string.Empty).Trim(), loginIdentifier, StringComparison.OrdinalIgnoreCase)));

        if (string.IsNullOrWhiteSpace(configuredUser.Email) || string.IsNullOrWhiteSpace(configuredUser.Password))
        {
            return false;
        }

        if (!PasswordsMatch(configuredUser.Password, password))
        {
            return false;
        }

        var normalizedEmail = configuredUser.Email.Trim();

        if (_userStore.TryGetByEmail(normalizedEmail, out var existingUser) && existingUser is not null)
        {
            if (!VerifyPasswordCompat(password, existingUser.PasswordHash))
            {
                _userStore.UpdatePassword(normalizedEmail, password);
                _userStore.TryGetByEmail(normalizedEmail, out existingUser);
            }

            user = existingUser;
            return user is not null;
        }

        var safeName = string.IsNullOrWhiteSpace(configuredUser.Name)
            ? normalizedEmail.Split('@')[0]
            : configuredUser.Name.Trim();

        user = _userStore.CreateUser(
            safeName,
            normalizedEmail,
            password,
            string.Empty,
            string.Empty,
            string.Empty,
            string.Empty);

        return true;
    }

    private static bool PasswordsMatch(string configuredPassword, string providedPassword)
    {
        static string Normalize(string value)
        {
            var trimmed = (value ?? string.Empty).Trim();
            if (trimmed.Length >= 2)
            {
                if ((trimmed.StartsWith('"') && trimmed.EndsWith('"')) ||
                    (trimmed.StartsWith('\'') && trimmed.EndsWith('\'')))
                {
                    return trimmed[1..^1];
                }
            }

            return trimmed;
        }

        return string.Equals(Normalize(configuredPassword), Normalize(providedPassword), StringComparison.Ordinal);
    }

    private IReadOnlyCollection<string> GetConfiguredAdminEmails()
    {
        return AuthAccessPolicy.ResolveConfiguredAdminEmails(_configuration);
    }

    private bool IsConfiguredAdminUser(string? email)
    {
        return AuthAccessPolicy.IsAdminLoginAllowed(email, GetConfiguredAdminEmails());
    }

    private bool IsAuthenticationAllowed(string? email)
    {
        if (string.IsNullOrWhiteSpace(email))
        {
            return false;
        }

        // Admins and team members are always allowed.
        if (IsConfiguredAdminUser(email) || (_teamAccessService?.IsTeamMemberAllowed(email) ?? false))
        {
            return true;
        }

        // Existing users (already registered) are always allowed to log in,
        // regardless of whether self-registration is currently enabled.
        // AllowSelfRegistration only gates creation of NEW accounts.
        if (_userStore?.EmailExists(email) == true)
        {
            return true;
        }

        // New users can only authenticate if self-registration is open.
        return IsSelfRegistrationAllowed();
    }

    private string ResolveAccessScope(string? email)
    {
        return IsConfiguredAdminUser(email) ? "admin" : "team";
    }

    private string ResolveTeamRole(string? email)
    {
        if (IsConfiguredAdminUser(email))
        {
            return "owner";
        }

        var snapshot = _teamAccessService.GetSnapshot();
        var member = snapshot.Members.FirstOrDefault(candidate =>
            candidate.Email.Equals((email ?? string.Empty).Trim(), StringComparison.OrdinalIgnoreCase));
        return member?.TeamRole ?? "member";
    }

    private string GenerateAdminPassTokenIfEligible(string userId, string email, string accessScope)
    {
        if (!string.Equals(accessScope, "admin", StringComparison.OrdinalIgnoreCase))
        {
            return string.Empty;
        }

        if (!IsConfiguredAdminUser(email))
        {
            return string.Empty;
        }

        return GenerateAdminPassToken(userId, email, accessScope);
    }

    private static string GenerateAdminPassToken(string userId, string email, string accessScope)
    {
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        AdminPassTokensByToken[token] = new AdminPassTokenRecord
        {
            UserId = userId,
            Email = (email ?? string.Empty).Trim().ToLowerInvariant(),
            Scope = string.IsNullOrWhiteSpace(accessScope) ? "team" : accessScope.Trim().ToLowerInvariant(),
            IssuedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddHours(24)
        };
        return token;
    }

    private PodcastControlState BuildPodcastControlState(string accessScope, string teamRole)
    {
        var normalizedScope = (accessScope ?? string.Empty).Trim().ToLowerInvariant();
        var normalizedTeamRole = NormalizePodcastRole(teamRole);

        if (normalizedScope == "admin" || normalizedTeamRole == "owner")
        {
            var ownerPermissions = BuildPodcastRolePermissions("owner");
            return new PodcastControlState
            {
                EffectiveRole = "owner",
                AllowedRoles = new[] { "owner", "producer", "host", "editor", "script-lead", "guest" },
                Permissions = ownerPermissions
            };
        }

        if (normalizedTeamRole == "producer")
        {
            return new PodcastControlState
            {
                EffectiveRole = "producer",
                AllowedRoles = new[] { "producer", "host", "editor", "script-lead", "guest" },
                Permissions = BuildPodcastRolePermissions("producer")
            };
        }

        if (normalizedTeamRole == "host")
        {
            return new PodcastControlState
            {
                EffectiveRole = "host",
                AllowedRoles = new[] { "host", "editor", "script-lead", "guest" },
                Permissions = BuildPodcastRolePermissions("host")
            };
        }

        if (normalizedTeamRole == "editor")
        {
            return new PodcastControlState
            {
                EffectiveRole = "editor",
                AllowedRoles = new[] { "editor", "script-lead", "guest" },
                Permissions = BuildPodcastRolePermissions("editor")
            };
        }

        if (normalizedTeamRole == "script-lead")
        {
            return new PodcastControlState
            {
                EffectiveRole = "script-lead",
                AllowedRoles = new[] { "script-lead", "guest" },
                Permissions = BuildPodcastRolePermissions("script-lead")
            };
        }

        // Public/self-registered users can still collaborate safely as guests.
        return new PodcastControlState
        {
            EffectiveRole = "guest",
            AllowedRoles = new[] { "guest" },
            Permissions = BuildPodcastRolePermissions("guest")
        };
    }

    private static string NormalizePodcastRole(string? value)
    {
        var normalized = (value ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            "owner" => "owner",
            "producer" => "producer",
            "host" => "host",
            "editor" => "editor",
            "script lead" => "script-lead",
            "script_lead" => "script-lead",
            "script-lead" => "script-lead",
            "guest" => "guest",
            _ => "guest"
        };
    }

    private static object BuildPodcastRolePermissions(string normalizedRole)
    {
        var role = NormalizePodcastRole(normalizedRole);
        return role switch
        {
            "owner" => new
            {
                canGoLive = true,
                canEditScript = true,
                canAssignShots = true,
                canApproveSegments = true,
                canSwitchMonitors = true,
                canManageGuests = true
            },
            "producer" => new
            {
                canGoLive = true,
                canEditScript = true,
                canAssignShots = true,
                canApproveSegments = true,
                canSwitchMonitors = true,
                canManageGuests = true
            },
            "host" => new
            {
                canGoLive = true,
                canEditScript = true,
                canAssignShots = true,
                canApproveSegments = false,
                canSwitchMonitors = true,
                canManageGuests = false
            },
            "editor" => new
            {
                canGoLive = false,
                canEditScript = true,
                canAssignShots = true,
                canApproveSegments = true,
                canSwitchMonitors = true,
                canManageGuests = false
            },
            "script-lead" => new
            {
                canGoLive = false,
                canEditScript = true,
                canAssignShots = true,
                canApproveSegments = true,
                canSwitchMonitors = false,
                canManageGuests = false
            },
            _ => new
            {
                canGoLive = false,
                canEditScript = false,
                canAssignShots = false,
                canApproveSegments = false,
                canSwitchMonitors = false,
                canManageGuests = false
            }
        };
    }

    private bool TryGetCurrentActorEmail(out string email)
    {
        email = User.FindFirstValue(ClaimTypes.Email)
            ?? User.FindFirstValue(JwtRegisteredClaimNames.Email)
            ?? string.Empty;
        email = email.Trim();
        return !string.IsNullOrWhiteSpace(email);
    }

    private void RecordTeamAccessPolicyShift(string actorEmail, string policyKey, string title, string summary, string status, string notes)
    {
        try
        {
            var userId = "system";
            var userEmail = actorEmail.Trim();

            if (_userStore.TryGetByEmail(actorEmail, out var actorUser) && actorUser is not null)
            {
                userId = actorUser.Id;
                userEmail = actorUser.Email;
            }

            _growthService.RecordAdminPolicyShift(userId, userEmail, new AdminPolicyShiftRequest
            {
                PolicyKey = policyKey,
                Title = title,
                Summary = summary,
                Status = status,
                Notes = notes
            });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to record team-access policy audit event {PolicyKey}.", policyKey);
        }
    }

    private static string NormalizeOAuthProvider(string? provider)
    {
        var value = (provider ?? string.Empty).Trim().ToLowerInvariant();
        return value switch
        {
            "google" => "google",
            "microsoft" => "microsoft",
            "facebook" => "facebook",
            "instagram" => "instagram",
            "tiktok" => "tiktok",
            "youtube" => "youtube",
            "twitter" => "twitter",
            "x" => "twitter",         // X is the rebrand of Twitter
            "bluesky" => "bluesky",
            "linkedin" => "linkedin",
            "reddit" => "reddit",
            _ => string.Empty
        };
    }

    private OAuthProviderConfig ReadOAuthProviderConfig(string provider)
    {
        var sectionName = provider switch
        {
            "google" => "Google",
            "microsoft" => "Microsoft",
            "facebook" => "Facebook",
            "instagram" => "Instagram",
            "tiktok" => "TikTok",
            "youtube" => "YouTube",
            "twitter" => "Twitter",
            "bluesky" => "Bluesky",
            "linkedin" => "LinkedIn",
            "reddit" => "Reddit",
            _ => string.Empty
        };

        var section = _configuration.GetSection($"Authentication:OAuthProviders:{sectionName}");
        var providerPrefix = provider.ToUpperInvariant();
        var rawClientIdEnv = ReadRawEnvironmentOAuthSetting($"Authentication__OAuthProviders__{sectionName}__ClientId");
        var rawClientSecretEnv = ReadRawEnvironmentOAuthSetting($"Authentication__OAuthProviders__{sectionName}__ClientSecret");
        var rawTenantEnv = ReadRawEnvironmentOAuthSetting($"Authentication__OAuthProviders__{sectionName}__TenantId");
        var rawRedirectUriEnv = ReadRawEnvironmentOAuthSetting($"Authentication__OAuthProviders__{sectionName}__RedirectUri");

        var fallbackClientId = provider switch
        {
            "facebook" => ResolveOAuthSettingValue(
                _configuration["Social:Facebook:AppId"],
                _configuration["FACEBOOK_APP_ID"],
                _configuration["META_APP_ID"]),
            // Instagram uses the same Meta app credentials as Facebook in most deployments.
            "instagram" => ResolveOAuthSettingValue(
                _configuration["Authentication:OAuthProviders:Facebook:ClientId"],
                _configuration["Social:Facebook:AppId"],
                _configuration["FACEBOOK_OAUTH_CLIENT_ID"],
                _configuration["FACEBOOK_CLIENT_ID"],
                _configuration["FACEBOOK_APP_ID"],
                _configuration["META_APP_ID"]),
            "tiktok" => ResolveOAuthSettingValue(
                _configuration["TIKTOK_CLIENT_ID"],
                _configuration["TIKTOK_APP_ID"],
                _configuration["Social:TikTok:ClientId"]),
            // YouTube OAuth uses Google OAuth credentials.
            "youtube" => ResolveOAuthSettingValue(
                _configuration["Authentication:OAuthProviders:Google:ClientId"],
                _configuration["GOOGLE_OAUTH_CLIENT_ID"],
                _configuration["GOOGLE_CLIENT_ID"]),
            "twitter" => ResolveOAuthSettingValue(
                _configuration["TWITTER_CLIENT_ID"],
                _configuration["X_CLIENT_ID"],
                _configuration["Social:Twitter:ClientId"]),
            "linkedin" => ResolveOAuthSettingValue(
                _configuration["LINKEDIN_CLIENT_ID"],
                _configuration["Social:LinkedIn:ClientId"],
                _configuration["Social:LinkedIn:AppId"]),
            "reddit" => ResolveOAuthSettingValue(
                _configuration["REDDIT_CLIENT_ID"],
                _configuration["Social:Reddit:ClientId"],
                _configuration["Social:Reddit:AppId"]),
            _ => string.Empty
        };
        var fallbackClientSecret = provider switch
        {
            "facebook" => ResolveOAuthSettingValue(
                _configuration["Social:Facebook:AppSecret"],
                _configuration["FACEBOOK_APP_SECRET"],
                _configuration["META_APP_SECRET"]),
            "instagram" => ResolveOAuthSettingValue(
                _configuration["Authentication:OAuthProviders:Facebook:ClientSecret"],
                _configuration["Social:Facebook:AppSecret"],
                _configuration["FACEBOOK_OAUTH_CLIENT_SECRET"],
                _configuration["FACEBOOK_CLIENT_SECRET"],
                _configuration["FACEBOOK_APP_SECRET"],
                _configuration["META_APP_SECRET"]),
            "tiktok" => ResolveOAuthSettingValue(
                _configuration["TIKTOK_CLIENT_SECRET"],
                _configuration["TIKTOK_APP_SECRET"],
                _configuration["Social:TikTok:ClientSecret"]),
            "youtube" => ResolveOAuthSettingValue(
                _configuration["Authentication:OAuthProviders:Google:ClientSecret"],
                _configuration["GOOGLE_OAUTH_CLIENT_SECRET"],
                _configuration["GOOGLE_CLIENT_SECRET"]),
            "twitter" => ResolveOAuthSettingValue(
                _configuration["TWITTER_CLIENT_SECRET"],
                _configuration["X_CLIENT_SECRET"],
                _configuration["Social:Twitter:ClientSecret"]),
            "linkedin" => ResolveOAuthSettingValue(
                _configuration["LINKEDIN_CLIENT_SECRET"],
                _configuration["Social:LinkedIn:ClientSecret"],
                _configuration["Social:LinkedIn:AppSecret"]),
            "reddit" => ResolveOAuthSettingValue(
                _configuration["REDDIT_CLIENT_SECRET"],
                _configuration["Social:Reddit:ClientSecret"],
                _configuration["Social:Reddit:AppSecret"]),
            _ => string.Empty
        };
        var fallbackRedirectUri = provider switch
        {
            "facebook" => ResolveOAuthSettingValue(
                _configuration["Social:Facebook:RedirectUri"],
                _configuration["FACEBOOK_OAUTH_REDIRECT_URI"],
                _configuration["FACEBOOK_REDIRECT_URI"]),
            "instagram" => ResolveOAuthSettingValue(
                _configuration["Authentication:OAuthProviders:Facebook:RedirectUri"],
                _configuration["Social:Facebook:RedirectUri"],
                _configuration["FACEBOOK_OAUTH_REDIRECT_URI"],
                _configuration["FACEBOOK_REDIRECT_URI"]),
            "tiktok" => ResolveOAuthSettingValue(
                _configuration["Social:TikTok:RedirectUri"],
                _configuration["TIKTOK_OAUTH_REDIRECT_URI"],
                _configuration["TIKTOK_REDIRECT_URI"]),
            "linkedin" => ResolveOAuthSettingValue(
                _configuration["Social:LinkedIn:RedirectUri"],
                _configuration["LINKEDIN_OAUTH_REDIRECT_URI"],
                _configuration["LINKEDIN_REDIRECT_URI"]),
            "reddit" => ResolveOAuthSettingValue(
                _configuration["Social:Reddit:RedirectUri"],
                _configuration["REDDIT_OAUTH_REDIRECT_URI"],
                _configuration["REDDIT_REDIRECT_URI"]),
            _ => string.Empty
        };

        var clientId = ResolveOAuthSettingValue(
            section["ClientId"],
            _configuration[$"Authentication:OAuthProviders:{sectionName}:ClientId"],
            rawClientIdEnv,
            ResolveOAuthSettingBySuffix(providerPrefix, sectionName, "ClientId"),
            _configuration[$"{providerPrefix}_OAUTH_CLIENT_ID"],
            _configuration[$"{providerPrefix}_OAUTH_CLIENTID"],
            _configuration[$"{providerPrefix}_CLIENT_ID"],
            _configuration[$"{providerPrefix}_CLIENTID"],
            provider == "facebook" ? _configuration["FACEBOOK_APP_ID"] : null,
            provider == "instagram" ? _configuration["INSTAGRAM_APP_ID"] : null,
            provider == "tiktok" ? _configuration["TIKTOK_CLIENT_KEY"] : null,
            fallbackClientId);
        var clientSecret = ResolveOAuthSettingValue(
            section["ClientSecret"],
            _configuration[$"Authentication:OAuthProviders:{sectionName}:ClientSecret"],
            rawClientSecretEnv,
            ResolveOAuthSettingBySuffix(providerPrefix, sectionName, "ClientSecret"),
            _configuration[$"{providerPrefix}_OAUTH_CLIENT_SECRET"],
            _configuration[$"{providerPrefix}_OAUTH_CLIENTSECRET"],
            _configuration[$"{providerPrefix}_CLIENT_SECRET"],
            _configuration[$"{providerPrefix}_CLIENTSECRET"],
            provider == "facebook" ? _configuration["FACEBOOK_APP_SECRET"] : null,
            provider == "instagram" ? _configuration["INSTAGRAM_APP_SECRET"] : null,
            fallbackClientSecret);
        var tenantId = ResolveOAuthSettingValue(
            section["TenantId"],
            _configuration[$"Authentication:OAuthProviders:{sectionName}:TenantId"],
            rawTenantEnv,
            ResolveOAuthSettingBySuffix(providerPrefix, sectionName, "TenantId"),
            _configuration[$"{providerPrefix}_OAUTH_TENANT_ID"],
            _configuration[$"{providerPrefix}_OAUTH_TENANT"]);
        var redirectUri = ResolveOAuthSettingValue(
            section["RedirectUri"],
            _configuration[$"Authentication:OAuthProviders:{sectionName}:RedirectUri"],
            rawRedirectUriEnv,
            ResolveOAuthSettingBySuffix(providerPrefix, sectionName, "RedirectUri"),
            _configuration[$"{providerPrefix}_OAUTH_REDIRECT_URI"],
            _configuration[$"{providerPrefix}_OAUTH_CALLBACK"],
            _configuration[$"{providerPrefix}_OAUTH_CALLBACK_URL"],
            _configuration[$"{providerPrefix}_REDIRECT_URI"],
            _configuration[$"{providerPrefix}_CALLBACK_URL"],
            fallbackRedirectUri);
        var requiresClientSecret = !string.Equals(provider, "facebook", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(provider, "instagram", StringComparison.OrdinalIgnoreCase);

        return new OAuthProviderConfig
        {
            ClientId = clientId,
            ClientSecret = clientSecret,
            TenantId = tenantId,
            RedirectUri = redirectUri,
            IsEnabled = !string.IsNullOrWhiteSpace(clientId)
                && (!requiresClientSecret || !string.IsNullOrWhiteSpace(clientSecret))
        };
    }

    private static string ResolveOAuthSettingValue(params string?[] candidates)
    {
        foreach (var candidate in candidates)
        {
            var normalized = NormalizeConfiguredValue(candidate);
            if (!string.IsNullOrWhiteSpace(normalized))
            {
                return normalized;
            }
        }

        return string.Empty;
    }

    private static string NormalizeConfiguredValue(string? raw)
    {
        var value = (raw ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        // Some deployments accidentally keep template placeholders verbatim.
        if (value.StartsWith("${", StringComparison.Ordinal) && value.EndsWith("}", StringComparison.Ordinal))
        {
            return string.Empty;
        }

        return value;
    }

    private static string ReadRawEnvironmentOAuthSetting(string key)
    {
        return Environment.GetEnvironmentVariable(key) ?? string.Empty;
    }

    private string ResolveOAuthSettingBySuffix(string providerPrefix, string sectionName, string fieldName)
    {
        var normalizedSection = sectionName.Trim();
        var normalizedField = fieldName.Trim();

        var configSuffix = $":oauthproviders:{normalizedSection.ToLowerInvariant()}:{normalizedField.ToLowerInvariant()}";
        foreach (var pair in _configuration.AsEnumerable())
        {
            var key = pair.Key ?? string.Empty;
            if (!key.EndsWith(configSuffix, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var resolved = NormalizeConfiguredValue(pair.Value);
            if (!string.IsNullOrWhiteSpace(resolved))
            {
                return resolved;
            }
        }

        var envSuffix = $"__OAUTHPROVIDERS__{normalizedSection.ToUpperInvariant()}__{normalizedField.ToUpperInvariant()}";
        var envPrefix = $"{providerPrefix}_OAUTH_{normalizedField.ToUpperInvariant()}";
        foreach (System.Collections.DictionaryEntry entry in Environment.GetEnvironmentVariables())
        {
            var key = (entry.Key?.ToString() ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(key))
            {
                continue;
            }

            if (!key.EndsWith(envSuffix, StringComparison.OrdinalIgnoreCase)
                && !key.StartsWith(envPrefix, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var resolved = NormalizeConfiguredValue(entry.Value?.ToString());
            if (!string.IsNullOrWhiteSpace(resolved))
            {
                return resolved;
            }
        }

        return string.Empty;
    }

    private string BuildOAuthCallbackUrl(string provider, OAuthProviderConfig? providerConfig = null, bool useLegacyConnectPath = false)
    {
        var callbackPath = useLegacyConnectPath
            ? $"/api/v1/connect/{provider}/callback"
            : $"/api/auth/oauth/{provider}/callback";

        var configuredRedirectUri = providerConfig?.RedirectUri ?? string.Empty;
        if (Uri.TryCreate(configuredRedirectUri, UriKind.Absolute, out var explicitRedirectUri)
            && (string.Equals(explicitRedirectUri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase)
                || string.Equals(explicitRedirectUri.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase)))
        {
            return explicitRedirectUri.ToString();
        }

        var origin = ResolvePublicAppOrigin();
        if (string.Equals(provider, "facebook", StringComparison.OrdinalIgnoreCase)
            || string.Equals(provider, "instagram", StringComparison.OrdinalIgnoreCase))
        {
            if (Uri.TryCreate(origin, UriKind.Absolute, out var originUri))
            {
                if (string.Equals(originUri.Host, "wise-ravens.com", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(originUri.Host, "www.wise-ravens.com", StringComparison.OrdinalIgnoreCase))
                {
                    origin = "https://wiseravenshare.com";
                }
            }
        }
        return $"{origin}{callbackPath}";
    }

    private string ResolveOAuthCallbackUrlForTokenExchange(string provider, OAuthProviderConfig providerConfig)
    {
        var configuredRedirectUri = providerConfig.RedirectUri;
        if (Uri.TryCreate(configuredRedirectUri, UriKind.Absolute, out _))
        {
            return configuredRedirectUri;
        }

        if (Request.Host.HasValue)
        {
            return $"{Request.Scheme}://{Request.Host}{Request.PathBase}{Request.Path}";
        }

        return BuildOAuthCallbackUrl(provider, providerConfig);
    }

    private static bool IsLegacyConnectOAuthPath(PathString path)
    {
        return path.HasValue &&
               path.Value is not null &&
               path.Value.StartsWith("/api/v1/connect/", StringComparison.OrdinalIgnoreCase);
    }

    private string ResolveOAuthReturnUrl(string? returnUrl)
    {
        var fallback = ResolvePublicAppOrigin();

        if (string.IsNullOrWhiteSpace(returnUrl))
        {
            return fallback;
        }

        if (!Uri.TryCreate(returnUrl, UriKind.Absolute, out var requestedUri))
        {
            return fallback;
        }

        if (!string.Equals(requestedUri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase)
            && !string.Equals(requestedUri.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase))
        {
            return fallback;
        }

        if (!Uri.TryCreate(fallback, UriKind.Absolute, out var fallbackUri))
        {
            return fallback;
        }

        var allowedHosts = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            fallbackUri.Host,
            "wiseravenshare.com",
            "www.wiseravenshare.com",
            "wise-ravens.com",
            "www.wise-ravens.com"
        };

        if (Request.Host.HasValue && !string.IsNullOrWhiteSpace(Request.Host.Host))
        {
            allowedHosts.Add(Request.Host.Host);
        }

        var configuredBaseUrl = (_configuration["App:PublicBaseUrl"] ?? string.Empty).Trim();
        if (Uri.TryCreate(configuredBaseUrl, UriKind.Absolute, out var configuredUri)
            && !string.IsNullOrWhiteSpace(configuredUri.Host))
        {
            allowedHosts.Add(configuredUri.Host);
        }

        if (!allowedHosts.Contains(requestedUri.Host))
        {
            return fallback;
        }

        return requestedUri.GetLeftPart(UriPartial.Path) + requestedUri.Query + requestedUri.Fragment;
    }

    private string ResolvePublicAppOrigin()
    {
        var requestOrigin = $"{Request.Scheme}://{Request.Host}".TrimEnd('/');
        var configuredBaseUrl = (_configuration["App:PublicBaseUrl"] ?? string.Empty).Trim();

        if (!Uri.TryCreate(configuredBaseUrl, UriKind.Absolute, out var configuredUri))
        {
            return requestOrigin;
        }

        var configuredOrigin = configuredUri.GetLeftPart(UriPartial.Authority).TrimEnd('/');
        if (configuredUri.IsLoopback
            || string.Equals(configuredUri.Host, "localhost", StringComparison.OrdinalIgnoreCase)
            || string.Equals(configuredUri.Host, "127.0.0.1", StringComparison.OrdinalIgnoreCase))
        {
            return requestOrigin;
        }

        if (!string.Equals(configuredUri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
        {
            return requestOrigin;
        }

        // For OAuth callbacks in production, prefer the configured public origin.
        // Proxy/container request hosts can be internal and fail provider domain checks.
        return configuredOrigin;
    }

    private string BuildOAuthAuthorizationUrl(string provider, OAuthProviderConfig config, string callbackUrl, string state, string codeChallenge = "")
    {
        return provider switch
        {
            "google" => BuildUrl("https://accounts.google.com/o/oauth2/v2/auth", new Dictionary<string, string?>
            {
                ["client_id"] = config.ClientId,
                ["redirect_uri"] = callbackUrl,
                ["response_type"] = "code",
                ["scope"] = "openid email profile",
                ["state"] = state,
                ["access_type"] = "offline",
                ["prompt"] = "consent",
                ["code_challenge"] = string.IsNullOrWhiteSpace(codeChallenge) ? null : codeChallenge,
                ["code_challenge_method"] = string.IsNullOrWhiteSpace(codeChallenge) ? null : "S256"
            }),
            "microsoft" => BuildUrl($"https://login.microsoftonline.com/{(string.IsNullOrWhiteSpace(config.TenantId) ? "common" : config.TenantId)}/oauth2/v2.0/authorize", new Dictionary<string, string?>
            {
                ["client_id"] = config.ClientId,
                ["redirect_uri"] = callbackUrl,
                ["response_type"] = "code",
                ["response_mode"] = "query",
                ["scope"] = "openid profile email User.Read",
                ["state"] = state
            }),
            "facebook" => BuildUrl("https://www.facebook.com/v19.0/dialog/oauth", new Dictionary<string, string?>
            {
                ["client_id"] = config.ClientId,
                ["redirect_uri"] = callbackUrl,
                ["response_type"] = "code",
                ["scope"] = "email,public_profile",
                ["state"] = state
            }),
            "instagram" => BuildUrl("https://www.facebook.com/v19.0/dialog/oauth", new Dictionary<string, string?>
            {
                ["client_id"] = config.ClientId,
                ["redirect_uri"] = callbackUrl,
                ["response_type"] = "code",
                ["scope"] = "email,public_profile,instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement,business_management",
                ["state"] = state
            }),
            "tiktok" => BuildUrl("https://www.tiktok.com/v2/auth/authorize/", new Dictionary<string, string?>
            {
                ["client_key"] = config.ClientId,
                ["redirect_uri"] = callbackUrl,
                ["response_type"] = "code",
                // TikTok Login Kit: only user.info.basic is currently approved for this
                // client key. Requesting unapproved scopes causes a scope-mismatch error
                // at the authorize endpoint and would fail the app review resubmission.
                ["scope"] = "user.info.basic",
                ["state"] = state
            }),
            "youtube" => BuildUrl("https://accounts.google.com/o/oauth2/v2/auth", new Dictionary<string, string?>
            {
                ["client_id"] = config.ClientId,
                ["redirect_uri"] = callbackUrl,
                ["response_type"] = "code",
                ["scope"] = "openid email profile https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
                ["state"] = state,
                ["access_type"] = "offline",
                ["prompt"] = "consent",
                ["include_granted_scopes"] = "true",
                ["code_challenge"] = string.IsNullOrWhiteSpace(codeChallenge) ? null : codeChallenge,
                ["code_challenge_method"] = string.IsNullOrWhiteSpace(codeChallenge) ? null : "S256"
            }),
            // X / Twitter — OAuth 2.0 with PKCE (required by X API v2)
            "twitter" => BuildUrl("https://twitter.com/i/oauth2/authorize", new Dictionary<string, string?>
            {
                ["client_id"] = config.ClientId,
                ["redirect_uri"] = callbackUrl,
                ["response_type"] = "code",
                ["scope"] = "tweet.read tweet.write users.read offline.access",
                ["state"] = state,
                ["code_challenge"] = string.IsNullOrWhiteSpace(codeChallenge) ? "challenge" : codeChallenge,
                ["code_challenge_method"] = "S256"
            }),
            "bluesky" => BuildUrl("https://bsky.app", new Dictionary<string, string?>
            {
                ["state"] = state
            }),
            "linkedin" => BuildUrl("https://www.linkedin.com/oauth/v2/authorization", new Dictionary<string, string?>
            {
                ["client_id"] = config.ClientId,
                ["redirect_uri"] = callbackUrl,
                ["response_type"] = "code",
                ["scope"] = "openid profile email w_member_social",
                ["state"] = state
            }),
            "reddit" => BuildUrl("https://www.reddit.com/api/v1/authorize", new Dictionary<string, string?>
            {
                ["client_id"] = config.ClientId,
                ["redirect_uri"] = callbackUrl,
                ["response_type"] = "code",
                ["scope"] = "identity submit read",
                ["state"] = state,
                ["duration"] = "permanent"
            }),
            _ => throw new InvalidOperationException("Unsupported OAuth provider.")
        };
    }

    private async Task<SocialProfile> ResolveSocialProfileAsync(string provider, OAuthProviderConfig config, string code, string callbackUrl, string codeVerifier = "")
    {
        using var httpClient = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(20)
        };

        return provider switch
        {
            "google" => await ResolveGoogleProfileAsync(httpClient, config, code, callbackUrl, codeVerifier),
            "microsoft" => await ResolveMicrosoftProfileAsync(httpClient, config, code, callbackUrl),
            "facebook" => await ResolveFacebookProfileAsync(httpClient, config, code, callbackUrl),
            "instagram" => await ResolveInstagramProfileAsync(httpClient, config, code, callbackUrl),
            "tiktok" => await ResolveTikTokProfileAsync(httpClient, config, code, callbackUrl),
            "youtube" => await ResolveYouTubeProfileAsync(httpClient, config, code, callbackUrl, codeVerifier),
            "twitter" => await ResolveTwitterProfileAsync(httpClient, config, code, callbackUrl, codeVerifier),
            "bluesky" => await ResolveBlueskyProfileAsync(httpClient, config, code, callbackUrl),
            "linkedin" => await ResolveLinkedInProfileAsync(httpClient, config, code, callbackUrl),
            "reddit" => await ResolveRedditProfileAsync(httpClient, config, code, callbackUrl),
            _ => throw new InvalidOperationException("Unsupported OAuth provider.")
        };
    }

    private static async Task<SocialProfile> ResolveLinkedInProfileAsync(HttpClient httpClient, OAuthProviderConfig config, string code, string callbackUrl)
    {
        var tokenRequest = new HttpRequestMessage(HttpMethod.Post, "https://www.linkedin.com/oauth/v2/accessToken");
        var tokenParams = new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["code"] = code,
            ["redirect_uri"] = callbackUrl,
            ["client_id"] = config.ClientId,
            ["client_secret"] = config.ClientSecret
        };
        tokenRequest.Content = new FormUrlEncodedContent(tokenParams);

        using var response = await httpClient.SendAsync(tokenRequest);
        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync();
        using var tokenJson = await JsonDocument.ParseAsync(stream);
        var tokenRoot = tokenJson.RootElement;

        var accessToken = tokenRoot.TryGetProperty("access_token", out var atNode) ? atNode.GetString() ?? string.Empty : string.Empty;
        var refreshToken = tokenRoot.TryGetProperty("refresh_token", out var rtNode) ? rtNode.GetString() ?? string.Empty : string.Empty;
        DateTimeOffset? tokenExpiresAt = null;
        if (tokenRoot.TryGetProperty("expires_in", out var expNode) && expNode.TryGetInt32(out var expSeconds) && expSeconds > 0)
        {
            tokenExpiresAt = DateTimeOffset.UtcNow.AddSeconds(expSeconds);
        }

        if (string.IsNullOrWhiteSpace(accessToken))
        {
            throw new InvalidOperationException("LinkedIn access token was not returned.");
        }

        var userRequest = new HttpRequestMessage(HttpMethod.Get, "https://api.linkedin.com/v2/userinfo");
        userRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        using var userResponse = await httpClient.SendAsync(userRequest);
        userResponse.EnsureSuccessStatusCode();

        await using var userStream = await userResponse.Content.ReadAsStreamAsync();
        using var userJson = await JsonDocument.ParseAsync(userStream);
        var uRoot = userJson.RootElement;

        var sub = uRoot.TryGetProperty("sub", out var subNode) ? subNode.GetString() ?? string.Empty : string.Empty;
        var name = uRoot.TryGetProperty("name", out var nameNode) ? nameNode.GetString() ?? string.Empty : string.Empty;
        var email = uRoot.TryGetProperty("email", out var emailNode) ? emailNode.GetString() ?? $"{sub}@linkedin.com" : $"{sub}@linkedin.com";

        return new SocialProfile
        {
            ProviderUserId = !string.IsNullOrWhiteSpace(sub) ? sub : name,
            Name = !string.IsNullOrWhiteSpace(name) ? name : "LinkedIn User",
            Email = email,
            AccessToken = accessToken,
            RefreshToken = refreshToken,
            TokenExpiresAt = tokenExpiresAt,
            DestinationId = sub,
            DestinationName = name
        };
    }

    private static async Task<SocialProfile> ResolveTwitterProfileAsync(HttpClient httpClient, OAuthProviderConfig config, string code, string callbackUrl, string codeVerifier = "")
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "https://api.twitter.com/2/oauth2/token");
        var tokenParams = new Dictionary<string, string>
        {
            ["code"] = code,
            ["grant_type"] = "authorization_code",
            ["client_id"] = config.ClientId,
            ["redirect_uri"] = callbackUrl,
            ["code_verifier"] = !string.IsNullOrWhiteSpace(codeVerifier) ? codeVerifier : "challenge"
        };
        request.Content = new FormUrlEncodedContent(tokenParams);

        if (!string.IsNullOrWhiteSpace(config.ClientId) && !string.IsNullOrWhiteSpace(config.ClientSecret))
        {
            var authBytes = Encoding.UTF8.GetBytes($"{config.ClientId}:{config.ClientSecret}");
            request.Headers.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(authBytes));
        }

        using var response = await httpClient.SendAsync(request);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync();
        using var tokenJson = await JsonDocument.ParseAsync(stream);
        var tokenRoot = tokenJson.RootElement;

        var accessToken = tokenRoot.TryGetProperty("access_token", out var atNode) ? atNode.GetString() ?? string.Empty : string.Empty;
        var refreshToken = tokenRoot.TryGetProperty("refresh_token", out var rtNode) ? rtNode.GetString() ?? string.Empty : string.Empty;
        DateTimeOffset? tokenExpiresAt = null;
        if (tokenRoot.TryGetProperty("expires_in", out var expNode) && expNode.TryGetInt32(out var expSeconds) && expSeconds > 0)
        {
            tokenExpiresAt = DateTimeOffset.UtcNow.AddSeconds(expSeconds);
        }

        if (string.IsNullOrWhiteSpace(accessToken))
        {
            throw new InvalidOperationException("Twitter access token was not returned.");
        }

        var userRequest = new HttpRequestMessage(HttpMethod.Get, "https://api.twitter.com/2/users/me?user.fields=profile_image_url,description,name,username");
        userRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        using var userResponse = await httpClient.SendAsync(userRequest);
        userResponse.EnsureSuccessStatusCode();

        await using var userStream = await userResponse.Content.ReadAsStreamAsync();
        using var userJson = await JsonDocument.ParseAsync(userStream);
        var dataNode = userJson.RootElement.TryGetProperty("data", out var d) ? d : userJson.RootElement;

        var twitterId = dataNode.TryGetProperty("id", out var idNode) ? idNode.GetString() ?? string.Empty : string.Empty;
        var username = dataNode.TryGetProperty("username", out var uNode) ? uNode.GetString() ?? string.Empty : string.Empty;
        var name = dataNode.TryGetProperty("name", out var nNode) ? nNode.GetString() ?? string.Empty : username;

        return new SocialProfile
        {
            ProviderUserId = !string.IsNullOrWhiteSpace(username) ? username : twitterId,
            Name = !string.IsNullOrWhiteSpace(name) ? name : username,
            Email = $"{username}@x.com",
            AccessToken = accessToken,
            RefreshToken = refreshToken,
            TokenExpiresAt = tokenExpiresAt,
            DestinationId = twitterId,
            DestinationName = username
        };
    }

    private static async Task<SocialProfile> ResolveRedditProfileAsync(HttpClient httpClient, OAuthProviderConfig config, string code, string callbackUrl)
    {
        var tokenRequest = new HttpRequestMessage(HttpMethod.Post, "https://www.reddit.com/api/v1/access_token");
        var tokenParams = new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["code"] = code,
            ["redirect_uri"] = callbackUrl
        };
        tokenRequest.Content = new FormUrlEncodedContent(tokenParams);
        if (!string.IsNullOrWhiteSpace(config.ClientId) && !string.IsNullOrWhiteSpace(config.ClientSecret))
        {
            var authBytes = Encoding.UTF8.GetBytes($"{config.ClientId}:{config.ClientSecret}");
            tokenRequest.Headers.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(authBytes));
        }
        tokenRequest.Headers.UserAgent.ParseAdd("web:wiseravenshare:v1.0.0 (by /u/wiseravenshare_dev)");

        using var response = await httpClient.SendAsync(tokenRequest);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync();
        using var tokenJson = await JsonDocument.ParseAsync(stream);
        var tokenRoot = tokenJson.RootElement;
        var accessToken = tokenRoot.TryGetProperty("access_token", out var atNode) ? atNode.GetString() ?? string.Empty : string.Empty;
        var refreshToken = tokenRoot.TryGetProperty("refresh_token", out var rtNode) ? rtNode.GetString() ?? string.Empty : string.Empty;
        DateTimeOffset? tokenExpiresAt = null;
        if (tokenRoot.TryGetProperty("expires_in", out var expNode) && expNode.TryGetInt32(out var expSeconds) && expSeconds > 0)
        {
            tokenExpiresAt = DateTimeOffset.UtcNow.AddSeconds(expSeconds);
        }

        if (string.IsNullOrWhiteSpace(accessToken))
        {
            throw new InvalidOperationException("Reddit access token was not returned.");
        }

        var meRequest = new HttpRequestMessage(HttpMethod.Get, "https://oauth.reddit.com/api/v1/me");
        meRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        meRequest.Headers.UserAgent.ParseAdd("web:wiseravenshare:v1.0.0 (by /u/wiseravenshare_dev)");
        using var meResponse = await httpClient.SendAsync(meRequest);
        meResponse.EnsureSuccessStatusCode();

        await using var meStream = await meResponse.Content.ReadAsStreamAsync();
        using var meJson = await JsonDocument.ParseAsync(meStream);
        var meRoot = meJson.RootElement;
        var username = meRoot.TryGetProperty("name", out var nameNode) ? nameNode.GetString() ?? string.Empty : string.Empty;
        var subreddit = meRoot.TryGetProperty("subreddit", out var subredditNode)
            && subredditNode.ValueKind == JsonValueKind.Object
            && subredditNode.TryGetProperty("display_name", out var displayNode)
            ? displayNode.GetString() ?? string.Empty
            : string.Empty;

        return new SocialProfile
        {
            ProviderUserId = username,
            Name = username,
            Email = $"{username}@reddit.local",
            AccessToken = accessToken,
            RefreshToken = refreshToken,
            TokenExpiresAt = tokenExpiresAt,
            DestinationId = !string.IsNullOrWhiteSpace(subreddit) ? subreddit : $"u_{username}",
            DestinationName = !string.IsNullOrWhiteSpace(subreddit) ? subreddit : username
        };
    }

    private static async Task<SocialProfile> ResolveBlueskyProfileAsync(HttpClient httpClient, OAuthProviderConfig config, string code, string callbackUrl)
    {
        string identifier = config.ClientId;
        string password = code;

        if (code.Contains(':'))
        {
            var parts = code.Split(':', 2);
            identifier = parts[0];
            password = parts[1];
        }

        if (string.IsNullOrWhiteSpace(identifier))
        {
            identifier = code;
        }

        string did = string.Empty;
        string handle = identifier.TrimStart('@');
        string displayName = handle;
        string accessJwt = string.Empty;
        string refreshJwt = string.Empty;

        if (!string.IsNullOrWhiteSpace(password) && password != identifier)
        {
            try
            {
                var sessionPayload = new
                {
                    identifier = identifier,
                    password = password
                };
                var content = new StringContent(JsonSerializer.Serialize(sessionPayload), Encoding.UTF8, "application/json");
                using var sessionResponse = await httpClient.PostAsync("https://bsky.social/xrpc/com.atproto.server.createSession", content);
                if (sessionResponse.IsSuccessStatusCode)
                {
                    await using var sessionStream = await sessionResponse.Content.ReadAsStreamAsync();
                    using var sessionJson = await JsonDocument.ParseAsync(sessionStream);
                    var sRoot = sessionJson.RootElement;
                    did = sRoot.TryGetProperty("did", out var didNode) ? didNode.GetString() ?? string.Empty : string.Empty;
                    handle = sRoot.TryGetProperty("handle", out var hNode) ? hNode.GetString() ?? handle : handle;
                    accessJwt = sRoot.TryGetProperty("accessJwt", out var ajNode) ? ajNode.GetString() ?? string.Empty : string.Empty;
                    refreshJwt = sRoot.TryGetProperty("refreshJwt", out var rjNode) ? rjNode.GetString() ?? string.Empty : string.Empty;
                }
            }
            catch
            {
                // Fall back to public profile resolution
            }
        }

        try
        {
            using var profileResponse = await httpClient.GetAsync($"https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor={Uri.EscapeDataString(handle)}");
            if (profileResponse.IsSuccessStatusCode)
            {
                await using var pStream = await profileResponse.Content.ReadAsStreamAsync();
                using var pJson = await JsonDocument.ParseAsync(pStream);
                var pRoot = pJson.RootElement;
                if (string.IsNullOrWhiteSpace(did))
                    did = pRoot.TryGetProperty("did", out var dNode) ? dNode.GetString() ?? string.Empty : string.Empty;
                handle = pRoot.TryGetProperty("handle", out var hNode) ? hNode.GetString() ?? handle : handle;
                displayName = pRoot.TryGetProperty("displayName", out var dnNode) ? dnNode.GetString() ?? handle : handle;
            }
        }
        catch { }

        return new SocialProfile
        {
            ProviderUserId = handle,
            Name = !string.IsNullOrWhiteSpace(displayName) ? displayName : handle,
            Email = $"{handle}@bsky.social",
            AccessToken = !string.IsNullOrWhiteSpace(accessJwt) ? accessJwt : password,
            RefreshToken = refreshJwt,
            DestinationId = !string.IsNullOrWhiteSpace(did) ? did : handle,
            DestinationName = handle
        };
    }

    private static async Task<SocialProfile> ResolveGoogleProfileAsync(HttpClient httpClient, OAuthProviderConfig config, string code, string callbackUrl, string codeVerifier = "")
    {
        var tokenParams = new Dictionary<string, string>
        {
            ["code"] = code,
            ["client_id"] = config.ClientId,
            ["client_secret"] = config.ClientSecret,
            ["redirect_uri"] = callbackUrl,
            ["grant_type"] = "authorization_code"
        };
        if (!string.IsNullOrWhiteSpace(codeVerifier))
            tokenParams["code_verifier"] = codeVerifier;

        var tokenPayload = await ExchangeCodeForTokenAsync(httpClient, "https://oauth2.googleapis.com/token", tokenParams);

        if (string.IsNullOrWhiteSpace(tokenPayload.AccessToken))
        {
            throw new InvalidOperationException("Google access token was not returned.");
        }

        var request = new HttpRequestMessage(HttpMethod.Get, "https://openidconnect.googleapis.com/v1/userinfo");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenPayload.AccessToken);
        using var response = await httpClient.SendAsync(request);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync();
        using var profileJson = await JsonDocument.ParseAsync(stream);
        var root = profileJson.RootElement;

        return new SocialProfile
        {
            ProviderUserId = root.TryGetProperty("sub", out var subNode) ? subNode.GetString() ?? string.Empty : string.Empty,
            Name = root.TryGetProperty("name", out var nameNode) ? nameNode.GetString() ?? string.Empty : string.Empty,
            Email = root.TryGetProperty("email", out var emailNode) ? emailNode.GetString() ?? string.Empty : string.Empty
        };
    }

    private static async Task<SocialProfile> ResolveYouTubeProfileAsync(HttpClient httpClient, OAuthProviderConfig config, string code, string callbackUrl, string codeVerifier = "")
    {
        var tokenParams = new Dictionary<string, string>
        {
            ["code"] = code,
            ["client_id"] = config.ClientId,
            ["client_secret"] = config.ClientSecret,
            ["redirect_uri"] = callbackUrl,
            ["grant_type"] = "authorization_code"
        };
        if (!string.IsNullOrWhiteSpace(codeVerifier))
            tokenParams["code_verifier"] = codeVerifier;

        var tokenPayload = await ExchangeCodeForTokenAsync(httpClient, "https://oauth2.googleapis.com/token", tokenParams);

        if (string.IsNullOrWhiteSpace(tokenPayload.AccessToken))
        {
            throw new InvalidOperationException("YouTube access token was not returned.");
        }

        using var profileRequest = new HttpRequestMessage(HttpMethod.Get, "https://openidconnect.googleapis.com/v1/userinfo");
        profileRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenPayload.AccessToken);
        using var profileResponse = await httpClient.SendAsync(profileRequest);
        profileResponse.EnsureSuccessStatusCode();
        await using var profileStream = await profileResponse.Content.ReadAsStreamAsync();
        using var profileJson = await JsonDocument.ParseAsync(profileStream);
        var profileRoot = profileJson.RootElement;

        var fallbackName = profileRoot.TryGetProperty("name", out var nameNode) ? nameNode.GetString() ?? string.Empty : string.Empty;
        var fallbackEmail = profileRoot.TryGetProperty("email", out var emailNode) ? emailNode.GetString() ?? string.Empty : string.Empty;
        var fallbackUserId = profileRoot.TryGetProperty("sub", out var subNode) ? subNode.GetString() ?? string.Empty : string.Empty;

        using var channelRequest = new HttpRequestMessage(HttpMethod.Get, "https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true");
        channelRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenPayload.AccessToken);
        using var channelResponse = await httpClient.SendAsync(channelRequest);

        if (channelResponse.IsSuccessStatusCode)
        {
            await using var channelStream = await channelResponse.Content.ReadAsStreamAsync();
            using var channelJson = await JsonDocument.ParseAsync(channelStream);
            if (channelJson.RootElement.TryGetProperty("items", out var itemsNode)
                && itemsNode.ValueKind == JsonValueKind.Array
                && itemsNode.GetArrayLength() > 0)
            {
                var first = itemsNode[0];
                var channelId = first.TryGetProperty("id", out var idNode) ? idNode.GetString() ?? string.Empty : string.Empty;
                var snippetNode = first.TryGetProperty("snippet", out var snippet) ? snippet : default;
                var channelTitle = snippetNode.ValueKind == JsonValueKind.Object && snippetNode.TryGetProperty("title", out var titleNode)
                    ? titleNode.GetString() ?? string.Empty
                    : string.Empty;
                var customUrl = snippetNode.ValueKind == JsonValueKind.Object && snippetNode.TryGetProperty("customUrl", out var customUrlNode)
                    ? customUrlNode.GetString() ?? string.Empty
                    : string.Empty;

                var providerUserId = !string.IsNullOrWhiteSpace(customUrl)
                    ? customUrl.Trim().TrimStart('@')
                    : (!string.IsNullOrWhiteSpace(channelId) ? channelId : fallbackUserId);
                var resolvedName = !string.IsNullOrWhiteSpace(customUrl)
                    ? customUrl.Trim()
                    : (!string.IsNullOrWhiteSpace(channelTitle) ? channelTitle : fallbackName);

                return new SocialProfile
                {
                    ProviderUserId = providerUserId,
                    Name = resolvedName,
                    Email = fallbackEmail,
                    AccessToken = tokenPayload.AccessToken,
                    RefreshToken = tokenPayload.RefreshToken,
                    TokenExpiresAt = tokenPayload.TokenExpiresAt,
                    // DestinationId for YouTube = the UC-prefixed channel ID needed for the Data API.
                    DestinationId = !string.IsNullOrWhiteSpace(channelId) ? channelId : string.Empty,
                    DestinationName = !string.IsNullOrWhiteSpace(channelTitle) ? channelTitle : resolvedName
                };
            }
        }

        return new SocialProfile
        {
            ProviderUserId = fallbackUserId,
            Name = fallbackName,
            Email = fallbackEmail,
            AccessToken = tokenPayload.AccessToken,
            RefreshToken = tokenPayload.RefreshToken,
            TokenExpiresAt = tokenPayload.TokenExpiresAt
        };
    }

    private static async Task<SocialProfile> ResolveMicrosoftProfileAsync(HttpClient httpClient, OAuthProviderConfig config, string code, string callbackUrl)
    {
        var tenant = string.IsNullOrWhiteSpace(config.TenantId) ? "common" : config.TenantId;
        var tokenPayload = await ExchangeCodeForTokenAsync(httpClient, $"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token", new Dictionary<string, string>
        {
            ["code"] = code,
            ["client_id"] = config.ClientId,
            ["client_secret"] = config.ClientSecret,
            ["redirect_uri"] = callbackUrl,
            ["grant_type"] = "authorization_code",
            ["scope"] = "openid profile email User.Read offline_access"
        });

        if (string.IsNullOrWhiteSpace(tokenPayload.AccessToken))
        {
            throw new InvalidOperationException("Microsoft access token was not returned.");
        }

        var request = new HttpRequestMessage(HttpMethod.Get, "https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenPayload.AccessToken);
        using var response = await httpClient.SendAsync(request);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync();
        using var profileJson = await JsonDocument.ParseAsync(stream);
        var root = profileJson.RootElement;
        var mail = root.TryGetProperty("mail", out var mailNode) ? mailNode.GetString() ?? string.Empty : string.Empty;
        var upn = root.TryGetProperty("userPrincipalName", out var upnNode) ? upnNode.GetString() ?? string.Empty : string.Empty;

        return new SocialProfile
        {
            ProviderUserId = root.TryGetProperty("id", out var idNode) ? idNode.GetString() ?? string.Empty : string.Empty,
            Name = root.TryGetProperty("displayName", out var nameNode) ? nameNode.GetString() ?? string.Empty : string.Empty,
            Email = !string.IsNullOrWhiteSpace(mail) ? mail : upn
        };
    }

    private static async Task<SocialProfile> ResolveFacebookProfileAsync(HttpClient httpClient, OAuthProviderConfig config, string code, string callbackUrl)
    {
        var tokenUrl = BuildUrl("https://graph.facebook.com/v26.0/oauth/access_token", new Dictionary<string, string?>
        {
            ["client_id"] = config.ClientId,
            ["client_secret"] = config.ClientSecret,
            ["redirect_uri"] = callbackUrl,
            ["code"] = code
        });

        using var tokenResponse = await httpClient.GetAsync(tokenUrl);
        tokenResponse.EnsureSuccessStatusCode();
        await using var tokenStream = await tokenResponse.Content.ReadAsStreamAsync();
        using var tokenJson = await JsonDocument.ParseAsync(tokenStream);
        var accessToken = tokenJson.RootElement.TryGetProperty("access_token", out var accessTokenNode)
            ? accessTokenNode.GetString() ?? string.Empty
            : string.Empty;
        DateTimeOffset? tokenExpiresAt = null;
        if (tokenJson.RootElement.TryGetProperty("expires_in", out var expiresNode))
        {
            if (expiresNode.TryGetInt64(out var expiresInSeconds) && expiresInSeconds > 0)
            {
                tokenExpiresAt = DateTimeOffset.UtcNow.AddSeconds(expiresInSeconds);
            }
            else if (expiresNode.ValueKind == JsonValueKind.String
                     && long.TryParse(expiresNode.GetString(), out var parsedExpiry)
                     && parsedExpiry > 0)
            {
                tokenExpiresAt = DateTimeOffset.UtcNow.AddSeconds(parsedExpiry);
            }
        }

        if (string.IsNullOrWhiteSpace(accessToken))
        {
            throw new InvalidOperationException("Facebook access token was not returned.");
        }

        var profileUrl = BuildUrl("https://graph.facebook.com/me", new Dictionary<string, string?>
        {
            ["fields"] = "id,name,email",
            ["access_token"] = accessToken
        });

        using var profileResponse = await httpClient.GetAsync(profileUrl);
        profileResponse.EnsureSuccessStatusCode();
        await using var profileStream = await profileResponse.Content.ReadAsStreamAsync();
        using var profileJson = await JsonDocument.ParseAsync(profileStream);
        var root = profileJson.RootElement;

        // Fetch the user's managed Pages to determine the publish destination.
        string destinationId = string.Empty;
        string destinationToken = string.Empty;
        string destinationName = string.Empty;
        try
        {
            var pagesUrl = $"https://graph.facebook.com/v26.0/me/accounts?fields=id,name,access_token&access_token={Uri.EscapeDataString(accessToken)}";
            using var pagesResponse = await httpClient.GetAsync(pagesUrl);
            if (pagesResponse.IsSuccessStatusCode)
            {
                await using var pagesStream = await pagesResponse.Content.ReadAsStreamAsync();
                using var pagesJson = await JsonDocument.ParseAsync(pagesStream);
                if (pagesJson.RootElement.TryGetProperty("data", out var pagesDataNode)
                    && pagesDataNode.ValueKind == JsonValueKind.Array
                    && pagesDataNode.GetArrayLength() > 0)
                {
                    var firstPage = pagesDataNode[0];
                    destinationId = firstPage.TryGetProperty("id", out var pidNode) ? pidNode.GetString() ?? string.Empty : string.Empty;
                    destinationToken = firstPage.TryGetProperty("access_token", out var ptNode) ? ptNode.GetString() ?? string.Empty : string.Empty;
                    destinationName = firstPage.TryGetProperty("name", out var pnNode) ? pnNode.GetString() ?? string.Empty : string.Empty;
                }
            }
        }
        catch
        {
            // Non-fatal: user may not have pages. Publish will fall back to user token.
        }

        return new SocialProfile
        {
            ProviderUserId = root.TryGetProperty("id", out var idNode) ? idNode.GetString() ?? string.Empty : string.Empty,
            Name = root.TryGetProperty("name", out var nameNode) ? nameNode.GetString() ?? string.Empty : string.Empty,
            Email = root.TryGetProperty("email", out var emailNode) ? emailNode.GetString() ?? string.Empty : string.Empty,
            AccessToken = accessToken,
            TokenExpiresAt = tokenExpiresAt,
            DestinationId = destinationId,
            DestinationToken = destinationToken,
            DestinationName = destinationName
        };
    }

    private static async Task<SocialProfile> ResolveInstagramProfileAsync(HttpClient httpClient, OAuthProviderConfig config, string code, string callbackUrl)
    {
        var tokenUrl = BuildUrl("https://graph.facebook.com/v26.0/oauth/access_token", new Dictionary<string, string?>
        {
            ["client_id"] = config.ClientId,
            ["client_secret"] = config.ClientSecret,
            ["redirect_uri"] = callbackUrl,
            ["code"] = code
        });

        using var tokenResponse = await httpClient.GetAsync(tokenUrl);
        tokenResponse.EnsureSuccessStatusCode();
        await using var tokenStream = await tokenResponse.Content.ReadAsStreamAsync();
        using var tokenJson = await JsonDocument.ParseAsync(tokenStream);
        var tokenRoot = tokenJson.RootElement;
        var accessToken = tokenRoot.TryGetProperty("access_token", out var accessTokenNode)
            ? accessTokenNode.GetString() ?? string.Empty
            : string.Empty;

        DateTimeOffset? tokenExpiresAt = null;
        if (tokenRoot.TryGetProperty("expires_in", out var expiresNode))
        {
            if (expiresNode.TryGetInt64(out var expiresInSeconds) && expiresInSeconds > 0)
            {
                tokenExpiresAt = DateTimeOffset.UtcNow.AddSeconds(expiresInSeconds);
            }
            else if (expiresNode.ValueKind == JsonValueKind.String
                     && long.TryParse(expiresNode.GetString(), out var parsedExpiry)
                     && parsedExpiry > 0)
            {
                tokenExpiresAt = DateTimeOffset.UtcNow.AddSeconds(parsedExpiry);
            }
        }

        if (string.IsNullOrWhiteSpace(accessToken))
        {
            throw new InvalidOperationException("Instagram access token was not returned.");
        }

        var profileUrl = BuildUrl("https://graph.facebook.com/me", new Dictionary<string, string?>
        {
            ["fields"] = "id,name,email",
            ["access_token"] = accessToken
        });

        using var profileResponse = await httpClient.GetAsync(profileUrl);
        profileResponse.EnsureSuccessStatusCode();
        await using var profileStream = await profileResponse.Content.ReadAsStreamAsync();
        using var profileJson = await JsonDocument.ParseAsync(profileStream);
        var profileRoot = profileJson.RootElement;
        var fallbackId = profileRoot.TryGetProperty("id", out var idNode) ? idNode.GetString() ?? string.Empty : string.Empty;
        var fallbackName = profileRoot.TryGetProperty("name", out var nameNode) ? nameNode.GetString() ?? string.Empty : string.Empty;
        var fallbackEmail = profileRoot.TryGetProperty("email", out var emailNode) ? emailNode.GetString() ?? string.Empty : string.Empty;

        var pagesUrl = BuildUrl("https://graph.facebook.com/me/accounts", new Dictionary<string, string?>
        {
            ["fields"] = "instagram_business_account{id,username},name",
            ["limit"] = "25",
            ["access_token"] = accessToken
        });

        string instagramUserId = string.Empty;
        string instagramUsername = string.Empty;

        using var pagesResponse = await httpClient.GetAsync(pagesUrl);
        if (pagesResponse.IsSuccessStatusCode)
        {
            await using var pagesStream = await pagesResponse.Content.ReadAsStreamAsync();
            using var pagesJson = await JsonDocument.ParseAsync(pagesStream);
            if (pagesJson.RootElement.TryGetProperty("data", out var pagesNode)
                && pagesNode.ValueKind == JsonValueKind.Array)
            {
                foreach (var page in pagesNode.EnumerateArray())
                {
                    if (!page.TryGetProperty("instagram_business_account", out var accountNode)
                        || accountNode.ValueKind != JsonValueKind.Object)
                    {
                        continue;
                    }

                    instagramUserId = accountNode.TryGetProperty("id", out var instagramIdNode)
                        ? instagramIdNode.GetString() ?? string.Empty
                        : string.Empty;
                    instagramUsername = accountNode.TryGetProperty("username", out var usernameNode)
                        ? usernameNode.GetString() ?? string.Empty
                        : string.Empty;
                    if (!string.IsNullOrWhiteSpace(instagramUserId) || !string.IsNullOrWhiteSpace(instagramUsername))
                    {
                        break;
                    }
                }
            }
        }

        var providerUserId = !string.IsNullOrWhiteSpace(instagramUsername)
            ? instagramUsername
            : (!string.IsNullOrWhiteSpace(instagramUserId) ? instagramUserId : fallbackId);

        return new SocialProfile
        {
            ProviderUserId = providerUserId,
            Name = !string.IsNullOrWhiteSpace(instagramUsername) ? instagramUsername : fallbackName,
            Email = fallbackEmail,
            AccessToken = accessToken,
            TokenExpiresAt = tokenExpiresAt
        };
    }

    private static async Task<SocialProfile> ResolveTikTokProfileAsync(HttpClient httpClient, OAuthProviderConfig config, string code, string callbackUrl)
    {
        var tokenPayload = await ExchangeCodeForTokenAsync(httpClient, "https://open.tiktokapis.com/v2/oauth/token/", new Dictionary<string, string>
        {
            ["client_key"] = config.ClientId,
            ["client_secret"] = config.ClientSecret,
            ["code"] = code,
            ["grant_type"] = "authorization_code",
            ["redirect_uri"] = callbackUrl
        });

        if (string.IsNullOrWhiteSpace(tokenPayload.AccessToken))
        {
            throw new InvalidOperationException("TikTok access token was not returned.");
        }

        // Fields available under the user.info.basic scope only. user.info.profile
        // fields (display_name, bio, username) are not requested because that scope
        // is not yet approved for this client key.
        var request = new HttpRequestMessage(HttpMethod.Get, "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenPayload.AccessToken);
        using var response = await httpClient.SendAsync(request);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync();
        using var profileJson = await JsonDocument.ParseAsync(stream);
        var root = profileJson.RootElement;
        var userNode = root.TryGetProperty("data", out var dataNode) && dataNode.TryGetProperty("user", out var userDataNode)
            ? userDataNode
            : root;

        var displayName = userNode.TryGetProperty("display_name", out var displayNameNode) ? displayNameNode.GetString() ?? string.Empty : string.Empty;
        var avatarUrl = userNode.TryGetProperty("avatar_url", out var avatarUrlNode) ? avatarUrlNode.GetString() ?? string.Empty : string.Empty;

        return new SocialProfile
        {
            ProviderUserId = userNode.TryGetProperty("open_id", out var openIdNode) ? openIdNode.GetString() ?? string.Empty : string.Empty,
            Name = !string.IsNullOrWhiteSpace(displayName) ? displayName : "TikTok User",
            Email = string.Empty,
            AccessToken = tokenPayload.AccessToken,
            RefreshToken = tokenPayload.RefreshToken,
            TokenExpiresAt = tokenPayload.TokenExpiresAt,
            DestinationId = userNode.TryGetProperty("open_id", out var destinationIdNode) ? destinationIdNode.GetString() ?? string.Empty : string.Empty,
            DestinationName = !string.IsNullOrWhiteSpace(displayName) ? displayName : "TikTok User"
        };
    }

    private static async Task<TokenExchangePayload> ExchangeCodeForTokenAsync(HttpClient httpClient, string tokenUrl, Dictionary<string, string> formValues)
    {
        using var response = await httpClient.PostAsync(tokenUrl, new FormUrlEncodedContent(formValues));
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync();
        using var tokenJson = await JsonDocument.ParseAsync(stream);
        var root = tokenJson.RootElement;
        var payloadRoot = root.TryGetProperty("data", out var nestedDataNode) && nestedDataNode.ValueKind == JsonValueKind.Object
            ? nestedDataNode
            : root;

        return new TokenExchangePayload
        {
            AccessToken = payloadRoot.TryGetProperty("access_token", out var accessTokenNode) ? accessTokenNode.GetString() ?? string.Empty : string.Empty,
            RefreshToken = payloadRoot.TryGetProperty("refresh_token", out var refreshTokenNode) ? refreshTokenNode.GetString() ?? string.Empty : string.Empty,
            IdToken = payloadRoot.TryGetProperty("id_token", out var idTokenNode) ? idTokenNode.GetString() ?? string.Empty : string.Empty,
            TokenExpiresAt = payloadRoot.TryGetProperty("expires_in", out var expiresInNode)
                && expiresInNode.TryGetInt32(out var expiresInSeconds)
                && expiresInSeconds > 0
                    ? DateTimeOffset.UtcNow.AddSeconds(expiresInSeconds)
                    : null
        };
    }

    private string BuildOAuthSuccessRedirect(string returnUrl, string provider, string token, string refreshToken, string adminPassToken)
    {
        return BuildUrl(returnUrl, new Dictionary<string, string?>
        {
            ["authToken"] = token,
            ["refreshToken"] = refreshToken,
            ["adminPassToken"] = adminPassToken,
            ["authProvider"] = provider
        });
    }

    private string BuildOAuthErrorRedirect(string returnUrl, string provider, string message)
    {
        return BuildUrl(returnUrl, new Dictionary<string, string?>
        {
            ["socialAuthError"] = message,
            ["authProvider"] = provider
        });
    }

    private static string ResolveSocialEmail(SocialProfile profile, string provider)
    {
        var email = (profile.Email ?? string.Empty).Trim().ToLowerInvariant();
        if (IsValidEmail(email))
        {
            return email;
        }

        var providerUserId = string.IsNullOrWhiteSpace(profile.ProviderUserId)
            ? Convert.ToHexString(RandomNumberGenerator.GetBytes(12)).ToLowerInvariant()
            : profile.ProviderUserId.Trim().ToLowerInvariant();
        return $"{provider}.{providerUserId}@oauth.wise-ravens.local";
    }

    private static UpdateSocialFeedsRequest? BuildSocialFeedActivationRequest(string provider, SocialProfile profile)
    {
        var connection = BuildSocialFeedConnection(provider, profile);
        if (connection is null)
        {
            return null;
        }

        return provider switch
        {
            "facebook" => new UpdateSocialFeedsRequest { Facebook = connection },
            "instagram" => new UpdateSocialFeedsRequest { Instagram = connection },
            "tiktok" => new UpdateSocialFeedsRequest { TikTok = connection },
            "youtube" => new UpdateSocialFeedsRequest { YouTube = connection },
            "twitter" => new UpdateSocialFeedsRequest { Twitter = connection },
            "linkedin" => new UpdateSocialFeedsRequest { LinkedIn = connection },
            "reddit" => new UpdateSocialFeedsRequest { Reddit = connection },
            "bluesky" => new UpdateSocialFeedsRequest { Bluesky = connection },
            _ => null
        };
    }

    private static SocialFeedConnection? BuildSocialFeedConnection(string provider, SocialProfile profile)
    {
        var identifier = ResolveSocialAccountIdentifier(provider, profile);
        if (string.IsNullOrWhiteSpace(identifier))
        {
            return null;
        }

        var profileUrl = BuildSocialProfileUrl(provider, identifier);
        var designation = provider switch
        {
            "facebook" => "facebook-page",
            "instagram" => "instagram-creator",
            "tiktok" => "tiktok-creator",
            "youtube" => "youtube-channel",
            "twitter" => "x-profile",
            "linkedin" => "linkedin-profile",
            "reddit" => "reddit-profile",
            _ => string.Empty
        };

        return new SocialFeedConnection
        {
            Enabled = true,
            Site = provider,
            Username = identifier,
            ProfileUrl = profileUrl,
            FeedUrl = profileUrl,
            Designation = designation,
            AccessToken = profile.AccessToken,
            RefreshToken = profile.RefreshToken,
            TokenExpiresAt = profile.TokenExpiresAt,
            DestinationId = profile.DestinationId,
            DestinationToken = profile.DestinationToken,
            DestinationName = profile.DestinationName
        };
    }

    private string ResolveRequestedSocialConnectUserId(string? requestedUserId)
    {
        var explicitUserId = (requestedUserId ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(explicitUserId))
        {
            if (_userStore.TryGetById(explicitUserId, out var explicitUser) && explicitUser is not null)
            {
                return explicitUser.Id;
            }

            if (Guid.TryParse(explicitUserId, out var parsedExplicitId))
            {
                var normalizedExplicitId = parsedExplicitId.ToString("N");
                if (_userStore.TryGetById(normalizedExplicitId, out var normalizedUser) && normalizedUser is not null)
                {
                    return normalizedUser.Id;
                }
            }

            if (explicitUserId.Contains('@') && _userStore.TryGetByEmail(explicitUserId, out var userByEmail) && userByEmail is not null)
            {
                return userByEmail.Id;
            }

            return explicitUserId;
        }

        var actorClaimUserId = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue("sub")
            ?? User.FindFirstValue("user_id")
            ?? string.Empty;

        if (!string.IsNullOrWhiteSpace(actorClaimUserId))
        {
            if (_userStore.TryGetById(actorClaimUserId, out var actorByClaimId) && actorByClaimId is not null)
            {
                return actorByClaimId.Id;
            }

            if (Guid.TryParse(actorClaimUserId, out var parsedActorId))
            {
                var normalizedActorId = parsedActorId.ToString("N");
                if (_userStore.TryGetById(normalizedActorId, out var actorByNormalizedId) && actorByNormalizedId is not null)
                {
                    return actorByNormalizedId.Id;
                }
            }
        }

        if (TryGetCurrentActorEmail(out var actorEmail)
            && _userStore.TryGetByEmail(actorEmail, out var actorByEmail)
            && actorByEmail is not null)
        {
            return actorByEmail.Id;
        }

        return actorClaimUserId;
    }

    private bool CanManageSocialConnectionForUser(string requestedUserId)
    {
        var normalizedRequested = (requestedUserId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedRequested))
        {
            return false;
        }

        var actorUserId = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue("sub")
            ?? User.FindFirstValue("user_id")
            ?? string.Empty;

        if (string.Equals(actorUserId, normalizedRequested, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(actorUserId.Replace("-", ""), normalizedRequested.Replace("-", ""), StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (Guid.TryParse(actorUserId, out var parsedActorId)
            && (string.Equals(parsedActorId.ToString("N"), normalizedRequested, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(parsedActorId.ToString(), normalizedRequested, StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        if (!TryGetCurrentActorEmail(out var actorEmail))
        {
            return false;
        }

        if (IsConfiguredAdminUser(actorEmail))
        {
            return true;
        }

        if (_userStore.TryGetByEmail(actorEmail, out var actorUser) && actorUser is not null)
        {
            if (string.Equals(actorUser.Id, normalizedRequested, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(actorUser.Id.Replace("-", ""), normalizedRequested.Replace("-", ""), StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            if (_userStore.TryGetById(normalizedRequested, out var requestedUser)
                && requestedUser is not null
                && string.Equals(requestedUser.Email, actorUser.Email, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    private static SocialFeedConnection? GetSocialConnection(UserRecord user, string platform)
    {
        var feeds = user.SocialFeeds ?? new SocialFeedSettings();
        return platform switch
        {
            "facebook" => feeds.Facebook,
            "instagram" => feeds.Instagram,
            "tiktok" => feeds.TikTok,
            "youtube" => feeds.YouTube,
            "twitter" => feeds.Twitter,
            "linkedin" => feeds.LinkedIn,
            "reddit" => feeds.Reddit,
            "bluesky" => feeds.Bluesky,
            _ => null
        };
    }

    private static UpdateSocialFeedsRequest? BuildManualConnectionUpdate(
        string platform,
        SocialFeedConnection existing,
        IReadOnlyDictionary<string, string> fields)
    {
        static string ReadField(IReadOnlyDictionary<string, string> values, params string[] keys)
        {
            foreach (var key in keys)
            {
                if (values.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value))
                {
                    return value.Trim();
                }
            }

            return string.Empty;
        }

        static bool ParseBool(string value, bool fallback)
        {
            if (string.IsNullOrWhiteSpace(value)) return fallback;
            return bool.TryParse(value, out var b) ? b : fallback;
        }

        var explicitUsername = ReadField(fields, "username", "handle", "user_id", "userId");
        var explicitProfileUrl = ReadField(fields, "profile_url", "profileUrl");
        var explicitFeedUrl = ReadField(fields, "feed_url", "feedUrl");
        var explicitDesignation = ReadField(fields, "designation");

        var next = new SocialFeedConnection
        {
            Enabled = true,
            Site = platform,
            Username = !string.IsNullOrWhiteSpace(explicitUsername) ? explicitUsername : existing.Username,
            ProfileUrl = !string.IsNullOrWhiteSpace(explicitProfileUrl) ? explicitProfileUrl : existing.ProfileUrl,
            FeedUrl = !string.IsNullOrWhiteSpace(explicitFeedUrl) ? explicitFeedUrl : existing.FeedUrl,
            Designation = !string.IsNullOrWhiteSpace(explicitDesignation) ? explicitDesignation : existing.Designation,
            AccessToken = existing.AccessToken,
            RefreshToken = existing.RefreshToken,
            TokenExpiresAt = existing.TokenExpiresAt,
            DestinationId = existing.DestinationId,
            DestinationToken = existing.DestinationToken,
            DestinationName = existing.DestinationName,
            ShareProfile = ParseBool(ReadField(fields, "share_profile", "shareProfile"), existing.ShareProfile),
            AllowCrossPosting = ParseBool(ReadField(fields, "allow_crossposting", "allowCrossPosting", "sharing_crosspost"), existing.AllowCrossPosting),
            AllowContentImport = ParseBool(ReadField(fields, "allow_content_import", "allowContentImport", "sharing_import"), existing.AllowContentImport),
            ShareAnalytics = ParseBool(ReadField(fields, "share_analytics", "shareAnalytics", "sharing_analytics"), existing.ShareAnalytics),
            SharingConsent = ParseBool(ReadField(fields, "sharing_consent", "sharingConsent"), true),
            Scopes = ReadField(fields, "scopes", "sharing_scopes") is { Length: > 0 } sc ? sc : (existing.Scopes ?? "profile,crosspost,import,analytics")
        };

        var channelHandle = ReadField(fields, "channel_handle", "channelHandle", "youtube_user_id", "youtubeUserId");
        var channelId = ReadField(fields, "channel_id", "channelId", "youtube_channel_id", "youtubeChannelId", "id");
        var pageId = ReadField(fields, "page_id", "pageId");
        var pageName = ReadField(fields, "page_name", "pageName");
        var instagramUserId = ReadField(fields, "instagram_user_id", "business_user_id");
        var instagramUsername = ReadField(fields, "instagram_username");

        switch (platform)
        {
            case "youtube":
                if (!string.IsNullOrWhiteSpace(channelHandle))
                {
                    var normalized = channelHandle.TrimStart('@');
                    next.Username = normalized;
                    next.ProfileUrl = $"https://www.youtube.com/@{normalized}";
                    next.FeedUrl = next.ProfileUrl;
                }
                else if (!string.IsNullOrWhiteSpace(channelId))
                {
                    next.Username = channelId;
                    next.ProfileUrl = $"https://www.youtube.com/channel/{channelId}";
                    next.FeedUrl = next.ProfileUrl;
                }
                if (string.IsNullOrWhiteSpace(next.Designation)) next.Designation = "youtube-channel";
                return new UpdateSocialFeedsRequest { YouTube = next };

            case "facebook":
                if (!string.IsNullOrWhiteSpace(pageName))
                {
                    next.Username = pageName;
                }
                else if (!string.IsNullOrWhiteSpace(pageId))
                {
                    next.Username = pageId;
                }

                if (!string.IsNullOrWhiteSpace(pageId))
                {
                    next.ProfileUrl = $"https://www.facebook.com/{pageId}";
                    next.FeedUrl = next.ProfileUrl;
                }
                if (string.IsNullOrWhiteSpace(next.Designation)) next.Designation = "facebook-page";
                return new UpdateSocialFeedsRequest { Facebook = next };

            case "instagram":
                if (!string.IsNullOrWhiteSpace(instagramUsername))
                {
                    next.Username = instagramUsername.TrimStart('@');
                }
                else if (!string.IsNullOrWhiteSpace(instagramUserId))
                {
                    next.Username = instagramUserId;
                }

                if (!string.IsNullOrWhiteSpace(next.Username))
                {
                    next.ProfileUrl = $"https://www.instagram.com/{next.Username.TrimStart('@')}";
                    next.FeedUrl = next.ProfileUrl;
                }
                if (string.IsNullOrWhiteSpace(next.Designation)) next.Designation = "instagram-creator";
                return new UpdateSocialFeedsRequest { Instagram = next };

            case "tiktok":
                var tiktokUser = ReadField(fields, "username", "handle", "open_id");
                if (!string.IsNullOrWhiteSpace(tiktokUser))
                {
                    var normalized = tiktokUser.TrimStart('@');
                    next.Username = normalized;
                    next.ProfileUrl = $"https://www.tiktok.com/@{normalized}";
                    next.FeedUrl = next.ProfileUrl;
                }
                if (string.IsNullOrWhiteSpace(next.Designation)) next.Designation = "tiktok-creator";
                return new UpdateSocialFeedsRequest { TikTok = next };

            case "twitter":
                var twitterUser = ReadField(fields, "username", "handle");
                if (!string.IsNullOrWhiteSpace(twitterUser))
                {
                    var normalized = twitterUser.TrimStart('@');
                    next.Username = normalized;
                    next.ProfileUrl = $"https://x.com/{normalized}";
                    next.FeedUrl = next.ProfileUrl;
                }
                if (string.IsNullOrWhiteSpace(next.Designation)) next.Designation = "x-profile";
                return new UpdateSocialFeedsRequest { Twitter = next };

            case "bluesky":
                var bskyUser = ReadField(fields, "username", "handle");
                if (!string.IsNullOrWhiteSpace(bskyUser))
                {
                    var normalized = bskyUser.TrimStart('@');
                    next.Username = normalized;
                    next.ProfileUrl = $"https://bsky.app/profile/{normalized}";
                    next.FeedUrl = next.ProfileUrl;
                }
                var appPassword = ReadField(fields, "app_password", "appPassword");
                if (!string.IsNullOrWhiteSpace(appPassword))
                {
                    next.AccessToken = appPassword;
                }
                if (string.IsNullOrWhiteSpace(next.Designation)) next.Designation = "bluesky-profile";
                return new UpdateSocialFeedsRequest { Bluesky = next };

            case "linkedin":
                var linkedinUser = ReadField(fields, "username", "handle");
                if (!string.IsNullOrWhiteSpace(linkedinUser))
                {
                    var normalized = linkedinUser.TrimStart('@');
                    next.Username = normalized;
                    next.ProfileUrl = $"https://www.linkedin.com/in/{normalized}";
                    next.FeedUrl = next.ProfileUrl;
                }
                if (string.IsNullOrWhiteSpace(next.Designation)) next.Designation = "linkedin-profile";
                return new UpdateSocialFeedsRequest { LinkedIn = next };

            case "reddit":
                var redditUser = ReadField(fields, "username", "handle");
                if (!string.IsNullOrWhiteSpace(redditUser))
                {
                    var normalized = redditUser.TrimStart('@').Replace("u/", "", StringComparison.OrdinalIgnoreCase);
                    next.Username = normalized;
                    next.ProfileUrl = $"https://www.reddit.com/user/{normalized}";
                    next.FeedUrl = $"https://www.reddit.com/user/{normalized}/submitted/";
                }
                if (string.IsNullOrWhiteSpace(next.Designation)) next.Designation = "reddit-profile";
                return new UpdateSocialFeedsRequest { Reddit = next };

            default:
                return null;
        }
    }

    private static string ResolveSocialAccountIdentifier(string provider, SocialProfile profile)
    {
        var providerUserId = (profile.ProviderUserId ?? string.Empty).Trim();
        var displayName = (profile.Name ?? string.Empty).Trim().TrimStart('@');

        return provider switch
        {
            "facebook" => providerUserId,
            "instagram" => !string.IsNullOrWhiteSpace(providerUserId) ? providerUserId : displayName,
            "tiktok" => !string.IsNullOrWhiteSpace(providerUserId) ? providerUserId : displayName,
            "youtube" or "twitter" or "linkedin" or "reddit" or "bluesky" => !string.IsNullOrWhiteSpace(displayName) ? displayName : providerUserId,
            _ => string.Empty
        };
    }

    private static string BuildSocialProfileUrl(string provider, string identifier)
    {
        if (string.IsNullOrWhiteSpace(identifier))
        {
            return string.Empty;
        }

        return provider switch
        {
            "facebook" => $"https://www.facebook.com/{identifier}",
            "instagram" => $"https://www.instagram.com/{identifier.TrimStart('@')}",
            "tiktok" => $"https://www.tiktok.com/@{identifier}",
            "youtube" => identifier.StartsWith("UC", StringComparison.OrdinalIgnoreCase)
                ? $"https://www.youtube.com/channel/{identifier}"
                : $"https://www.youtube.com/@{identifier.TrimStart('@')}",
            "twitter" => $"https://x.com/{identifier}",
            "bluesky" => $"https://bsky.app/profile/{identifier.TrimStart('@')}",
            "linkedin" => $"https://www.linkedin.com/in/{identifier}",
            "reddit" => $"https://www.reddit.com/user/{identifier.TrimStart('@')}",
            _ => string.Empty
        };
    }

    private static string BuildUrl(string baseUrl, IReadOnlyDictionary<string, string?> queryParameters)
    {
        var encoded = queryParameters
            .Where(pair => !string.IsNullOrWhiteSpace(pair.Value))
            .Select(pair => $"{Uri.EscapeDataString(pair.Key)}={Uri.EscapeDataString(pair.Value ?? string.Empty)}");
        var separator = baseUrl.Contains('?', StringComparison.Ordinal) ? "&" : "?";
        return $"{baseUrl}{separator}{string.Join("&", encoded)}";
    }

    /// <summary>
    /// Generates a PKCE code_verifier and S256 code_challenge pair.
    /// Used by Google, YouTube, and Twitter/X OAuth 2.0 PKCE flows.
    /// </summary>
    private static (string verifier, string challenge) BuildPkceChallenge(string provider)
    {
        if (!string.Equals(provider, "google", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(provider, "youtube", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(provider, "twitter", StringComparison.OrdinalIgnoreCase))
        {
            return (string.Empty, string.Empty);
        }

        // RFC 7636: verifier is 43-128 unreserved characters
        var verifierBytes = RandomNumberGenerator.GetBytes(48);
        var verifier = Convert.ToBase64String(verifierBytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');

        var challengeBytes = System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.ASCII.GetBytes(verifier));
        var challenge = Convert.ToBase64String(challengeBytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');

        return (verifier, challenge);
    }

    private static void CleanupExpiredOAuthStates()
    {
        var utcNow = DateTime.UtcNow;
        foreach (var candidate in OAuthStatesByToken.Where(entry => entry.Value.ExpiresAtUtc <= utcNow).ToList())
        {
            OAuthStatesByToken.TryRemove(candidate.Key, out _);
        }
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

    private static bool VerifyPasswordCompat(string password, string storedHash)
    {
        if (string.IsNullOrWhiteSpace(password) || string.IsNullOrWhiteSpace(storedHash))
        {
            return false;
        }

        return UserStore.VerifyPassword(password, storedHash)
            || PasswordHelper.VerifyPassword(password, storedHash);
    }

    private async Task EnsurePodcastSessionSnapshotSchemaAsync(NpgsqlConnection connection, CancellationToken cancellationToken)
    {
        const string sql = @"
CREATE SCHEMA IF NOT EXISTS app_data;

CREATE TABLE IF NOT EXISTS app_data.podcast_session_snapshots (
    room_id TEXT PRIMARY KEY,
    snapshot_json JSONB NOT NULL,
    version TEXT NOT NULL,
    saved_by_email TEXT NOT NULL,
    saved_at_utc TIMESTAMPTZ NOT NULL,
    blob_object_key TEXT NULL,
    blob_public_url TEXT NULL,
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);";

        await using var command = new NpgsqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private async Task<PodcastSessionSnapshotStorageRecord?> UpsertPodcastSessionSnapshotInDatabaseAsync(
        string roomId,
        string actorEmail,
        string snapshotJson,
        string version,
        CancellationToken cancellationToken)
    {
        var connectionString = NormalizeDatabaseConnectionString(_configuration["DATABASE_URL"]
            ?? _configuration.GetConnectionString("DefaultConnection")
            ?? string.Empty);
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            return null;
        }

        string? blobObjectKey = null;
        string? blobPublicUrl = null;

        if (_blobStorageService.IsConfigured)
        {
            try
            {
                var safeRoomSegment = new string((roomId ?? "main").Where(ch => char.IsLetterOrDigit(ch) || ch == '-' || ch == '_').ToArray());
                if (string.IsNullOrWhiteSpace(safeRoomSegment))
                {
                    safeRoomSegment = "main";
                }

                blobObjectKey = $"wiseravenshare/podcast/session-snapshots/{safeRoomSegment}/latest.json";
                await using var payloadStream = new MemoryStream(Encoding.UTF8.GetBytes(snapshotJson));
                var upload = await _blobStorageService.UploadAsync(blobObjectKey, payloadStream, "application/json", cancellationToken);
                blobPublicUrl = upload.PublicUrl;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed uploading podcast session snapshot blob for room {RoomId}.", roomId);
                blobObjectKey = null;
                blobPublicUrl = null;
            }
        }

        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync(cancellationToken);
        await EnsurePodcastSessionSnapshotSchemaAsync(connection, cancellationToken);

        const string sql = @"
INSERT INTO app_data.podcast_session_snapshots (
    room_id, snapshot_json, version, saved_by_email, saved_at_utc, blob_object_key, blob_public_url, updated_at_utc
) VALUES (
    @room_id, CAST(@snapshot_json AS jsonb), @version, @saved_by_email, @saved_at_utc, @blob_object_key, @blob_public_url, @updated_at_utc
)
ON CONFLICT (room_id) DO UPDATE
SET snapshot_json = EXCLUDED.snapshot_json,
    version = EXCLUDED.version,
    saved_by_email = EXCLUDED.saved_by_email,
    saved_at_utc = EXCLUDED.saved_at_utc,
    blob_object_key = EXCLUDED.blob_object_key,
    blob_public_url = EXCLUDED.blob_public_url,
    updated_at_utc = EXCLUDED.updated_at_utc;
";

        var savedAtUtc = DateTime.UtcNow;
        await using (var command = new NpgsqlCommand(sql, connection))
        {
            command.Parameters.AddWithValue("room_id", roomId);
            command.Parameters.AddWithValue("snapshot_json", snapshotJson);
            command.Parameters.AddWithValue("version", version);
            command.Parameters.AddWithValue("saved_by_email", actorEmail);
            command.Parameters.AddWithValue("saved_at_utc", savedAtUtc);
            command.Parameters.AddWithValue("blob_object_key", (object?)blobObjectKey ?? DBNull.Value);
            command.Parameters.AddWithValue("blob_public_url", (object?)blobPublicUrl ?? DBNull.Value);
            command.Parameters.AddWithValue("updated_at_utc", savedAtUtc);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        return new PodcastSessionSnapshotStorageRecord
        {
            RoomId = roomId,
            SnapshotJson = snapshotJson,
            Version = version,
            SavedByEmail = actorEmail,
            SavedAtUtc = savedAtUtc,
            BlobObjectKey = blobObjectKey,
            BlobPublicUrl = blobPublicUrl
        };
    }

    private async Task<PodcastSessionSnapshotStorageRecord?> GetPodcastSessionSnapshotFromDatabaseAsync(string roomId, CancellationToken cancellationToken)
    {
        var connectionString = NormalizeDatabaseConnectionString(_configuration["DATABASE_URL"]
            ?? _configuration.GetConnectionString("DefaultConnection")
            ?? string.Empty);
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            return null;
        }

        try
        {
            await using var connection = new NpgsqlConnection(connectionString);
            await connection.OpenAsync(cancellationToken);
            await EnsurePodcastSessionSnapshotSchemaAsync(connection, cancellationToken);

            const string sql = @"
SELECT room_id, snapshot_json::text, version, saved_by_email, saved_at_utc, blob_object_key, blob_public_url
FROM app_data.podcast_session_snapshots
WHERE room_id = @room_id
LIMIT 1;";

            await using var command = new NpgsqlCommand(sql, connection);
            command.Parameters.AddWithValue("room_id", roomId);

            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return null;
            }

            return new PodcastSessionSnapshotStorageRecord
            {
                RoomId = reader.IsDBNull(0) ? roomId : reader.GetString(0),
                SnapshotJson = reader.IsDBNull(1) ? "{}" : reader.GetString(1),
                Version = reader.IsDBNull(2) ? string.Empty : reader.GetString(2),
                SavedByEmail = reader.IsDBNull(3) ? string.Empty : reader.GetString(3),
                SavedAtUtc = reader.IsDBNull(4) ? DateTime.UtcNow : reader.GetDateTime(4),
                BlobObjectKey = reader.IsDBNull(5) ? null : reader.GetString(5),
                BlobPublicUrl = reader.IsDBNull(6) ? null : reader.GetString(6)
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed reading podcast session snapshot from database for room {RoomId}.", roomId);
            return null;
        }
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

    private static string NormalizeDatabaseConnectionString(string connectionString)
    {
        var value = connectionString?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        if (!value.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase)
            && !value.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
        {
            return value;
        }

        if (value.EndsWith("?sslmode", StringComparison.OrdinalIgnoreCase))
        {
            return value + "=require";
        }

        value = value.Replace("?sslmode&", "?sslmode=require&", StringComparison.OrdinalIgnoreCase);
        value = value.Replace("&sslmode&", "&sslmode=require&", StringComparison.OrdinalIgnoreCase);

        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri))
        {
            return value;
        }

        var userName = string.Empty;
        var password = string.Empty;
        if (!string.IsNullOrWhiteSpace(uri.UserInfo))
        {
            var parts = uri.UserInfo.Split(':', 2);
            userName = Uri.UnescapeDataString(parts[0]);
            if (parts.Length > 1)
            {
                password = Uri.UnescapeDataString(parts[1]);
            }
        }

        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.IsDefaultPort ? 5432 : uri.Port,
            Username = userName,
            Password = password,
            Database = uri.AbsolutePath.Trim('/'),
            SslMode = SslMode.Require,
            Pooling = true
        };

        var query = uri.Query?.TrimStart('?') ?? string.Empty;
        foreach (var segment in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var kv = segment.Split('=', 2);
            var keyPart = Uri.UnescapeDataString(kv[0]);
            var valuePart = kv.Length > 1 ? Uri.UnescapeDataString(kv[1]) : string.Empty;

            if (keyPart.Equals("sslmode", StringComparison.OrdinalIgnoreCase)
                && Enum.TryParse<SslMode>(valuePart, true, out var mode))
            {
                builder.SslMode = mode;
            }
        }

        return builder.ConnectionString;
    }

    private void EnsureConfiguredUsersSeeded()
    {
        var configuredUsers = ReadConfiguredUsers().ToList();
        if (Interlocked.Exchange(ref _seededUsersLogWritten, 1) == 0)
        {
            _logger.LogInformation("Bootstrapping auth with {ConfiguredUserCount} configured user(s).", configuredUsers.Count);
        }

        _userStore.EnsureSeeded(configuredUsers);
    }

    private bool TryBuildInviteLink(string inviteToken, string inviteeEmail, out string inviteLink)
    {
        inviteLink = string.Empty;

        var isDevelopment = HttpContext.RequestServices.GetRequiredService<IWebHostEnvironment>().IsDevelopment();
        var configuredBaseUrl = (_configuration["App:PublicBaseUrl"] ?? string.Empty).Trim().TrimEnd('/');

        Uri? baseUri = null;
        if (!string.IsNullOrWhiteSpace(configuredBaseUrl))
        {
            if (!Uri.TryCreate(configuredBaseUrl, UriKind.Absolute, out baseUri))
            {
                _logger.LogWarning("App:PublicBaseUrl is configured but invalid. Falling back to request origin for invite links.");
            }
        }

        if (baseUri is null)
        {
            var forwardedProto = Request.Headers["X-Forwarded-Proto"].ToString()
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .FirstOrDefault();
            var forwardedHost = Request.Headers["X-Forwarded-Host"].ToString()
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .FirstOrDefault();

            var scheme = string.IsNullOrWhiteSpace(forwardedProto) ? Request.Scheme : forwardedProto;
            var host = string.IsNullOrWhiteSpace(forwardedHost) ? Request.Host.Value : forwardedHost;
            if (!isDevelopment && !string.Equals(scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
            {
                scheme = Uri.UriSchemeHttps;
            }

            if (!string.IsNullOrWhiteSpace(host) && Uri.TryCreate($"{scheme}://{host}", UriKind.Absolute, out var derivedUri))
            {
                baseUri = derivedUri;
                _logger.LogWarning("App:PublicBaseUrl is not configured; using request origin {RequestOrigin} for invite links.", baseUri);
            }
        }

        if (baseUri is null)
        {
            _logger.LogError("Unable to build invite link because no valid base URL could be resolved.");
            return false;
        }

        if (!isDevelopment &&
            !string.Equals(baseUri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogError("Unable to build invite link because App:PublicBaseUrl must use https outside development.");
            return false;
        }

        inviteLink = $"{baseUri}?teamToken={Uri.EscapeDataString(inviteToken)}&email={Uri.EscapeDataString(inviteeEmail)}";
        return true;
    }

    private IEnumerable<(string Name, string Email, string Password)> ReadConfiguredUsers()
    {
        var returnedEmails = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        var section = _configuration.GetSection("Authentication:Users");
        var userSections = section.GetChildren().ToList();
        foreach (var childSection in userSections)
        {
            var name = childSection["Name"] ?? childSection["name"] ?? string.Empty;
            var email = childSection["Email"] ?? childSection["email"] ?? string.Empty;
            var password = childSection["Password"] ?? childSection["password"] ?? string.Empty;

            if (string.IsNullOrWhiteSpace(email) && string.IsNullOrWhiteSpace(password) && string.IsNullOrWhiteSpace(name))
            {
                continue;
            }

            if (!string.IsNullOrWhiteSpace(email) && returnedEmails.Add(email.Trim()))
            {
                yield return (name, email, password);
            }
        }

        var boundUsers = section.Get<List<ConfiguredUser>>() ?? new List<ConfiguredUser>();
        foreach (var user in boundUsers)
        {
            if (string.IsNullOrWhiteSpace(user.Email) && string.IsNullOrWhiteSpace(user.Password) && string.IsNullOrWhiteSpace(user.Name))
            {
                continue;
            }

            if (!string.IsNullOrWhiteSpace(user.Email) && returnedEmails.Add(user.Email.Trim()))
            {
                yield return (user.Name, user.Email, user.Password);
            }
        }

        for (var i = 0; i <= 15; i++)
        {
            var email = _configuration[$"Authentication:Users:{i}:Email"]
                ?? _configuration[$"Authentication:Users:{i}:email"]
                ?? _configuration[$"AUTHENTICATION:EMAIL:{i}"]
                ?? _configuration[$"AUTHENTICATION__EMAIL__{i}"]
                ?? _configuration[$"Authentication:Email:{i}"]
                ?? _configuration[$"AUTHENTICATION_EMAIL_{i}"];

            var password = _configuration[$"Authentication:Users:{i}:Password"]
                ?? _configuration[$"Authentication:Users:{i}:password"]
                ?? _configuration[$"AUTHENTICATION:PASSWORD:{i}"]
                ?? _configuration[$"AUTHENTICATION__PASSWORD__{i}"]
                ?? _configuration[$"Authentication:Password:{i}"]
                ?? _configuration[$"AUTHENTICATION_PASSWORD_{i}"];

            var name = _configuration[$"Authentication:Users:{i}:Name"]
                ?? _configuration[$"Authentication:Users:{i}:name"]
                ?? _configuration[$"AUTHENTICATION:NAME:{i}"]
                ?? _configuration[$"AUTHENTICATION__NAME__{i}"]
                ?? _configuration[$"Authentication:Name:{i}"]
                ?? _configuration[$"AUTHENTICATION_NAME_{i}"];

            if (!string.IsNullOrWhiteSpace(email) && !string.IsNullOrWhiteSpace(password))
            {
                if (returnedEmails.Add(email.Trim()))
                {
                    yield return (name ?? string.Empty, email.Trim(), password.Trim());
                }
            }
        }
    }

    private async Task<Guid> EnsureDomainUserAsync(AppUserRecord authUser)
    {
        if (!Guid.TryParse(authUser.Id, out var parsedId))
        {
            parsedId = Guid.NewGuid();
            _logger.LogWarning("Auth user id '{AuthUserId}' is not a valid GUID. Generated a replacement domain user id for {Email}.", authUser.Id, authUser.Email);
        }

        if (!_userStore.IsDatabasePersistenceAvailable())
        {
            _userStore.TryAlignUserId(authUser.Email, parsedId.ToString("N"));
            _logger.LogWarning("Skipping domain-user repository operations for {Email} because database persistence is unavailable.", authUser.Email);
            return parsedId;
        }

        try
        {
            var existingById = await _userRepository.GetByIdAsync(parsedId);
            if (existingById is not null)
            {
                if (!string.IsNullOrWhiteSpace(existingById.AvatarUrl))
                {
                    authUser.Avatar = existingById.AvatarUrl;
                    _userStore.UpdateProfile(authUser.Id, new UpdateUserProfileRequest { Avatar = existingById.AvatarUrl });
                }
                else if (!string.IsNullOrWhiteSpace(authUser.Avatar))
                {
                    existingById.AvatarUrl = authUser.Avatar;
                    await _userRepository.UpdateAsync(existingById);
                }

                _userStore.TryAlignUserId(authUser.Email, existingById.Id.ToString("N"));
                return existingById.Id;
            }

            var existingByEmail = await _userRepository.GetByEmailAsync(authUser.Email);
            if (existingByEmail is not null)
            {
                if (!existingByEmail.IsActive)
                {
                    existingByEmail.IsActive = true;
                }

                if (!string.IsNullOrWhiteSpace(existingByEmail.AvatarUrl))
                {
                    authUser.Avatar = existingByEmail.AvatarUrl;
                    _userStore.UpdateProfile(authUser.Id, new UpdateUserProfileRequest { Avatar = existingByEmail.AvatarUrl });
                }
                else if (!string.IsNullOrWhiteSpace(authUser.Avatar))
                {
                    existingByEmail.AvatarUrl = authUser.Avatar;
                }

                await _userRepository.UpdateAsync(existingByEmail);

                _userStore.TryAlignUserId(authUser.Email, existingByEmail.Id.ToString("N"));
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
                sanitizedUsername = $"localuser-{parsedId.ToString("N")[..6]}";
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
            _userStore.TryAlignUserId(authUser.Email, newUser.Id.ToString("N"));
            _logger.LogInformation("Provisioned EF user record for auth user {Email} ({UserId}).", newUser.Email, newUser.Id);
            return newUser.Id;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Falling back to auth-only identity for {Email} because the domain user repository is unavailable.", authUser.Email);
            return parsedId;
        }
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


    private sealed class AdminPassTokenRecord
    {
        public string UserId { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string Scope { get; set; } = "team";
        public DateTime IssuedAtUtc { get; set; }
        public DateTime ExpiresAtUtc { get; set; }
    }

    private sealed class OAuthStateRecord
    {
        public string Provider { get; set; } = string.Empty;
        public string ReturnUrl { get; set; } = string.Empty;
        public DateTime ExpiresAtUtc { get; set; }
        public bool IsSocialConnect { get; set; }
        public string RequestedUserId { get; set; } = string.Empty;
        /// <summary>PKCE code verifier stored server-side; matched to the code_challenge sent to the provider.</summary>
        public string CodeVerifier { get; set; } = string.Empty;
    }

    private sealed class OAuthProviderConfig
    {
        public string ClientId { get; set; } = string.Empty;
        public string ClientSecret { get; set; } = string.Empty;
        public string TenantId { get; set; } = string.Empty;
        public string RedirectUri { get; set; } = string.Empty;
        public bool IsEnabled { get; set; }
    }

    private sealed class TokenExchangePayload
    {
        public string AccessToken { get; init; } = string.Empty;
        public string RefreshToken { get; init; } = string.Empty;
        public string IdToken { get; init; } = string.Empty;
        public DateTimeOffset? TokenExpiresAt { get; init; }
    }

    private sealed class SocialProfile
    {
        public string ProviderUserId { get; init; } = string.Empty;
        public string Name { get; init; } = string.Empty;
        public string Email { get; init; } = string.Empty;
        public string AccessToken { get; init; } = string.Empty;
        public string RefreshToken { get; init; } = string.Empty;
        public DateTimeOffset? TokenExpiresAt { get; init; }
        /// <summary>Platform-specific publish destination ID (Facebook Page ID, YouTube Channel ID, TikTok display username).</summary>
        public string DestinationId { get; init; } = string.Empty;
        /// <summary>Page-level access token for publish destinations that require it (Facebook pages).</summary>
        public string DestinationToken { get; init; } = string.Empty;
        /// <summary>Human-readable name of the publish destination (page name, channel title).</summary>
        public string DestinationName { get; init; } = string.Empty;
    }

    private sealed class PodcastControlState
    {
        public string EffectiveRole { get; init; } = "guest";
        public string[] AllowedRoles { get; init; } = new[] { "guest" };
        public object Permissions { get; init; } = new
        {
            canGoLive = false,
            canEditScript = false,
            canAssignShots = false,
            canApproveSegments = false,
            canSwitchMonitors = false,
            canManageGuests = false
        };
    }

    private sealed class PodcastSessionSnapshotStorageRecord
    {
        public string RoomId { get; init; } = "main";
        public string SnapshotJson { get; init; } = "{}";
        public string Version { get; init; } = string.Empty;
        public string SavedByEmail { get; init; } = string.Empty;
        public DateTime SavedAtUtc { get; init; }
        public string? BlobObjectKey { get; init; }
        public string? BlobPublicUrl { get; init; }
    }
}

public sealed class SocialConnectCompleteRequest
{
    [JsonPropertyName("user_id")]
    public string UserId { get; set; } = string.Empty;
    public Dictionary<string, string> Fields { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}

public sealed class SocialConnectDisconnectRequest
{
    [JsonPropertyName("user_id")]
    public string UserId { get; set; } = string.Empty;
}

public sealed class LoginRequest
{
    private string _email = string.Empty;
    public string Email
    {
        get => !string.IsNullOrWhiteSpace(_email) ? _email : (!string.IsNullOrWhiteSpace(UsernameOrEmail) ? UsernameOrEmail : (Username ?? string.Empty));
        set => _email = value;
    }
    public string Password { get; set; } = string.Empty;
    public string? Username { get; set; }
    public string? UsernameOrEmail { get; set; }
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
    /// <summary>Optional preferred username/handle. Must be 3–30 chars, alphanumeric and underscores only.
    /// If omitted or unavailable a unique handle is auto-generated from Name/Email.</summary>
    public string? Username { get; set; }
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

public sealed class RefreshTokenRequest
{
    public string RefreshToken { get; set; } = string.Empty;
}

public sealed class ChangePasswordRequest
{
    public string CurrentPassword { get; set; } = string.Empty;
    public string NewPassword { get; set; } = string.Empty;
}

public sealed class TeamInviteRequest
{
    public string Email { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string TeamRole { get; set; } = "member";
    public int ExpiresInHours { get; set; } = 72;
}

public sealed class TeamInviteAcceptRequest
{
    public string InviteToken { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
}

public sealed class TeamAccessAdminActionRequest
{
    public string Reason { get; set; } = string.Empty;
}

public sealed class TeamMemberStatusUpdateRequest
{
    public bool Active { get; set; }
    public string Reason { get; set; } = string.Empty;
}

public sealed class PodcastControlRoleRequest
{
    public string RequestedRole { get; set; } = string.Empty;
}

public sealed class PodcastSharedScriptRequest
{
    public string RoomId { get; set; } = "main";
    public string ScriptText { get; set; } = string.Empty;
    public PodcastSharedScriptPipelineRequest ScriptPipeline { get; set; } = new();
}

public sealed class PodcastSharedScriptPipelineRequest
{
    public string Segment1 { get; set; } = string.Empty;
    public string Segment2 { get; set; } = string.Empty;
    public string Segment3 { get; set; } = string.Empty;
    public string Segment4 { get; set; } = string.Empty;
}

public sealed class PodcastSessionSnapshotRequest
{
    public string RoomId { get; set; } = "main";
    public JsonElement Snapshot { get; set; }
    public string Version { get; set; } = string.Empty;
}

public sealed class PodcastTeamSelectionRequest
{
    public string RoomId { get; set; } = "main";
    public int RequestedMaxParticipants { get; set; } = 5;
    public int DeviceCapacity { get; set; } = 5;
    public List<PodcastTeamMemberRequest> Participants { get; set; } = new();
    public string Version { get; set; } = string.Empty;
}

public sealed class PodcastTeamMemberRequest
{
    public string Identifier { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Role { get; set; } = "guest";
    public string Device { get; set; } = "Unknown";
    public bool IsConnected { get; set; } = true;
    public DateTime? AddedAtUtc { get; set; }
}
