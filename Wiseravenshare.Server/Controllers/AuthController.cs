using System.Collections.Concurrent;
using System.ComponentModel.DataAnnotations;
using System.IdentityModel.Tokens.Jwt;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using Google.Apis.Auth;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Interfaces.Repositories;
using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services;
using AppUserRecord = Wiseravenshare.Server.Models.UserRecord;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Route("[controller]")]
public class AuthController : ControllerBase
{
    private static readonly ConcurrentDictionary<string, PasswordResetRecord> PasswordResetsByToken = new(StringComparer.Ordinal);
    private static readonly ConcurrentDictionary<string, LoginAttemptRecord> LoginAttemptsByKey = new(StringComparer.OrdinalIgnoreCase);
    private static readonly ConcurrentDictionary<string, RefreshTokenRecord> RefreshTokensByToken = new(StringComparer.Ordinal);
    private static readonly ConcurrentDictionary<string, AdminPassTokenRecord> AdminPassTokensByToken = new(StringComparer.Ordinal);
    private static readonly ConcurrentDictionary<string, OAuthStateRecord> OAuthStatesByToken = new(StringComparer.Ordinal);
    private static int _seededUsersLogWritten;
    private static readonly TimeSpan LoginAttemptWindow = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan LoginLockoutDuration = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan OAuthStateLifetime = TimeSpan.FromMinutes(10);
    private const int MaxFailedLoginAttempts = 5;

    private readonly IConfiguration _configuration;
    private readonly UserStore _userStore;
    private readonly IUserRepository _userRepository;
    private readonly GrowthService _growthService;
    private readonly TeamAccessService _teamAccessService;
    private readonly IEmailService _emailService;
    private readonly ILogger<AuthController> _logger;

