// Wiseravenshare.Server/Services/PostService.cs
using System.Text.Json;
using System.Text.RegularExpressions;
using System.IO;
using System.Net.Sockets;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Npgsql;
using Wiseravenshare.Server.DTOs.Post;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Entities.Currency;
using Wiseravenshare.Server.Exceptions;
using Wiseravenshare.Server.Interfaces.Repositories;
using Wiseravenshare.Server.DTOs.User;
using Wiseravenshare.Server.Services;
using Wiseravenshare.Server.Services.CrossPlatform;
using Wiseravenshare.Server.Services.Communication;
using Wiseravenshare.Server.DTOs.Social;
using Wiseravenshare.Server.Services.Currency;
using Wiseravenshare.Server.Services.Truth;

namespace Wiseravenshare.Server.Services;

public interface IPostService
{
    Task<PostDto> CreatePostAsync(Guid userId, CreatePostDto dto);
    Task<PostDto> UpdatePostAsync(Guid userId, Guid postId, UpdatePostDto dto);
    Task DeletePostAsync(Guid userId, Guid postId);
    Task<PostDto> GetPostAsync(Guid postId);
    Task<IEnumerable<PostDto>> GetFeedAsync(Guid userId, int page, int pageSize);
    Task<IEnumerable<PostDto>> GetUserPostsAsync(Guid userId, int page, int pageSize);
    Task<PostInteractionDto> LikePostAsync(Guid userId, Guid postId);
    Task<PostInteractionDto> UnlikePostAsync(Guid userId, Guid postId);
    Task<PostInteractionDto> RepostPostAsync(Guid userId, Guid postId);
    Task<PostInteractionDto> UnrepostPostAsync(Guid userId, Guid postId);
    Task<PostInteractionDto> BookmarkPostAsync(Guid userId, Guid postId);
    Task<PostInteractionDto> UnbookmarkPostAsync(Guid userId, Guid postId);
    Task<IReadOnlyList<PostCommentDto>> GetCommentsAsync(Guid postId, int page, int pageSize);
    Task<PostCommentDto> AddCommentAsync(Guid userId, Guid postId, AddPostCommentDto dto);
    Task<CommentInteractionDto> LikeCommentAsync(Guid userId, Guid commentId);
    Task<CommentInteractionDto> UnlikeCommentAsync(Guid userId, Guid commentId);
    Task<IEnumerable<PostDto>> GetTrendingPostsAsync(int count);
    Task<int> GetPostCountAsync(Guid userId);
    Task TrackViewAsync(Guid postId);
    Task<PostInteractionDto> SharePostAsync(Guid postId);
}

public class PostService : IPostService
{
    private static readonly Regex HashtagRegex = new(@"#([\p{L}\p{N}_-]{2,64})", RegexOptions.Compiled);
    private static readonly Regex PartialRegex = new(@"%([\p{L}\p{N}_-]{2,64})", RegexOptions.Compiled);
    private const int MaxHashtagsPerPost = 10;
    private const int MaxHashtagLength = 30;
    private const int MaxPostLength = 1000;
    private const int MaxCommentLength = 500;
    private readonly IPostRepository _postRepository;
    private readonly IUserRepository _userRepository;
    private readonly ITruthService _truthService;
    private readonly ISocialPublishDispatcher _socialPublishDispatcher;
    private readonly ICrossPlatformPublishService _crossPlatformPublishService;
    private readonly IEngagementNotificationService _engagementNotificationService;
    private readonly IWiseCoinService _wiseCoinService;
    private readonly IEngagementMultiplierService _engagementMultiplierService;
    private readonly IContentCrawlerService _contentCrawler;
    private readonly IPostFeedRankingService _postFeedRankingService;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<PostService> _logger;

