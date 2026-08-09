// Wiseravenshare.Server/Controllers/PostsController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using Wiseravenshare.Server.DTOs.Post;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Interfaces.Repositories;
using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services;

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

        public PostsController(IPostService postService, IUserRepository userRepository, ILogger<PostsController> logger)
        {
            _postService = postService;
            _userRepository = userRepository;
            _logger = logger;
        }

        /// <summary>
        /// Create a new post
        /// </summary>
        [HttpPost]
        [ProducesResponseType(typeof(PostDto), StatusCodes.Status201Created)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
        public async Task<IActionResult> CreatePost([FromBody] CreatePostDto dto)
        {
            var userId = await ResolveEffectiveUserIdAsync();
            var post = await _postService.CreatePostAsync(userId, dto);
            return CreatedAtAction(nameof(GetPost), new { id = post.Id }, post);
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
            return NoContent();
        }

        /// <summary>
        /// Get the user's feed
        /// </summary>
        [HttpGet("feed")]
        [ProducesResponseType(typeof(IEnumerable<PostDto>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetFeed([FromQuery] int page = 1, [FromQuery] int pageSize = 20)
        {
            var userId = await ResolveEffectiveUserIdAsync();
            var posts = await _postService.GetFeedAsync(userId, page, pageSize);
            return Ok(posts);
        }

        /// <summary>
        /// Get posts by a specific user
        /// </summary>
        [HttpGet("user/{userId}")]
        [AllowAnonymous]
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
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> LikePost(Guid id)
        {
            var userId = await ResolveEffectiveUserIdAsync();
            await _postService.LikePostAsync(userId, id);
            return NoContent();
        }

        /// <summary>
        /// Unlike a post
        /// </summary>
        [HttpDelete("{id}/like")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> UnlikePost(Guid id)
        {
            var userId = await ResolveEffectiveUserIdAsync();
            await _postService.UnlikePostAsync(userId, id);
            return NoContent();
        }

        /// <summary>
        /// Repost a post
        /// </summary>
        [HttpPost("{id}/repost")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> RepostPost(Guid id)
        {
            var userId = await ResolveEffectiveUserIdAsync();
            await _postService.RepostPostAsync(userId, id);
            return NoContent();
        }

        /// <summary>
        /// Unrepost a post
        /// </summary>
        [HttpDelete("{id}/repost")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> UnrepostPost(Guid id)
        {
            var userId = await ResolveEffectiveUserIdAsync();
            await _postService.UnrepostPostAsync(userId, id);
            return NoContent();
        }

        /// <summary>
        /// Bookmark a post
        /// </summary>
        [HttpPost("{id}/bookmark")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> BookmarkPost(Guid id)
        {
            var userId = await ResolveEffectiveUserIdAsync();
            await _postService.BookmarkPostAsync(userId, id);
            return NoContent();
        }

        /// <summary>
        /// Unbookmark a post
        /// </summary>
        [HttpDelete("{id}/bookmark")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> UnbookmarkPost(Guid id)
        {
            var userId = await ResolveEffectiveUserIdAsync();
            await _postService.UnbookmarkPostAsync(userId, id);
            return NoContent();
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

        private async Task<Guid> ResolveEffectiveUserIdAsync()
        {
            var rawClaimId = User.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? User.FindFirstValue("sub");

            var hasGuidClaim = Guid.TryParse(rawClaimId, out var claimUserId) && claimUserId != Guid.Empty;
            if (!hasGuidClaim)
            {
                _logger.LogWarning("Authenticated request has missing or invalid user id claim. sub={Sub}", rawClaimId ?? "<null>");
                claimUserId = Guid.NewGuid();
            }

            if (hasGuidClaim)
            {
                var byId = await _userRepository.GetByIdAsync(claimUserId);
                if (byId is not null)
                {
                    return byId.Id;
                }
            }

            var email = (User.FindFirstValue(ClaimTypes.Email)
                ?? User.FindFirstValue("email")
                ?? string.Empty).Trim();

            if (string.IsNullOrWhiteSpace(email))
            {
                _logger.LogWarning("Unable to resolve missing domain user {UserId} because token email claim is missing.", claimUserId);
                return claimUserId;
            }

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

            var displayName = (User.FindFirstValue(ClaimTypes.Name) ?? email.Split('@')[0]).Trim();
            var usernameSeed = displayName.Length > 0 ? displayName : email.Split('@')[0];
            var sanitizedUsername = new string(usernameSeed.Where(char.IsLetterOrDigit).ToArray()).ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(sanitizedUsername))
            {
                sanitizedUsername = $"user{claimUserId.ToString("N")[..8]}";
            }

            try
            {
                var created = await _userRepository.AddAsync(new Wiseravenshare.Server.Entities.User
                {
                    Id = claimUserId,
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
                var fallbackByEmail = await _userRepository.GetByEmailAsync(email);
                return fallbackByEmail?.Id ?? claimUserId;
            }
        }
    }
}