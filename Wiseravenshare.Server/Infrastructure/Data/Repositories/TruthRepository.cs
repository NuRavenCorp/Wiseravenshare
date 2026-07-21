using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Interfaces.Repositories;

namespace Wiseravenshare.Server.Infrastructure.Data.Repositories;

public class TruthRepository : Repository<TruthClaim>, ITruthRepository
{
    public TruthRepository(AppDbContext context) : base(context)
    {
    }

    public Task<TruthClaim?> GetClaimByTextAsync(string normalizedClaim)
        => _dbSet.FirstOrDefaultAsync(c => c.NormalizedClaim == normalizedClaim && !c.IsDeleted);

    public Task<IEnumerable<TruthClaim>> GetClaimsByCategoryAsync(string category)
        => Task.FromResult<IEnumerable<TruthClaim>>(_dbSet.Where(c => c.Category == category && !c.IsDeleted).ToList());

    public Task<IEnumerable<TruthClaim.TruthDispute>> GetDisputesByPostAsync(Guid postId)
        => Task.FromResult<IEnumerable<TruthClaim.TruthDispute>>(_context.TruthDisputes.Where(d => d.PostId == postId && !d.IsDeleted).ToList());

    public Task<IEnumerable<TruthClaim.TruthVerificationVote>> GetVotesForClaimAsync(Guid claimId)
        => Task.FromResult<IEnumerable<TruthClaim.TruthVerificationVote>>(_context.TruthVerificationVotes.Where(v => v.ClaimId == claimId && !v.IsDeleted).ToList());

    public async Task<decimal> GetAverageTruthScoreAsync(Guid userId)
    {
        var scores = await _dbSet.Where(c => c.CreatedBy == userId && !c.IsDeleted).Select(c => c.Confidence).ToListAsync();
        return scores.Count == 0 ? 0 : scores.Average();
    }

    public Task<IEnumerable<TruthClaim>> GetUnverifiedClaimsAsync(int count)
        => Task.FromResult<IEnumerable<TruthClaim>>(_dbSet.Where(c => !c.IsDeleted && c.VerificationCount < 2).Take(count).ToList());

    public async Task AddDisputeAsync(TruthClaim.TruthDispute dispute)
    {
        await _context.TruthDisputes.AddAsync(dispute);
        await _context.SaveChangesAsync();
    }

    public Task<TruthClaim.TruthDispute?> GetDisputeAsync(Guid disputeId)
        => _context.TruthDisputes.FirstOrDefaultAsync(d => d.Id == disputeId);

    public async Task UpdateDisputeAsync(TruthClaim.TruthDispute dispute)
    {
        _context.TruthDisputes.Update(dispute);
        await _context.SaveChangesAsync();
    }
}
