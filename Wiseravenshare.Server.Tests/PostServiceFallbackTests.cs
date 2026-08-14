using Microsoft.Extensions.Logging.Abstractions;
using Wiseravenshare.Server.DTOs;
using Wiseravenshare.Server.DTOs.Post;
using Wiseravenshare.Server.DTOs.User;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Interfaces.Repositories;
using Wiseravenshare.Server.Services;
using Xunit;

namespace Wiseravenshare.Server.Tests;

public class PostServiceFallbackTests
{
    [Fact]
    public async System.Threading.Tasks.Task CreatePostAsync_ReturnsFallbackPost_WhenRepositoryPersistenceFails()
    {
        var service = new PostService(
            new ThrowingPostRepository(),
            new StubUserRepository(),
            new StubTruthService(),
            NullLogger<PostService>.Instance);

        var result = await service.CreatePostAsync(
            Guid.NewGuid(),
            new CreatePostDto
            {
                Content = "hello world",
                Type = "Image",
                MediaUrl = "https://example.com/photo.jpg",
                MediaUrls = "https://example.com/photo.jpg"
            });

        Assert.NotEqual(Guid.Empty, result.Id);
        Assert.Equal("hello world", result.Content);
        Assert.Equal("Image", result.Type);
        Assert.Equal("https://example.com/photo.jpg", result.MediaUrl);
    }

    [Fact]
    public async System.Threading.Tasks.Task CreatePostAsync_ReturnsFallbackPost_WhenUserLookupFails()
    {
        var service = new PostService(
            new StubPostRepository(),
            new ThrowingUserRepository(),
            new StubTruthService(),
            NullLogger<PostService>.Instance);

        var result = await service.CreatePostAsync(
            Guid.NewGuid(),
            new CreatePostDto
            {
                Content = "hello world",
                Type = "Image",
                MediaUrl = "https://example.com/photo.jpg",
                MediaUrls = "https://example.com/photo.jpg"
            });

        Assert.NotEqual(Guid.Empty, result.Id);
        Assert.Equal("hello world", result.Content);
        Assert.Equal("Image", result.Type);
        Assert.Equal("https://example.com/photo.jpg", result.MediaUrl);
    }

