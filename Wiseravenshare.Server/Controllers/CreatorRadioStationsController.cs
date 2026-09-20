using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.DTOs.FM;
using Wiseravenshare.Server.Exceptions;
using Wiseravenshare.Server.Services.FM;
using Wiseravenshare.Server.Shared;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/fmtuner/creator-stations")]
[Authorize]
[Produces("application/json")]
public sealed class CreatorRadioStationsController : ControllerBase
{
    private readonly ICreatorRadioStationService _service;

    public CreatorRadioStationsController(ICreatorRadioStationService service)
    {
        _service = service;
    }

    [HttpGet("mine")]
    [ProducesResponseType(typeof(IEnumerable<CreatorRadioStationDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMine(CancellationToken cancellationToken)
    {
        var userId = RequireUserId();
        var stations = await _service.GetCreatorStationsAsync(userId, userId, cancellationToken);
        return Ok(stations);
    }

    [HttpGet("public")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IEnumerable<CreatorRadioStationDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetPublic([FromQuery] int page = 1, [FromQuery] int pageSize = 24, CancellationToken cancellationToken = default)
    {
        var stations = await _service.GetPublicStationsAsync(page, pageSize, GetUserIdOrDefault(), cancellationToken);
        return Ok(stations);
    }

    [HttpGet("marketplace")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IEnumerable<CreatorRadioStationDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMarketplace([FromQuery] int page = 1, [FromQuery] int pageSize = 24, CancellationToken cancellationToken = default)
    {
        // Returns monetized public stations available for subscription
        var all = await _service.GetPublicStationsAsync(page, pageSize * 3, GetUserIdOrDefault(), cancellationToken);
        var marketplace = all.Where(s => s.IsMonetized || s.SubscriptionPrice > 0).Take(pageSize);
        return Ok(marketplace);
    }

    [HttpGet("search")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IEnumerable<CreatorRadioStationDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Search([FromQuery] string query = "", [FromQuery] string? genre = null, [FromQuery] string? visibility = null, CancellationToken cancellationToken = default)
    {
        var stations = await _service.SearchStationsAsync(query, genre, visibility, GetUserIdOrDefault(), cancellationToken);
        return Ok(stations);
    }

    [HttpGet("{id:guid}")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(CreatorRadioStationDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await _service.GetStationAsync(id, GetUserIdOrDefault(), cancellationToken));
        }
        catch (NotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (UnauthorizedException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
        }
    }

    [HttpPost]
    [ProducesResponseType(typeof(CreatorRadioStationDto), StatusCodes.Status201Created)]
    public async Task<IActionResult> Create([FromBody] CreateCreatorRadioStationDto dto, CancellationToken cancellationToken)
    {
        var userId = RequireUserId();
        try
        {
            var station = await _service.CreateStationAsync(dto, userId, cancellationToken);
            return CreatedAtAction(nameof(Get), new { id = station.Id }, station);
        }
        catch (BadRequestException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPut("{id:guid}")]
    [ProducesResponseType(typeof(CreatorRadioStationDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateCreatorRadioStationDto dto, CancellationToken cancellationToken)
    {
        var userId = RequireUserId();
        try
        {
            var station = await _service.UpdateStationAsync(id, dto, userId, cancellationToken);
            return Ok(station);
        }
        catch (NotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (UnauthorizedException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
        }
        catch (BadRequestException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPatch("{id:guid}/status")]
    [ProducesResponseType(typeof(CreatorRadioStationDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] RadioStationStatusUpdateDto dto, CancellationToken cancellationToken)
    {
        var userId = RequireUserId();
        try
        {
            var station = await _service.UpdateStationStatusAsync(id, dto, userId, cancellationToken);
            return Ok(station);
        }
        catch (NotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (UnauthorizedException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
        }
        catch (BadRequestException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var userId = RequireUserId();
        try
        {
            await _service.DeleteStationAsync(id, userId, cancellationToken);
            return NoContent();
        }
        catch (NotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (UnauthorizedException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
        }
    }

    [HttpPost("{id:guid}/live/start")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> StartLive(Guid id, CancellationToken cancellationToken)
    {
        var userId = RequireUserId();
        await _service.StartLiveStreamAsync(id, userId, cancellationToken);
        return NoContent();
    }

    [HttpPost("{id:guid}/live/end")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> EndLive(Guid id, CancellationToken cancellationToken)
    {
        var userId = RequireUserId();
        await _service.EndLiveStreamAsync(id, userId, cancellationToken);
        return NoContent();
    }

    [HttpGet("{id:guid}/schedules")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IEnumerable<RadioStationScheduleDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetSchedules(Guid id, CancellationToken cancellationToken)
    {
        return Ok(await _service.GetStationSchedulesAsync(id, cancellationToken));
    }

    [HttpPost("{id:guid}/schedules")]
    [ProducesResponseType(typeof(RadioStationScheduleDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> AddSchedule(Guid id, [FromBody] CreateRadioStationScheduleDto dto, CancellationToken cancellationToken)
    {
        var userId = RequireUserId();
        return Ok(await _service.AddScheduleAsync(id, dto, userId, cancellationToken));
    }

    [HttpDelete("schedules/{scheduleId:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> DeleteSchedule(Guid scheduleId, CancellationToken cancellationToken)
    {
        var userId = RequireUserId();
        await _service.DeleteScheduleAsync(scheduleId, userId, cancellationToken);
        return NoContent();
    }

    [HttpPost("{id:guid}/follow")]
    [ProducesResponseType(typeof(RadioStationFollowDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> Follow(Guid id, CancellationToken cancellationToken)
    {
        var userId = RequireUserId();
        return Ok(await _service.FollowStationAsync(id, userId, cancellationToken));
    }

    [HttpDelete("{id:guid}/follow")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Unfollow(Guid id, CancellationToken cancellationToken)
    {
        var userId = RequireUserId();
        await _service.UnfollowStationAsync(id, userId, cancellationToken);
        return NoContent();
    }

    [HttpPost("{id:guid}/requests")]
    [ProducesResponseType(typeof(RadioStationRequestDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> RequestSong(Guid id, [FromBody] CreateRadioStationRequestDto dto, CancellationToken cancellationToken)
    {
        var userId = RequireUserId();
        return Ok(await _service.CreateRequestAsync(id, dto, userId, cancellationToken));
    }

    [HttpPost("{id:guid}/shoutouts")]
    [ProducesResponseType(typeof(RadioStationShoutoutDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> CreateShoutout(Guid id, [FromBody] CreateRadioStationShoutoutDto dto, CancellationToken cancellationToken)
    {
        var userId = RequireUserId();
        return Ok(await _service.CreateShoutoutAsync(id, dto, userId, cancellationToken));
    }

    [HttpGet("{id:guid}/analytics")]
    [ProducesResponseType(typeof(RadioStationAnalyticsDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> Analytics(Guid id, CancellationToken cancellationToken)
    {
        var userId = RequireUserId();
        return Ok(await _service.GetStationAnalyticsAsync(id, userId, cancellationToken));
    }

    private Guid RequireUserId()
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            throw new UnauthorizedException("Invalid user session.");
        }

        return userId;
    }

    private Guid GetUserIdOrDefault()
    {
        var userId = User.GetUserId();
        return userId == Guid.Empty ? Guid.Empty : userId;
    }
}
