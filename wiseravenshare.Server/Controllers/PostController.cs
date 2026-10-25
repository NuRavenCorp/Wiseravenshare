// Wiseravenshare.Server/Controllers/PostsController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Wiseravenshare.Server.DTOs.Post;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Interfaces.Repositories;
using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Exceptions;
using Wiseravenshare.Server.Services;
using Wiseravenshare.Server.Services.Personalization;

namespace Wiseravenshare.Server.Controllers
{

    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    [Produces("application/json")]
    public class PostsController : ControllerBase
    {
        private readonly IPostService _postService;
        private readonly IUserRepository _userRepository;
        private readonly ILogger<PostsController> _logger;
        private readonly OutputCacheInvalidationService _cacheInvalidation;
        private readonly IPersonalizationService _personalizationService;
        private static readonly System.Text.RegularExpressions.Regex HashtagRegex = new(@"#([\p{L}\p{N}_-]{2,64})", System.Text.RegularExpressions.RegexOptions.Compiled);
        private static readonly System.Text.RegularExpressions.Regex PartialRegex = new(@"%([\p{L}\p{N}_-]{2,64})", System.Text.RegularExpressions.RegexOptions.Compiled);

        public PostsController(
            IPostService postService,
            IUserRepository userRepository,
            ILogger<PostsController> logger,
            OutputCacheInvalidationService cacheInvalidation,
            IPersonalizationService personalizationService)
        {
            _postService = postService;
            _userRepository = userRepository;
            _logger = logger;
            _cacheInvalidation = cacheInvalidation;
            _personalizationService = personalizationService;
        }

