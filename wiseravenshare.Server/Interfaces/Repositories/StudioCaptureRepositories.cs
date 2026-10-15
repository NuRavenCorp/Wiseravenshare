using Wiseravenshare.Server.Entities;

namespace Wiseravenshare.Server.Interfaces.Repositories;

public interface IStudioCaptureRigProfileRepository : IRepository<StudioCaptureRigProfile>
{
    Task<StudioCaptureRigProfile?> GetByUserIdAsync(Guid userId, CancellationToken cancellationToken = default);
}

public interface IStudioCaptureSourceCaptureRepository : IRepository<StudioCaptureSourceCapture>
{
    Task<IReadOnlyList<StudioCaptureSourceCapture>> GetRecentByUserIdAsync(
        Guid userId,
        int limit,
        CancellationToken cancellationToken = default);
}
