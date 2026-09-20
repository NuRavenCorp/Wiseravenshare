using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Interfaces.Repositories;

namespace Wiseravenshare.Server.Infrastructure.Data.Repositories;

public sealed class StudioCaptureRigProfileRepository : Repository<StudioCaptureRigProfile>, IStudioCaptureRigProfileRepository
{
    public StudioCaptureRigProfileRepository(AppDbContext context) : base(context)
    {
    }

    public Task<StudioCaptureRigProfile?> GetByUserIdAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        return _dbSet
            .FirstOrDefaultAsync(x => x.UserId == userId && !x.IsDeleted, cancellationToken);
    }
}

public sealed class StudioCaptureSourceCaptureRepository : Repository<StudioCaptureSourceCapture>, IStudioCaptureSourceCaptureRepository
{
    public StudioCaptureSourceCaptureRepository(AppDbContext context) : base(context)
    {
    }

    public async Task<IReadOnlyList<StudioCaptureSourceCapture>> GetRecentByUserIdAsync(
        Guid userId,
        int limit,
        CancellationToken cancellationToken = default)
    {
        var safeLimit = Math.Clamp(limit, 1, 100);
        return await _dbSet
            .AsNoTracking()
            .Where(x => x.UserId == userId && !x.IsDeleted)
            .OrderByDescending(x => x.CapturedAtUtc)
            .Take(safeLimit)
            .ToListAsync(cancellationToken);
    }
}
