using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Models;

namespace Wiseravenshare.Server.Services;

public interface IRavensightVideoService
{
    Task<RavensightSavedVideo> SaveVideoAsync(
        Guid userId,
        IFormFile file,
        string? title,
        string? description,
        string? destinationFolder,
        PrivacyStatus privacy = PrivacyStatus.Unlisted,
        CancellationToken cancellationToken = default);
}

public sealed class RavensightVideoService : IRavensightVideoService
{
    private readonly IRavensightMediaPathService _mediaPathService;

    public RavensightVideoService(IRavensightMediaPathService mediaPathService)
    {
        _mediaPathService = mediaPathService;
    }

    public async Task<RavensightSavedVideo> SaveVideoAsync(
        Guid userId,
        IFormFile file,
        string? title,
        string? description,
        string? destinationFolder,
        PrivacyStatus privacy = PrivacyStatus.Unlisted,
        CancellationToken cancellationToken = default)
    {
        var savedFile = await _mediaPathService.SaveFileAsync(
            file,
            RavensightMediaType.Video,
            destinationFolder,
            cancellationToken);

        var entity = new Video
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Title = string.IsNullOrWhiteSpace(title) ? Path.GetFileNameWithoutExtension(file.FileName) : title.Trim(),
            Description = string.IsNullOrWhiteSpace(description) ? null : description.Trim(),
            VideoUrl = savedFile.PublicUrl ?? savedFile.RelativePath,
            Privacy = privacy,
            Status = VideoStatus.Ready,
            PublishedAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        return new RavensightSavedVideo
        {
            File = savedFile,
            Video = entity
        };
    }
}
