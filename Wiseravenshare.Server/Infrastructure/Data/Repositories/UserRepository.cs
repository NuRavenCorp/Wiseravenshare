// Wiseravenshare.Server.Infrastructure/Data/Repositories/UserRepository.cs
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Interfaces.Repositories;

namespace Wiseravenshare.Server.Infrastructure.Data.Repositories
{

    public class UserRepository : Repository<User>, IUserRepository
    {
        public UserRepository(AppDbContext context) : base(context)
        {
        }

        public async Task<User?> GetByEmailAsync(string email)
        {
            return await _dbSet
                .FirstOrDefaultAsync(u => u.Email.ToLower() == email.ToLower() && !u.IsDeleted);
        }

        public async Task<User?> GetByUsernameAsync(string username)
        {
            return await _dbSet
                .FirstOrDefaultAsync(u => u.Username.ToLower() == username.ToLower() && !u.IsDeleted);
        }

        public async Task<IEnumerable<User>> GetFollowersAsync(Guid userId)
        {
            return await _context.UserFollows
                .Where(f => f.FollowingId == userId && !f.Follower.IsDeleted)
                .Select(f => f.Follower)
                .ToListAsync();
        }

        public async Task<IEnumerable<User>> GetFollowingAsync(Guid userId)
        {
            return await _context.UserFollows
                .Where(f => f.FollowerId == userId && !f.Following.IsDeleted)
                .Select(f => f.Following)
                .ToListAsync();
        }

        public async Task<IEnumerable<User>> SearchUsersAsync(string searchTerm)
        {
            if (string.IsNullOrWhiteSpace(searchTerm))
                return Enumerable.Empty<User>();

            searchTerm = searchTerm.Trim();
            return await _dbSet
                .Where(u => !u.IsDeleted &&
                    (u.Username.Contains(searchTerm) ||
                     u.DisplayName.Contains(searchTerm) ||
                     u.Email.Contains(searchTerm)))
                .Take(20)
                .ToListAsync();
        }

        public async Task<bool> IsFollowingAsync(Guid followerId, Guid followingId)
        {
            return await _context.UserFollows
                .AnyAsync(f => f.FollowerId == followerId && f.FollowingId == followingId);
        }

        public async Task FollowUserAsync(Guid followerId, Guid followingId)
        {
            if (followerId == followingId)
                throw new InvalidOperationException("Cannot follow yourself");

            if (await IsFollowingAsync(followerId, followingId))
                return;

            var follow = new Follow
            {
                FollowerId = followerId,
                FollowingId = followingId
            };

            await _context.UserFollows.AddAsync(follow);
            await _context.SaveChangesAsync();
        }

        public async Task UnfollowUserAsync(Guid followerId, Guid followingId)
        {
            var follow = await _context.UserFollows
                .FirstOrDefaultAsync(f => f.FollowerId == followerId && f.FollowingId == followingId);

            if (follow != null)
            {
                _context.UserFollows.Remove(follow);
                await _context.SaveChangesAsync();
            }
        }

        public async Task<IEnumerable<User>> GetTopTruthSeekersAsync(int count)
        {
            return await _dbSet
                .Where(u => !u.IsDeleted && u.IsActive)
                .OrderByDescending(u => u.TruthScore)
                .Take(count)
                .ToListAsync();
        }
    }
}