    private sealed class ThrowingPostRepository : IPostRepository
    {
        public System.Threading.Tasks.Task<Post?> GetByIdAsync(Guid id) => System.Threading.Tasks.Task.FromResult<Post?>(null);
        public System.Threading.Tasks.Task<IEnumerable<Post>> GetAllAsync() => System.Threading.Tasks.Task.FromResult<IEnumerable<Post>>(Array.Empty<Post>());
        public System.Threading.Tasks.Task<IEnumerable<Post>> FindAsync(System.Linq.Expressions.Expression<Func<Post, bool>> predicate) => System.Threading.Tasks.Task.FromResult<IEnumerable<Post>>(Array.Empty<Post>());
        public System.Threading.Tasks.Task<Post> AddAsync(Post entity) => throw new InvalidOperationException("DB unavailable");
        public System.Threading.Tasks.Task<IEnumerable<Post>> AddRangeAsync(IEnumerable<Post> entities) => throw new NotImplementedException();
        public System.Threading.Tasks.Task UpdateAsync(Post entity) => throw new NotImplementedException();
        public System.Threading.Tasks.Task DeleteAsync(Post entity) => throw new NotImplementedException();
        public System.Threading.Tasks.Task DeleteRangeAsync(IEnumerable<Post> entities) => throw new NotImplementedException();
        public System.Threading.Tasks.Task<bool> ExistsAsync(System.Linq.Expressions.Expression<Func<Post, bool>> predicate) => System.Threading.Tasks.Task.FromResult(false);
        public System.Threading.Tasks.Task<int> CountAsync(System.Linq.Expressions.Expression<Func<Post, bool>>? predicate = null) => System.Threading.Tasks.Task.FromResult(0);
        public System.Threading.Tasks.Task<IEnumerable<Post>> GetPagedAsync(int pageNumber, int pageSize, System.Linq.Expressions.Expression<Func<Post, bool>>? predicate = null, Func<IQueryable<Post>, IOrderedQueryable<Post>>? orderBy = null) => System.Threading.Tasks.Task.FromResult<IEnumerable<Post>>(Array.Empty<Post>());
        public System.Threading.Tasks.Task<IEnumerable<Post>> GetFeedAsync(Guid userId, int page, int pageSize) => throw new NotImplementedException();
        public System.Threading.Tasks.Task<IEnumerable<Post>> GetUserPostsAsync(Guid userId, int page, int pageSize) => throw new NotImplementedException();
        public System.Threading.Tasks.Task<IEnumerable<Post>> GetTrendingPostsAsync(int count) => throw new NotImplementedException();
        public System.Threading.Tasks.Task<IEnumerable<Post>> GetRepliesAsync(Guid postId) => throw new NotImplementedException();
        public System.Threading.Tasks.Task<int> GetPostCountAsync(Guid userId) => System.Threading.Tasks.Task.FromResult(0);
        public System.Threading.Tasks.Task LikePostAsync(Guid postId, Guid userId) => throw new NotImplementedException();
        public System.Threading.Tasks.Task UnlikePostAsync(Guid postId, Guid userId) => throw new NotImplementedException();
        public System.Threading.Tasks.Task RepostPostAsync(Guid postId, Guid userId) => throw new NotImplementedException();
        public System.Threading.Tasks.Task UnrepostPostAsync(Guid postId, Guid userId) => throw new NotImplementedException();
        public System.Threading.Tasks.Task BookmarkPostAsync(Guid postId, Guid userId) => throw new NotImplementedException();
        public System.Threading.Tasks.Task UnbookmarkPostAsync(Guid postId, Guid userId) => throw new NotImplementedException();
        public System.Threading.Tasks.Task<PostInteractionState> GetInteractionStateAsync(Guid postId, Guid? userId = null)
            => System.Threading.Tasks.Task.FromResult(new PostInteractionState(0, 0, 0, false, false, false));
    }

