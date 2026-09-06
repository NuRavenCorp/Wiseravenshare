// Wiseravenshare.Server/Services/HistoricalPostsService.cs
using Microsoft.Extensions.Logging;
using Wiseravenshare.Server.DTOs.Post;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Interfaces.Repositories;

namespace Wiseravenshare.Server.Services
{
    /// <summary>
    /// Service for managing historical posts and daily post archives
    /// Provides functionality to organize, retrieve, and review posts from specific dates
    /// </summary>
    public interface IHistoricalPostsService
    {
        Task<DailyPostsArchiveResponse> GetPostsByDateAsync(Guid userId, DateTime date, int page = 1, int pageSize = 20);
        Task<DailyPostsArchiveResponse> GetPostsForDateRangeAsync(Guid userId, DateTime startDate, DateTime endDate, int page = 1, int pageSize = 20);
        Task<IEnumerable<PostDateSummary>> GetMonthSummaryAsync(Guid userId, int year, int month);
        Task<IEnumerable<PostDateSummary>> GetYearSummaryAsync(Guid userId, int year);
        Task<DailyPostsArchiveResponse> GetPostsByWeekAsync(Guid userId, DateTime weekStartDate, int page = 1, int pageSize = 20);
        Task<IEnumerable<HistoricalDaySnapshot>> GetHistoricalTimelineAsync(Guid userId, int daysBack = 30);
        Task<PostStatisticsResponse> GetPostStatisticsAsync(Guid userId, DateTime startDate, DateTime endDate);
        Task AutoSavePostToDailyArchiveAsync(Guid postId);
        Task<bool> HasPostsForDateAsync(Guid userId, DateTime date);
    }

    public class HistoricalPostsService : IHistoricalPostsService
    {
        private readonly IPostRepository _postRepository;
        private readonly IUserRepository _userRepository;
        private readonly ILogger<HistoricalPostsService> _logger;

        public HistoricalPostsService(
            IPostRepository postRepository,
            IUserRepository userRepository,
            ILogger<HistoricalPostsService> logger)
        {
            _postRepository = postRepository;
            _userRepository = userRepository;
            _logger = logger;
        }

        /// <summary>
        /// Get all posts created on a specific date
        /// </summary>
        public async Task<DailyPostsArchiveResponse> GetPostsByDateAsync(Guid userId, DateTime date, int page = 1, int pageSize = 20)
        {
            _logger.LogInformation("Fetching posts for user {UserId} on date {Date}", userId, date.Date);

            var startOfDay = date.Date;
            var endOfDay = startOfDay.AddDays(1).AddTicks(-1);

            var query = _postRepository.GetAll()
                .Where(p => p.UserId == userId 
                    && !p.IsDeleted 
                    && p.CreatedAt >= startOfDay 
                    && p.CreatedAt <= endOfDay)
                .OrderByDescending(p => p.CreatedAt);

            var totalCount = query.Count();
            var posts = query
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToList();

            return new DailyPostsArchiveResponse
            {
                Date = startOfDay,
                DayOfWeek = startOfDay.DayOfWeek.ToString(),
                Posts = posts.Select(MapToPostDto).ToList(),
                TotalPostsForDay = totalCount,
                Page = page,
                PageSize = pageSize,
                TotalPages = (int)Math.Ceiling(totalCount / (double)pageSize)
            };
        }

        /// <summary>
        /// Get posts created between two dates
        /// </summary>
        public async Task<DailyPostsArchiveResponse> GetPostsForDateRangeAsync(Guid userId, DateTime startDate, DateTime endDate, int page = 1, int pageSize = 20)
        {
            _logger.LogInformation("Fetching posts for user {UserId} between {StartDate} and {EndDate}", userId, startDate, endDate);

            if (endDate < startDate)
                endDate = startDate.AddDays(1);

            var query = _postRepository.GetAll()
                .Where(p => p.UserId == userId 
                    && !p.IsDeleted 
                    && p.CreatedAt >= startDate.Date 
                    && p.CreatedAt < endDate.Date.AddDays(1))
                .OrderByDescending(p => p.CreatedAt);

            var totalCount = query.Count();
            var posts = query
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToList();

            return new DailyPostsArchiveResponse
            {
                Date = startDate,
                DayOfWeek = $"{startDate:MMMM dd} - {endDate:MMMM dd}",
                Posts = posts.Select(MapToPostDto).ToList(),
                TotalPostsForDay = totalCount,
                Page = page,
                PageSize = pageSize,
                TotalPages = (int)Math.Ceiling(totalCount / (double)pageSize)
            };
        }