    public AuthController(
        IConfiguration configuration,
        UserStore userStore,
        IUserRepository userRepository,
        GrowthService growthService,
        TeamAccessService teamAccessService,
        IEmailService emailService,
        ILogger<AuthController> logger)
    {
        _configuration = configuration;
        _userStore = userStore;
        _userRepository = userRepository;
        _growthService = growthService;
        _teamAccessService = teamAccessService;
        _emailService = emailService;
        _logger = logger;
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
            return Conflict(new { message = "An account with that email already exists." });
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
                request.Avatar);
        }
        catch (InvalidOperationException ex)
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
        var accessScope = ResolveAccessScope(user.Email);
        var teamRole = ResolveTeamRole(user.Email);
        var token = GenerateToken(domainUserId.ToString("N"), user.Email, user.Name, accessScope, teamRole);
        var refreshToken = GenerateRefreshToken(domainUserId.ToString("N"));
        var adminPassToken = GenerateAdminPassTokenIfEligible(domainUserId.ToString("N"), user.Email, accessScope);

        var responseUser = UserStore.ToResponse(user);
        responseUser.Id = domainUserId.ToString("N");
        return Ok(new { token, refreshToken, adminPassToken, user = responseUser });
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
        AppUserRecord? user;
        var matchedStoreUser = _userStore.FindByLoginIdentifier(request.Email);
        var hasValidStoredCredential = matchedStoreUser is not null && UserStore.VerifyPassword(request.Password, matchedStoreUser.PasswordHash);
        var hasValidConfiguredCredential = false;
        AppUserRecord? configuredUser = null;
        if (!hasValidStoredCredential)
        {
            hasValidConfiguredCredential = TryAuthenticateConfiguredCredential(request.Email, request.Password, out configuredUser) && configuredUser is not null;
        }

        if (IsLockedOut(attemptKey, out var retryAfter))
        {
            // Let any valid credential recover immediately from lockout.
            if (!hasValidStoredCredential && !hasValidConfiguredCredential)
            {
                Response.Headers["Retry-After"] = Math.Max((int)Math.Ceiling(retryAfter.TotalSeconds), 1).ToString();
                return StatusCode(StatusCodes.Status429TooManyRequests, new { message = "Too many failed login attempts. Please try again later." });
            }

            user = hasValidStoredCredential ? matchedStoreUser : configuredUser;
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

        var responseUser = UserStore.ToResponse(user);
        responseUser.Id = domainUserId.ToString("N");
        return Ok(new { token, refreshToken, adminPassToken, user = responseUser });
    }

    [HttpPost("refresh-token")]
    [AllowAnonymous]
    public async Task<IActionResult> RefreshToken([FromBody] RefreshTokenRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.RefreshToken))
        {
            return BadRequest(new { message = "Refresh token is required." });
        }

        if (!RefreshTokensByToken.TryGetValue(request.RefreshToken, out var record) || record.ExpiresAtUtc < DateTime.UtcNow)
        {
            RefreshTokensByToken.TryRemove(request.RefreshToken, out _);
            return Unauthorized(new { message = "Refresh token is invalid or expired." });
        }

        if (!_userStore.TryGetById(record.UserId, out var user) || user is null)
        {
            RefreshTokensByToken.TryRemove(request.RefreshToken, out _);
            return Unauthorized(new { message = "User not found." });
        }

        if (!IsAuthenticationAllowed(user.Email))
        {
            RefreshTokensByToken.TryRemove(request.RefreshToken, out _);
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "Access requires admin approval or an active team invite." });
        }

        RefreshTokensByToken.TryRemove(request.RefreshToken, out _);

        var domainUserId = await EnsureDomainUserAsync(user);
        var accessScope = ResolveAccessScope(user.Email);
        var teamRole = ResolveTeamRole(user.Email);
        var newToken = GenerateToken(domainUserId.ToString("N"), user.Email, user.Name, accessScope, teamRole);
        var newRefreshToken = GenerateRefreshToken(domainUserId.ToString("N"));
        var adminPassToken = GenerateAdminPassTokenIfEligible(domainUserId.ToString("N"), user.Email, accessScope);

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

        if (string.IsNullOrWhiteSpace(providedToken))
        {
            return Unauthorized(new { valid = false, message = "Token is required." });
        }

        var tokenHandler = new JwtSecurityTokenHandler();

        try
        {
            var claimsPrincipal = tokenHandler.ValidateToken(providedToken, BuildTokenValidationParameters(), out _);
            var email = claimsPrincipal.FindFirstValue(ClaimTypes.Email)
                ?? claimsPrincipal.FindFirstValue(JwtRegisteredClaimNames.Email)
                ?? claimsPrincipal.FindFirstValue("email");
            if (string.IsNullOrWhiteSpace(email))
            {
                return Unauthorized(new { valid = false, message = "Invalid token claims." });
            }

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
            return Ok(new
            {
                valid = true,
                user = responseUser,
                adminPassActive = string.Equals(accessScope, "admin", StringComparison.OrdinalIgnoreCase)
            });
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
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!string.IsNullOrWhiteSpace(userId))
        {
            var tokensToRemove = RefreshTokensByToken.Where(pair => pair.Value.UserId == userId).ToList();
            foreach (var pair in tokensToRemove)
            {
                RefreshTokensByToken.TryRemove(pair.Key, out _);
            }
        }

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

        if (!UserStore.VerifyPassword(request.CurrentPassword, user.PasswordHash))
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
        var jwtKey = _configuration["Authentication:Jwt:Key"];
        var jwtKeyConfigured = !string.IsNullOrWhiteSpace(jwtKey) && jwtKey.Length >= 32;

        var allowSelfRegistration = IsSelfRegistrationAllowed();
        return Ok(new
        {
            selfRegistrationEnabled = allowSelfRegistration,
            adminOnlyLogin = false,
            teamInviteLoginEnabled = true,
            firebaseConfigured = IsFirebaseConfigured(),
            jwt = new
            {
                issuerConfigured = jwtIssuerConfigured,
                audienceConfigured = jwtAudienceConfigured,
                keyConfigured = jwtKeyConfigured
            }
        });
    }

    [HttpPost("firebase/exchange")]
    [AllowAnonymous]
    public async Task<IActionResult> ExchangeFirebase([FromBody] FirebaseSignInRequest request)
    {
        EnsureConfiguredUsersSeeded();

        if (!IsFirebaseConfigured())
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = "Firebase authentication is not configured." });
        }

        if (string.IsNullOrWhiteSpace(request.IdToken))
        {
            return BadRequest(new { message = "Firebase ID token is required." });
        }

        try
        {
            var projectId = (_configuration["Firebase:ProjectId"] ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(projectId))
            {
                return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = "Firebase authentication is not configured." });
            }

            var decodedToken = await GoogleJsonWebSignature.ValidateAsync(
                request.IdToken.Trim(),
                new GoogleJsonWebSignature.ValidationSettings
                {
                    Audience = new[] { projectId }
                });

            var email = decodedToken.Email;
            if (string.IsNullOrWhiteSpace(email))
            {
                return BadRequest(new { message = "Firebase account does not include an email address." });
            }

            var name = decodedToken.Name ?? string.Empty;
            var picture = decodedToken.Picture ?? string.Empty;
            var firebaseUserId = decodedToken.Subject;

            var user = _userStore.UpsertFromExternalIdentity(firebaseUserId, email, name, picture);
            if (!IsAuthenticationAllowed(user.Email))
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { message = "Access requires admin approval or an active team invite." });
            }

            try
            {
                _growthService.TrackEvent(user.Id, user.Email, "login_success");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Growth tracking failed during Firebase sign-in for {Email}.", user.Email);
            }

            var domainUserId = await EnsureDomainUserAsync(user);
            var accessScope = ResolveAccessScope(user.Email);
            var teamRole = ResolveTeamRole(user.Email);
            var token = GenerateToken(domainUserId.ToString("N"), user.Email, user.Name, accessScope, teamRole);
            var refreshToken = GenerateRefreshToken(domainUserId.ToString("N"));
            var adminPassToken = GenerateAdminPassTokenIfEligible(domainUserId.ToString("N"), user.Email, accessScope);

            var responseUser = UserStore.ToResponse(user);
            responseUser.Id = domainUserId.ToString("N");
            return Ok(new { token, refreshToken, adminPassToken, user = responseUser, provider = "firebase" });
        }
        catch (InvalidJwtException ex)
        {
            _logger.LogWarning(ex, "Firebase token verification failed.");
            return Unauthorized(new { message = "Firebase sign-in failed. Please try again." });
        }
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
            return Redirect(BuildOAuthErrorRedirect(
                normalizedReturnUrl,
                normalizedProvider,
                $"{normalizedProvider} sign-in is not configured. Add OAuth credentials in Authentication:OAuthProviders."));
        }

        var callbackUrl = BuildOAuthCallbackUrl(normalizedProvider);
        if (string.IsNullOrWhiteSpace(callbackUrl))
        {
            return Redirect(BuildOAuthErrorRedirect(normalizedReturnUrl, normalizedProvider, "Unable to resolve OAuth callback URL."));
        }

        CleanupExpiredOAuthStates();
        var state = Convert.ToHexString(RandomNumberGenerator.GetBytes(24));
        OAuthStatesByToken[state] = new OAuthStateRecord
        {
            Provider = normalizedProvider,
            ReturnUrl = normalizedReturnUrl,
            ExpiresAtUtc = DateTime.UtcNow.Add(OAuthStateLifetime)
        };

        var authorizationUrl = BuildOAuthAuthorizationUrl(normalizedProvider, providerConfig, callbackUrl, state);
        return Redirect(authorizationUrl);
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
            var unavailableUrl = BuildOAuthErrorRedirect(ResolveOAuthReturnUrl(null), normalizedProvider, $"{normalizedProvider} sign-in is not configured.");
            return Redirect(unavailableUrl);
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

        var callbackUrl = BuildOAuthCallbackUrl(normalizedProvider);
        if (string.IsNullOrWhiteSpace(callbackUrl))
        {
            var callbackErrorUrl = BuildOAuthErrorRedirect(stateRecord.ReturnUrl, normalizedProvider, "Unable to resolve OAuth callback URL.");
            return Redirect(callbackErrorUrl);
        }

        SocialProfile profile;
        try
        {
            profile = await ResolveSocialProfileAsync(normalizedProvider, providerConfig, code, callbackUrl);
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

        var domainUserId = await EnsureDomainUserAsync(user);
        var accessScope = ResolveAccessScope(user.Email);
        var teamRole = ResolveTeamRole(user.Email);
        var token = GenerateToken(domainUserId.ToString("N"), user.Email, user.Name, accessScope, teamRole);
        var refreshToken = GenerateRefreshToken(domainUserId.ToString("N"));
        var adminPassToken = GenerateAdminPassTokenIfEligible(domainUserId.ToString("N"), user.Email, accessScope);
        var successUrl = BuildOAuthSuccessRedirect(stateRecord.ReturnUrl, normalizedProvider, token, refreshToken, adminPassToken);
        return Redirect(successUrl);
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

        return Ok(new
        {
            success = true,
            invite = issued,
            inviteLink,
            emailDelivered,
            emailDispatchStatus = emailDelivered ? "sent" : "not_sent",
            emailDispatchMessage = emailDelivered
                ? "Invite email sent."
                : "Invite token created but email was not sent. Verify SMTP settings and share the invite link manually."
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

        return Ok(new
        {
            success = true,
            prearrangedToken = issued,
            inviteLink,
            emailDelivered,
            emailDispatchStatus = emailDelivered ? "sent" : "not_sent",
            emailDispatchMessage = emailDelivered
                ? "Invite email sent."
                : "Prearranged token created but email was not sent. Verify SMTP settings and share the invite link manually."
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

        if (string.Equals(accessScope, "admin", StringComparison.OrdinalIgnoreCase))
        {
            claims.Add(new Claim("admin_pass", "all-access"));
        }

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

    private string GenerateRefreshToken(string userId)
    {
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        var expiresAtUtc = DateTime.UtcNow.AddDays(7);

        RefreshTokensByToken[token] = new RefreshTokenRecord
        {
            UserId = userId,
            ExpiresAtUtc = expiresAtUtc
        };

        return token;
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
        var raw = _configuration["Authentication:AllowSelfRegistration"];
        if (string.IsNullOrWhiteSpace(raw)) return true;
        if (bool.TryParse(raw, out var parsedBool)) return parsedBool;
        if (string.Equals(raw, "1", StringComparison.Ordinal)) return true;
        if (string.Equals(raw, "0", StringComparison.Ordinal)) return false;
        return !string.Equals(raw, "false", StringComparison.OrdinalIgnoreCase);
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
            if (!UserStore.VerifyPassword(password, existingUser.PasswordHash))
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
        var configuredAdminEmails = _configuration.GetSection("Admin:Emails").Get<string[]>() ?? [];
        return AuthAccessPolicy.GetConfiguredAdminEmails(configuredAdminEmails, Enumerable.Empty<string>());
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

        return IsConfiguredAdminUser(email)
            || _teamAccessService.IsTeamMemberAllowed(email)
            || IsSelfRegistrationAllowed();
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
            "tiktok" => "tiktok",
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
            "tiktok" => "TikTok",
            _ => string.Empty
        };

        var section = _configuration.GetSection($"Authentication:OAuthProviders:{sectionName}");
        return new OAuthProviderConfig
        {
            ClientId = (section["ClientId"] ?? string.Empty).Trim(),
            ClientSecret = (section["ClientSecret"] ?? string.Empty).Trim(),
            TenantId = (section["TenantId"] ?? string.Empty).Trim()
        };
    }

    private string BuildOAuthCallbackUrl(string provider)
    {
        var callbackPath = $"/api/auth/oauth/{provider}/callback";
        var apiOrigin = Request.Host.HasValue
            ? $"{Request.Scheme}://{Request.Host}".TrimEnd('/')
            : ResolvePublicAppOrigin();
        return $"{apiOrigin}{callbackPath}";
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
            fallbackUri.Host
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

    private bool IsFirebaseConfigured() => !string.IsNullOrWhiteSpace(_configuration["Firebase:ProjectId"]);

    private string ResolvePublicAppOrigin()
    {
        var requestOrigin = $"{Request.Scheme}://{Request.Host}".TrimEnd('/');
        var configuredBaseUrl = (_configuration["App:PublicBaseUrl"] ?? string.Empty).Trim();

        if (!Uri.TryCreate(configuredBaseUrl, UriKind.Absolute, out var configuredUri))
        {
            return requestOrigin;
        }

        var configuredOrigin = configuredUri.GetLeftPart(UriPartial.Authority).TrimEnd('/');
        if (Request.Host.HasValue && string.Equals(configuredUri.Host, Request.Host.Host, StringComparison.OrdinalIgnoreCase))
        {
            return configuredOrigin;
        }

        // Prefer the active request origin to avoid redirecting users to stale/misconfigured domains.
        if (Request.Host.HasValue)
        {
            return requestOrigin;
        }

        return configuredOrigin;
    }

    private string BuildOAuthAuthorizationUrl(string provider, OAuthProviderConfig config, string callbackUrl, string state)
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
                ["prompt"] = "consent"
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
            _ => throw new InvalidOperationException("Unsupported OAuth provider.")
        };
    }

    private async Task<SocialProfile> ResolveSocialProfileAsync(string provider, OAuthProviderConfig config, string code, string callbackUrl)
    {
        using var httpClient = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(20)
        };

        return provider switch
        {
            "google" => await ResolveGoogleProfileAsync(httpClient, config, code, callbackUrl),
            "microsoft" => await ResolveMicrosoftProfileAsync(httpClient, config, code, callbackUrl),
            "facebook" => await ResolveFacebookProfileAsync(httpClient, config, code, callbackUrl),
            "tiktok" => await ResolveTikTokProfileAsync(httpClient, config, code, callbackUrl),
            _ => throw new InvalidOperationException("Unsupported OAuth provider.")
        };
    }

    private static async Task<SocialProfile> ResolveGoogleProfileAsync(HttpClient httpClient, OAuthProviderConfig config, string code, string callbackUrl)
    {
        var tokenPayload = await ExchangeCodeForTokenAsync(httpClient, "https://oauth2.googleapis.com/token", new Dictionary<string, string>
        {
            ["code"] = code,
            ["client_id"] = config.ClientId,
            ["client_secret"] = config.ClientSecret,
            ["redirect_uri"] = callbackUrl,
            ["grant_type"] = "authorization_code"
        });

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

        return new SocialProfile
        {
            ProviderUserId = root.TryGetProperty("id", out var idNode) ? idNode.GetString() ?? string.Empty : string.Empty,
            Name = root.TryGetProperty("name", out var nameNode) ? nameNode.GetString() ?? string.Empty : string.Empty,
            Email = root.TryGetProperty("email", out var emailNode) ? emailNode.GetString() ?? string.Empty : string.Empty
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
            Email = string.Empty
        };
    }

    private static async Task<TokenExchangePayload> ExchangeCodeForTokenAsync(HttpClient httpClient, string tokenUrl, Dictionary<string, string> formValues)
    {
        using var response = await httpClient.PostAsync(tokenUrl, new FormUrlEncodedContent(formValues));
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync();
        using var tokenJson = await JsonDocument.ParseAsync(stream);
        var root = tokenJson.RootElement;

        return new TokenExchangePayload
        {
            AccessToken = root.TryGetProperty("access_token", out var accessTokenNode) ? accessTokenNode.GetString() ?? string.Empty : string.Empty,
            IdToken = root.TryGetProperty("id_token", out var idTokenNode) ? idTokenNode.GetString() ?? string.Empty : string.Empty
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

    private static string BuildUrl(string baseUrl, IReadOnlyDictionary<string, string?> queryParameters)
    {
        var encoded = queryParameters
            .Where(pair => !string.IsNullOrWhiteSpace(pair.Value))
            .Select(pair => $"{Uri.EscapeDataString(pair.Key)}={Uri.EscapeDataString(pair.Value ?? string.Empty)}");
        var separator = baseUrl.Contains('?', StringComparison.Ordinal) ? "&" : "?";
        return $"{baseUrl}{separator}{string.Join("&", encoded)}";
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

        var configuredBaseUrl = (_configuration["App:PublicBaseUrl"] ?? string.Empty).Trim().TrimEnd('/');
        if (string.IsNullOrWhiteSpace(configuredBaseUrl) || !Uri.TryCreate(configuredBaseUrl, UriKind.Absolute, out var baseUri))
        {
            _logger.LogError("Unable to build invite link because App:PublicBaseUrl is missing or invalid.");
            return false;
        }

        if (!HttpContext.RequestServices.GetRequiredService<IWebHostEnvironment>().IsDevelopment() &&
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
        var section = _configuration.GetSection("Authentication:Users");
        var userSections = section.GetChildren().ToList();
        if (userSections.Count > 0)
        {
            foreach (var childSection in userSections)
            {
                var name = childSection["Name"] ?? childSection["name"] ?? string.Empty;
                var email = childSection["Email"] ?? childSection["email"] ?? string.Empty;
                var password = childSection["Password"] ?? childSection["password"] ?? string.Empty;

                if (string.IsNullOrWhiteSpace(email) && string.IsNullOrWhiteSpace(password) && string.IsNullOrWhiteSpace(name))
                {
                    continue;
                }

                yield return (name, email, password);
            }

            yield break;
        }

        var boundUsers = section.Get<List<ConfiguredUser>>() ?? new List<ConfiguredUser>();
        foreach (var user in boundUsers)
        {
            if (string.IsNullOrWhiteSpace(user.Email) && string.IsNullOrWhiteSpace(user.Password) && string.IsNullOrWhiteSpace(user.Name))
            {
                continue;
            }

            yield return (user.Name, user.Email, user.Password);
        }

        var index = 0;
        while (true)
        {
            var email = _configuration[$"Authentication:Users:{index}:Email"] ?? _configuration[$"Authentication:Users:{index}:email"];
            var password = _configuration[$"Authentication:Users:{index}:Password"] ?? _configuration[$"Authentication:Users:{index}:password"];
            var name = _configuration[$"Authentication:Users:{index}:Name"] ?? _configuration[$"Authentication:Users:{index}:name"];
            if (string.IsNullOrWhiteSpace(email) && string.IsNullOrWhiteSpace(password) && string.IsNullOrWhiteSpace(name))
            {
                break;
            }

            yield return (name ?? string.Empty, email ?? string.Empty, password ?? string.Empty);
            index++;
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
            _logger.LogWarning("Skipping domain-user repository operations for {Email} because database persistence is unavailable.", authUser.Email);
            return parsedId;
        }

        try
        {
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

    private sealed class RefreshTokenRecord
    {
        public string UserId { get; set; } = string.Empty;
        public DateTime ExpiresAtUtc { get; set; }
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
    }

    private sealed class OAuthProviderConfig
    {
        public string ClientId { get; set; } = string.Empty;
        public string ClientSecret { get; set; } = string.Empty;
        public string TenantId { get; set; } = string.Empty;
        public bool IsEnabled => !string.IsNullOrWhiteSpace(ClientId) && !string.IsNullOrWhiteSpace(ClientSecret);
    }

    private sealed class TokenExchangePayload
    {
        public string AccessToken { get; init; } = string.Empty;
        public string IdToken { get; init; } = string.Empty;
    }

    private sealed class SocialProfile
    {
        public string ProviderUserId { get; init; } = string.Empty;
        public string Name { get; init; } = string.Empty;
        public string Email { get; init; } = string.Empty;
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
}

public sealed class VerifyRequest
{
    public string Token { get; set; } = string.Empty;
}

public sealed class FirebaseSignInRequest
{
    public string IdToken { get; set; } = string.Empty;
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