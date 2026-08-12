using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Hosting;
using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services;
using Xunit;

namespace Wiseravenshare.Server.Tests.Services;

public sealed class RavensightMediaPathServiceTests
{
    [Fact]
    public async Task ResolveExistingFilePath_finds_file_in_canonical_storage_folder()
    {
        var tempRoot = Path.Combine(Path.GetTempPath(), "RavensightMediaPathServiceTests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempRoot);

        var storageRoot = Path.Combine(tempRoot, "ravensight_videos", "wiseravenshare", "ravensight", "video");
        Directory.CreateDirectory(storageRoot);

        var expectedFilePath = Path.Combine(storageRoot, "test123.mp4");
        await File.WriteAllBytesAsync(expectedFilePath, new byte[] { 1, 2, 3, 4 });

        var service = CreateService(tempRoot);

        var resolvedPath = service.ResolveExistingFilePath(RavensightMediaType.Video, "test123.mp4", "wiseravenshare/ravensight/video");

        Assert.Equal(expectedFilePath, resolvedPath);
    }

    private static RavensightMediaPathService CreateService(string contentRootPath)
    {
        var environment = new FakeWebHostEnvironment(contentRootPath);
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Storage:Video:StorageFolderName"] = "ravensight_videos"
            })
            .Build();

        return new RavensightMediaPathService(environment, configuration, NullLogger<RavensightMediaPathService>.Instance, new NullBlobStorageService());
    }

    private sealed class NullBlobStorageService : IBlobStorageService
    {
        public bool IsConfigured => false;

        public string? ResolvePublicUrl(string objectKey) => null;

        public Task<StoredBlobResult> UploadAsync(string objectKey, Stream content, string contentType, CancellationToken cancellationToken = default)
            => Task.FromResult(new StoredBlobResult(objectKey, string.Empty));

        public Task<Stream?> OpenReadAsync(string objectKey, CancellationToken cancellationToken = default)
            => Task.FromResult<Stream?>(null);
    }

    private sealed class FakeWebHostEnvironment(string contentRootPath) : IWebHostEnvironment
    {
        public string ApplicationName { get; set; } = "Wiseravenshare.Server.Tests";
        public IFileProvider WebRootFileProvider { get; set; } = null!;
        public string WebRootPath { get; set; } = string.Empty;
        public string ContentRootPath { get; set; } = contentRootPath;
        public IFileProvider ContentRootFileProvider { get; set; } = null!;
        public string EnvironmentName { get; set; } = Environments.Development;
    }
}
