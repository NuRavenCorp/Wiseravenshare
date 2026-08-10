// Wiseravenshare.Server/Services/PostService.cs
using System.Text.Json;
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
        User? user = null;
        try
        {
            user = await _userRepository.GetByIdAsync(userId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "User lookup failed while creating post for user {UserId}; using a fallback identity.", userId);
        }

        if (user == null)
        {
            user = new User
            {
                Id = userId,
                Email = $"local-{userId:N}@local",
                Username = $"user{userId:N}"[..Math.Min(12, $"user{userId:N}".Length)],
                DisplayName = "Local User",
                Role = UserRole.User,
                IsActive = true,
                TruthScore = 50.00m
            };
        }

        // Create post
        var mediaUrls = NormalizeMediaUrls(dto);
        var post = new Post
        {
            UserId = userId,
            Content = dto.Content,
            Type = Enum.Parse<PostType>(dto.Type, true),
            MediaUrls = mediaUrls,
            MediaMetadata = BuildMediaMetadata(dto, mediaUrls),
            ReplyToId = dto.ReplyToId,
            RepostOfId = dto.RepostOfId,
            QuoteOfId = dto.QuoteOfId,
            LocationName = dto.LocationName,
            Latitude = dto.Latitude.HasValue ? (decimal?)dto.Latitude.Value : null,
            Longitude = dto.Longitude.HasValue ? (decimal?)dto.Longitude.Value : null,
            IsSensitive = dto.IsSensitive
        };

        // Analyze truth score when available, but never block post creation on the truth service.
        if (!string.IsNullOrEmpty(dto.Content))
        {
            try
            {
                var truthResult = await _truthService.AnalyzeContentAsync(dto.Content);
                post.TruthScore = truthResult.TruthScore;
                post.TruthCorrection = truthResult.Correction;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Truth analysis failed for post creation; continuing without truth metadata.");
            }
        }

        var createdPostId = post.Id == Guid.Empty ? Guid.NewGuid() : post.Id;
        post.Id = createdPostId;

        bool persisted = false;
        try
        {
            await _postRepository.AddAsync(post);
            persisted = true;
            _logger.LogInformation("Post created by user {UserId}", userId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Post repository persistence failed; returning a local fallback post DTO for user {UserId}", userId);
            return BuildPostDto(post, user);
        }

        // If repost, update the original post's repost count
        if (dto.RepostOfId.HasValue)
        {
            try
            {
                var originalPost = await _postRepository.GetByIdAsync(dto.RepostOfId.Value);
                if (originalPost != null)
                {
                    originalPost.RepostsCount++;
                    await _postRepository.UpdateAsync(originalPost);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to update repost count for post {PostId}", dto.RepostOfId.Value);
            }
        }

        if (!persisted)
        {
            return BuildPostDto(post, user);
        }

        try
        {
            return await GetPostDtoAsync(post.Id);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Post could not be reloaded after creation for user {UserId}; returning the local fallback DTO.", userId);
            return BuildPostDto(post, user);
        }
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
        try
        {
            var posts = await _postRepository.GetFeedAsync(userId, page, pageSize);
            return await MapToPostDtosAsync(posts);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Post feed query failed; returning an empty fallback feed for user {UserId}", userId);
            return Array.Empty<PostDto>();
        }
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
        try
        {
            var posts = await _postRepository.GetTrendingPostsAsync(count);
            return await MapToPostDtosAsync(posts);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Trending post query failed; returning an empty fallback feed.");
            return Array.Empty<PostDto>();
        }
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

        return BuildPostDto(post, post.User);
    }

    private PostDto BuildPostDto(Post post, User? user)
    {
        return new PostDto
        {
            Id = post.Id,
            UserId = post.UserId,
            Content = post.Content,
            Type = post.Type.ToString(),
            MediaUrl = ResolveMediaUrl(post),
            MediaUrls = ResolveMediaUrls(post),
            YoutubeUrl = ReadMediaMetadataValue(post.MediaMetadata, "youtubeUrl"),
            TikTokUrl = ReadMediaMetadataValue(post.MediaMetadata, "tiktokUrl"),
            FacebookUrl = ReadMediaMetadataValue(post.MediaMetadata, "facebookUrl"),
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
            User = user is null ? new UserDto() : MapToUserDto(user)
        };
    }

    private static JsonDocument? BuildMediaMetadata(CreatePostDto dto, string[]? mediaUrls)
    {
        var metadata = new Dictionary<string, string?>();

        if (!string.IsNullOrWhiteSpace(dto.YoutubeUrl))
        {
            metadata["youtubeUrl"] = dto.YoutubeUrl.Trim();
        }

        if (!string.IsNullOrWhiteSpace(dto.TikTokUrl))
        {
            metadata["tiktokUrl"] = dto.TikTokUrl.Trim();
        }

        if (!string.IsNullOrWhiteSpace(dto.FacebookUrl))
        {
            metadata["facebookUrl"] = dto.FacebookUrl.Trim();
        }

        if (mediaUrls is { Length: > 0 })
        {
            metadata["mediaUrl"] = mediaUrls[0];
            metadata["mediaUrls"] = string.Join(",", mediaUrls);
        }

        if (metadata.Count == 0)
        {
            return null;
        }

        return JsonDocument.Parse(JsonSerializer.Serialize(metadata));
    }

    private static string[]? NormalizeMediaUrls(CreatePostDto dto)
    {
        var parsed = new List<string>();

        if (!string.IsNullOrWhiteSpace(dto.MediaUrl))
        {
            parsed.Add(dto.MediaUrl.Trim());
        }

        if (!string.IsNullOrWhiteSpace(dto.MediaUrls))
        {
            try
            {
                var mediaPayload = JsonSerializer.Deserialize<JsonElement>(dto.MediaUrls);
                var parsedMediaUrls = PostMediaPayloadParser.ParseMediaUrls(dto.MediaUrl, mediaPayload);
                parsed.AddRange(parsedMediaUrls);
            }
            catch (JsonException)
            {
                foreach (var part in dto.MediaUrls.Split([',', '\n', '\r'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                {
                    if (!string.IsNullOrWhiteSpace(part))
                    {
                        parsed.Add(part);
                    }
                }
            }
        }

        return parsed.Count > 0 ? parsed.Distinct(StringComparer.OrdinalIgnoreCase).ToArray() : null;
    }

    private static string? ResolveMediaUrl(Post post)
    {
        var resolved = ResolveMediaUrls(post);
        return resolved?.FirstOrDefault() ?? ReadMediaMetadataValue(post.MediaMetadata, "mediaUrl");
    }

    private static string[]? ResolveMediaUrls(Post post)
    {
        if (post.MediaUrls is { Length: > 0 })
        {
            return post.MediaUrls.Where(url => !string.IsNullOrWhiteSpace(url)).Select(url => url.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        }

        var metadataValue = ReadMediaMetadataValue(post.MediaMetadata, "mediaUrls");
        if (string.IsNullOrWhiteSpace(metadataValue))
        {
            return null;
        }

        return metadataValue.Split([','], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(url => !string.IsNullOrWhiteSpace(url))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static string? ReadMediaMetadataValue(JsonDocument? metadata, string key)
    {
        if (metadata?.RootElement.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        return metadata.RootElement.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;
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