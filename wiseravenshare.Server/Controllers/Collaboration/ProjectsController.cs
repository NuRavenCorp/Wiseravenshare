// Wiseravenshare.Server/Controllers/Collaboration/ProjectsController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.DTOs.Collaboration;
using Wiseravenshare.Server.Entities.Collaboration;
using Wiseravenshare.Server.Enums;
using Wiseravenshare.Server.Interfaces.Services;
using Wiseravenshare.Server.Validators;

namespace Wiseravenshare.Server.Controllers.Collaboration;

[ApiController]
[Route("api/[controller]")]
[Authorize]
[Produces("application/json")]
public class ProjectsController : ControllerBase
{
    private readonly IProjectService _projectService;
    private readonly IPlatformPublishService _publishService;
    private readonly ILogger<ProjectsController> _logger;

    public ProjectsController(
        IProjectService projectService,
        IPlatformPublishService publishService,
        ILogger<ProjectsController> logger)
    {
        _projectService = projectService;
        _publishService = publishService;
        _logger = logger;
    }

    [HttpGet("my")]
    public async Task<IActionResult> GetMyProjects([FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        var userId = User.GetUserId();
        var projects = await _projectService.GetUserProjectsAsync(userId, page, Math.Min(pageSize, 100));
        return Ok(projects);
    }

    [HttpGet]
    public async Task<IActionResult> GetPublicProjects([FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        var projects = await _projectService.GetUserProjectsAsync(User.GetUserId(), page, Math.Min(pageSize, 100));
        return Ok(projects);
    }

    [HttpPost]
    public async Task<IActionResult> CreateProject([FromBody] CreateProjectDto dto)
    {
        try
        {
            dto.Validate();
            var userId = User.GetUserId();
            var project = await _projectService.CreateProjectAsync(dto, userId);
            return CreatedAtAction(nameof(GetProject), new { id = project.Id }, project);
        }
        catch (System.ComponentModel.DataAnnotations.ValidationException ex)
        {
            return BadRequest(new ErrorResponse { Error = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new ErrorResponse { Error = ex.Message });
        }
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetProject(Guid id)
    {
        try
        {
            var project = await _projectService.GetProjectAsync(id, User.GetUserId());
            return Ok(project);
        }
        catch (Exceptions.NotFoundException)
        {
            return NotFound(new ErrorResponse { Error = "Project not found" });
        }
        catch (Exceptions.UnauthorizedException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new ErrorResponse { Error = ex.Message });
        }
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> UpdateProject(Guid id, [FromBody] UpdateProjectDto dto)
    {
        try
        {
            var project = await _projectService.UpdateProjectAsync(id, dto, User.GetUserId());
            return Ok(project);
        }
        catch (Exceptions.NotFoundException)
        {
            return NotFound(new ErrorResponse { Error = "Project not found" });
        }
        catch (Exceptions.UnauthorizedException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new ErrorResponse { Error = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new ErrorResponse { Error = ex.Message });
        }
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteProject(Guid id)
    {
        try
        {
            var ok = await _projectService.DeleteProjectAsync(id, User.GetUserId());
            return ok ? NoContent() : BadRequest(new ErrorResponse { Error = "Could not delete project" });
        }
        catch (Exceptions.NotFoundException)
        {
            return NotFound(new ErrorResponse { Error = "Project not found" });
        }
        catch (Exceptions.UnauthorizedException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new ErrorResponse { Error = ex.Message });
        }
    }

    // ── Members ─────────────────────────────────────────────────────────────────

    [HttpPost("{projectId:guid}/members")]
    public async Task<IActionResult> AddMember(Guid projectId, [FromBody] AddMemberDto dto)
    {
        try
        {
            dto.Validate();
            var member = await _projectService.AddMemberAsync(projectId, dto, User.GetUserId());
            return Ok(member);
        }
        catch (System.ComponentModel.DataAnnotations.ValidationException ex)
        {
            return BadRequest(new ErrorResponse { Error = ex.Message });
        }
        catch (Exceptions.NotFoundException ex)
        {
            return NotFound(new ErrorResponse { Error = ex.Message });
        }
        catch (Exception ex) when (ex is InvalidOperationException or Exceptions.UnauthorizedException)
        {
            return StatusCode(
                ex is Exceptions.UnauthorizedException ? StatusCodes.Status403Forbidden : StatusCodes.Status400BadRequest,
                new ErrorResponse { Error = ex.Message });
        }
    }

    [HttpDelete("{projectId:guid}/members/{memberId:guid}")]
    public async Task<IActionResult> RemoveMember(Guid projectId, Guid memberId)
    {
        try
        {
            var ok = await _projectService.RemoveMemberAsync(projectId, memberId, User.GetUserId());
            return ok ? NoContent() : BadRequest(new ErrorResponse { Error = "Could not remove member" });
        }
        catch (Exception ex) when (ex is Exceptions.NotFoundException or Exceptions.UnauthorizedException or InvalidOperationException)
        {
            return StatusCode(
                ex is Exceptions.UnauthorizedException ? StatusCodes.Status403Forbidden
                : ex is Exceptions.NotFoundException ? StatusCodes.Status404NotFound
                : StatusCodes.Status400BadRequest,
                new ErrorResponse { Error = ex.Message });
        }
    }

    [HttpPut("{projectId:guid}/members/{memberId:guid}/role")]
    public async Task<IActionResult> UpdateMemberRole(Guid projectId, Guid memberId, [FromBody] UpdateRoleRequest request)
    {
        try
        {
            if (!Enum.TryParse<ProjectRole>(request.Role, true, out var role))
                return BadRequest(new ErrorResponse { Error = $"'{request.Role}' is not a valid project role" });

            var member = await _projectService.UpdateMemberRoleAsync(projectId, memberId, role, User.GetUserId());
            return Ok(member);
        }
        catch (Exception ex) when (ex is Exceptions.NotFoundException or Exceptions.UnauthorizedException)
        {
            return StatusCode(
                ex is Exceptions.UnauthorizedException ? StatusCodes.Status403Forbidden : StatusCodes.Status404NotFound,
                new ErrorResponse { Error = ex.Message });
        }
    }

    [HttpGet("{projectId:guid}/members")]
    public async Task<IActionResult> GetMembers(Guid projectId)
        => Ok(await _projectService.GetProjectMembersAsync(projectId));

    // ── Invites ─────────────────────────────────────────────────────────────────

    [HttpPost("{projectId:guid}/invite")]
    public async Task<IActionResult> InviteCollaborator(Guid projectId, [FromBody] InviteCollaboratorDto dto)
    {
        try
        {
            dto.Validate();
            var invite = await _projectService.InviteCollaboratorAsync(projectId, dto, User.GetUserId());
            return Ok(invite);
        }
        catch (System.ComponentModel.DataAnnotations.ValidationException ex)
        {
            return BadRequest(new ErrorResponse { Error = ex.Message });
        }
        catch (Exception ex) when (ex is Exceptions.NotFoundException or Exceptions.UnauthorizedException or InvalidOperationException)
        {
            return StatusCode(
                ex is Exceptions.UnauthorizedException ? StatusCodes.Status403Forbidden
                : ex is Exceptions.NotFoundException ? StatusCodes.Status404NotFound
                : StatusCodes.Status400BadRequest,
                new ErrorResponse { Error = ex.Message });
        }
    }

    [HttpPost("invites/{inviteId:guid}/accept")]
    public async Task<IActionResult> AcceptInvite(Guid inviteId)
    {
        try
        {
            var ok = await _projectService.AcceptInviteAsync(inviteId, User.GetUserId());
            return ok ? NoContent() : BadRequest(new ErrorResponse { Error = "Could not accept invite" });
        }
        catch (Exception ex) when (ex is Exceptions.NotFoundException or Exceptions.UnauthorizedException or InvalidOperationException)
        {
            return StatusCode(
                ex is Exceptions.UnauthorizedException ? StatusCodes.Status403Forbidden
                : ex is Exceptions.NotFoundException ? StatusCodes.Status404NotFound
                : StatusCodes.Status400BadRequest,
                new ErrorResponse { Error = ex.Message });
        }
    }

    [HttpPost("invites/{inviteId:guid}/decline")]
    public async Task<IActionResult> DeclineInvite(Guid inviteId)
    {
        try
        {
            var ok = await _projectService.DeclineInviteAsync(inviteId, User.GetUserId());
            return ok ? NoContent() : BadRequest(new ErrorResponse { Error = "Could not decline invite" });
        }
        catch (Exception ex) when (ex is Exceptions.NotFoundException or Exceptions.UnauthorizedException or InvalidOperationException)
        {
            return StatusCode(
                ex is Exceptions.UnauthorizedException ? StatusCodes.Status403Forbidden
                : ex is Exceptions.NotFoundException ? StatusCodes.Status404NotFound
                : StatusCodes.Status400BadRequest,
                new ErrorResponse { Error = ex.Message });
        }
    }

    // ── Content ─────────────────────────────────────────────────────────────────

    [HttpPost("{projectId:guid}/content")]
    public async Task<IActionResult> AddContent(Guid projectId, [FromBody] AddContentDto dto)
    {
        try
        {
            dto.Validate();
            var content = await _projectService.AddContentAsync(projectId, dto, User.GetUserId());
            return CreatedAtAction(nameof(GetProject), new { id = projectId }, content);
        }
        catch (System.ComponentModel.DataAnnotations.ValidationException ex)
        {
            return BadRequest(new ErrorResponse { Error = ex.Message });
        }
        catch (Exception ex) when (ex is Exceptions.NotFoundException or Exceptions.UnauthorizedException)
        {
            return StatusCode(
                ex is Exceptions.UnauthorizedException ? StatusCodes.Status403Forbidden : StatusCodes.Status404NotFound,
                new ErrorResponse { Error = ex.Message });
        }
    }

    [HttpPut("content/{contentId:guid}")]
    public async Task<IActionResult> UpdateContent(Guid contentId, [FromBody] UpdateContentDto dto)
    {
        try
        {
            var content = await _projectService.UpdateContentAsync(contentId, dto, User.GetUserId());
            return Ok(content);
        }
        catch (Exception ex) when (ex is Exceptions.NotFoundException or Exceptions.UnauthorizedException)
        {
            return StatusCode(
                ex is Exceptions.UnauthorizedException ? StatusCodes.Status403Forbidden : StatusCodes.Status404NotFound,
                new ErrorResponse { Error = ex.Message });
        }
    }

    [HttpDelete("content/{contentId:guid}")]
    public async Task<IActionResult> DeleteContent(Guid contentId)
    {
        try
        {
            var ok = await _projectService.DeleteContentAsync(contentId, User.GetUserId());
            return ok ? NoContent() : BadRequest(new ErrorResponse { Error = "Could not delete content" });
        }
        catch (Exception ex) when (ex is Exceptions.NotFoundException or Exceptions.UnauthorizedException)
        {
            return StatusCode(
                ex is Exceptions.UnauthorizedException ? StatusCodes.Status403Forbidden : StatusCodes.Status404NotFound,
                new ErrorResponse { Error = ex.Message });
        }
    }

    [HttpGet("{projectId:guid}/content")]
    public async Task<IActionResult> GetContent(Guid projectId)
        => Ok(await _projectService.GetProjectContentAsync(projectId));

    // ── Comments & Activity ─────────────────────────────────────────────────────

    [HttpPost("{projectId:guid}/comments")]
    public async Task<IActionResult> AddComment(Guid projectId, [FromBody] AddCommentDto dto)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(dto.Text))
                return BadRequest(new ErrorResponse { Error = "Comment text is required" });

            var comment = await _projectService.AddCommentAsync(projectId, dto, User.GetUserId());
            return Ok(comment);
        }
        catch (Exception ex) when (ex is Exceptions.NotFoundException or InvalidOperationException)
        {
            return StatusCode(
                ex is InvalidOperationException ? StatusCodes.Status400BadRequest : StatusCodes.Status404NotFound,
                new ErrorResponse { Error = ex.Message });
        }
    }

    [HttpGet("{projectId:guid}/activity")]
    public async Task<IActionResult> GetActivity(Guid projectId, [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
        => Ok(await _projectService.GetProjectActivityAsync(projectId, page, Math.Min(pageSize, 100)));

    // ── Publishing ──────────────────────────────────────────────────────────────

    [HttpPost("{projectId:guid}/publish")]
    public async Task<IActionResult> PublishToPlatforms(Guid projectId, [FromBody] PublishContentDto dto)
    {
        try
        {
            dto.Validate();
        }
        catch (System.ComponentModel.DataAnnotations.ValidationException ex)
        {
            return BadRequest(new ErrorResponse { Error = ex.Message });
        }

        var userId = User.GetUserId();
        var results = new List<PlatformPublish>();
        var errors = new List<string>();

        foreach (var platform in dto.Platforms)
        {
            try
            {
                results.Add(await _publishService.PublishToPlatformAsync(dto.ContentId, platform, dto.PlatformSettings));
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to publish content {ContentId} to {Platform}", dto.ContentId, platform);
                errors.Add($"{platform}: {ex.Message}");
            }
        }

        if (results.Count == 0 && errors.Count > 0)
            return StatusCode(StatusCodes.Status502BadGateway, new ErrorResponse { Error = "All platform publishes failed", Details = string.Join("; ", errors) });

        return Ok(new { published = results, errors });
    }

    [HttpPost("{projectId:guid}/schedule")]
    public async Task<IActionResult> SchedulePublish(Guid projectId, [FromBody] SchedulePublishDto dto)
    {
        var results = new List<PlatformPublish>();
        var errors = new List<string>();

        foreach (var schedule in dto.Schedules)
        {
            try
            {
                schedule.Validate();
                results.Add(await _publishService.SchedulePublishAsync(
                    schedule.ContentId, schedule.Platform, schedule.ScheduledTime, schedule.PlatformSettings));
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to schedule content {ContentId} to {Platform}", schedule.ContentId, schedule.Platform);
                errors.Add($"{schedule.Platform}: {ex.Message}");
            }
        }

        return Ok(new { scheduled = results, errors });
    }

    [HttpGet("content/{contentId:guid}/publishes")]
    public async Task<IActionResult> GetPublishes(Guid contentId)
        => Ok(await _publishService.GetPlatformPublishesAsync(contentId));

    [HttpPost("publishes/{publishId:guid}/retry")]
    public async Task<IActionResult> RetryPublish(Guid publishId)
    {
        try
        {
            var ok = await _publishService.RetryPublishAsync(publishId);
            return ok ? Ok(new { status = "Published" }) : BadRequest(new ErrorResponse { Error = "Publish cannot be retried" });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new ErrorResponse { Error = ex.Message });
        }
    }

    [HttpPost("publishes/{publishId:guid}/cancel")]
    public async Task<IActionResult> CancelPublish(Guid publishId)
    {
        var ok = await _publishService.CancelPublishAsync(publishId);
        return ok ? NoContent() : BadRequest(new ErrorResponse { Error = "Publish cannot be cancelled" });
    }

    [HttpGet("content/{contentId:guid}/analytics")]
    public async Task<IActionResult> GetContentAnalytics(Guid contentId)
        => Ok(await _publishService.GetCrossPlatformAnalyticsAsync(contentId));
}

public class UpdateRoleRequest
{
    public string Role { get; set; } = string.Empty;
}
