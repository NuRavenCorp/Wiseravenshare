using Wiseravenshare.Server.DTOs.Video;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Exceptions;

namespace Wiseravenshare.Server.Services;

public interface IVideoService
{
    Task<VideoDto> UploadVideoAsync(Guid userId, UploadVideoDto dto);
    Task<VideoDto> GetVideoAsync(Guid id);
    Task<VideoDto> UpdateVideoAsync(Guid userId, Guid id, UpdateVideoDto dto);
    Task DeleteVideoAsync(Guid userId, Guid id);
    Task<IEnumerable<VideoDto>> GetUserVideosAsync(Guid userId, int page, int pageSize);
    Task<IEnumerable<VideoDto>> GetVideoFeedAsync(string? filter, int page, int pageSize);
    Task LikeVideoAsync(Guid userId, Guid id);
    Task UnlikeVideoAsync(Guid userId, Guid id);
    Task ShareVideoAsync(Guid userId, Guid id);
    Task<object> GetVideoAnalyticsAsync(Guid id);
}

public class VideoService : IVideoService
{
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<VideoService> _logger;
    private readonly AppDbContext _context;

    public VideoService(IWebHostEnvironment environment, ILogger<VideoService> logger, AppDbContext context)
    {
        _environment = environment;
        _logger = logger;
        _context = context;
    }

    public async Task DeleteVideoAsync(Guid userId, Guid id)
    {
        var video = await _context.Videos.FirstOrDefaultAsync(v => v.Id == id && !v.IsDeleted);
        if (video == null)
        {
            throw new NotFoundException("Video not found.");
        }

        if (video.UserId != userId)
        {
            throw new UnauthorizedException("You can only delete your own videos.");
        }

        video.IsDeleted = true;
        video.DeletedAt = DateTime.UtcNow;
        video.Status = VideoStatus.Deleted;
        video.UpdatedAt = DateTime.UtcNow;

        _context.Videos.Update(video);
        await _context.SaveChangesAsync();
    }

    public Task<object> GetVideoAnalyticsAsync(Guid id) => Task.FromResult<object>(new { id, views = 0, likes = 0 });

    public async Task<VideoDto> GetVideoAsync(Guid id)
    {
        var video = await _context.Videos
            .Include(v => v.User)
            .FirstOrDefaultAsync(v => v.Id == id && !v.IsDeleted);

        if (video == null)
        {
            throw new NotFoundException("Video not found.");
        }

        return ToDto(video);
    }

    public async Task<IEnumerable<VideoDto>> GetUserVideosAsync(Guid userId, int page, int pageSize)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var videos = await _context.Videos
            .Include(v => v.User)
            .Where(v => v.UserId == userId && !v.IsDeleted)
            .OrderByDescending(v => v.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return videos.Select(ToDto);
    }

    public async Task<IEnumerable<VideoDto>> GetVideoFeedAsync(string? filter, int page, int pageSize)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = _context.Videos
            .Include(v => v.User)
            .Where(v => !v.IsDeleted && v.Status != VideoStatus.Deleted && v.Privacy != PrivacyStatus.Private);

        if (!string.IsNullOrWhiteSpace(filter))
        {
            query = query.Where(v =>
                v.Title.Contains(filter) ||
                (v.Description != null && v.Description.Contains(filter)));
        }

        var videos = await query
            .OrderByDescending(v => v.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return videos.Select(ToDto);
    }

    public Task LikeVideoAsync(Guid userId, Guid id) => Task.CompletedTask;
    public Task ShareVideoAsync(Guid userId, Guid id) => Task.CompletedTask;
    public Task UnlikeVideoAsync(Guid userId, Guid id) => Task.CompletedTask;

