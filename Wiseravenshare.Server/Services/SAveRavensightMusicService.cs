using Wiseravenshare.Server.Models;

namespace Wiseravenshare.Server.Services;

public interface IRavensightMusicService
{
    Task<RavensightSavedMediaFile> SaveMusicAsync(
        IFormFile file,
        string? destinationFolder,
        CancellationToken cancellationToken = default);
}

public sealed class RavensightMusicService : IRavensightMusicService
{
    private readonly IRavensightMediaPathService _mediaPathService;

    public RavensightMusicService(IRavensightMediaPathService mediaPathService)
    {
        _mediaPathService = mediaPathService;
    }

    public Task<RavensightSavedMediaFile> SaveMusicAsync(
        IFormFile file,
        string? destinationFolder,
        CancellationToken cancellationToken = default)
    {
        return _mediaPathService.SaveFileAsync(
            file,
            RavensightMediaType.Music,
            destinationFolder,
            cancellationToken);
    }
}
