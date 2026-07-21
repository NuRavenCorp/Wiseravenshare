// Wiseravenshare.Server/Controllers/PostsController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.DTOs.Post;
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
        private readonly ILogger<PostsController> _logger;

        public PostsController(IPostService postService, ILogger<PostsController> logger)
        {
            _postService = postService;
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
            var userId = User.GetUserId();
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
            var userId = User.GetUserId();
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
            var userId = User.GetUserId();
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
            var userId = User.GetUserId();
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
            var userId = User.GetUserId();
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
            var userId = User.GetUserId();
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
            var userId = User.GetUserId();
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
            var userId = User.GetUserId();
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
            var userId = User.GetUserId();
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
            var userId = User.GetUserId();
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
    }
}