    private sealed class StubPostRepository : IPostRepository
    {
        public System.Threading.Tasks.Task<Post?> GetByIdAsync(Guid id) => System.Threading.Tasks.Task.FromResult<Post?>(null);
        public System.Threading.Tasks.Task<IEnumerable<Post>> GetAllAsync() => System.Threading.Tasks.Task.FromResult<IEnumerable<Post>>(Array.Empty<Post>());
        public System.Threading.Tasks.Task<IEnumerable<Post>> FindAsync(System.Linq.Expressions.Expression<Func<Post, bool>> predicate) => System.Threading.Tasks.Task.FromResult<IEnumerable<Post>>(Array.Empty<Post>());
        public System.Threading.Tasks.Task<Post> AddAsync(Post entity) => System.Threading.Tasks.Task.FromResult(entity);
        public System.Threading.Tasks.Task<IEnumerable<Post>> AddRangeAsync(IEnumerable<Post> entities) => System.Threading.Tasks.Task.FromResult<IEnumerable<Post>>(entities);
        public System.Threading.Tasks.Task UpdateAsync(Post entity) => System.Threading.Tasks.Task.CompletedTask;
        public System.Threading.Tasks.Task DeleteAsync(Post entity) => System.Threading.Tasks.Task.CompletedTask;
        public System.Threading.Tasks.Task DeleteRangeAsync(IEnumerable<Post> entities) => System.Threading.Tasks.Task.CompletedTask;
        public System.Threading.Tasks.Task<bool> ExistsAsync(System.Linq.Expressions.Expression<Func<Post, bool>> predicate) => System.Threading.Tasks.Task.FromResult(false);
        public System.Threading.Tasks.Task<int> CountAsync(System.Linq.Expressions.Expression<Func<Post, bool>>? predicate = null) => System.Threading.Tasks.Task.FromResult(0);
        public System.Threading.Tasks.Task<IEnumerable<Post>> GetPagedAsync(int pageNumber, int pageSize, System.Linq.Expressions.Expression<Func<Post, bool>>? predicate = null, Func<IQueryable<Post>, IOrderedQueryable<Post>>? orderBy = null) => System.Threading.Tasks.Task.FromResult<IEnumerable<Post>>(Array.Empty<Post>());
        public System.Threading.Tasks.Task<IEnumerable<Post>> GetFeedAsync(Guid userId, int page, int pageSize) => System.Threading.Tasks.Task.FromResult<IEnumerable<Post>>(Array.Empty<Post>());
        public System.Threading.Tasks.Task<IEnumerable<Post>> GetUserPostsAsync(Guid userId, int page, int pageSize) => System.Threading.Tasks.Task.FromResult<IEnumerable<Post>>(Array.Empty<Post>());
        public System.Threading.Tasks.Task<IEnumerable<Post>> GetTrendingPostsAsync(int count) => System.Threading.Tasks.Task.FromResult<IEnumerable<Post>>(Array.Empty<Post>());
        public System.Threading.Tasks.Task<IEnumerable<Post>> GetRepliesAsync(Guid postId) => System.Threading.Tasks.Task.FromResult<IEnumerable<Post>>(Array.Empty<Post>());
        public System.Threading.Tasks.Task<int> GetPostCountAsync(Guid userId) => System.Threading.Tasks.Task.FromResult(0);
        public System.Threading.Tasks.Task LikePostAsync(Guid postId, Guid userId) => System.Threading.Tasks.Task.CompletedTask;
        public System.Threading.Tasks.Task UnlikePostAsync(Guid postId, Guid userId) => System.Threading.Tasks.Task.CompletedTask;
        public System.Threading.Tasks.Task RepostPostAsync(Guid postId, Guid userId) => System.Threading.Tasks.Task.CompletedTask;
        public System.Threading.Tasks.Task UnrepostPostAsync(Guid postId, Guid userId) => System.Threading.Tasks.Task.CompletedTask;
        public System.Threading.Tasks.Task BookmarkPostAsync(Guid postId, Guid userId) => System.Threading.Tasks.Task.CompletedTask;
        public System.Threading.Tasks.Task UnbookmarkPostAsync(Guid postId, Guid userId) => System.Threading.Tasks.Task.CompletedTask;
        public System.Threading.Tasks.Task<PostInteractionState> GetInteractionStateAsync(Guid postId, Guid? userId = null)
            => System.Threading.Tasks.Task.FromResult(new PostInteractionState(0, 0, 0, false, false, false));
    }