        /// <summary>
        /// Create a new post
        /// </summary>
        [HttpPost]
        [AllowAnonymous]
        [ProducesResponseType(typeof(PostDto), StatusCodes.Status201Created)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
        public async Task<IActionResult> CreatePost([FromBody] CreatePostDto dto)
        {
            try
            {
                if (User.Identity?.IsAuthenticated == true)
                {
                    var userId = await ResolveEffectiveUserIdAsync();
                    var post = await _postService.CreatePostAsync(userId, dto);
                    await TryTrackPostCreationAsync(userId, post);
                    await _cacheInvalidation.InvalidateFeedAsync(HttpContext.RequestAborted);
                    return CreatedAtAction(nameof(GetPost), new { id = post.Id }, post);
                }

                var fallbackUserId = Guid.NewGuid();
                var fallbackPost = await _postService.CreatePostAsync(fallbackUserId, dto);
                await TryTrackPostCreationAsync(fallbackUserId, fallbackPost);
                await _cacheInvalidation.InvalidateFeedAsync(HttpContext.RequestAborted);
                return CreatedAtAction(nameof(GetPost), new { id = fallbackPost.Id }, fallbackPost);
            }
            catch (UnauthorizedAccessException ex)
            {
                _logger.LogWarning(ex, "Authenticated identity could not be resolved for post create; falling back to anonymous publisher.");
                var fallbackUserId = Guid.NewGuid();
                var fallbackPost = await _postService.CreatePostAsync(fallbackUserId, dto);
                await TryTrackPostCreationAsync(fallbackUserId, fallbackPost);
                await _cacheInvalidation.InvalidateFeedAsync(HttpContext.RequestAborted);
                return CreatedAtAction(nameof(GetPost), new { id = fallbackPost.Id }, fallbackPost);
            }
            catch (InvalidOperationException ex)
            {
                _logger.LogWarning(ex, "Post creation failed due to persistence constraints.");
                return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error creating post.");
                return StatusCode(StatusCodes.Status500InternalServerError, new { message = "Post could not be saved right now. Please try again." });
            }
        }

        /// <summary>
        /// Get a post by ID
        /// </summary>
        [HttpGet("{id}")]
        [AllowAnonymous]
        [ProducesResponseType(typeof(PostDto), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> GetPost(Guid id)
        {
            var post = await _postService.GetPostAsync(id);
            return Ok(post);
        }

        /// <summary>
        /// Create a threaded series of posts in order.
        /// Each post after the first replies to the previously created post.
        /// </summary>
        [HttpPost("threads")]
        [AllowAnonymous]
        [ProducesResponseType(typeof(IEnumerable<PostDto>), StatusCodes.Status201Created)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
        public async Task<IActionResult> CreateThread([FromBody] CreatePostThreadDto dto)
        {
            if (dto?.Posts == null || dto.Posts.Count == 0)
            {
                return BadRequest(new { message = "At least one post is required to create a thread." });
            }

            var userId = User.Identity?.IsAuthenticated == true
                ? await ResolveEffectiveUserIdAsync()
                : Guid.NewGuid();

            var created = new List<PostDto>(dto.Posts.Count);
            Guid? nextReplyToId = dto.ReplyToId;

            foreach (var item in dto.Posts)
            {
                var createDto = new CreatePostDto
                {
                    Content = item.Content,
                    MediaUrls = item.MediaUrls,
                    MediaUrl = item.MediaUrl,
                    YoutubeUrl = item.YoutubeUrl,
                    TikTokUrl = item.TikTokUrl,
                    FacebookUrl = item.FacebookUrl,
                    Provenance = item.Provenance,
                    Type = item.Type,
                    ReplyToId = nextReplyToId,
                    LocationName = item.LocationName,
                    IsTruthDispatch = item.IsTruthDispatch,
                    TruthDeclarationAccepted = item.TruthDeclarationAccepted,
                    Latitude = item.Latitude,
                    Longitude = item.Longitude,
                    IsSensitive = item.IsSensitive
                };

                var post = await _postService.CreatePostAsync(userId, createDto);
                created.Add(post);
                nextReplyToId = post.Id;
            }

            await _cacheInvalidation.InvalidateFeedAsync(HttpContext.RequestAborted);
            return StatusCode(StatusCodes.Status201Created, created);
        }

        /// <summary>
        /// Update a post
        /// </summary>
        [HttpPut("{id}")]
        [ProducesResponseType(typeof(PostDto), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> UpdatePost(Guid id, [FromBody] UpdatePostDto dto)
        {
            var userId = await ResolveEffectiveUserIdAsync();
            var post = await _postService.UpdatePostAsync(userId, id, dto);
            await _cacheInvalidation.InvalidateFeedAsync(HttpContext.RequestAborted);
            return Ok(post);
        }

        /// <summary>
        /// Delete a post
        /// </summary>
        [HttpDelete("{id}")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> DeletePost(Guid id)
        {
            var userId = await ResolveEffectiveUserIdAsync();
            await _postService.DeletePostAsync(userId, id);
            await _cacheInvalidation.InvalidateFeedAsync(HttpContext.RequestAborted);
            return NoContent();
        }

        /// <summary>
        /// Get the user's feed
        /// </summary>
        [HttpGet("feed")]
        [AllowAnonymous]
        [ProducesResponseType(typeof(IEnumerable<PostDto>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetFeed([FromQuery] int page = 1, [FromQuery] int pageSize = 20)
        {
            if (User.Identity?.IsAuthenticated == true)
            {
                var userId = await ResolveEffectiveUserIdAsync();
                var posts = await _postService.GetFeedAsync(userId, page, pageSize);
                return Ok(posts);
            }

            var fallbackPosts = await _postService.GetTrendingPostsAsync(Math.Max(pageSize, 10));
            return Ok(fallbackPosts);
        }

        /// <summary>
        /// Get posts by a specific user
        /// </summary>
        [HttpGet("user/{userId}")]
        [AllowAnonymous]
        [OutputCache(PolicyName = "PublicFeedShort")]
        [ProducesResponseType(typeof(IEnumerable<PostDto>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetUserPosts(Guid userId, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
        {
            var posts = await _postService.GetUserPostsAsync(userId, page, pageSize);
            return Ok(posts);
        }

        /// <summary>
        /// Like a post
        /// </summary>
        [HttpPost("{id}/like")]
        [ProducesResponseType(typeof(PostInteractionDto), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> LikePost(Guid id)
        {
            try
            {
                var userId = await ResolveEffectiveUserIdAsync();
                var state = await _postService.LikePostAsync(userId, id);
                await TryTrackPostInteractionAsync(userId, id, "Like");
                await _cacheInvalidation.InvalidateFeedAsync(HttpContext.RequestAborted);
                return Ok(state);
            }
            catch (NotFoundException ex)
            {
                return NotFound(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error liking post {PostId}", id);
                return StatusCode(500, new { message = "Failed to like post. Please try again." });
            }
        }

        /// <summary>
        /// Unlike a post
        /// </summary>
        [HttpDelete("{id}/like")]
        [ProducesResponseType(typeof(PostInteractionDto), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> UnlikePost(Guid id)
        {
            try
            {
                var userId = await ResolveEffectiveUserIdAsync();
                var state = await _postService.UnlikePostAsync(userId, id);
                await TryTrackPostInteractionAsync(userId, id, "Dislike");
                await _cacheInvalidation.InvalidateFeedAsync(HttpContext.RequestAborted);
                return Ok(state);
            }
            catch (NotFoundException ex)
            {
                return NotFound(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error unliking post {PostId}", id);
                return StatusCode(500, new { message = "Failed to unlike post. Please try again." });
            }
        }

        /// <summary>
        /// Repost a post
        /// </summary>
        [HttpPost("{id}/repost")]
        [ProducesResponseType(typeof(PostInteractionDto), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> RepostPost(Guid id)
        {
            try
            {
                var userId = await ResolveEffectiveUserIdAsync();
                var state = await _postService.RepostPostAsync(userId, id);
                await TryTrackPostInteractionAsync(userId, id, "Share");
                await _cacheInvalidation.InvalidateFeedAsync(HttpContext.RequestAborted);
                return Ok(state);
            }
            catch (NotFoundException ex)
            {
                return NotFound(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error reposting post {PostId}", id);
                return StatusCode(500, new { message = "Failed to update repost. Please try again." });
            }
        }

        /// <summary>
        /// Unrepost a post
        /// </summary>
        [HttpDelete("{id}/repost")]
        [ProducesResponseType(typeof(PostInteractionDto), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> UnrepostPost(Guid id)
        {
            try
            {
                var userId = await ResolveEffectiveUserIdAsync();
                var state = await _postService.UnrepostPostAsync(userId, id);
                await TryTrackPostInteractionAsync(userId, id, "Dismiss");
                await _cacheInvalidation.InvalidateFeedAsync(HttpContext.RequestAborted);
                return Ok(state);
            }
            catch (NotFoundException ex)
            {
                return NotFound(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error unreposting post {PostId}", id);
                return StatusCode(500, new { message = "Failed to update repost. Please try again." });
            }
        }

        /// <summary>
        /// Get comments for a post
        /// </summary>
        [HttpGet("{id}/comments")]
        [AllowAnonymous]
        [ProducesResponseType(typeof(IEnumerable<PostCommentDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> GetComments(Guid id, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
        {
            var comments = await _postService.GetCommentsAsync(id, page, pageSize);
            return Ok(comments);
        }

        /// <summary>
        /// Add a comment to a post
        /// </summary>
        [HttpPost("{id}/comments")]
        [ProducesResponseType(typeof(PostCommentDto), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> AddComment(Guid id, [FromBody] AddPostCommentDto dto)
        {
            var userId = await ResolveEffectiveUserIdAsync();
            var comment = await _postService.AddCommentAsync(userId, id, dto);
            await TryTrackPostInteractionAsync(userId, id, "Comment");
            await _cacheInvalidation.InvalidateFeedAsync(HttpContext.RequestAborted);
            return Ok(comment);
        }

        /// <summary>
        /// Like a comment
        /// </summary>
        [HttpPost("comments/{commentId}/like")]
        [ProducesResponseType(typeof(CommentInteractionDto), StatusCodes.Status200OK)]
        public async Task<IActionResult> LikeComment(Guid commentId)
        {
            try
            {
                var userId = await ResolveEffectiveUserIdAsync();
                var state = await _postService.LikeCommentAsync(userId, commentId);
                await _cacheInvalidation.InvalidateFeedAsync(HttpContext.RequestAborted);
                return Ok(state);
            }
            catch (NotFoundException ex)
            {
                return NotFound(new { message = ex.Message });
            }
        }

        /// <summary>
        /// Unlike a comment
        /// </summary>
        [HttpDelete("comments/{commentId}/like")]
        [ProducesResponseType(typeof(CommentInteractionDto), StatusCodes.Status200OK)]
        public async Task<IActionResult> UnlikeComment(Guid commentId)
        {
            try
            {
                var userId = await ResolveEffectiveUserIdAsync();
                var state = await _postService.UnlikeCommentAsync(userId, commentId);
                await _cacheInvalidation.InvalidateFeedAsync(HttpContext.RequestAborted);
                return Ok(state);
            }
            catch (NotFoundException ex)
            {
                return NotFound(new { message = ex.Message });
            }
        }

        /// <summary>
        /// Bookmark a post
        /// </summary>
        [HttpPost("{id}/bookmark")]
        [ProducesResponseType(typeof(PostInteractionDto), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> BookmarkPost(Guid id)
        {
            var userId = await ResolveEffectiveUserIdAsync();
            var state = await _postService.BookmarkPostAsync(userId, id);
            await TryTrackPostInteractionAsync(userId, id, "Bookmark");
            await _cacheInvalidation.InvalidateFeedAsync(HttpContext.RequestAborted);
            return Ok(state);
        }

        /// <summary>
        /// Unbookmark a post
        /// </summary>
        [HttpDelete("{id}/bookmark")]
        [ProducesResponseType(typeof(PostInteractionDto), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> UnbookmarkPost(Guid id)
        {
            var userId = await ResolveEffectiveUserIdAsync();
            var state = await _postService.UnbookmarkPostAsync(userId, id);
            await TryTrackPostInteractionAsync(userId, id, "Dismiss");
            await _cacheInvalidation.InvalidateFeedAsync(HttpContext.RequestAborted);
            return Ok(state);
        }

        /// <summary>
        /// Track a post view (fire-and-forget, AllowAnonymous)
        /// </summary>
        [HttpPost("{id}/view")]
        [AllowAnonymous]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        public async Task<IActionResult> TrackView(Guid id)
        {
            try
            {
                await _postService.TrackViewAsync(id);
                if (User.Identity?.IsAuthenticated == true)
                {
                    var userId = await ResolveEffectiveUserIdAsync();
                    await TryTrackPostInteractionAsync(userId, id, "View");
                }
            }
            catch
            {
                // View tracking is best-effort; never surface errors to client.
            }
            return NoContent();
        }

        /// <summary>
        /// Increment share count when a user shares a post externally
        /// </summary>
        [HttpPost("{id}/share")]
        [AllowAnonymous]
        [ProducesResponseType(typeof(PostInteractionDto), StatusCodes.Status200OK)]
        public async Task<IActionResult> SharePost(Guid id)
        {
            try
            {
                var state = await _postService.SharePostAsync(id);
                if (User.Identity?.IsAuthenticated == true)
                {
                    var userId = await ResolveEffectiveUserIdAsync();
                    await TryTrackPostInteractionAsync(userId, id, "Share");
                }
                return Ok(state);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error recording share for post {PostId}", id);
                return StatusCode(500, new { message = "Failed to record share." });
            }
        }

        /// <summary>
        /// Get trending posts
        /// </summary>
        [HttpGet("trending")]
        [AllowAnonymous]
        [ProducesResponseType(typeof(IEnumerable<PostDto>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetTrending([FromQuery] int count = 10)
        {
            var posts = await _postService.GetTrendingPostsAsync(count);
            return Ok(posts);
        }

        /// <summary>
        /// Get post count for a user
        /// </summary>
        [HttpGet("count/{userId}")]
        [AllowAnonymous]
        [ProducesResponseType(typeof(int), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetPostCount(Guid userId)
        {
            var count = await _postService.GetPostCountAsync(userId);
            return Ok(count);
        }

        /// <summary>
        /// Mark post as not interested for ranking suppression
        /// </summary>
        [HttpPost("{id}/not-interested")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> MarkNotInterested(Guid id)
        {
            try
            {
                var userId = await ResolveEffectiveUserIdAsync();
                await TryTrackPostInteractionAsync(userId, id, "Dismiss");
                await _cacheInvalidation.InvalidateFeedAsync(HttpContext.RequestAborted);
                return NoContent();
            }
            catch (NotFoundException ex)
            {
                return NotFound(new { message = ex.Message });
            }
        }

        /// <summary>
        /// Hide an author from the feed (without full account block)
        /// </summary>
        [HttpPost("{id}/hide-author")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> HideAuthor(Guid id)
        {
            try
            {
                var userId = await ResolveEffectiveUserIdAsync();
                var post = await _postService.GetPostAsync(id);
                await _personalizationService.TrackInteractionAsync(userId, new TrackInteractionRequest(
                    "Dismiss",
                    "author",
                    post.UserId,
                    post.User?.DisplayName ?? post.User?.Username ?? "Author",
                    "author",
                    null,
                    100,
                    null,
                    HttpContext.Request.Headers.UserAgent.ToString(),
                    null,
                    null), HttpContext.RequestAborted);

                await _cacheInvalidation.InvalidateFeedAsync(HttpContext.RequestAborted);
                return NoContent();
            }
            catch (NotFoundException ex)
            {
                return NotFound(new { message = ex.Message });
            }
        }

        private async Task TrackPostInteractionAsync(Guid userId, Guid postId, string interactionType)
        {
            var post = await _postService.GetPostAsync(postId);
            var tags = ExtractPostSignalTags(post.Content);

            await _personalizationService.TrackInteractionAsync(userId, new TrackInteractionRequest(
                interactionType,
                "post",
                post.Id,
                string.IsNullOrWhiteSpace(post.Content) ? "Post" : post.Content[..Math.Min(120, post.Content.Length)],
                post.Type,
                tags.Length > 0 ? tags : null,
                null,
                null,
                HttpContext.Request.Headers.UserAgent.ToString(),
                null,
                null), HttpContext.RequestAborted);
        }

        private async Task TryTrackPostCreationAsync(Guid userId, PostDto post)
        {
            try
            {
                var tags = ExtractPostSignalTags(post.Content);
                await _personalizationService.TrackInteractionAsync(userId, new TrackInteractionRequest(
                    "Share",
                    "post",
                    post.Id,
                    string.IsNullOrWhiteSpace(post.Content) ? "Post" : post.Content[..Math.Min(120, post.Content.Length)],
                    post.Type,
                    tags.Length > 0 ? tags : null,
                    tags.Length,
                    null,
                    HttpContext.Request.Headers.UserAgent.ToString(),
                    null,
                    null), HttpContext.RequestAborted);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to track post creation signals for user {UserId} post {PostId}", userId, post.Id);
            }
        }

        private async Task TryTrackPostInteractionAsync(Guid userId, Guid postId, string interactionType)
        {
            try
            {
                await TrackPostInteractionAsync(userId, postId, interactionType);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to track post interaction {InteractionType} for user {UserId} post {PostId}", interactionType, userId, postId);
            }
        }

        private static string[] ExtractPostSignalTags(string? content)
        {
            if (string.IsNullOrWhiteSpace(content))
            {
                return Array.Empty<string>();
            }

            var hashtags = HashtagRegex
                .Matches(content)
                .Select(match => match.Groups[1].Value.Trim().ToLowerInvariant())
                .Where(tag => !string.IsNullOrWhiteSpace(tag))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Take(24)
                .ToArray();

            var partials = PartialRegex
                .Matches(content)
                .Select(match => match.Groups[1].Value.Trim().ToLowerInvariant())
                .Where(tag => !string.IsNullOrWhiteSpace(tag))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Take(24)
                .ToArray();

            return hashtags
                .Select(tag => $"#{tag}")
                .Concat(partials.Select(tag => $"%{tag}"))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Take(32)
                .ToArray();
        }

        private async Task<Guid> ResolveEffectiveUserIdAsync()
        {
            var rawClaimId = User.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? User.FindFirstValue("sub");

            var hasGuidClaim = Guid.TryParse(rawClaimId, out var claimUserId) && claimUserId != Guid.Empty;
            if (!hasGuidClaim)
            {
                claimUserId = Guid.Empty;
                _logger.LogWarning("Authenticated request has missing or invalid user id claim. sub={Sub}; attempting email/username recovery.", rawClaimId ?? "<null>");
            }

            if (hasGuidClaim)
            {
                try
                {
                    var byId = await _userRepository.GetByIdAsync(claimUserId);
                    if (byId is not null)
                    {
                        return byId.Id;
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "User lookup by id failed for token user {UserId}; falling back to claim-based identity.", claimUserId);
                }
            }

            var email = (User.FindFirstValue(ClaimTypes.Email)
                ?? User.FindFirstValue("email")
                ?? string.Empty).Trim();

            var username = (User.FindFirstValue(ClaimTypes.Name)
                ?? User.FindFirstValue(ClaimTypes.Upn)
                ?? User.FindFirstValue(JwtRegisteredClaimNames.UniqueName)
                ?? User.FindFirstValue("preferred_username")
                ?? string.Empty).Trim();

            if (!string.IsNullOrWhiteSpace(username))
            {
                try
                {
                    var byUsername = await _userRepository.GetByUsernameAsync(username);
                    if (byUsername is not null)
                    {
                        if (!byUsername.IsActive)
                        {
                            byUsername.IsActive = true;
                            await _userRepository.UpdateAsync(byUsername);
                        }

                        _logger.LogInformation("Recovered domain user mapping by username {Username}: token user {TokenUserId} -> domain user {DomainUserId}", username, claimUserId, byUsername.Id);
                        return byUsername.Id;
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "User lookup by username failed for {Username}; continuing identity resolution.", username);
                }
            }

            if (string.IsNullOrWhiteSpace(email))
            {
                email = hasGuidClaim
                    ? $"local-{claimUserId:N}@local"
                    : $"local-{Guid.NewGuid():N}@local";
            }

            try
            {
                var byEmail = await _userRepository.GetByEmailAsync(email);
                if (byEmail is not null)
                {
                    if (!byEmail.IsActive)
                    {
                        byEmail.IsActive = true;
                        await _userRepository.UpdateAsync(byEmail);
                    }

                    _logger.LogInformation("Recovered domain user mapping for {Email}: token user {TokenUserId} -> domain user {DomainUserId}", email, claimUserId, byEmail.Id);
                    return byEmail.Id;
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "User lookup by email failed for {Email}; falling back to the token identity.", email);
            }

            var displayName = username.Length > 0 ? username : (User.FindFirstValue(ClaimTypes.Name) ?? email.Split('@')[0]).Trim();
            var usernameSeed = username.Length > 0 ? username : (displayName.Length > 0 ? displayName : email.Split('@')[0]);
            var sanitizedUsername = new string(usernameSeed.Where(char.IsLetterOrDigit).ToArray()).ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(sanitizedUsername))
            {
                sanitizedUsername = $"localuser-{claimUserId.ToString("N")[..6]}";
            }

            try
            {
                var resolvedUserId = hasGuidClaim ? claimUserId : Guid.NewGuid();
                var created = await _userRepository.AddAsync(new Wiseravenshare.Server.Entities.User
                {
                    Id = resolvedUserId,
                    Email = email,
                    Username = sanitizedUsername,
                    DisplayName = displayName,
                    PasswordHash = string.Empty,
                    IsActive = true,
                    TruthScore = 50.00m
                });

                _logger.LogInformation("Auto-provisioned missing domain user {UserId} for {Email} during post request.", created.Id, email);
                return created.Id;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to auto-provision missing domain user {UserId} for {Email}.", claimUserId, email);
                try
                {
                    var fallbackById = await _userRepository.GetByIdAsync(claimUserId);
                    if (fallbackById is not null)
                    {
                        return fallbackById.Id;
                    }

                    var fallbackByEmail = await _userRepository.GetByEmailAsync(email);
                    if (fallbackByEmail is not null)
                    {
                        return fallbackByEmail.Id;
                    }
                }
                catch (Exception fallbackEx)
                {
                    _logger.LogWarning(fallbackEx, "Recovery lookup failed for {Email}.", email);
                }
            }

            if (hasGuidClaim)
            {
                _logger.LogWarning("Falling back to token identity {UserId} after unresolved domain mapping.", claimUserId);
                return claimUserId;
            }

            throw new UnauthorizedAccessException("Authenticated identity could not be mapped to a domain user.");
        }
    }
}