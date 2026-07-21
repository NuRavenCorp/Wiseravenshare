// Wiseravenshare.Server/Services/PostService.cs
using Microsoft.Extensions.Logging;
using Wiseravenshare.Server.DTOs.Post;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Exceptions;
using Wiseravenshare.Server.Interfaces.Repositories;
using Wiseravenshare.Server.DTOs.User;

namespace Wiseravenshare.Server.Services;

public interface IPostService
{
    Task<PostDto> CreatePostAsync(Guid userId, CreatePostDto dto);
    Task<PostDto> UpdatePostAsync(Guid userId, Guid postId, UpdatePostDto dto);
    Task DeletePostAsync(Guid userId, Guid postId);
    Task<PostDto> GetPostAsync(Guid postId);
    Task<IEnumerable<PostDto>> GetFeedAsync(Guid userId, int page, int pageSize);
    Task<IEnumerable<PostDto>> GetUserPostsAsync(Guid userId, int page, int pageSize);
    Task LikePostAsync(Guid userId, Guid postId);
    Task UnlikePostAsync(Guid userId, Guid postId);
    Task RepostPostAsync(Guid userId, Guid postId);
    Task UnrepostPostAsync(Guid userId, Guid postId);
    Task BookmarkPostAsync(Guid userId, Guid postId);
    Task UnbookmarkPostAsync(Guid userId, Guid postId);
    Task<IEnumerable<PostDto>> GetTrendingPostsAsync(int count);
    Task<int> GetPostCountAsync(Guid userId);
}

public class PostService : IPostService
{
    private readonly IPostRepository _postRepository;
    private readonly IUserRepository _userRepository;
    private readonly ITruthService _truthService;
    private readonly ILogger<PostService> _logger;

    public PostService(
        IPostRepository postRepository,
        IUserRepository userRepository,
        ITruthService truthService,
        ILogger<PostService> logger)
    {
        _postRepository = postRepository;
        _userRepository = userRepository;
        _truthService = truthService;
        _logger = logger;
    }

    public async Task<PostDto> CreatePostAsync(Guid userId, CreatePostDto dto)
    {
        var user = await _userRepository.GetByIdAsync(userId);
        if (user == null)
        {
            throw new NotFoundException("User not found");
        }

        // Create post
        var post = new Post
        {
            UserId = userId,
            Content = dto.Content,
            Type = Enum.Parse<PostType>(dto.Type, true),
            MediaUrls = dto.MediaUrls?.Split(',', StringSplitOptions.RemoveEmptyEntries),
            ReplyToId = dto.ReplyToId,
            RepostOfId = dto.RepostOfId,
            QuoteOfId = dto.QuoteOfId,
            LocationName = dto.LocationName,
            Latitude = dto.Latitude.HasValue ? (decimal?)dto.Latitude.Value : null,
            Longitude = dto.Longitude.HasValue ? (decimal?)dto.Longitude.Value : null,
            IsSensitive = dto.IsSensitive
        };

        // Analyze truth score
        if (!string.IsNullOrEmpty(dto.Content))
        {
            var truthResult = await _truthService.AnalyzeContentAsync(dto.Content);
            post.TruthScore = truthResult.TruthScore;
            post.TruthCorrection = truthResult.Correction;
            if (truthResult.Sources != null)
            {
                // Store sources as JSON
            }
        }

        await _postRepository.AddAsync(post);

        _logger.LogInformation($"Post created by user {userId}");

        // If repost, update the original post's repost count
        if (dto.RepostOfId.HasValue)
        {
            var originalPost = await _postRepository.GetByIdAsync(dto.RepostOfId.Value);
            if (originalPost != null)
            {
                originalPost.RepostsCount++;
                await _postRepository.UpdateAsync(originalPost);
            }
        }

        return await GetPostDtoAsync(post.Id);
    }

    public async Task<PostDto> UpdatePostAsync(Guid userId, Guid postId, UpdatePostDto dto)
    {
        var post = await _postRepository.GetByIdAsync(postId);
        if (post == null)
        {
            throw new NotFoundException("Post not found");
        }

        if (post.UserId != userId)
        {
            throw new UnauthorizedException("You can only update your own posts");
        }

        if (!string.IsNullOrEmpty(dto.Content))
        {
            post.Content = dto.Content;

            // Re-analyze truth score
            var truthResult = await _truthService.AnalyzeContentAsync(dto.Content);
            post.TruthScore = truthResult.TruthScore;
            post.TruthCorrection = truthResult.Correction;
        }

        if (dto.IsSensitive.HasValue)
        {
            post.IsSensitive = dto.IsSensitive.Value;
        }

        await _postRepository.UpdateAsync(post);
        _logger.LogInformation($"Post {postId} updated by user {userId}");

        return await GetPostDtoAsync(post.Id);
    }

    public async Task DeletePostAsync(Guid userId, Guid postId)
    {
        var post = await _postRepository.GetByIdAsync(postId);
        if (post == null)
        {
            throw new NotFoundException("Post not found");
        }

        if (post.UserId != userId)
        {
            throw new UnauthorizedException("You can only delete your own posts");
        }

        post.IsDeleted = true;
        post.DeletedAt = DateTime.UtcNow;
        await _postRepository.UpdateAsync(post);

        _logger.LogInformation($"Post {postId} deleted by user {userId}");
    }

    public async Task<PostDto> GetPostAsync(Guid postId)
    {
        var post = await _postRepository.GetByIdAsync(postId);
        if (post == null || post.IsDeleted)
        {
            throw new NotFoundException("Post not found");
        }

        return await GetPostDtoAsync(postId);
    }