    private sealed class StubUserRepository : IUserRepository
    {
        public System.Threading.Tasks.Task<User?> GetByIdAsync(Guid id) => System.Threading.Tasks.Task.FromResult<User?>(new User { Id = id, Email = "user@example.com", Username = "user", DisplayName = "User", Role = UserRole.User, IsActive = true });
        public System.Threading.Tasks.Task<IEnumerable<User>> GetAllAsync() => System.Threading.Tasks.Task.FromResult<IEnumerable<User>>(Array.Empty<User>());
        public System.Threading.Tasks.Task<IEnumerable<User>> FindAsync(System.Linq.Expressions.Expression<Func<User, bool>> predicate) => System.Threading.Tasks.Task.FromResult<IEnumerable<User>>(Array.Empty<User>());
        public System.Threading.Tasks.Task<User> AddAsync(User entity) => System.Threading.Tasks.Task.FromResult(entity);
        public System.Threading.Tasks.Task<IEnumerable<User>> AddRangeAsync(IEnumerable<User> entities) => System.Threading.Tasks.Task.FromResult<IEnumerable<User>>(entities);
        public System.Threading.Tasks.Task UpdateAsync(User entity) => System.Threading.Tasks.Task.CompletedTask;
        public System.Threading.Tasks.Task DeleteAsync(User entity) => System.Threading.Tasks.Task.CompletedTask;
        public System.Threading.Tasks.Task DeleteRangeAsync(IEnumerable<User> entities) => System.Threading.Tasks.Task.CompletedTask;
        public System.Threading.Tasks.Task<bool> ExistsAsync(System.Linq.Expressions.Expression<Func<User, bool>> predicate) => System.Threading.Tasks.Task.FromResult(false);
        public System.Threading.Tasks.Task<int> CountAsync(System.Linq.Expressions.Expression<Func<User, bool>>? predicate = null) => System.Threading.Tasks.Task.FromResult(0);
        public System.Threading.Tasks.Task<IEnumerable<User>> GetPagedAsync(int pageNumber, int pageSize, System.Linq.Expressions.Expression<Func<User, bool>>? predicate = null, Func<IQueryable<User>, IOrderedQueryable<User>>? orderBy = null) => System.Threading.Tasks.Task.FromResult<IEnumerable<User>>(Array.Empty<User>());
        public System.Threading.Tasks.Task<User?> GetByEmailAsync(string email) => System.Threading.Tasks.Task.FromResult<User?>(null);
        public System.Threading.Tasks.Task<User?> GetByUsernameAsync(string username) => System.Threading.Tasks.Task.FromResult<User?>(null);
        public System.Threading.Tasks.Task<IEnumerable<User>> GetFollowersAsync(Guid userId) => System.Threading.Tasks.Task.FromResult<IEnumerable<User>>(Array.Empty<User>());
        public System.Threading.Tasks.Task<IEnumerable<User>> GetFollowingAsync(Guid userId) => System.Threading.Tasks.Task.FromResult<IEnumerable<User>>(Array.Empty<User>());
        public System.Threading.Tasks.Task<IEnumerable<User>> SearchUsersAsync(string searchTerm) => System.Threading.Tasks.Task.FromResult<IEnumerable<User>>(Array.Empty<User>());
        public System.Threading.Tasks.Task<bool> IsFollowingAsync(Guid followerId, Guid followingId) => System.Threading.Tasks.Task.FromResult(false);
        public System.Threading.Tasks.Task FollowUserAsync(Guid followerId, Guid followingId) => System.Threading.Tasks.Task.CompletedTask;
        public System.Threading.Tasks.Task UnfollowUserAsync(Guid followerId, Guid followingId) => System.Threading.Tasks.Task.CompletedTask;
        public System.Threading.Tasks.Task<IEnumerable<User>> GetTopTruthSeekersAsync(int count) => System.Threading.Tasks.Task.FromResult<IEnumerable<User>>(Array.Empty<User>());
    }

