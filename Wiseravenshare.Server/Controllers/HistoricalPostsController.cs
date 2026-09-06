// Wiseravenshare.Server/Controllers/HistoricalPostsController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers
{
    /// <summary>
    /// Controller for accessing and managing historical posts
    /// Allows users to view, review, and analyze their posts from specific dates
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class HistoricalPostsController : ControllerBase
    {
        private readonly IHistoricalPostsService _historicalPostsService;
        private readonly ILogger<HistoricalPostsController> _logger;

        public HistoricalPostsController(
            IHistoricalPostsService historicalPostsService,
            ILogger<HistoricalPostsController> logger)
        {
            _historicalPostsService = historicalPostsService;
            _logger = logger;
        }

        /// <summary>
        /// Gets the current user's ID from JWT claims
        /// </summary>
        private Guid GetUserId()
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
            if (userIdClaim == null || !Guid.TryParse(userIdClaim.Value, out var userId))
                throw new UnauthorizedAccessException("Invalid or missing user ID in token");
            return userId;
        }

        /// <summary>
        /// Get all posts created on a specific date
        /// </summary>
        /// <param name="date">Date to retrieve posts from (format: YYYY-MM-DD)</param>
        /// <param name="page">Page number (1-based)</param>
        /// <param name="pageSize">Items per page</param>
        /// <returns>Posts from the specified date with pagination</returns>
        [HttpGet("by-date")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        public async Task<ActionResult<DailyPostsArchiveResponse>> GetPostsByDate(
            [FromQuery] DateTime date,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 20)
        {
            try
            {
                if (page < 1) page = 1;
                if (pageSize < 1 || pageSize > 100) pageSize = 20;

                var userId = GetUserId();
                var result = await _historicalPostsService.GetPostsByDateAsync(userId, date, page, pageSize);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving posts by date");
                return StatusCode(500, new { message = "Error retrieving posts" });
            }
        }

        /// <summary>
        /// Get posts within a date range
        /// </summary>
        /// <param name="startDate">Start date (format: YYYY-MM-DD)</param>
        /// <param name="endDate">End date (format: YYYY-MM-DD)</param>
        /// <param name="page">Page number (1-based)</param>
        /// <param name="pageSize">Items per page</param>
        /// <returns>Posts within date range with pagination</returns>
        [HttpGet("by-date-range")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        public async Task<ActionResult<DailyPostsArchiveResponse>> GetPostsByDateRange(
            [FromQuery] DateTime startDate,
            [FromQuery] DateTime endDate,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 20)
        {
            try
            {
                if (page < 1) page = 1;
                if (pageSize < 1 || pageSize > 100) pageSize = 20;

                var userId = GetUserId();
                var result = await _historicalPostsService.GetPostsForDateRangeAsync(userId, startDate, endDate, page, pageSize);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving posts by date range");
                return StatusCode(500, new { message = "Error retrieving posts" });
            }
        }

        /// <summary>
        /// Get monthly summary of posts grouped by day
        /// </summary>
        /// <param name="year">Year</param>
        /// <param name="month">Month (1-12)</param>
        /// <returns>Daily summaries for the month</returns>
        [HttpGet("month/{year}/{month}")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        public async Task<ActionResult<IEnumerable<PostDateSummary>>> GetMonthSummary(int year, int month)
        {
            try
            {
                if (month < 1 || month > 12)
                    return BadRequest(new { message = "Month must be between 1 and 12" });

                var userId = GetUserId();
                var result = await _historicalPostsService.GetMonthSummaryAsync(userId, year, month);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving month summary");
                return StatusCode(500, new { message = "Error retrieving summary" });
            }
        }

        /// <summary>
        /// Get yearly summary of posts grouped by day
        /// </summary>
        /// <param name="year">Year to retrieve</param>
        /// <returns>Daily summaries for the year</returns>
        [HttpGet("year/{year}")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        public async Task<ActionResult<IEnumerable<PostDateSummary>>> GetYearSummary(int year)
        {
            try
            {
                if (year < 2000 || year > DateTime.Now.Year + 1)
                    return BadRequest(new { message = "Invalid year" });

                var userId = GetUserId();
                var result = await _historicalPostsService.GetYearSummaryAsync(userId, year);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving year summary");
                return StatusCode(500, new { message = "Error retrieving summary" });
            }
        }

        /// <summary>
        /// Get posts from a specific week
        /// </summary>
        /// <param name="weekStartDate">First day of the week (format: YYYY-MM-DD)</param>
        /// <param name="page">Page number (1-based)</param>
        /// <param name="pageSize">Items per page</param>
        /// <returns>Posts from the week with pagination</returns>
        [HttpGet("by-week")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        public async Task<ActionResult<DailyPostsArchiveResponse>> GetPostsByWeek(
            [FromQuery] DateTime weekStartDate,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 20)
        {
            try
            {
                if (page < 1) page = 1;
                if (pageSize < 1 || pageSize > 100) pageSize = 20;

                var userId = GetUserId();
                var result = await _historicalPostsService.GetPostsByWeekAsync(userId, weekStartDate, page, pageSize);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving posts by week");
                return StatusCode(500, new { message = "Error retrieving posts" });
            }
        }

        /// <summary>
        /// Get historical timeline showing the last N days of posts
        /// </summary>
        /// <param name="daysBack">Number of days to look back (default: 30)</param>
        /// <returns>Timeline of past days with post counts and engagement</returns>
        [HttpGet("timeline")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        public async Task<ActionResult<IEnumerable<HistoricalDaySnapshot>>> GetHistoricalTimeline(
            [FromQuery] int daysBack = 30)
        {
            try
            {
                if (daysBack < 1) daysBack = 30;
                if (daysBack > 365) daysBack = 365;

                var userId = GetUserId();
                var result = await _historicalPostsService.GetHistoricalTimelineAsync(userId, daysBack);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving historical timeline");
                return StatusCode(500, new { message = "Error retrieving timeline" });
            }
        }

        /// <summary>
        /// Get statistics about posts in a date range
        /// Includes engagement metrics, averages, and highlights
        /// </summary>
        /// <param name="startDate">Start date (format: YYYY-MM-DD)</param>
        /// <param name="endDate">End date (format: YYYY-MM-DD)</param>
        /// <returns>Statistics for the date range</returns>
        [HttpGet("statistics")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        public async Task<ActionResult<PostStatisticsResponse>> GetPostStatistics(
            [FromQuery] DateTime startDate,
            [FromQuery] DateTime endDate)
        {
            try
            {
                if (endDate < startDate)
                    return BadRequest(new { message = "End date must be after start date" });

                var userId = GetUserId();
                var result = await _historicalPostsService.GetPostStatisticsAsync(userId, startDate, endDate);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving post statistics");
                return StatusCode(500, new { message = "Error retrieving statistics" });
            }
        }

        /// <summary>
        /// Check if user has posts for a specific date
        /// </summary>
        /// <param name="date">Date to check (format: YYYY-MM-DD)</param>
        /// <returns>Boolean indicating if posts exist for the date</returns>
        [HttpGet("has-posts")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        public async Task<ActionResult<object>> HasPostsForDate([FromQuery] DateTime date)
        {
            try
            {
                var userId = GetUserId();
                var hasPosts = await _historicalPostsService.HasPostsForDateAsync(userId, date);
                return Ok(new { date = date.Date, hasPosts });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking posts for date");
                return StatusCode(500, new { message = "Error checking posts" });
            }
        }

        /// <summary>
        /// Get today's posts
        /// </summary>
        /// <param name="page">Page number (1-based)</param>
        /// <param name="pageSize">Items per page</param>
        /// <returns>Today's posts with pagination</returns>
        [HttpGet("today")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        public async Task<ActionResult<DailyPostsArchiveResponse>> GetTodaysPosts(
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 20)
        {
            try
            {
                var userId = GetUserId();
                var result = await _historicalPostsService.GetPostsByDateAsync(userId, DateTime.Now, page, pageSize);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving today's posts");
                return StatusCode(500, new { message = "Error retrieving posts" });
            }
        }

        /// <summary>
        /// Get yesterday's posts
        /// </summary>
        /// <param name="page">Page number (1-based)</param>
        /// <param name="pageSize">Items per page</param>
        /// <returns>Yesterday's posts with pagination</returns>
        [HttpGet("yesterday")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        public async Task<ActionResult<DailyPostsArchiveResponse>> GetYesterdaysPosts(
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 20)
        {
            try
            {
                var userId = GetUserId();
                var yesterday = DateTime.Now.AddDays(-1);
                var result = await _historicalPostsService.GetPostsByDateAsync(userId, yesterday, page, pageSize);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving yesterday's posts");
                return StatusCode(500, new { message = "Error retrieving posts" });
            }
        }

        /// <summary>
        /// Get this week's posts
        /// </summary>
        /// <param name="page">Page number (1-based)</param>
        /// <param name="pageSize">Items per page</param>
        /// <returns>This week's posts with pagination</returns>
        [HttpGet("this-week")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        public async Task<ActionResult<DailyPostsArchiveResponse>> GetThisWeeksPosts(
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 20)
        {
            try
            {
                var userId = GetUserId();
                var now = DateTime.Now;
                var weekStart = now.AddDays(-(int)now.DayOfWeek);
                var result = await _historicalPostsService.GetPostsByWeekAsync(userId, weekStart, page, pageSize);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving this week's posts");
                return StatusCode(500, new { message = "Error retrieving posts" });
            }
        }

        /// <summary>
        /// Get this month's posts
        /// </summary>
        /// <returns>Daily summaries for this month</returns>
        [HttpGet("this-month")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        public async Task<ActionResult<IEnumerable<PostDateSummary>>> GetThisMonthsPosts()
        {
            try
            {
                var userId = GetUserId();
                var now = DateTime.Now;
                var result = await _historicalPostsService.GetMonthSummaryAsync(userId, now.Year, now.Month);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving this month's posts");
                return StatusCode(500, new { message = "Error retrieving posts" });
            }
        }
    }
}