        /// <summary>
        /// Get posts grouped by day for a specific month
        /// </summary>
        public async Task<IEnumerable<PostDateSummary>> GetMonthSummaryAsync(Guid userId, int year, int month)
        {
            _logger.LogInformation("Fetching month summary for user {UserId}, {Year}-{Month}", userId, year, month);

            var startDate = new DateTime(year, month, 1);
            var endDate = startDate.AddMonths(1);

            var posts = _postRepository.GetAll()
                .Where(p => p.UserId == userId 
                    && !p.IsDeleted 
                    && p.CreatedAt >= startDate 
                    && p.CreatedAt < endDate)
                .ToList();

            var groupedByDay = posts
                .GroupBy(p => p.CreatedAt.Date)
                .OrderByDescending(g => g.Key)
                .Select(g => new PostDateSummary
                {
                    Date = g.Key,
                    DayOfWeek = g.Key.DayOfWeek.ToString(),
                    PostCount = g.Count(),
                    LikeCount = g.Sum(p => p.LikesCount),
                    RepostCount = g.Sum(p => p.RepostsCount),
                    CommentCount = g.Sum(p => p.CommentsCount),
                    PreviewText = g.OrderByDescending(p => p.CreatedAt).FirstOrDefault()?.Content ?? "No posts"
                })
                .ToList();

            return groupedByDay;
        }

        /// <summary>
        /// Get posts grouped by day for a specific year
        /// </summary>
        public async Task<IEnumerable<PostDateSummary>> GetYearSummaryAsync(Guid userId, int year)
        {
            _logger.LogInformation("Fetching year summary for user {UserId}, {Year}", userId, year);

            var startDate = new DateTime(year, 1, 1);
            var endDate = new DateTime(year, 12, 31).AddDays(1);

            var posts = _postRepository.GetAll()
                .Where(p => p.UserId == userId 
                    && !p.IsDeleted 
                    && p.CreatedAt >= startDate 
                    && p.CreatedAt < endDate)
                .ToList();

            var groupedByDay = posts
                .GroupBy(p => p.CreatedAt.Date)
                .OrderByDescending(g => g.Key)
                .Select(g => new PostDateSummary
                {
                    Date = g.Key,
                    DayOfWeek = g.Key.DayOfWeek.ToString(),
                    PostCount = g.Count(),
                    LikeCount = g.Sum(p => p.LikesCount),
                    RepostCount = g.Sum(p => p.RepostsCount),
                    CommentCount = g.Sum(p => p.CommentsCount),
                    PreviewText = g.OrderByDescending(p => p.CreatedAt).FirstOrDefault()?.Content ?? "No posts"
                })
                .ToList();

            return groupedByDay;
        }

        /// <summary>
        /// Get posts from a specific week
        /// </summary>
        public async Task<DailyPostsArchiveResponse> GetPostsByWeekAsync(Guid userId, DateTime weekStartDate, int page = 1, int pageSize = 20)
        {
            _logger.LogInformation("Fetching posts for week starting {WeekStartDate}", weekStartDate);

            var startOfWeek = weekStartDate.Date;
            var endOfWeek = startOfWeek.AddDays(7);

            var query = _postRepository.GetAll()
                .Where(p => p.UserId == userId 
                    && !p.IsDeleted 
                    && p.CreatedAt >= startOfWeek 
                    && p.CreatedAt < endOfWeek)
                .OrderByDescending(p => p.CreatedAt);

            var totalCount = query.Count();
            var posts = query
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToList();

            return new DailyPostsArchiveResponse
            {
                Date = startOfWeek,
                DayOfWeek = $"Week of {startOfWeek:MMMM dd, yyyy}",
                Posts = posts.Select(MapToPostDto).ToList(),
                TotalPostsForDay = totalCount,
                Page = page,
                PageSize = pageSize,
                TotalPages = (int)Math.Ceiling(totalCount / (double)pageSize)
            };
        }

        /// <summary>
        /// Get historical timeline showing posts from the past N days
        /// </summary>
        public async Task<IEnumerable<HistoricalDaySnapshot>> GetHistoricalTimelineAsync(Guid userId, int daysBack = 30)
        {
            _logger.LogInformation("Fetching historical timeline for user {UserId}, last {DaysBack} days", userId, daysBack);

            var startDate = DateTime.UtcNow.AddDays(-daysBack).Date;
            var endDate = DateTime.UtcNow.Date.AddDays(1);

            var posts = _postRepository.GetAll()
                .Where(p => p.UserId == userId 
                    && !p.IsDeleted 
                    && p.CreatedAt >= startDate 
                    && p.CreatedAt < endDate)
                .ToList();

            var timeline = new List<HistoricalDaySnapshot>();

            for (int i = daysBack - 1; i >= 0; i--)
            {
                var currentDate = DateTime.UtcNow.AddDays(-i).Date;
                var dayPosts = posts
                    .Where(p => p.CreatedAt.Date == currentDate)
                    .OrderByDescending(p => p.CreatedAt)
                    .ToList();

                if (dayPosts.Any() || i == 0) // Always include today even if no posts
                {
                    timeline.Add(new HistoricalDaySnapshot
                    {
                        Date = currentDate,
                        DayOfWeek = currentDate.DayOfWeek.ToString(),
                        PostCount = dayPosts.Count,
                        TotalEngagement = dayPosts.Sum(p => p.LikesCount + p.RepostsCount + p.CommentsCount),
                        Preview = dayPosts.FirstOrDefault()?.Content?.Substring(0, 100),
                        HasPosts = dayPosts.Count > 0
                    });
                }
            }

            return timeline;
        }

