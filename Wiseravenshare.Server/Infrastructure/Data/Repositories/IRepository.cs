// Wiseravenshare.Server/Infrastructure/Data/Repositories/IRepository.cs
using System.Linq.Expressions;
using Wiseravenshare.Server.Entities;

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
}

// Wiseravenshare.Core/Interfaces/Repositories/ITruthRepository.cs
public interface ITruthRepository : IRepository<TruthClaim>
{
    Task<TruthClaim?> GetClaimByTextAsync(string normalizedClaim);
    Task<IEnumerable<TruthClaim>> GetClaimsByCategoryAsync(string category);
    Task<IEnumerable<TruthClaim.TruthDispute>> GetDisputesByPostAsync(Guid postId);
    Task<IEnumerable<TruthClaim.TruthVerificationVote>> GetVotesForClaimAsync(Guid claimId);
    Task<decimal> GetAverageTruthScoreAsync(Guid userId);
    Task<IEnumerable<TruthClaim>> GetUnverifiedClaimsAsync(int count);
    Task AddDisputeAsync(TruthClaim.TruthDispute dispute);
    Task<TruthClaim.TruthDispute?> GetDisputeAsync(Guid disputeId);
    Task UpdateDisputeAsync(TruthClaim.TruthDispute dispute);
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