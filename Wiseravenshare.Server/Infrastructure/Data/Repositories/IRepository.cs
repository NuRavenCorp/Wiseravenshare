// Wiseravenshare.Server/Infrastructure/Data/Repositories/IRepository.cs
using System.Linq.Expressions;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Services.Truth;

namespace Wiseravenshare.Server.Interfaces.Repositories;

public interface IRepository<T> where T : BaseEntity
{
    Task<T?> GetByIdAsync(Guid id);
    Task<IEnumerable<T>> GetAllAsync();
    Task<IEnumerable<T>> FindAsync(Expression<Func<T, bool>> predicate);
    Task<T> AddAsync(T entity);
    Task<IEnumerable<T>> AddRangeAsync(IEnumerable<T> entities);
    Task UpdateAsync(T entity);
    Task DeleteAsync(T entity);
    Task DeleteRangeAsync(IEnumerable<T> entities);
    Task<bool> ExistsAsync(Expression<Func<T, bool>> predicate);
    Task<int> CountAsync(Expression<Func<T, bool>>? predicate = null);
    Task<IEnumerable<T>> GetPagedAsync(int pageNumber, int pageSize,
        Expression<Func<T, bool>>? predicate = null,
        Func<IQueryable<T>, IOrderedQueryable<T>>? orderBy = null);
}

// Wiseravenshare.Core/Interfaces/Repositories/IUserRepository.cs
public interface IUserRepository : IRepository<User>
{
    Task<User?> GetByEmailAsync(string email);
    Task<User?> GetByUsernameAsync(string username);
    Task<IEnumerable<User>> GetFollowersAsync(Guid userId);
    Task<IEnumerable<User>> GetFollowingAsync(Guid userId);
    Task<IEnumerable<User>> SearchUsersAsync(string searchTerm);
    Task<bool> IsFollowingAsync(Guid followerId, Guid followingId);
    Task FollowUserAsync(Guid followerId, Guid followingId);
    Task UnfollowUserAsync(Guid followerId, Guid followingId);
    Task<IEnumerable<User>> GetTopTruthSeekersAsync(int count);
}

// Wiseravenshare.Core/Interfaces/Repositories/IPostRepository.cs
public interface IPostRepository : IRepository<Post>
{
    Task<IEnumerable<Post>> GetFeedAsync(Guid userId, int page, int pageSize);
    Task<IEnumerable<Post>> GetUserPostsAsync(Guid userId, int page, int pageSize);
    Task<IEnumerable<Post>> GetTrendingPostsAsync(int count);
    Task<IEnumerable<Post>> GetRepliesAsync(Guid postId);
    Task<int> GetPostCountAsync(Guid userId);
    Task LikePostAsync(Guid postId, Guid userId);
    Task UnlikePostAsync(Guid postId, Guid userId);
    Task RepostPostAsync(Guid postId, Guid userId);
    Task UnrepostPostAsync(Guid postId, Guid userId);
    Task BookmarkPostAsync(Guid postId, Guid userId);
    Task UnbookmarkPostAsync(Guid postId, Guid userId);
    Task<PostInteractionState> GetInteractionStateAsync(Guid postId, Guid? userId = null);
}

public sealed record PostInteractionState(
    int LikesCount,
    int RepostsCount,
    int BookmarksCount,
    bool IsLiked,
    bool IsReposted,
    bool IsBookmarked);

// Wiseravenshare.Core/Interfaces/Repositories/ITruthRepository.cs
public interface ITruthRepository : IRepository<TruthClaim>
{
    Task<TruthClaim?> GetClaimByTextAsync(string normalizedClaim);
    Task<IEnumerable<TruthClaim>> GetClaimsByCategoryAsync(string category);
    Task<IEnumerable<TruthClaim.TruthDispute>> GetDisputesByPostAsync(Guid postId);
    Task<IEnumerable<TruthClaim.TruthVerificationVote>> GetVotesForClaimAsync(Guid claimId);
    Task<TruthClaim.TruthVerificationVote?> GetUserVoteAsync(Guid claimId, Guid userId);
    Task<IEnumerable<TruthClaim.TruthVerificationVote>> GetVotesByUsersAsync(string normalizedClaim, IEnumerable<Guid> userIds);
    Task<IEnumerable<TruthClaim.TruthVerificationVote>> GetStakedVotesAsync(string normalizedClaim);
    Task AddVoteAsync(TruthClaim.TruthVerificationVote vote);
    Task<decimal> GetAverageTruthScoreAsync(Guid userId);
    Task<IEnumerable<TruthClaim>> GetUnverifiedClaimsAsync(int count);
    Task AddDisputeAsync(TruthClaim.TruthDispute dispute);
    Task<TruthClaim.TruthDispute?> GetDisputeAsync(Guid disputeId);
    Task UpdateDisputeAsync(TruthClaim.TruthDispute dispute);
    Task<TruthFact?> FindFactAsync(string normalizedClaim);
    Task<IEnumerable<TruthFact>> FindSimilarFactsAsync(string normalizedClaim);
    Task AddFactAsync(TruthFact fact);
    Task UpdateFactAsync(TruthFact fact);
    Task<IEnumerable<TruthFact>> GetRecentFactsAsync(int count);
    Task<IDictionary<string, decimal>> GetCategoryStatsAsync();
    Task<IEnumerable<TruthFact>> GetUnverifiedFactsAsync(int count);
    Task<List<TruthFact>> GetHistoricalClaimsAsync(string normalizedClaim);
}

// Wiseravenshare.Core/Interfaces/Repositories/IAgentRepository.cs
public interface IAgentRepository : IRepository<AIAgent>
{
    Task<IEnumerable<AIAgent>> GetActiveAgentsAsync();
    Task<IEnumerable<AIAgent>> GetAgentsByTypeAsync(AgentType type);
    Task<IEnumerable<AgentEvolution>> GetEvolutionsForAgentAsync(Guid agentId);
    Task<IEnumerable<AgentInteraction>> GetInteractionsForAgentAsync(Guid agentId);
    Task<IEnumerable<AIAgent>> GetTopPerformingAgentsAsync(int count);
    Task<decimal> GetAveragePerformanceScoreAsync();
    Task<IEnumerable<AgentEvolution>> GetAllEvolutionsAsync();
    Task AddEvolutionAsync(AgentEvolution evolution);
}

// Wiseravenshare.Core/Interfaces/Repositories/ISocialCrossPostRepository.cs
public interface ISocialCrossPostRepository : IRepository<SocialCrossPost>
{
    Task<IEnumerable<SocialCrossPost>> GetByPostIdAsync(Guid postId);
    Task<IEnumerable<SocialCrossPost>> GetByUserIdAsync(Guid userId, int page = 1, int pageSize = 50);
    Task<SocialCrossPost?> GetByPostAndPlatformAsync(Guid postId, string platform);
    Task UpsertAsync(SocialCrossPost crossPost);
}