    public async Task<VideoDto> UpdateVideoAsync(Guid userId, Guid id, UpdateVideoDto dto)
    {
        var video = await _context.Videos.Include(v => v.User).FirstOrDefaultAsync(v => v.Id == id && !v.IsDeleted);
        if (video == null)
        {
            throw new NotFoundException("Video not found.");
        }

        if (video.UserId != userId)
        {
            throw new UnauthorizedException("You can only update your own videos.");
        }

        if (!string.IsNullOrWhiteSpace(dto.Title))
        {
            video.Title = dto.Title.Trim();
        }

        if (dto.Description != null)
        {
            video.Description = dto.Description.Trim();
        }

        if (dto.Tags != null)
        {
            video.Tags = dto.Tags;
        }

        if (!string.IsNullOrWhiteSpace(dto.Privacy) && Enum.TryParse<PrivacyStatus>(dto.Privacy, true, out var privacy))
        {
            video.Privacy = privacy;
        }

        video.UpdatedAt = DateTime.UtcNow;
        _context.Videos.Update(video);
        await _context.SaveChangesAsync();

        return ToDto(video);
    }

    public async Task<VideoDto> UploadVideoAsync(Guid userId, UploadVideoDto dto)
    {
        if (dto.Video == null || dto.Video.Length == 0)
        {
            throw new InvalidOperationException("No video file provided.");
        }

        var extension = Path.GetExtension(dto.Video.FileName);
        var fileName = $"{Guid.NewGuid():N}{extension}";

        var webRoot = string.IsNullOrWhiteSpace(_environment.WebRootPath)
            ? Path.Combine(_environment.ContentRootPath, "wwwroot")
            : _environment.WebRootPath;

        var videosDir = Path.Combine(webRoot, "uploads", "videos");
        Directory.CreateDirectory(videosDir);

        var absolutePath = Path.Combine(videosDir, fileName);

        await using (var stream = new FileStream(absolutePath, FileMode.Create))
        {
            await dto.Video.CopyToAsync(stream);
        }

        _logger.LogInformation("Saved uploaded video for user {UserId} to {Path}", userId, absolutePath);

        var relativeUrl = $"/uploads/videos/{fileName}";

        var privacy = PrivacyStatus.Unlisted;
        if (!string.IsNullOrWhiteSpace(dto.Privacy) && Enum.TryParse<PrivacyStatus>(dto.Privacy, true, out var parsedPrivacy))
        {
            privacy = parsedPrivacy;
        }

        var entity = new Video
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Title = string.IsNullOrWhiteSpace(dto.Title) ? "Untitled Recording" : dto.Title.Trim(),
            Description = dto.Description?.Trim(),
            VideoUrl = relativeUrl,
            Tags = dto.Tags,
            Privacy = privacy,
            Status = VideoStatus.Ready,
            YoutubePublishStatus = dto.PublishToYoutube ? VideoPublishStatus.Processing : VideoPublishStatus.Pending,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            PublishedAt = DateTime.UtcNow
        };

        await _context.Videos.AddAsync(entity);
        await _context.SaveChangesAsync();

        await _context.Entry(entity).Reference(v => v.User).LoadAsync();

        return ToDto(entity);
    }

    private static VideoDto ToDto(Video video)
    {
        return new VideoDto
        {
            Id = video.Id,
            UserId = video.UserId,
            Title = video.Title,
            Description = video.Description,
            VideoUrl = video.VideoUrl,
            ThumbnailUrl = video.ThumbnailUrl,
            Duration = video.Duration,
            YoutubeVideoId = video.YoutubeVideoId,
            YoutubeUrl = video.YoutubeUrl,
            YoutubePublishStatus = video.YoutubePublishStatus.ToString(),
            Privacy = video.Privacy.ToString(),
            Status = video.Status.ToString(),
            ViewsCount = video.ViewsCount,
            LikesCount = video.LikesCount,
            CommentsCount = video.CommentsCount,
            SharesCount = video.SharesCount,
            Tags = video.Tags,
            PublishedAt = video.PublishedAt,
            CreatedAt = video.CreatedAt,
            User = new UserDto
            {
                Id = video.User?.Id ?? video.UserId,
                Username = video.User?.Username ?? string.Empty,
                DisplayName = video.User?.DisplayName ?? string.Empty,
                AvatarUrl = video.User?.AvatarUrl
            }
        };
    }
}