    private sealed class ThrowingUserRepository : IUserRepository
    {
        public System.Threading.Tasks.Task<User?> GetByIdAsync(Guid id) => throw new InvalidOperationException("DB unavailable");
        public System.Threading.Tasks.Task<IEnumerable<User>> GetAllAsync() => System.Threading.Tasks.Task.FromResult<IEnumerable<User>>(Array.Empty<User>());
        public System.Threading.Tasks.Task<IEnumerable<User>> FindAsync(System.Linq.Expressions.Expression<Func<User, bool>> predicate) => System.Threading.Tasks.Task.FromResult<IEnumerable<User>>(Array.Empty<User>());
        public System.Threading.Tasks.Task<User> AddAsync(User entity) => throw new NotImplementedException();
        public System.Threading.Tasks.Task<IEnumerable<User>> AddRangeAsync(IEnumerable<User> entities) => throw new NotImplementedException();
        public System.Threading.Tasks.Task UpdateAsync(User entity) => System.Threading.Tasks.Task.CompletedTask;
        public System.Threading.Tasks.Task DeleteAsync(User entity) => System.Threading.Tasks.Task.CompletedTask;
        public System.Threading.Tasks.Task DeleteRangeAsync(IEnumerable<User> entities) => System.Threading.Tasks.Task.CompletedTask;
        public System.Threading.Tasks.Task<bool> ExistsAsync(System.Linq.Expressions.Expression<Func<User, bool>> predicate) => System.Threading.Tasks.Task.FromResult(false);
        public System.Threading.Tasks.Task<int> CountAsync(System.Linq.Expressions.Expression<Func<User, bool>>? predicate = null) => System.Threading.Tasks.Task.FromResult(0);
        public System.Threading.Tasks.Task<IEnumerable<User>> GetPagedAsync(int pageNumber, int pageSize, System.Linq.Expressions.Expression<Func<User, bool>>? predicate = null, Func<IQueryable<User>, IOrderedQueryable<User>>? orderBy = null) => System.Threading.Tasks.Task.FromResult<IEnumerable<User>>(Array.Empty<User>());
        public System.Threading.Tasks.Task<User?> GetByEmailAsync(string email) => throw new InvalidOperationException("DB unavailable");
        public System.Threading.Tasks.Task<User?> GetByUsernameAsync(string username) => throw new NotImplementedException();
        public System.Threading.Tasks.Task<IEnumerable<User>> GetFollowersAsync(Guid userId) => System.Threading.Tasks.Task.FromResult<IEnumerable<User>>(Array.Empty<User>());
        public System.Threading.Tasks.Task<IEnumerable<User>> GetFollowingAsync(Guid userId) => System.Threading.Tasks.Task.FromResult<IEnumerable<User>>(Array.Empty<User>());
        public System.Threading.Tasks.Task<IEnumerable<User>> SearchUsersAsync(string searchTerm) => System.Threading.Tasks.Task.FromResult<IEnumerable<User>>(Array.Empty<User>());
        public System.Threading.Tasks.Task<bool> IsFollowingAsync(Guid followerId, Guid followingId) => System.Threading.Tasks.Task.FromResult(false);
        public System.Threading.Tasks.Task FollowUserAsync(Guid followerId, Guid followingId) => System.Threading.Tasks.Task.CompletedTask;
        public System.Threading.Tasks.Task UnfollowUserAsync(Guid followerId, Guid followingId) => System.Threading.Tasks.Task.CompletedTask;
        public System.Threading.Tasks.Task<IEnumerable<User>> GetTopTruthSeekersAsync(int count) => System.Threading.Tasks.Task.FromResult<IEnumerable<User>>(Array.Empty<User>());
    }

    private sealed class StubTruthService : ITruthService
    {
        public System.Threading.Tasks.Task<ClaimVerificationResultDto> AnalyzeContentAsync(string content) => System.Threading.Tasks.Task.FromResult(new ClaimVerificationResultDto());
        public System.Threading.Tasks.Task<TruthClaimDto> VerifyClaimAsync(Guid userId, VerifyClaimDto dto) => throw new NotImplementedException();
        public System.Threading.Tasks.Task<TruthClaimDto> GetClaimAsync(Guid claimId) => throw new NotImplementedException();
        public System.Threading.Tasks.Task<IEnumerable<TruthClaimDto>> GetClaimsByCategoryAsync(string category) => throw new NotImplementedException();
        public System.Threading.Tasks.Task DisputeClaimAsync(Guid userId, Guid postId, string reason, string? evidence) => throw new NotImplementedException();
        public System.Threading.Tasks.Task ResolveDisputeAsync(Guid adminUserId, Guid disputeId, string resolution) => throw new NotImplementedException();
        public System.Threading.Tasks.Task<decimal> GetUserTruthScoreAsync(Guid userId) => throw new NotImplementedException();
        public System.Threading.Tasks.Task<IEnumerable<TruthClaimDto>> GetUnverifiedClaimsAsync(int count) => throw new NotImplementedException();
    }
}
