using System.IO;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services;
using Wiseravenshare.Server.Services.Currency;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public sealed class UsersController : ControllerBase
{
    private readonly UserStore _userStore;
    private readonly GrowthService _growthService;
    private readonly IWiseCoinService _wiseCoinService;
    private readonly IConfiguration _configuration;
    private readonly ILogger<UsersController> _logger;
    private readonly AppDbContext _dbContext;
    private readonly IBlobStorageService _blobStorage;
    private readonly IWebHostEnvironment _environment;

    public UsersController(
        IConfiguration configuration,
        UserStore userStore,
        GrowthService growthService,
        IWiseCoinService wiseCoinService,
        ILogger<UsersController> logger,
        AppDbContext dbContext,
        IBlobStorageService blobStorage,
        IWebHostEnvironment environment)
    {
        _configuration = configuration;
        _userStore = userStore;
        _growthService = growthService;
        _wiseCoinService = wiseCoinService;
        _logger = logger;
        _dbContext = dbContext;
        _blobStorage = blobStorage;
        _environment = environment;
    }

    private UserRecord? ResolveTargetUser(string id)
    {
        var email = User.FindFirstValue(ClaimTypes.Email)
            ?? User.FindFirstValue("email")
            ?? (User.Identity?.Name?.Contains('@') == true ? User.Identity.Name : null);
        var sub = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue("sub")
            ?? User.FindFirstValue("id")
            ?? User.FindFirstValue("userId");

        if (string.Equals(id, "me", StringComparison.OrdinalIgnoreCase))
        {
            if (!string.IsNullOrWhiteSpace(email) && _userStore.TryGetByEmail(email, out var userByEmail) && userByEmail != null)
            {
                return userByEmail;
            }

            if (!string.IsNullOrWhiteSpace(sub) && _userStore.TryGetById(sub, out var userBySub) && userBySub != null)
            {
                return userBySub;
            }

            // Check EF DbContext for authenticated user
            if (Guid.TryParse(sub, out var gSub))
            {
                var dbUser = _dbContext.Users.FirstOrDefault(u => u.Id == gSub);
                if (dbUser != null)
                {
                    return SyncDbUserToStore(dbUser);
                }
            }

            if (!string.IsNullOrWhiteSpace(email))
            {
                var dbUser = _dbContext.Users.FirstOrDefault(u => u.Email == email);
                if (dbUser != null)
                {
                    return SyncDbUserToStore(dbUser);
                }
            }

            if (User.Identity?.IsAuthenticated == true && !string.IsNullOrWhiteSpace(email))
            {
                var name = User.FindFirstValue(ClaimTypes.Name) ?? email.Split('@')[0];
                return _userStore.UpsertFromToken(sub ?? Guid.NewGuid().ToString("N"), email, name);
            }

            // Anonymous visitor resolution
            return _userStore.FindByLoginIdentifier("visitor");
        }

        if (_userStore.TryGetById(id, out var user) && user != null)
        {
            return user;
        }

        if (Guid.TryParse(id, out var parsedGuid))
        {
            var withDashes = parsedGuid.ToString("D");
            var withoutDashes = parsedGuid.ToString("N");
            if (_userStore.TryGetById(withDashes, out user) && user != null) return user;
            if (_userStore.TryGetById(withoutDashes, out user) && user != null) return user;

            var dbUser = _dbContext.Users.FirstOrDefault(u => u.Id == parsedGuid);
            if (dbUser != null)
            {
                return SyncDbUserToStore(dbUser);
            }
        }

        if (id.Contains('@'))
        {
            if (_userStore.TryGetByEmail(id, out user) && user != null)
            {
                return user;
            }

            var dbUser = _dbContext.Users.FirstOrDefault(u => u.Email == id);
            if (dbUser != null)
            {
                return SyncDbUserToStore(dbUser);
            }
        }

        if (!string.IsNullOrWhiteSpace(email) && _userStore.TryGetByEmail(email, out user) && user != null)
        {
            return user;
        }

        if (User.Identity?.IsAuthenticated == true && !string.IsNullOrWhiteSpace(email))
        {
            var name = User.FindFirstValue(ClaimTypes.Name) ?? email.Split('@')[0];
            return _userStore.UpsertFromToken(sub ?? Guid.NewGuid().ToString("N"), email, name);
        }

        return _userStore.FindByLoginIdentifier(id);
    }

    private UserRecord SyncDbUserToStore(Wiseravenshare.Server.Entities.User dbUser)
    {
        var existing = _userStore.FindByLoginIdentifier(dbUser.Email);
        if (existing != null)
        {
            if (!string.IsNullOrWhiteSpace(dbUser.AvatarUrl) && existing.Avatar != dbUser.AvatarUrl)
            {
                existing.Avatar = dbUser.AvatarUrl;
                _userStore.UpdateProfile(existing.Id, new UpdateUserProfileRequest { Avatar = dbUser.AvatarUrl });
            }
            return existing;
        }

        return _userStore.CreateUser(
            dbUser.DisplayName ?? dbUser.Username,
            dbUser.Email,
            "Temp#123",
            dbUser.Bio ?? "",
            dbUser.Location ?? "",
            dbUser.Website ?? "",
            dbUser.AvatarUrl ?? "",
            dbUser.Username);
    }

    [HttpGet("{id}")]
    [AllowAnonymous]
    public IActionResult GetById(string id)
    {
        var user = ResolveTargetUser(id);
        if (user is null)
        {
            return NotFound(new { message = "User not found." });
        }

        var response = UserStore.ToResponse(user);
        return Ok(new
        {
            id = response.Id,
            name = response.Name,
            handle = response.Handle,
            bio = response.Bio,
            location = response.Location,
            website = response.Website,
            avatar = response.Avatar,
            createdAt = response.CreatedAt,
            updatedAt = response.UpdatedAt,
            socialFeeds = response.SocialFeeds,
            followersCount = 0,
            followingCount = 0
        });
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateProfile(string id, [FromBody] UpdateUserProfileRequest request)
    {
        if (!CanAccessUser(id))
        {
            return Forbid();
        }

        var user = ResolveTargetUser(id);
        if (user is null)
        {
            return NotFound(new { message = "User not found." });
        }

        if (request.Website is not null)
        {
            var trimmedWebsite = request.Website.Trim();
            if (trimmedWebsite.Length > 0)
            {
                var normalizedWebsite = trimmedWebsite;
                if (!normalizedWebsite.Contains("://", StringComparison.Ordinal))
                {
                    normalizedWebsite = $"https://{normalizedWebsite}";
                }

                if (!Uri.TryCreate(normalizedWebsite, UriKind.Absolute, out _))
                {
                    return BadRequest(new { message = "Website must be a valid URL." });
                }

                request.Website = normalizedWebsite;
            }
            else
            {
                request.Website = string.Empty;
            }
        }

        try
        {
            var updated = _userStore.UpdateProfile(user.Id, request);
            _growthService.TrackEvent(updated.Id, updated.Email, "profile_updated");
            await TryAwardProfileCompletionBadgeAsync(updated);

            // Synchronize with database entity (app_data.Users) for durable persistence
            try
            {
                var targetIdGuid = Guid.TryParse(updated.Id, out var g) ? g : Guid.Empty;
                var dbUser = await _dbContext.Users.FirstOrDefaultAsync(u => (targetIdGuid != Guid.Empty && u.Id == targetIdGuid) || u.Email == updated.Email);
                if (dbUser != null)
                {
                    if (request.Name != null) dbUser.DisplayName = updated.Name;
                    if (request.Bio != null) dbUser.Bio = updated.Bio;
                    if (request.Location != null) dbUser.Location = updated.Location;
                    if (request.Website != null) dbUser.Website = updated.Website;
                    if (request.Avatar != null || request.AvatarUrl != null) dbUser.AvatarUrl = updated.Avatar;
                    dbUser.UpdatedAt = DateTime.UtcNow;
                    await _dbContext.SaveChangesAsync();
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to sync profile updates to Postgres users table; file-backed store retained changes.");
            }

            return Ok(UserStore.ToResponse(updated));
        }
        catch (InvalidOperationException ex)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = ex.Message });
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "User not found." });
        }
    }

    [HttpPost("{id}/avatar")]
    [HttpPost("avatar")]
    [AllowAnonymous]
    [RequestSizeLimit(20_000_000)]
    public async Task<IActionResult> UploadAvatar(string? id, IFormFile? file, CancellationToken cancellationToken)
    {
        var targetId = string.IsNullOrWhiteSpace(id) ? "me" : id.Trim();
        if (User.Identity?.IsAuthenticated == true && !CanAccessUser(targetId))
        {
            return Forbid();
        }

        var user = ResolveTargetUser(targetId);
        if (user is null)
        {
            if (User.Identity?.IsAuthenticated == true)
            {
                var email = User.FindFirstValue(ClaimTypes.Email) ?? User.FindFirstValue("email");
                var sub = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? Guid.NewGuid().ToString("N");
                var name = User.FindFirstValue(ClaimTypes.Name) ?? email?.Split('@')[0] ?? "User";
                user = _userStore.UpsertFromToken(sub, email ?? "user@wiseravenshare.ai", name);
            }
            else
            {
                user = _userStore.FindByLoginIdentifier("visitor")
                    ?? _userStore.CreateUser("Visitor", "visitor@wiseravenshare.ai", "Visitor#123", "Community Member", "", "", "", "visitor");
            }
        }

        file ??= Request.Form.Files.FirstOrDefault(f =>
            string.Equals(f.Name, "file", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(f.Name, "avatar", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(f.Name, "image", StringComparison.OrdinalIgnoreCase));

        if (file is null || file.Length == 0)
        {
            return BadRequest(new { message = "No image file provided. Please choose an image to upload." });
        }

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        var allowedExts = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { ".jpg", ".jpeg", ".png", ".webp", ".gif" };
        if (!allowedExts.Contains(ext))
        {
            return BadRequest(new { message = "Invalid image format. Supported formats: JPG, PNG, WebP, GIF." });
        }

        if (file.Length > 15 * 1024 * 1024)
        {
            return BadRequest(new { message = "Image size exceeds 15 MB limit." });
        }

        try
        {
            var avatarUrl = await SaveAvatarFileAsync(user, file, ext, cancellationToken);
            var updated = _userStore.UpdateProfile(user.Id, new UpdateUserProfileRequest { Avatar = avatarUrl });

            // Synchronize with database entity (app_data.Users) for durable persistence
            try
            {
                var targetIdGuid = Guid.TryParse(user.Id, out var g) ? g : Guid.Empty;
                var dbUser = await _dbContext.Users.FirstOrDefaultAsync(u => (targetIdGuid != Guid.Empty && u.Id == targetIdGuid) || u.Email == user.Email, cancellationToken);
                if (dbUser != null)
                {
                    dbUser.AvatarUrl = avatarUrl;
                    dbUser.UpdatedAt = DateTime.UtcNow;
                    await _dbContext.SaveChangesAsync(cancellationToken);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to sync avatar update to Postgres users table; file-backed store retained changes.");
            }

            var fileName = Path.GetFileName(avatarUrl);
            return Ok(new
            {
                success = true,
                avatarUrl,
                avatar = avatarUrl,
                fileName,
                user = UserStore.ToResponse(updated)
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to upload avatar for user {UserId}", user.Id);
            return StatusCode(StatusCodes.Status500InternalServerError, new { message = "Failed to upload avatar image." });
        }
    }

    [HttpGet("{id}/avatars")]
    [HttpGet("avatars")]
    [AllowAnonymous]
    public IActionResult GetSavedAvatars(string? id)
    {
        var targetId = string.IsNullOrWhiteSpace(id) ? "me" : id.Trim();
        var user = ResolveTargetUser(targetId);

        var localFolders = new[]
        {
            Path.Combine(_environment.WebRootPath ?? Path.Combine(_environment.ContentRootPath, "wwwroot"), "uploads", "avatars"),
            Path.Combine(_environment.ContentRootPath, "App_Data", "avatars")
        };

        var allowedExts = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { ".jpg", ".jpeg", ".png", ".webp", ".gif" };
        var avatarMap = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);

        foreach (var dir in localFolders)
        {
            if (!Directory.Exists(dir)) continue;

            try
            {
                var files = new DirectoryInfo(dir).GetFiles();
                foreach (var file in files)
                {
                    if (!allowedExts.Contains(file.Extension)) continue;
                    if (avatarMap.ContainsKey(file.Name)) continue;

                    var url = $"/uploads/avatars/{file.Name}";
                    var isActive = user != null && !string.IsNullOrWhiteSpace(user.Avatar) &&
                        (user.Avatar.EndsWith(file.Name, StringComparison.OrdinalIgnoreCase) || user.Avatar.Equals(url, StringComparison.OrdinalIgnoreCase));

                    avatarMap[file.Name] = new
                    {
                        fileName = file.Name,
                        url = url,
                        size = file.Length,
                        createdAt = file.CreationTimeUtc,
                        isActive = isActive
                    };
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed scanning avatars in directory {Dir}", dir);
            }
        }

        var results = avatarMap.Values.ToList();
        return Ok(results);
    }

    [HttpPost("{id}/avatar/select")]
    [HttpPost("avatar/select")]
    [AllowAnonymous]
    public async Task<IActionResult> SelectAvatar(string? id, [FromBody] SelectAvatarRequest? request, CancellationToken cancellationToken)
    {
        var targetId = string.IsNullOrWhiteSpace(id) ? "me" : id.Trim();
        var user = ResolveTargetUser(targetId);
        if (user is null)
        {
            if (User.Identity?.IsAuthenticated == true)
            {
                var email = User.FindFirstValue(ClaimTypes.Email) ?? User.FindFirstValue("email");
                var sub = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? Guid.NewGuid().ToString("N");
                var name = User.FindFirstValue(ClaimTypes.Name) ?? email?.Split('@')[0] ?? "User";
                user = _userStore.UpsertFromToken(sub, email ?? "user@wiseravenshare.ai", name);
            }
            else
            {
                user = _userStore.FindByLoginIdentifier("visitor")
                    ?? _userStore.CreateUser("Visitor", "visitor@wiseravenshare.ai", "Visitor#123", "Community Member", "", "", "", "visitor");
            }
        }

        var avatarUrl = request?.AvatarUrl?.Trim();
        if (string.IsNullOrWhiteSpace(avatarUrl) && !string.IsNullOrWhiteSpace(request?.FileName))
        {
            avatarUrl = $"/uploads/avatars/{Path.GetFileName(request.FileName)}";
        }

        if (string.IsNullOrWhiteSpace(avatarUrl))
        {
            return BadRequest(new { message = "AvatarUrl or FileName is required." });
        }

        var updated = _userStore.UpdateProfile(user.Id, new UpdateUserProfileRequest { Avatar = avatarUrl });

        // Synchronize with database entity
        try
        {
            var targetIdGuid = Guid.TryParse(user.Id, out var g) ? g : Guid.Empty;
            var dbUser = await _dbContext.Users.FirstOrDefaultAsync(u => (targetIdGuid != Guid.Empty && u.Id == targetIdGuid) || u.Email == user.Email, cancellationToken);
            if (dbUser != null)
            {
                dbUser.AvatarUrl = avatarUrl;
                dbUser.UpdatedAt = DateTime.UtcNow;
                await _dbContext.SaveChangesAsync(cancellationToken);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to sync selected avatar to Postgres users table.");
        }

        return Ok(new
        {
            success = true,
            avatarUrl,
            avatar = avatarUrl,
            fileName = Path.GetFileName(avatarUrl),
            user = UserStore.ToResponse(updated)
        });
    }

    [HttpDelete("{id}/avatars/{fileName}")]
    [HttpDelete("avatars/{fileName}")]
    [AllowAnonymous]
    public IActionResult DeleteSavedAvatar(string? id, string fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName))
        {
            return BadRequest(new { message = "FileName is required." });
        }

        var safeFileName = Path.GetFileName(fileName);
        var localFolders = new[]
        {
            Path.Combine(_environment.WebRootPath ?? Path.Combine(_environment.ContentRootPath, "wwwroot"), "uploads", "avatars"),
            Path.Combine(_environment.ContentRootPath, "App_Data", "avatars")
        };

        var deleted = false;
        foreach (var dir in localFolders)
        {
            var filePath = Path.Combine(dir, safeFileName);
            if (System.IO.File.Exists(filePath))
            {
                try
                {
                    System.IO.File.Delete(filePath);
                    deleted = true;
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Could not delete avatar file {Path}", filePath);
                }
            }
        }

        return Ok(new { success = deleted, fileName = safeFileName });
    }

    private async Task<string> SaveAvatarFileAsync(UserRecord user, IFormFile file, string extension, CancellationToken cancellationToken)
    {
        var uniqueFileName = $"avatar_{user.Id}_{Guid.NewGuid():N}{extension}";

        // 1. DigitalOcean Spaces / S3 Blob Storage if configured
        if (_blobStorage != null && _blobStorage.IsConfigured)
        {
            var objectKey = $"wiseravenshare/avatars/{uniqueFileName}";
            try
            {
                await using var blobStream = file.OpenReadStream();
                var result = await _blobStorage.UploadAsync(
                    objectKey,
                    blobStream,
                    file.ContentType ?? "image/jpeg",
                    cancellationToken);

                var streamUrl = StreamingUrlHelper.StreamByBlobPath(result.ObjectKey);
                return string.IsNullOrWhiteSpace(streamUrl) ? result.PublicUrl : streamUrl;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Blob storage avatar upload failed; falling back to persistent local storage.");
            }
        }

        // 2. Persistent local disk storage
        var localFolders = new[]
        {
            Path.Combine(_environment.WebRootPath ?? Path.Combine(_environment.ContentRootPath, "wwwroot"), "uploads", "avatars"),
            Path.Combine(_environment.ContentRootPath, "App_Data", "avatars"),
            Path.Combine(_environment.ContentRootPath, "MediaStorage")
        };

        foreach (var dir in localFolders)
        {
            try
            {
                Directory.CreateDirectory(dir);
                var fullPath = Path.Combine(dir, uniqueFileName);
                await using var stream = new FileStream(fullPath, FileMode.Create, FileAccess.Write, FileShare.None);
                await file.CopyToAsync(stream, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not save avatar copy to directory: {Directory}", dir);
            }
        }

        return $"/uploads/avatars/{uniqueFileName}";
    }

    [HttpGet("/uploads/avatars/{fileName}")]
    [HttpGet("/avatars/{fileName}")]
    [HttpGet("/{fileName:regex(^avatar_.*)}")]
    [HttpGet("/api/users/avatar/file/{fileName}")]
    [HttpGet("/api/users/avatars/{fileName}")]
    [HttpGet("avatar/file/{fileName}")]
    [HttpGet("avatars/{fileName}")]
    [AllowAnonymous]
    public IActionResult GetAvatarFile(string fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName)) return NotFound();
        var safeFileName = Path.GetFileName(fileName);

        var searchFolders = new[]
        {
            Path.Combine(_environment.WebRootPath ?? Path.Combine(_environment.ContentRootPath, "wwwroot"), "uploads", "avatars"),
            Path.Combine(_environment.ContentRootPath, "wwwroot", "uploads", "avatars"),
            Path.Combine(_environment.ContentRootPath, "App_Data", "avatars"),
            Path.Combine(_environment.ContentRootPath, "MediaStorage")
        };

        foreach (var folder in searchFolders)
        {
            var filePath = Path.Combine(folder, safeFileName);
            if (System.IO.File.Exists(filePath))
            {
                var ext = Path.GetExtension(filePath).ToLowerInvariant();
                var contentType = ext switch
                {
                    ".png" => "image/png",
                    ".webp" => "image/webp",
                    ".gif" => "image/gif",
                    _ => "image/jpeg"
                };
                return PhysicalFile(filePath, contentType, enableRangeProcessing: true);
            }
        }

        return NotFound();
    }

    [HttpGet("{id}/feeds")]
    public IActionResult GetSocialFeeds(string id)
    {
        if (!CanAccessUser(id))
        {
            return Forbid();
        }

        if (!_userStore.TryGetById(id, out var user) || user is null)
        {
            return NotFound(new { message = "User not found." });
        }

        return Ok(user.SocialFeeds ?? new SocialFeedSettings());
    }

    [HttpPut("{id}/feeds")]
    public async Task<IActionResult> UpdateSocialFeeds(string id, [FromBody] UpdateSocialFeedsRequest request)
    {
        if (!CanAccessUser(id))
        {
            return Forbid();
        }

        var effectiveRequest = request;
        if (!IsConfiguredAdminRequest())
        {
            if (!TryBuildSelfServiceSocialFeedRequest(request, out var restrictedRequest, out var validationMessage))
            {
                return BadRequest(new { message = validationMessage });
            }

            effectiveRequest = restrictedRequest;
        }

        try
        {
            var user = _userStore.UpdateSocialFeeds(id, effectiveRequest);
            _growthService.TrackEvent(user.Id, user.Email, "profile_updated");
            await TryAwardProfileCompletionBadgeAsync(user);
            return Ok(user.SocialFeeds);
        }
        catch (InvalidOperationException ex)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = ex.Message });
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "User not found." });
        }
    }

    private bool CanAccessUser(string id)
    {
        if (string.Equals(id, "me", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        var subjectId =
            User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue("sub")
            ?? User.FindFirstValue("id")
            ?? User.FindFirstValue("userId");

        if (string.Equals(subjectId, id, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (Guid.TryParse(id, out var g1) && Guid.TryParse(subjectId, out var g2) && g1 == g2)
        {
            return true;
        }

        var email = User.FindFirstValue(ClaimTypes.Email)
            ?? User.FindFirstValue("email")
            ?? (User.Identity?.Name?.Contains('@') == true ? User.Identity.Name : null);
        if (!string.IsNullOrWhiteSpace(email))
        {
            if (string.Equals(email, id, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            if (_userStore.TryGetByEmail(email, out var userByEmail) && userByEmail != null)
            {
                if (string.Equals(userByEmail.Id, id, StringComparison.OrdinalIgnoreCase)) return true;
                if (Guid.TryParse(userByEmail.Id, out var gUser) && Guid.TryParse(id, out var gTarget) && gUser == gTarget) return true;
            }
        }

        return false;
    }

    private bool IsConfiguredAdminRequest()
    {
        var email = User.FindFirstValue(ClaimTypes.Email)
            ?? User.FindFirstValue("email")
            ?? string.Empty;
        return AuthAccessPolicy.IsConfiguredAdminEmail(_configuration, email);
    }

    private static bool TryBuildSelfServiceSocialFeedRequest(
        UpdateSocialFeedsRequest request,
        out UpdateSocialFeedsRequest restrictedRequest,
        out string message)
    {
        restrictedRequest = new UpdateSocialFeedsRequest();

        if (request.Twitter is not null || request.LinkedIn is not null || request.Bluesky is not null)
        {
            message = "Self-service social linking is limited to Facebook, TikTok, Instagram, and YouTube.";
            return false;
        }

        if (!TryRestrictConnection(request.Facebook, "facebook", out var facebook, out message)
            || !TryRestrictConnection(request.TikTok, "tiktok", out var tikTok, out message)
            || !TryRestrictConnection(request.Instagram, "instagram", out var instagram, out message)
            || !TryRestrictConnection(request.YouTube, "youtube", out var youTube, out message))
        {
            return false;
        }

        restrictedRequest.Facebook = facebook;
        restrictedRequest.TikTok = tikTok;
        restrictedRequest.Instagram = instagram;
        restrictedRequest.YouTube = youTube;
        message = string.Empty;
        return true;
    }

    private static bool TryRestrictConnection(
        SocialFeedConnection? input,
        string platform,
        out SocialFeedConnection? output,
        out string message)
    {
        output = null;
        message = string.Empty;
        if (input is null)
        {
            return true;
        }

        if (!string.IsNullOrWhiteSpace(input.Designation)
            || !string.IsNullOrWhiteSpace(input.AccessToken)
            || !string.IsNullOrWhiteSpace(input.RefreshToken)
            || input.TokenExpiresAt is not null
            || !string.IsNullOrWhiteSpace(input.Site))
        {
            message = "Advanced social fields are restricted to administrators.";
            return false;
        }

        var username = (input.Username ?? string.Empty).Trim();
        var profileUrl = (input.ProfileUrl ?? string.Empty).Trim();
        var feedUrl = (input.FeedUrl ?? string.Empty).Trim();

        if (!IsHttpUrlOrEmpty(profileUrl) || !IsHttpUrlOrEmpty(feedUrl))
        {
            message = "Profile and feed URLs must be valid http(s) addresses.";
            return false;
        }

        output = new SocialFeedConnection
        {
            Enabled = input.Enabled,
            Username = username,
            ProfileUrl = profileUrl,
            FeedUrl = feedUrl
        };

        return true;
    }

    private static bool IsHttpUrlOrEmpty(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return true;
        }

        return Uri.TryCreate(value, UriKind.Absolute, out var uri)
            && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
    }

    private async Task TryAwardProfileCompletionBadgeAsync(UserRecord user)
    {
        try
        {
            if (!IsProfileComplete(user))
            {
                return;
            }

            if (Guid.TryParse(user.Id, out var userId))
            {
                await _wiseCoinService.AwardJobWellDoneBadgeAsync(userId, "profile_complete");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to award profile completion badge for {UserId}", user.Id);
        }
    }

    private static bool IsProfileComplete(UserRecord user)
    {
        var socialFeeds = user.SocialFeeds;
        var hasConnectedFeed = socialFeeds is not null && (
            IsConnected(socialFeeds.TikTok) ||
            IsConnected(socialFeeds.Facebook) ||
            IsConnected(socialFeeds.Instagram) ||
            IsConnected(socialFeeds.YouTube) ||
            IsConnected(socialFeeds.Twitter) ||
            IsConnected(socialFeeds.LinkedIn) ||
            IsConnected(socialFeeds.Bluesky));

        return !string.IsNullOrWhiteSpace(user.Name)
            && !string.IsNullOrWhiteSpace(user.Bio)
            && !string.IsNullOrWhiteSpace(user.Avatar)
            && (hasConnectedFeed || !string.IsNullOrWhiteSpace(user.Location) || !string.IsNullOrWhiteSpace(user.Website));
    }

    private static bool IsConnected(SocialFeedConnection? connection)
    {
        if (connection is null)
        {
            return false;
        }

        return connection.Enabled
            || !string.IsNullOrWhiteSpace(connection.Username)
            || !string.IsNullOrWhiteSpace(connection.ProfileUrl)
            || !string.IsNullOrWhiteSpace(connection.FeedUrl);
    }

    // ── Block / Unblock endpoints ──────────────────────────────────────────────

    /// <summary>POST /api/users/{id}/block — Block a user. Idempotent.</summary>
    [HttpPost("{id}/block")]
    public async Task<IActionResult> BlockUser(string id, CancellationToken cancellationToken)
    {
        var currentUserId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (string.IsNullOrWhiteSpace(currentUserId) || !Guid.TryParse(currentUserId, out var blockerId))
            return Unauthorized(new { message = "Unable to determine current user." });

        if (!Guid.TryParse(id, out var blockedId) || blockedId == blockerId)
            return BadRequest(new { message = "Invalid target user." });

        var exists = await _dbContext.UserBlocks
            .AnyAsync(b => b.BlockerId == blockerId && b.BlockedId == blockedId && !b.IsDeleted, cancellationToken);
        if (!exists)
        {
            _dbContext.UserBlocks.Add(new UserBlock { BlockerId = blockerId, BlockedId = blockedId });
            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        return Ok(new { blocked = true, userId = id });
    }

    /// <summary>DELETE /api/users/{id}/block — Unblock a user.</summary>
    [HttpDelete("{id}/block")]
    public async Task<IActionResult> UnblockUser(string id, CancellationToken cancellationToken)
    {
        var currentUserId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (string.IsNullOrWhiteSpace(currentUserId) || !Guid.TryParse(currentUserId, out var blockerId))
            return Unauthorized(new { message = "Unable to determine current user." });

        if (!Guid.TryParse(id, out var blockedId))
            return BadRequest(new { message = "Invalid target user." });

        var block = await _dbContext.UserBlocks
            .FirstOrDefaultAsync(b => b.BlockerId == blockerId && b.BlockedId == blockedId && !b.IsDeleted, cancellationToken);

        if (block is not null)
        {
            block.IsDeleted = true;
            block.DeletedAt = DateTime.UtcNow;
            block.UpdatedAt = DateTime.UtcNow;
            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        return Ok(new { blocked = false, userId = id });
    }

    /// <summary>GET /api/users/me/blocks — List users blocked by the current user.</summary>
    [HttpGet("me/blocks")]
    public async Task<IActionResult> GetMyBlocks(CancellationToken cancellationToken)
    {
        var currentUserId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (string.IsNullOrWhiteSpace(currentUserId) || !Guid.TryParse(currentUserId, out var userId))
            return Unauthorized(new { message = "Unable to determine current user." });

        var blocks = await _dbContext.UserBlocks
            .Where(b => b.BlockerId == userId && !b.IsDeleted)
            .Select(b => new { userId = b.BlockedId.ToString(), blockedAt = b.CreatedAt })
            .ToListAsync(cancellationToken);

        return Ok(blocks);
    }
}
