namespace Wiseravenshare.Server.Services;

public interface IYouTubeService
{
    Task<string> UploadVideoAsync(IFormFile videoFile, string title, string description);
    Task<string> UploadTikTokVideoAsync(IFormFile videoFile, string title, string description);
    Task<string> UploadPodcastAsync(IFormFile audioFile, string title, string description);
}

public sealed class YouTubeService : IYouTubeService
{
    private static string GenerateSlug() => Guid.NewGuid().ToString("N")[..10];

    public Task<string> UploadVideoAsync(IFormFile videoFile, string title, string description)
    {
        return Task.FromResult($"https://youtube.com/watch?v={GenerateSlug()}");
    }

    public Task<string> UploadTikTokVideoAsync(IFormFile videoFile, string title, string description)
    {
        return Task.FromResult($"https://www.tiktok.com/@wiseravenshare/video/{GenerateSlug()}");
    }

    public Task<string> UploadPodcastAsync(IFormFile audioFile, string title, string description)
    {
        return Task.FromResult($"https://youtube.com/watch?v={GenerateSlug()}");
    }
}
