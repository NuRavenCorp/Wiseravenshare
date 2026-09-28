namespace Wiseravenshare.Server.Controllers;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.DTOs;
using Wiseravenshare.Server.Services;
using System.Security.Claims;

/// <summary>
/// Workspace Pages API
/// 
/// Manages persistent pages for scripts, subject matter, props, and references.
/// Pages are tied to sessions and persist across session closure.
/// All team members in a session can access all pages.
/// </summary>
[ApiController]
[Route("api/workspace-pages")]
[Authorize]
public class WorkspacePagesController : ControllerBase
{
    private readonly IWorkspacePageService _pageService;
    private readonly ILogger<WorkspacePagesController> _logger;

    public WorkspacePagesController(IWorkspacePageService pageService, ILogger<WorkspacePagesController> logger)
    {
        _pageService = pageService;
        _logger = logger;
    }

    private string GetUserId()
    {
        return User.FindFirst(ClaimTypes.NameIdentifier)?.Value 
            ?? throw new UnauthorizedAccessException("User ID not found in token");
    }

    /// <summary>
    /// POST /api/workspace-pages/create
    /// Create a new persistent workspace page
    /// </summary>
    [HttpPost("create")]
    public async Task<ActionResult<WorkspacePageDto>> CreatePage([FromBody] CreateOrUpdateWorkspacePageRequest request)
    {
        try
        {
            var userId = GetUserId();

            if (string.IsNullOrWhiteSpace(request.SessionId))
                return BadRequest("SessionId is required");

            if (string.IsNullOrWhiteSpace(request.Title))
                return BadRequest("Title is required");

            var page = await _pageService.CreatePageAsync(request.SessionId, userId, request);
            _logger.LogInformation($"User {userId} created page {page.Id}");
            return Ok(page);
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error creating page: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// PUT /api/workspace-pages/{pageId}
    /// Update an existing page
    /// </summary>
    [HttpPut("{pageId}")]
    public async Task<ActionResult<WorkspacePageDto>> UpdatePage(string pageId, [FromBody] CreateOrUpdateWorkspacePageRequest request)
    {
        try
        {
            var userId = GetUserId();

            if (string.IsNullOrWhiteSpace(pageId))
                return BadRequest("PageId is required");

            var page = await _pageService.UpdatePageAsync(pageId, userId, request);
            _logger.LogInformation($"User {userId} updated page {pageId}");
            return Ok(page);
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error updating page: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// GET /api/workspace-pages/session/{sessionId}
    /// Get all active pages in a session
    /// </summary>
    [HttpGet("session/{sessionId}")]
    public async Task<ActionResult<List<WorkspacePageDto>>> GetSessionPages(string sessionId)
    {
        try
        {
            var pages = await _pageService.GetSessionPagesAsync(sessionId);
            return Ok(pages);
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error getting session pages: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// GET /api/workspace-pages/session/{sessionId}/type/{pageType}
    /// Get all pages of a specific type (e.g., "script", "props")
    /// </summary>
    [HttpGet("session/{sessionId}/type/{pageType}")]
    public async Task<ActionResult<List<WorkspacePageDto>>> GetPagesByType(string sessionId, string pageType)
    {
        try
        {
            var pages = await _pageService.GetPagesByTypeAsync(sessionId, pageType);
            return Ok(pages);
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error getting pages by type: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// GET /api/workspace-pages/{pageId}
    /// Get a single page by ID
    /// </summary>
    [HttpGet("{pageId}")]
    public async Task<ActionResult<WorkspacePageDto>> GetPage(string pageId)
    {
        try
        {
            var page = await _pageService.GetPageAsync(pageId);
            if (page == null)
                return NotFound(new { error = "Page not found or archived" });

            return Ok(page);
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error getting page: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// POST /api/workspace-pages/{pageId}/archive
    /// Archive (soft delete) a page
    /// </summary>
    [HttpPost("{pageId}/archive")]
    public async Task<ActionResult<object>> ArchivePage(string pageId)
    {
        try
        {
            var userId = GetUserId();

            if (string.IsNullOrWhiteSpace(pageId))
                return BadRequest("PageId is required");

            var success = await _pageService.ArchivePageAsync(pageId, userId);
            if (!success)
                return NotFound(new { error = "Page not found" });

            _logger.LogInformation($"User {userId} archived page {pageId}");
            return Ok(new { success = true, message = "Page archived successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error archiving page: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// DELETE /api/workspace-pages/{pageId}
    /// Permanently delete a page
    /// </summary>
    [HttpDelete("{pageId}")]
    public async Task<ActionResult<object>> DeletePage(string pageId)
    {
        try
        {
            var userId = GetUserId();

            if (string.IsNullOrWhiteSpace(pageId))
                return BadRequest("PageId is required");

            var success = await _pageService.DeletePageAsync(pageId);
            if (!success)
                return NotFound(new { error = "Page not found" });

            _logger.LogInformation($"User {userId} permanently deleted page {pageId}");
            return Ok(new { success = true, message = "Page deleted successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error deleting page: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// GET /api/workspace-pages/session/{sessionId}/search?q=query
    /// Search pages by title, content, or tags
    /// </summary>
    [HttpGet("session/{sessionId}/search")]
    public async Task<ActionResult<List<WorkspacePageDto>>> SearchPages(string sessionId, [FromQuery] string q)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(q))
                return BadRequest("Search query (q) is required");

            var results = await _pageService.SearchPagesAsync(sessionId, q);
            return Ok(results);
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error searching pages: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }
}
