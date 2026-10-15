using Wiseravenshare.Server.Models;

namespace Wiseravenshare.Server.Services;

public interface IRavensightPhotoService
{
    Task<RavensightSavedMediaFile> SavePhotoAsync(
        IFormFile file,
        string? destinationFolder,
    string? userStorageIdentity,
        CancellationToken cancellationToken = default);
}

public sealed class RavensightPhotoService : IRavensightPhotoService
{
    private readonly IRavensightMediaPathService _mediaPathService;

    public RavensightPhotoService(IRavensightMediaPathService mediaPathService)
    {
        _mediaPathService = mediaPathService;
    }

    public Task<RavensightSavedMediaFile> SavePhotoAsync(
        IFormFile file,
        string? destinationFolder,
        string? userStorageIdentity,
        CancellationToken cancellationToken = default)
    {
        return _mediaPathService.SaveFileAsync(
            file,
            RavensightMediaType.Photo,
            destinationFolder,
            userStorageIdentity,
            cancellationToken);
    }
}