        /// <summary>
        /// Get statistics about posts in a date range
        /// </summary>
        public async Task<PostStatisticsResponse> GetPostStatisticsAsync(Guid userId, DateTime startDate, DateTime endDate)
        {
            _logger.LogInformation("Computing post statistics for user {UserId} from {StartDate} to {EndDate}", userId, startDate, endDate);

            var posts = _postRepository.GetAll()
                .Where(p => p.UserId == userId 
                    && !p.IsDeleted 
                    && p.CreatedAt >= startDate.Date 
                    && p.CreatedAt < endDate.Date.AddDays(1))
                .ToList();

            var daySpan = (endDate.Date - startDate.Date).Days;

            return new PostStatisticsResponse
            {
                TotalPosts = posts.Count,
                AveragePostsPerDay = daySpan > 0 ? Math.Round(posts.Count / (double)daySpan, 2) : posts.Count,
                TotalLikes = posts.Sum(p => p.LikesCount),
                TotalReposts = posts.Sum(p => p.RepostsCount),
                TotalComments = posts.Sum(p => p.CommentsCount),
                TotalShares = posts.Sum(p => p.SharesCount),
                TotalEngagement = posts.Sum(p => p.LikesCount + p.RepostsCount + p.CommentsCount + p.SharesCount),
                MostEngagedPost = posts.OrderByDescending(p => p.LikesCount + p.RepostsCount + p.CommentsCount).FirstOrDefault()?.Content,
                DayRange = daySpan + 1
            };
        }

        /// <summary>
        /// Auto-save a post to the daily archive (called after post creation)
        /// </summary>
        public async Task AutoSavePostToDailyArchiveAsync(Guid postId)
        {
            _logger.LogInformation("Auto-saving post {PostId} to daily archive", postId);

            try
            {
                var post = _postRepository.GetAll().FirstOrDefault(p => p.Id == postId);
                if (post != null)
                {
                    // Posts are automatically stored in the database with their creation date
                    // This method serves as a hook for future archive logic
                    _logger.LogInformation("Post {PostId} automatically archived with date {CreatedAt}", postId, post.CreatedAt);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error auto-saving post {PostId} to archive", postId);
            }
        }

        /// <summary>
        /// Check if user has any posts for a specific date
        /// </summary>
        public async Task<bool> HasPostsForDateAsync(Guid userId, DateTime date)
        {
            var startOfDay = date.Date;
            var endOfDay = startOfDay.AddDays(1).AddTicks(-1);

            return _postRepository.GetAll()
                .Any(p => p.UserId == userId 
                    && !p.IsDeleted 
                    && p.CreatedAt >= startOfDay 
                    && p.CreatedAt <= endOfDay);
        }

        private PostDto MapToPostDto(Post post)
        {
            return new PostDto
            {
                Id = post.Id,
                UserId = post.UserId,
                Content = post.Content,
                Type = post.Type.ToString(),
                MediaUrls = post.MediaUrls,
                IsSensitive = post.IsSensitive,
                LikesCount = post.LikesCount,
                RepostsCount = post.RepostsCount,
                CommentsCount = post.CommentsCount,
                SharesCount = post.SharesCount,
                BookmarksCount = post.BookmarksCount,
                ViewsCount = post.ViewsCount,
                CreatedAt = post.CreatedAt,
                UpdatedAt = post.UpdatedAt
            };
        }
    }

    /// <summary>
    /// DTO for daily posts archive response
    /// </summary>
    public class DailyPostsArchiveResponse
    {
        public DateTime Date { get; set; }
        public string DayOfWeek { get; set; }
        public List<PostDto> Posts { get; set; } = new();
        public int TotalPostsForDay { get; set; }
        public int Page { get; set; }
        public int PageSize { get; set; }
        public int TotalPages { get; set; }
    }

    /// <summary>
    /// Summary of posts for a specific date
    /// </summary>
    public class PostDateSummary
    {
        public DateTime Date { get; set; }
        public string DayOfWeek { get; set; }
        public int PostCount { get; set; }
        public int LikeCount { get; set; }
        public int RepostCount { get; set; }
        public int CommentCount { get; set; }
        public string PreviewText { get; set; }
    }

    /// <summary>
    /// Snapshot of a day in the historical timeline
    /// </summary>
    public class HistoricalDaySnapshot
    {
        public DateTime Date { get; set; }
        public string DayOfWeek { get; set; }
        public int PostCount { get; set; }
        public int TotalEngagement { get; set; }
        public string Preview { get; set; }
        public bool HasPosts { get; set; }
    }

    /// <summary>
    /// Statistics about posts in a date range
    /// </summary>
    public class PostStatisticsResponse
    {
        public int TotalPosts { get; set; }
        public double AveragePostsPerDay { get; set; }
        public int TotalLikes { get; set; }
        public int TotalReposts { get; set; }
        public int TotalComments { get; set; }
        public int TotalShares { get; set; }
        public int TotalEngagement { get; set; }
        public string MostEngagedPost { get; set; }
        public int DayRange { get; set; }
    }
}