    public async Task<IEnumerable<PostDto>> GetFeedAsync(Guid userId, int page, int pageSize)
    {
        var posts = await _postRepository.GetFeedAsync(userId, page, pageSize);
        return await MapToPostDtosAsync(posts);
    }

    public async Task<IEnumerable<PostDto>> GetUserPostsAsync(Guid userId, int page, int pageSize)
    {
        var posts = await _postRepository.GetUserPostsAsync(userId, page, pageSize);
        return await MapToPostDtosAsync(posts);
    }

    public async Task LikePostAsync(Guid userId, Guid postId)
    {
        var post = await _postRepository.GetByIdAsync(postId);
        if (post == null || post.IsDeleted)
        {
            throw new NotFoundException("Post not found");
        }

        await _postRepository.LikePostAsync(postId, userId);
        _logger.LogInformation($"User {userId} liked post {postId}");
    }

    public async Task UnlikePostAsync(Guid userId, Guid postId)
    {
        var post = await _postRepository.GetByIdAsync(postId);
        if (post == null || post.IsDeleted)
        {
            throw new NotFoundException("Post not found");
        }

        await _postRepository.UnlikePostAsync(postId, userId);
        _logger.LogInformation($"User {userId} unliked post {postId}");
    }

    public async Task RepostPostAsync(Guid userId, Guid postId)
    {
        var post = await _postRepository.GetByIdAsync(postId);
        if (post == null || post.IsDeleted)
        {
            throw new NotFoundException("Post not found");
        }

        await _postRepository.RepostPostAsync(postId, userId);
        _logger.LogInformation($"User {userId} reposted post {postId}");
    }

    public async Task UnrepostPostAsync(Guid userId, Guid postId)
    {
        var post = await _postRepository.GetByIdAsync(postId);
        if (post == null || post.IsDeleted)
        {
            throw new NotFoundException("Post not found");
        }

        await _postRepository.UnrepostPostAsync(postId, userId);
        _logger.LogInformation($"User {userId} unreposted post {postId}");
    }

    public async Task BookmarkPostAsync(Guid userId, Guid postId)
    {
        var post = await _postRepository.GetByIdAsync(postId);
        if (post == null || post.IsDeleted)
        {
            throw new NotFoundException("Post not found");
        }

        await _postRepository.BookmarkPostAsync(postId, userId);
        _logger.LogInformation($"User {userId} bookmarked post {postId}");
    }

    public async Task UnbookmarkPostAsync(Guid userId, Guid postId)
    {
        var post = await _postRepository.GetByIdAsync(postId);
        if (post == null || post.IsDeleted)
        {
            throw new NotFoundException("Post not found");
        }

        await _postRepository.UnbookmarkPostAsync(postId, userId);
        _logger.LogInformation($"User {userId} unbookmarked post {postId}");
    }

    public async Task<IEnumerable<PostDto>> GetTrendingPostsAsync(int count)
    {
        var posts = await _postRepository.GetTrendingPostsAsync(count);
        return await MapToPostDtosAsync(posts);
    }

    public async Task<int> GetPostCountAsync(Guid userId)
    {
        return await _postRepository.GetPostCountAsync(userId);
    }

    private async Task<PostDto> GetPostDtoAsync(Guid postId)
    {
        var post = await _postRepository.GetByIdAsync(postId);
        if (post == null)
        {
            throw new NotFoundException("Post not found");
        }

        var dto = new PostDto
        {
            Id = post.Id,
            UserId = post.UserId,
            Content = post.Content,
            Type = post.Type.ToString(),
            MediaUrls = post.MediaUrls,
            TruthScore = post.TruthScore,
            TruthCorrection = post.TruthCorrection,
            LocationName = post.LocationName,
            Latitude = post.Latitude.HasValue ? (double?)post.Latitude.Value : null,
            Longitude = post.Longitude.HasValue ? (double?)post.Longitude.Value : null,
            IsSensitive = post.IsSensitive,
            IsPinned = post.IsPinned,
            LikesCount = post.LikesCount,
            RepostsCount = post.RepostsCount,
            CommentsCount = post.CommentsCount,
            SharesCount = post.SharesCount,
            BookmarksCount = post.BookmarksCount,
            ViewsCount = post.ViewsCount,
            CreatedAt = post.CreatedAt,
            User = MapToUserDto(post.User)
        };

        return dto;
    }

    private async Task<IEnumerable<PostDto>> MapToPostDtosAsync(IEnumerable<Post> posts)
    {
        var dtos = new List<PostDto>();
        foreach (var post in posts)
        {
            dtos.Add(await GetPostDtoAsync(post.Id));
        }
        return dtos;
    }

    private UserDto MapToUserDto(User user)
    {
        return new UserDto
        {
            Id = user.Id,
            Email = user.Email,
            Username = user.Username,
            DisplayName = user.DisplayName,
            Bio = user.Bio,
            AvatarUrl = user.AvatarUrl,
            CoverPhotoUrl = user.CoverPhotoUrl,
            Location = user.Location,
            Website = user.Website,
            IsVerified = user.IsVerified,
            IsPrivate = user.IsPrivate,
            Role = user.Role.ToString(),
            TruthScore = user.TruthScore,
            ReputationPoints = user.ReputationPoints,
            CreatedAt = user.CreatedAt,
            LastActiveAt = user.LastActiveAt
        };
    }
}