    public PostService(
        IPostRepository postRepository,
        IUserRepository userRepository,
        ITruthService truthService,
        ISocialPublishDispatcher socialPublishDispatcher,
        ICrossPlatformPublishService crossPlatformPublishService,
        IEngagementNotificationService engagementNotificationService,
        IWiseCoinService wiseCoinService,
        IEngagementMultiplierService engagementMultiplierService,
        IContentCrawlerService contentCrawler,
        IPostFeedRankingService postFeedRankingService,
        IServiceScopeFactory scopeFactory,
        ILogger<PostService> logger)
    {
        _postRepository = postRepository;
        _userRepository = userRepository;
        _truthService = truthService;
        _socialPublishDispatcher = socialPublishDispatcher;
        _crossPlatformPublishService = crossPlatformPublishService;
        _engagementNotificationService = engagementNotificationService;
        _wiseCoinService = wiseCoinService;
        _engagementMultiplierService = engagementMultiplierService;
        _contentCrawler = contentCrawler;
        _postFeedRankingService = postFeedRankingService;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    private static bool IsOpinionOrQuestion(string content)
    {
        if (string.IsNullOrWhiteSpace(content)) return false;

        var trimmed = content.Trim();
        if (trimmed.EndsWith('?')) return true;

        var lower = trimmed.ToLowerInvariant();
        string[] questionWords = { "who ", "what ", "where ", "when ", "why ", "how ", "if " };
        foreach (var word in questionWords)
        {
            if (lower.StartsWith(word)) return true;
        }

        if (lower.StartsWith("if,")) return true;

        string[] opinionPhrases = { "i think", "i believe", "my opinion", "in my opinion", "i feel", "seems to me", "i guess", "to me", "in my view" };
        foreach (var phrase in opinionPhrases)
        {
            if (lower.Contains(phrase)) return true;
        }

        return false;
    }

    public async Task<PostDto> CreatePostAsync(Guid userId, CreatePostDto dto)
    {
        if (dto is null)
        {
            throw new BadRequestException("Post payload is required.");
        }

        dto.Content = (dto.Content ?? string.Empty).Trim();
        var mediaUrls = NormalizeMediaUrls(dto);
        ValidateCreatePostInput(dto, mediaUrls);

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
            var fallbackUsername = $"localuser-{userId:N}";
            user = new User
            {
                Id = userId,
                Email = $"local-{userId:N}@local",
                Username = fallbackUsername,
                DisplayName = fallbackUsername,
                Role = UserRole.User,
                IsActive = true,
                TruthScore = 50.00m
            };
        }

        userId = await EnsurePersistedUserForPostAsync(userId, user);
        user.Id = userId;

        // Create post
        if (!Enum.TryParse<PostType>(dto.Type, true, out var parsedPostType))
        {
            _logger.LogWarning("Unknown post type '{PostType}' received during post creation for user {UserId}; defaulting to Text.", dto.Type, userId);
            parsedPostType = PostType.Text;
        }

        var post = new Post
        {
            UserId = userId,
            Content = dto.Content,
            Type = parsedPostType,
            MediaUrls = mediaUrls,
            MediaMetadata = BuildMediaMetadata(dto, mediaUrls),
            TruthSources = BuildProvenanceMetadata(dto.Provenance),
            ReplyToId = dto.ReplyToId,
            RepostOfId = dto.RepostOfId,
            QuoteOfId = dto.QuoteOfId,
            LocationName = dto.LocationName,
            IsTruthDispatch = dto.IsTruthDispatch,
            TruthDeclarationAccepted = dto.TruthDeclarationAccepted,
            Latitude = dto.Latitude.HasValue ? (decimal?)dto.Latitude.Value : null,
            Longitude = dto.Longitude.HasValue ? (decimal?)dto.Longitude.Value : null,
            IsSensitive = dto.IsSensitive
        };

        // Nullify truth score initially — analysis runs in background after post is saved
        // so it NEVER blocks the publish request (journalism reports can be 1000+ chars with
        // many sentences; awaiting per-sentence AI calls here caused upstream 503 timeouts).
        post.TruthScore = null;
        post.TruthCorrection = null;
        post.TruthStatus = IsOpinionOrQuestion(dto.Content ?? "") ? TruthStatuses.Opinion : TruthStatuses.Pending;

        var createdPostId = post.Id == Guid.Empty ? Guid.NewGuid() : post.Id;
        post.Id = createdPostId;

        await PersistPostStrictAsync(post, user);

        // Fire-and-forget truth analysis: updates the post record after publish completes.
        if (!string.IsNullOrEmpty(dto.Content) && !IsOpinionOrQuestion(dto.Content))
        {
            var bgPostId = post.Id;
            var bgContent = dto.Content;
            _ = Task.Run(async () =>
            {
                try
                {
                    using var cts = new System.Threading.CancellationTokenSource(TimeSpan.FromSeconds(25));
                    var truthTask = _truthService.AnalyzeContentAsync(bgContent);
                    var completedTask = await Task.WhenAny(truthTask, Task.Delay(25000, cts.Token));
                    if (completedTask != truthTask)
                    {
                        _logger.LogWarning("Background truth analysis timed out for post {PostId}.", bgPostId);
                        return;
                    }

                    var truthResult = await truthTask;
                    await using var scope = _scopeFactory.CreateAsyncScope();
                    var repo = scope.ServiceProvider.GetRequiredService<IPostRepository>();
                    var saved = await repo.GetByIdAsync(bgPostId);
                    if (saved is not null)
                    {
                        saved.TruthScore = truthResult.TruthScore;
                        saved.TruthCorrection = truthResult.Correction;
                        saved.TruthStatus = TruthStatusHelper.FromScore(truthResult.TruthScore);
                        await repo.UpdateAsync(saved);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Background truth analysis failed for post {PostId}.", bgPostId);
                }
            });
        }

        _logger.LogInformation("Post created by user {UserId}", userId);
        DispatchSocialPublish(post);
        DispatchCrossPlatformPublish(post);

        // All post-save enrichment runs in the background — none of it should block the HTTP response.
        var bgPost = post;
        var bgUser = user;
        var bgUserId = userId;
        _ = Task.Run(async () =>
        {
            // Repost count
            if (dto.RepostOfId.HasValue)
            {
                try
                {
                    await using var scope = _scopeFactory.CreateAsyncScope();
                    var repo = scope.ServiceProvider.GetRequiredService<IPostRepository>();
                    var originalPost = await repo.GetByIdAsync(dto.RepostOfId.Value);
                    if (originalPost != null)
                    {
                        originalPost.RepostsCount++;
                        await repo.UpdateAsync(originalPost);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to update repost count for post {PostId}", dto.RepostOfId.Value);
                }
            }

            // WiseCoin creation reward
            try { await AwardCreationRewardAsync(bgPost, bgUser); }
            catch (Exception ex) { _logger.LogWarning(ex, "Failed to award WiseCoin post reward for post {PostId}", bgPost.Id); }

            // Milestone badge
            try
            {
                await using var scope = _scopeFactory.CreateAsyncScope();
                var wsc = scope.ServiceProvider.GetRequiredService<IWiseCoinService>();
                var pr = scope.ServiceProvider.GetRequiredService<IPostRepository>();
                var postCount = await pr.GetPostCountAsync(bgUserId);
                await wsc.AwardJobWellDoneBadgeAsync(bgUserId, "post_created", postCount);
            }
            catch (Exception ex) { _logger.LogWarning(ex, "Failed to award post milestone badge for user {UserId}", bgUserId); }

            // Content crawler ingest
            try
            {
                var crawlerTitle = bgPost.Content?.Substring(0, Math.Min(100, bgPost.Content.Length)) ?? "";
                var crawlerTags = ExtractHashtags(bgPost.Content ?? string.Empty).ToArray();
                await using var scope = _scopeFactory.CreateAsyncScope();
                var crawler = scope.ServiceProvider.GetRequiredService<IContentCrawlerService>();
                await crawler.IngestUserContentAsync(
                    bgPost.Id, "Post", crawlerTitle,
                    bgUserId, bgUser.DisplayName ?? bgUser.Username ?? "Unknown", crawlerTags, "GLOBAL");
            }
            catch (Exception ex) { _logger.LogWarning(ex, "Background content crawler ingest failed for post {PostId}", bgPost.Id); }
        });

        // Return the post immediately — no reload DB round-trip needed on the hot path.
        return BuildPostDto(post, user);
    }

    private async Task PersistPostStrictAsync(Post post, User user)
    {
        try
        {
            await _postRepository.AddAsync(post);
            return;
        }
        catch (Exception ex)
        {
            if (await PostAlreadyPersistedAsync(post.Id))
            {
                _logger.LogWarning(ex, "Post {PostId} appears persisted despite initial save exception; continuing.", post.Id);
                return;
            }

            _logger.LogWarning(ex, "Initial post persistence failed for user {UserId}. Retrying after user reconciliation.", post.UserId);
        }

        var reconciledUserId = await EnsurePersistedUserForPostAsync(post.UserId, user);
        post.UserId = reconciledUserId;

        try
        {
            await _postRepository.AddAsync(post);
        }
        catch (Exception retryEx)
        {
            if (await PostAlreadyPersistedAsync(post.Id))
            {
                _logger.LogWarning(retryEx, "Post {PostId} appears persisted despite retry save exception; continuing.", post.Id);
                return;
            }

            _logger.LogError(retryEx, "Post persistence failed after retry for user {UserId}.", post.UserId);
            throw new InvalidOperationException(BuildPostPersistenceFailureMessage(retryEx), retryEx);
        }
    }

    private async Task<bool> PostAlreadyPersistedAsync(Guid postId)
    {
        try
        {
            return await _postRepository.GetByIdAsync(postId) is not null;
        }
        catch (Exception lookupEx)
        {
            _logger.LogWarning(lookupEx, "Failed checking persisted post state for {PostId}.", postId);
            return false;
        }
    }

    private static string BuildPostPersistenceFailureMessage(Exception exception)
    {
        if (IsTransientDatabaseException(exception))
        {
            return "Database is temporarily unavailable. Please retry in a moment.";
        }

        var postgres = FindPostgresException(exception);
        if (postgres is not null)
        {
            return postgres.SqlState switch
            {
                PostgresErrorCodes.ForeignKeyViolation => "Post could not be saved because a related record is missing. Refresh and retry.",
                PostgresErrorCodes.NotNullViolation => "Post could not be saved because required fields were missing.",
                PostgresErrorCodes.UniqueViolation => "Post could not be saved because a duplicate record was detected. Please retry.",
                _ => "Post could not be saved due to a database constraint. Please retry."
            };
        }

        return "Post could not be saved. Please try again.";
    }

    private static PostgresException? FindPostgresException(Exception exception)
    {
        var current = exception;
        while (current is not null)
        {
            if (current is PostgresException postgresException)
            {
                return postgresException;
            }

            current = current.InnerException;
        }

        return null;
    }

    private static bool IsTransientDatabaseException(Exception exception)
    {
        var current = exception;
        while (current is not null)
        {
            if (current is TimeoutException || current is IOException || current is SocketException)
            {
                return true;
            }

            if (current is NpgsqlException npgsqlException)
            {
                if (npgsqlException.IsTransient)
                {
                    return true;
                }

                if (!string.IsNullOrWhiteSpace(npgsqlException.SqlState))
                {
                    var sqlState = npgsqlException.SqlState;
                    if (sqlState.StartsWith("08", StringComparison.Ordinal)
                        || sqlState == "40001"
                        || sqlState == "40P01"
                        || sqlState == "57P01")
                    {
                        return true;
                    }
                }
            }

            current = current.InnerException;
        }

        return false;
    }

    private async Task<Guid> EnsurePersistedUserForPostAsync(Guid requestedUserId, User candidate)
    {
        try
        {
            var byId = await _userRepository.GetByIdAsync(requestedUserId);
            if (byId is not null)
            {
                return byId.Id;
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "User lookup by id failed during post persistence for {UserId}.", requestedUserId);
        }

        if (!string.IsNullOrWhiteSpace(candidate.Email))
        {
            try
            {
                var byEmail = await _userRepository.GetByEmailAsync(candidate.Email);
                if (byEmail is not null)
                {
                    return byEmail.Id;
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "User lookup by email failed during post persistence for {Email}.", candidate.Email);
            }
        }

        if (!string.IsNullOrWhiteSpace(candidate.Username))
        {
            try
            {
                var byUsername = await _userRepository.GetByUsernameAsync(candidate.Username);
                if (byUsername is not null)
                {
                    return byUsername.Id;
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "User lookup by username failed during post persistence for {Username}.", candidate.Username);
            }
        }

        try
        {
            var created = await _userRepository.AddAsync(new User
            {
                Id = requestedUserId,
                Email = candidate.Email,
                Username = candidate.Username,
                DisplayName = string.IsNullOrWhiteSpace(candidate.DisplayName) ? candidate.Username : candidate.DisplayName,
                PasswordHash = string.IsNullOrWhiteSpace(candidate.PasswordHash) ? string.Empty : candidate.PasswordHash,
                IsActive = true,
                Role = candidate.Role,
                TruthScore = candidate.TruthScore
            });

            _logger.LogInformation("Auto-provisioned missing user {UserId} for post persistence.", created.Id);
            return created.Id;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Auto-provisioning user failed for post persistence; attempting final reconciliation.");
        }

        if (!string.IsNullOrWhiteSpace(candidate.Email))
        {
            var byEmail = await _userRepository.GetByEmailAsync(candidate.Email);
            if (byEmail is not null)
            {
                return byEmail.Id;
            }
        }

        if (!string.IsNullOrWhiteSpace(candidate.Username))
        {
            var byUsername = await _userRepository.GetByUsernameAsync(candidate.Username);
            if (byUsername is not null)
            {
                return byUsername.Id;
            }
        }

        throw new InvalidOperationException("User profile could not be resolved for post publishing.");
    }

    /// <summary>
    /// Fire-and-forget fan-out of a new post to all configured external
    /// platforms via the cross-platform publisher adapters. Never blocks or
    /// fails post creation.
    /// </summary>
    private void DispatchCrossPlatformPublish(Post post)
    {
        var mediaUrl = ResolveMediaUrl(post);
        var mediaType = post.Type switch
        {
            PostType.Video => "video",
            PostType.Image => "photo",
            PostType.Audio => "music",
            _ => string.IsNullOrWhiteSpace(mediaUrl) ? "text" : "photo"
        };

        _ = Task.Run(async () =>
        {
            try
            {
                await _crossPlatformPublishService.PublishAsync(post.UserId, new CrossPlatformPublishRequest
                {
                    PostId = post.Id,
                    Message = post.Content ?? string.Empty,
                    MediaUrl = string.IsNullOrWhiteSpace(mediaUrl) ? null : mediaUrl,
                    MediaUrls = ResolveMediaUrls(post)?.ToList(),
                    MediaType = mediaType
                    // Platforms omitted -> fans out to every configured platform.
                });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Cross-platform publish task failed for post {PostId}.", post.Id);
            }
        });
    }

    private async Task AwardCreationRewardAsync(Post post, User user)
    {
        if (post == null || user == null)
        {
            return;
        }

        if ((user.Email ?? string.Empty).StartsWith("local-", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        var baseReward = post.Type switch
        {
            PostType.Video => 1.5m,
            PostType.Audio => 1.4m,
            PostType.Image => 1.2m,
            PostType.Podcast => 1.35m,
            PostType.TruthClaim => 1.25m,
            _ => 1.0m
        };

        if (post.IsTruthDispatch)
        {
            baseReward += 0.25m;
        }

        var engagementMultiplier = await _engagementMultiplierService.GetPostEngagementMultiplierAsync(post.Id, user.Id);
        var rewardAmount = decimal.Round(baseReward * engagementMultiplier, 2);

        if (rewardAmount <= 0)
        {
            return;
        }

        var result = await _wiseCoinService.EarnWSCAsync(
            user.Id,
            rewardAmount,
            TransactionType.ContentCreation,
            $"Post reward for {post.Type} post",
            applyMultipliers: true);

        if (!result.Success)
        {
            _logger.LogWarning("WiseCoin reward declined for post {PostId}: {Error}", post.Id, result.ErrorMessage);
            return;
        }

        _logger.LogInformation(
            "Awarded {Amount} WSC for post {PostId} (base={BaseReward}, engagementMultiplier={Multiplier})",
            result.Amount,
            post.Id,
            baseReward,
            engagementMultiplier);
    }

    private void DispatchSocialPublish(Post post)
    {
        // Trigger (checklist step 1): notify the middleware asynchronously so
        // it can download -> optimize -> publish to Facebook without blocking.
        var mediaUrl = ResolveMediaUrl(post);
        var mediaType = post.Type switch
        {
            PostType.Video => "video",
            PostType.Image => "photo",
            PostType.Audio => "music",
            _ => string.IsNullOrWhiteSpace(mediaUrl) ? "text" : "photo"
        };

        _ = Task.Run(async () =>
        {
            try
            {
                await _socialPublishDispatcher.DispatchAsync(post.Id, post.Content ?? string.Empty, mediaUrl, mediaType);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Social publish dispatch task failed for post {PostId}.", post.Id);
            }
        });
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
            post.TruthScore = null;
            post.TruthCorrection = null;

            if (!IsOpinionOrQuestion(dto.Content))
            {
                var bgPostId = postId;
                var bgContent = dto.Content;
                _ = Task.Run(async () =>
                {
                    try
                    {
                        using var cts = new System.Threading.CancellationTokenSource(TimeSpan.FromSeconds(25));
                        var truthTask = _truthService.AnalyzeContentAsync(bgContent);
                        var completedTask = await Task.WhenAny(truthTask, Task.Delay(25000, cts.Token));
                        if (completedTask != truthTask)
                        {
                            _logger.LogWarning("Background truth re-analysis timed out for post {PostId}.", bgPostId);
                            return;
                        }

                        var truthResult = await truthTask;
                        await using var scope = _scopeFactory.CreateAsyncScope();
                        var repo = scope.ServiceProvider.GetRequiredService<IPostRepository>();
                        var saved = await repo.GetByIdAsync(bgPostId);
                        if (saved is not null)
                        {
                            saved.TruthScore = truthResult.TruthScore;
                            saved.TruthCorrection = truthResult.Correction;
                            saved.TruthStatus = TruthStatusHelper.FromScore(truthResult.TruthScore);
                            await repo.UpdateAsync(saved);
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Background truth re-analysis failed for post {PostId}.", bgPostId);
                    }
                });
            }
        }

        if (dto.IsSensitive.HasValue)
        {
            post.IsSensitive = dto.IsSensitive.Value;
        }

        if (dto.IsTruthDispatch.HasValue)
        {
            post.IsTruthDispatch = dto.IsTruthDispatch.Value;
        }

        if (dto.TruthDeclarationAccepted.HasValue)
        {
            post.TruthDeclarationAccepted = dto.TruthDeclarationAccepted.Value;
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
            var posts = await _postFeedRankingService.GenerateFeedAsync(userId, page, pageSize);
            return await MapToPostDtosAsync(posts, userId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Post feed query failed; trying own-posts fallback for user {UserId}", userId);
            try
            {
                var ownPosts = await _postRepository.FindAsync(p => !p.IsDeleted && p.UserId == userId);
                var ordered = ownPosts.OrderByDescending(p => p.CreatedAt).Take(pageSize);
                return await MapToPostDtosAsync(ordered, userId);
            }
            catch (Exception fallbackEx)
            {
                _logger.LogWarning(fallbackEx, "Own-posts fallback also failed for user {UserId}.", userId);
                return Array.Empty<PostDto>();
            }
        }
    }

    public async Task<IEnumerable<PostDto>> GetUserPostsAsync(Guid userId, int page, int pageSize)
    {
        var posts = await _postRepository.GetUserPostsAsync(userId, page, pageSize);
        return await MapToPostDtosAsync(posts, userId);
    }

    public async Task<PostInteractionDto> LikePostAsync(Guid userId, Guid postId)
    {
        var post = await _postRepository.GetByIdAsync(postId);
        if (post == null || post.IsDeleted)
        {
            throw new NotFoundException("Post not found");
        }

        await _postRepository.LikePostAsync(postId, userId);
        _logger.LogInformation("User {UserId} liked post {PostId}", userId, postId);

        // Award WSC to the post author for receiving a like (fire-and-forget).
        if (post.UserId != userId)
        {
            var liker = await _userRepository.GetByIdAsync(userId);
            var likerName = liker?.DisplayName ?? "Someone";
            _ = _engagementNotificationService.NotifyPostLikedAsync(
                post.UserId,
                postId,
                likerName,
                post.Content ?? "your post"
            );

            _ = Task.Run(async () =>
            {
                try
                {
                    await _wiseCoinService.EarnWSCAsync(
                        post.UserId,
                        0.25m,
                        TransactionType.EngagementReward,
                        $"Like reward: post received a like",
                        applyMultipliers: true);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "WSC like reward failed for post author {UserId}", post.UserId);
                }
            });
        }

        PostInteractionState interaction;
        try
        {
            interaction = await _postRepository.GetInteractionStateAsync(postId, userId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "GetInteractionState failed after like for post {PostId}; returning estimated state.", postId);
            // The like was already saved — return a best-effort response so the client doesn't see a 500.
            return new PostInteractionDto
            {
                PostId = postId,
                LikesCount = post.LikesCount + 1,
                RepostsCount = post.RepostsCount,
                CommentsCount = post.CommentsCount,
                BookmarksCount = post.BookmarksCount,
                IsLiked = true,
                IsReposted = false,
                IsBookmarked = false
            };
        }

        // Update engagement in content crawler (fire-and-forget)
        _ = Task.Run(async () =>
        {
            try { await _contentCrawler.UpdateEngagementAsync(postId, post.ViewsCount, interaction.LikesCount, interaction.RepostsCount); }
            catch (Exception ex) { _logger.LogWarning(ex, "Content crawler engagement update failed for post {PostId}", postId); }
        });

        return new PostInteractionDto
        {
            PostId = postId,
            LikesCount = interaction.LikesCount,
            RepostsCount = interaction.RepostsCount,
            CommentsCount = interaction.CommentsCount,
            BookmarksCount = interaction.BookmarksCount,
            IsLiked = interaction.IsLiked,
            IsReposted = interaction.IsReposted,
            IsBookmarked = interaction.IsBookmarked
        };
    }

    public async Task<PostInteractionDto> UnlikePostAsync(Guid userId, Guid postId)
    {
        var post = await _postRepository.GetByIdAsync(postId);
        if (post == null || post.IsDeleted)
        {
            throw new NotFoundException("Post not found");
        }

        await _postRepository.UnlikePostAsync(postId, userId);
        _logger.LogInformation("User {UserId} unliked post {PostId}", userId, postId);

        PostInteractionState interaction;
        try
        {
            interaction = await _postRepository.GetInteractionStateAsync(postId, userId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "GetInteractionState failed after unlike for post {PostId}; returning estimated state.", postId);
            return new PostInteractionDto
            {
                PostId = postId,
                LikesCount = Math.Max(0, post.LikesCount - 1),
                RepostsCount = post.RepostsCount,
                CommentsCount = post.CommentsCount,
                BookmarksCount = post.BookmarksCount,
                IsLiked = false,
                IsReposted = false,
                IsBookmarked = false
            };
        }

        _ = Task.Run(async () =>
        {
            try { await _contentCrawler.UpdateEngagementAsync(postId, post.ViewsCount, interaction.LikesCount, interaction.RepostsCount); }
            catch (Exception ex) { _logger.LogWarning(ex, "Content crawler engagement update failed for post {PostId}", postId); }
        });

        return new PostInteractionDto
        {
            PostId = postId,
            LikesCount = interaction.LikesCount,
            RepostsCount = interaction.RepostsCount,
            CommentsCount = interaction.CommentsCount,
            BookmarksCount = interaction.BookmarksCount,
            IsLiked = interaction.IsLiked,
            IsReposted = interaction.IsReposted,
            IsBookmarked = interaction.IsBookmarked
        };
    }

    public async Task<PostInteractionDto> RepostPostAsync(Guid userId, Guid postId)
    {
        var post = await _postRepository.GetByIdAsync(postId);
        if (post == null || post.IsDeleted)
        {
            throw new NotFoundException("Post not found");
        }

        await _postRepository.RepostPostAsync(postId, userId);
        _logger.LogInformation("User {UserId} reposted post {PostId}", userId, postId);

        // Create a visible repost Post so it appears in the user's feed and followers' feeds.
        var existingReposts = await _postRepository.FindAsync(p => p.UserId == userId && p.RepostOfId == postId && !p.IsDeleted);
        if (!existingReposts.Any())
        {
            try
            {
                var repostPost = new Post
                {
                    Id = Guid.NewGuid(),
                    UserId = userId,
                    Content = string.Empty,
                    Type = post.Type,
                    RepostOfId = postId
                };
                await _postRepository.AddAsync(repostPost);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to create visible repost post for user {UserId} reposting {PostId}.", userId, postId);
            }
        }

        // Award WSC to the post author for receiving a repost (fire-and-forget).
        if (post.UserId != userId)
        {
            var sharedBy = await _userRepository.GetByIdAsync(userId);
            var sharedByName = sharedBy?.DisplayName ?? "Someone";
            _ = _engagementNotificationService.NotifyPostSharedAsync(
                post.UserId,
                postId,
                sharedByName,
                post.Content ?? "your post"
            );

            _ = Task.Run(async () =>
            {
                try
                {
                    await _wiseCoinService.EarnWSCAsync(
                        post.UserId,
                        0.50m,
                        TransactionType.EngagementReward,
                        $"Repost reward: post was reposted",
                        applyMultipliers: true);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "WSC repost reward failed for post author {UserId}", post.UserId);
                }
            });
        }

        PostInteractionState repostInteraction;
        try
        {
            repostInteraction = await _postRepository.GetInteractionStateAsync(postId, userId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "GetInteractionState failed after repost for post {PostId}; returning estimated state.", postId);
            return new PostInteractionDto
            {
                PostId = postId,
                LikesCount = post.LikesCount,
                RepostsCount = post.RepostsCount + 1,
                CommentsCount = post.CommentsCount,
                BookmarksCount = post.BookmarksCount,
                IsLiked = false,
                IsReposted = true,
                IsBookmarked = false
            };
        }

        _ = Task.Run(async () =>
        {
            try { await _contentCrawler.UpdateEngagementAsync(postId, post.ViewsCount, repostInteraction.LikesCount, repostInteraction.RepostsCount); }
            catch (Exception ex) { _logger.LogWarning(ex, "Content crawler engagement update failed for post {PostId}", postId); }
        });

        return new PostInteractionDto
        {
            PostId = postId,
            LikesCount = repostInteraction.LikesCount,
            RepostsCount = repostInteraction.RepostsCount,
            CommentsCount = repostInteraction.CommentsCount,
            BookmarksCount = repostInteraction.BookmarksCount,
            IsLiked = repostInteraction.IsLiked,
            IsReposted = repostInteraction.IsReposted,
            IsBookmarked = repostInteraction.IsBookmarked
        };
    }

    public async Task<PostInteractionDto> UnrepostPostAsync(Guid userId, Guid postId)
    {
        var post = await _postRepository.GetByIdAsync(postId);
        if (post == null || post.IsDeleted)
        {
            throw new NotFoundException("Post not found");
        }

        await _postRepository.UnrepostPostAsync(postId, userId);
        _logger.LogInformation("User {UserId} unreposted post {PostId}", userId, postId);

        // Remove the visible repost Post entry created when the user reposted.
        var repostPosts = await _postRepository.FindAsync(p => p.UserId == userId && p.RepostOfId == postId && !p.IsDeleted);
        foreach (var repostPost in repostPosts)
        {
            try
            {
                repostPost.IsDeleted = true;
                repostPost.DeletedAt = DateTime.UtcNow;
                await _postRepository.UpdateAsync(repostPost);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to remove visible repost post {RepostPostId} for user {UserId}.", repostPost.Id, userId);
            }
        }

        PostInteractionState unrepostInteraction;
        try
        {
            unrepostInteraction = await _postRepository.GetInteractionStateAsync(postId, userId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "GetInteractionState failed after unrepost for post {PostId}; returning estimated state.", postId);
            return new PostInteractionDto
            {
                PostId = postId,
                LikesCount = post.LikesCount,
                RepostsCount = Math.Max(0, post.RepostsCount - 1),
                CommentsCount = post.CommentsCount,
                BookmarksCount = post.BookmarksCount,
                IsLiked = false,
                IsReposted = false,
                IsBookmarked = false
            };
        }

        _ = Task.Run(async () =>
        {
            try { await _contentCrawler.UpdateEngagementAsync(postId, post.ViewsCount, unrepostInteraction.LikesCount, unrepostInteraction.RepostsCount); }
            catch (Exception ex) { _logger.LogWarning(ex, "Content crawler engagement update failed for post {PostId}", postId); }
        });

        return new PostInteractionDto
        {
            PostId = postId,
            LikesCount = unrepostInteraction.LikesCount,
            RepostsCount = unrepostInteraction.RepostsCount,
            CommentsCount = unrepostInteraction.CommentsCount,
            BookmarksCount = unrepostInteraction.BookmarksCount,
            IsLiked = unrepostInteraction.IsLiked,
            IsReposted = unrepostInteraction.IsReposted,
            IsBookmarked = unrepostInteraction.IsBookmarked
        };
    }

    public async Task<PostInteractionDto> BookmarkPostAsync(Guid userId, Guid postId)
    {
        var post = await _postRepository.GetByIdAsync(postId);
        if (post == null || post.IsDeleted)
        {
            throw new NotFoundException("Post not found");
        }

        await _postRepository.BookmarkPostAsync(postId, userId);
        _logger.LogInformation("User {UserId} bookmarked post {PostId}", userId, postId);
        return await BuildPostInteractionDtoAsync(postId, userId);
    }

    public async Task<PostInteractionDto> UnbookmarkPostAsync(Guid userId, Guid postId)
    {
        var post = await _postRepository.GetByIdAsync(postId);
        if (post == null || post.IsDeleted)
        {
            throw new NotFoundException("Post not found");
        }

        await _postRepository.UnbookmarkPostAsync(postId, userId);
        _logger.LogInformation("User {UserId} unbookmarked post {PostId}", userId, postId);
        return await BuildPostInteractionDtoAsync(postId, userId);
    }

    public async Task<IReadOnlyList<PostCommentDto>> GetCommentsAsync(Guid postId, int page, int pageSize)
    {
        var post = await _postRepository.GetByIdAsync(postId);
        if (post == null || post.IsDeleted)
        {
            throw new NotFoundException("Post not found");
        }

        var comments = await _postRepository.GetCommentsAsync(postId, page, pageSize);
        var interaction = await _postRepository.GetInteractionStateAsync(postId, null);

        return comments
            .Select(comment => BuildPostCommentDto(comment, interaction.CommentsCount))
            .ToList();
    }

    public async Task<PostCommentDto> AddCommentAsync(Guid userId, Guid postId, AddPostCommentDto dto)
    {
        var post = await _postRepository.GetByIdAsync(postId);
        if (post == null || post.IsDeleted)
        {
            throw new NotFoundException("Post not found");
        }

        var content = (dto.Content ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(content))
        {
            throw new BadRequestException("Comment text is required.");
        }
        if (content.Length > MaxCommentLength)
        {
            throw new BadRequestException($"Comment cannot exceed {MaxCommentLength} characters.");
        }

        var created = await _postRepository.AddCommentAsync(postId, userId, content, dto.ParentCommentId);

        if (post.UserId != userId)
        {
            var commenter = await _userRepository.GetByIdAsync(userId);
            var commenterName = commenter?.DisplayName ?? "Someone";
            _ = _engagementNotificationService.NotifyPostCommentedAsync(
                post.UserId,
                postId,
                commenterName,
                post.Content ?? "your post"
            );
        }

        var interaction = await _postRepository.GetInteractionStateAsync(postId, userId);

        try
        {
            await _wiseCoinService.AwardJobWellDoneBadgeAsync(userId, "comment_added");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to award comment badge for user {UserId}", userId);
        }
        return BuildPostCommentDto(created, interaction.CommentsCount);
    }

    public async Task<CommentInteractionDto> LikeCommentAsync(Guid userId, Guid commentId)
    {
        CommentInteractionState interaction;
        try
        {
            interaction = await _postRepository.LikeCommentAsync(commentId, userId);
        }
        catch (InvalidOperationException ex)
        {
            throw new NotFoundException(ex.Message);
        }

        return new CommentInteractionDto
        {
            CommentId = interaction.CommentId,
            LikesCount = interaction.LikesCount,
            IsLiked = interaction.IsLiked
        };
    }

    public async Task<CommentInteractionDto> UnlikeCommentAsync(Guid userId, Guid commentId)
    {
        CommentInteractionState interaction;
        try
        {
            interaction = await _postRepository.UnlikeCommentAsync(commentId, userId);
        }
        catch (InvalidOperationException ex)
        {
            throw new NotFoundException(ex.Message);
        }

        return new CommentInteractionDto
        {
            CommentId = interaction.CommentId,
            LikesCount = interaction.LikesCount,
            IsLiked = interaction.IsLiked
        };
    }

    public async Task<IEnumerable<PostDto>> GetTrendingPostsAsync(int count)
    {
        try
        {
            var posts = await _postRepository.GetTrendingPostsAsync(count);
            return await MapToPostDtosAsync(posts, null);
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

    public async Task TrackViewAsync(Guid postId)
    {
        try
        {
            await _postRepository.IncrementViewAsync(postId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "View tracking failed for post {PostId}", postId);
        }
    }

    public async Task<PostInteractionDto> SharePostAsync(Guid postId)
    {
        try
        {
            await _postRepository.IncrementShareAsync(postId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Share increment failed for post {PostId}", postId);
        }

        return await BuildPostInteractionDtoAsync(postId, null);
    }

    private async Task<PostDto> GetPostDtoAsync(Guid postId, Guid? viewerUserId = null)
    {
        var post = await _postRepository.GetByIdAsync(postId);
        if (post == null)
        {
            throw new NotFoundException("Post not found");
        }

        // GetByIdAsync (FindAsync) does not eagerly load navigation properties.
        // Resolve the author separately so the DTO always has user info.
        User? author = post.User;
        if (author == null && post.UserId != Guid.Empty)
        {
            try { author = await _userRepository.GetByIdAsync(post.UserId); }
            catch (Exception ex) { _logger.LogWarning(ex, "Failed to load author for post {PostId}.", postId); }
        }

        var states = await _postRepository.GetBatchInteractionStatesAsync([postId], viewerUserId);
        states.TryGetValue(postId, out var interaction);
        var engagementUsers = await BuildPostEngagementUsersAsync(post.Id);
        return BuildPostDto(post, author, interaction, engagementUsers);
    }

    private PostDto BuildPostDto(
        Post post,
        User? user,
        PostInteractionState? interaction = null,
        IReadOnlyList<PostEngagementUserDto>? engagementUsers = null,
        bool includeNestedPosts = true)
    {
        var (hashtags, partials, _) = ExtractSignalTags(post.Content);
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
            Provenance = ReadProvenanceMetadata(post.TruthSources),
            LocationName = post.LocationName,
            IsTruthDispatch = post.IsTruthDispatch,
            TruthDeclarationAccepted = post.TruthDeclarationAccepted,
            Latitude = post.Latitude.HasValue ? (double?)post.Latitude.Value : null,
            Longitude = post.Longitude.HasValue ? (double?)post.Longitude.Value : null,
            IsSensitive = post.IsSensitive,
            IsPinned = post.IsPinned,
            LikesCount = interaction?.LikesCount ?? post.LikesCount,
            RepostsCount = interaction?.RepostsCount ?? post.RepostsCount,
            CommentsCount = post.CommentsCount,
            SharesCount = post.SharesCount,
            BookmarksCount = interaction?.BookmarksCount ?? post.BookmarksCount,
            ViewsCount = post.ViewsCount,
            Hashtags = hashtags,
            Partials = partials,
            CreatedAt = post.CreatedAt,
            IsLiked = interaction?.IsLiked ?? false,
            IsReposted = interaction?.IsReposted ?? false,
            IsBookmarked = interaction?.IsBookmarked ?? false,
            RepostOf = (includeNestedPosts && post.RepostOf != null)
                ? BuildPostDto(post.RepostOf, post.RepostOf.User, includeNestedPosts: false)
                : null,
            User = user is null ? new UserDto() : MapToUserDto(user),
            EngagementUsers = engagementUsers ?? Array.Empty<PostEngagementUserDto>()
        };
    }

    private static (string[] Hashtags, string[] Partials, string[] AllTags) ExtractSignalTags(string? content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return (Array.Empty<string>(), Array.Empty<string>(), Array.Empty<string>());
        }

        var hashtags = HashtagRegex
            .Matches(content)
            .Select(match => NormalizeMetadataValue(match.Groups[1].Value)?.ToLowerInvariant())
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(32)
            .Cast<string>()
            .ToArray();

        var partials = PartialRegex
            .Matches(content)
            .Select(match => NormalizeMetadataValue(match.Groups[1].Value)?.ToLowerInvariant())
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(32)
            .Cast<string>()
            .ToArray();

        var all = hashtags
            .Select(tag => $"#{tag}")
            .Concat(partials.Select(tag => $"%{tag}"))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(48)
            .ToArray();

        return (hashtags, partials, all);
    }

    private async Task<IReadOnlyList<PostEngagementUserDto>> BuildPostEngagementUsersAsync(Guid postId)
    {
        var actors = await _postRepository.GetRecentEngagementActorsAsync(postId, 3);
        if (actors.Count == 0)
        {
            return Array.Empty<PostEngagementUserDto>();
        }

        var userIds = actors.Select(actor => actor.UserId).Distinct().ToArray();
        var users = await _userRepository.FindAsync(user => userIds.Contains(user.Id));
        var userMap = users.ToDictionary(user => user.Id, user => MapToUserDto(user));

        return actors
            .Where(actor => userMap.ContainsKey(actor.UserId))
            .OrderByDescending(actor => actor.CreatedAt)
            .Select(actor => new PostEngagementUserDto
            {
                Type = actor.EngagementType,
                EngagedAt = actor.CreatedAt,
                User = userMap[actor.UserId]
            })
            .ToList();
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

    private static JsonDocument? BuildProvenanceMetadata(PostProvenanceDto? provenance)
    {
        if (provenance is null)
        {
            return null;
        }

        var sourceUrl = NormalizeMetadataValue(provenance.SourceUrl);
        var evidenceSummary = NormalizeMetadataValue(provenance.EvidenceSummary);
        var verificationStatus = NormalizeMetadataValue(provenance.VerificationStatus);
        var correctionReferenceUrl = NormalizeMetadataValue(provenance.CorrectionReferenceUrl);
        var capturedAtUtc = NormalizeMetadataValue(provenance.CapturedAtUtc) ?? DateTime.UtcNow.ToString("O");

        if (sourceUrl is null && evidenceSummary is null && verificationStatus is null && correctionReferenceUrl is null)
        {
            return null;
        }

        var payload = new Dictionary<string, string?>
        {
            ["sourceUrl"] = sourceUrl,
            ["evidenceSummary"] = evidenceSummary,
            ["verificationStatus"] = verificationStatus,
            ["correctionReferenceUrl"] = correctionReferenceUrl,
            ["capturedAtUtc"] = capturedAtUtc
        };

        return JsonDocument.Parse(JsonSerializer.Serialize(payload));
    }

    private static PostProvenanceDto? ReadProvenanceMetadata(JsonDocument? metadata)
    {
        if (metadata?.RootElement.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        var provenance = new PostProvenanceDto
        {
            SourceUrl = NormalizeMetadataValue(ReadMediaMetadataValue(metadata, "sourceUrl")),
            EvidenceSummary = NormalizeMetadataValue(ReadMediaMetadataValue(metadata, "evidenceSummary")),
            VerificationStatus = NormalizeMetadataValue(ReadMediaMetadataValue(metadata, "verificationStatus")),
            CorrectionReferenceUrl = NormalizeMetadataValue(ReadMediaMetadataValue(metadata, "correctionReferenceUrl")),
            CapturedAtUtc = NormalizeMetadataValue(ReadMediaMetadataValue(metadata, "capturedAtUtc"))
        };

        var hasValue = provenance.SourceUrl is not null
            || provenance.EvidenceSummary is not null
            || provenance.VerificationStatus is not null
            || provenance.CorrectionReferenceUrl is not null
            || provenance.CapturedAtUtc is not null;

        return hasValue ? provenance : null;
    }

    private static string? NormalizeMetadataValue(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
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

    private async Task<IEnumerable<PostDto>> MapToPostDtosAsync(IEnumerable<Post> posts, Guid? viewerUserId)
    {
        var postList = posts.ToList();
        if (postList.Count == 0) return Array.Empty<PostDto>();

        // Batch all viewer-specific interaction queries into 3 DB calls (instead of N*6 calls).
        // This also avoids the SaveChangesAsync that GetInteractionStateAsync triggers per post.
        var postIds = postList.Select(p => p.Id).ToList();
        var interactionStates = await _postRepository.GetBatchInteractionStatesAsync(postIds, viewerUserId);

        var dtos = new List<PostDto>(postList.Count);
        foreach (var post in postList)
        {
            try
            {
                interactionStates.TryGetValue(post.Id, out var interaction);
                var engagementUsers = await BuildPostEngagementUsersAsync(post.Id);
                // Use the navigation property already loaded by the feed Include clause.
                // Fall back to a separate DB lookup only when the navigation property is null.
                var author = post.User;
                if (author == null && post.UserId != Guid.Empty)
                {
                    try { author = await _userRepository.GetByIdAsync(post.UserId); }
                    catch { /* skip author info if lookup fails */ }
                }
                dtos.Add(BuildPostDto(post, author, interaction, engagementUsers));
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to map post {PostId} to DTO; skipping.", post.Id);
            }
        }
        return dtos;
    }

    private async Task<PostInteractionDto> BuildPostInteractionDtoAsync(Guid postId, Guid? userId)
    {
        var interaction = await _postRepository.GetInteractionStateAsync(postId, userId);
        return new PostInteractionDto
        {
            PostId = postId,
            LikesCount = interaction.LikesCount,
            RepostsCount = interaction.RepostsCount,
            CommentsCount = interaction.CommentsCount,
            BookmarksCount = interaction.BookmarksCount,
            ViewsCount = interaction.ViewsCount,
            SharesCount = interaction.SharesCount,
            IsLiked = interaction.IsLiked,
            IsReposted = interaction.IsReposted,
            IsBookmarked = interaction.IsBookmarked
        };
    }

    private PostCommentDto BuildPostCommentDto(Comment comment, int commentsCount)
    {
        return new PostCommentDto
        {
            Id = comment.Id,
            PostId = comment.PostId,
            UserId = comment.UserId,
            ParentCommentId = comment.ParentCommentId,
            Content = comment.Content,
            CreatedAt = comment.CreatedAt,
            LikesCount = comment.LikesCount,
            RepliesCount = comment.RepliesCount,
            CommentsCount = commentsCount,
            User = comment.User is null ? new UserDto() : MapToUserDto(comment.User)
        };
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

    private static List<string> ExtractHashtags(string content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return new List<string>();
        }

        return HashtagRegex
            .Matches(content)
            .Select(match => NormalizeMetadataValue(match.Groups[1].Value)?.ToLowerInvariant())
            .Where(tag => !string.IsNullOrWhiteSpace(tag) && tag!.Length <= MaxHashtagLength)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(MaxHashtagsPerPost)
            .Cast<string>()
            .ToList();
    }

    private static void ValidateCreatePostInput(CreatePostDto dto, string[]? mediaUrls)
    {
        var content = dto.Content ?? string.Empty;
        var hasContent = !string.IsNullOrWhiteSpace(content);
        var hasMedia = mediaUrls is { Length: > 0 }
            || !string.IsNullOrWhiteSpace(dto.MediaUrl)
            || !string.IsNullOrWhiteSpace(dto.YoutubeUrl)
            || !string.IsNullOrWhiteSpace(dto.TikTokUrl)
            || !string.IsNullOrWhiteSpace(dto.FacebookUrl);
        var isReferencePost = dto.RepostOfId.HasValue || dto.QuoteOfId.HasValue;

        if (!hasContent && !hasMedia && !isReferencePost)
        {
            throw new BadRequestException("Post content is required unless media or a repost/quote reference is provided.");
        }

        if (content.Length > MaxPostLength)
        {
            throw new BadRequestException($"Post cannot exceed {MaxPostLength} characters.");
        }

        var hashtagMatches = HashtagRegex.Matches(content);
        if (content.Contains('#', StringComparison.Ordinal) && hashtagMatches.Count == 0)
        {
            throw new BadRequestException("Post contains malformed hashtags.");
        }

        if (hashtagMatches.Count > MaxHashtagsPerPost)
        {
            throw new BadRequestException($"Post cannot contain more than {MaxHashtagsPerPost} hashtags.");
        }

        foreach (Match match in hashtagMatches)
        {
            var tag = match.Groups[1].Value;
            if (tag.Length > MaxHashtagLength)
            {
                throw new BadRequestException($"Hashtag #{tag} exceeds the {MaxHashtagLength} character limit.");
            }
        }
    }
}
