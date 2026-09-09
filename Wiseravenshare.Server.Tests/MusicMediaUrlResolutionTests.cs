using System.Reflection;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services;
using Xunit;

namespace Wiseravenshare.Server.Tests;

public class MusicMediaUrlResolutionTests
{
    [Fact]
    public void ResolveMediaUrl_UsesBlobStreamRoute_WhenPublicUrlMissing()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Storage:Blob:BucketName"] = "bucket-name",
                ["Storage:Blob:AccessKey"] = "access-key",
                ["Storage:Blob:SecretKey"] = "secret-key",
                ["Storage:Blob:Endpoint"] = "https://nyc3.digitaloceanspaces.com",
                ["Storage:Blob:PublicBaseUrl"] = ""
            })
            .Build();

        var store = new BucketMusicLibraryStore(configuration, new StubBlobStorageService(), new StubMusicService());
        var method = typeof(BucketMusicLibraryStore).GetMethod("ResolveMediaUrl", BindingFlags.Instance | BindingFlags.NonPublic);

        Assert.NotNull(method);

        var result = method!.Invoke(store, new object?[] { null, "wiseravenshare/ravensight/music/track-123.mp3", "track-123.mp3" });

        Assert.Equal("/api/videostreaming/blob/wiseravenshare/ravensight/music/track-123.mp3", result);
    }

    private sealed class StubBlobStorageService : IBlobStorageService
    {
        public bool IsConfigured => true;

        public string? ResolvePublicUrl(string objectKey) => null;

        public string? ResolveObjectKey(string location) => location;

        public Task<StoredBlobResult> UploadAsync(string objectKey, Stream content, string contentType, CancellationToken cancellationToken = default)
            => Task.FromResult(new StoredBlobResult(objectKey, $"https://cdn.example.com/{objectKey}"));

        public Task<Stream?> OpenReadAsync(string objectKey, CancellationToken cancellationToken = default)
            => Task.FromResult<Stream?>(new MemoryStream());

        public Task<bool> DeleteAsync(string objectKey, CancellationToken cancellationToken = default)
            => Task.FromResult(true);
    }

    private sealed class StubMusicService : IRavensightMusicService
    {
        public Task<RavensightSavedMediaFile> SaveMusicAsync(IFormFile file, string? destinationFolder, string? userStorageIdentity, CancellationToken cancellationToken = default)
            => Task.FromResult(new RavensightSavedMediaFile
            {
                FileName = file.FileName,
                RelativePath = destinationFolder ?? "music",
                DestinationFolder = destinationFolder ?? "music",
                ContentType = file.ContentType,
                SizeBytes = file.Length,
                SavedAtUtc = DateTime.UtcNow
            });
    }
}
