using System;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Wiseravenshare.Server.Entities.Stream;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Services;
using Wiseravenshare.Server.Services.StreamBridge;
using Xunit;

namespace Wiseravenshare.Server.Tests;

public class StreamTransferContentModerationTests : IDisposable
{
    private readonly string _testAppDataDir;
    private readonly AppDbContext _db;
    private readonly UserStore _userStore;
    private readonly IConfiguration _config;
    private readonly IHttpClientFactory _httpFactory;

    public StreamTransferContentModerationTests()
    {
        _testAppDataDir = Path.Combine(Path.GetTempPath(), "wrs_mod_test_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_testAppDataDir);

        var env = new TestWebHostEnvironment { ContentRootPath = _testAppDataDir };
        _config = new ConfigurationBuilder().AddInMemoryCollection().Build();
        _userStore = new UserStore(env, _config);

        var dbOptions = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase("test_mod_db_" + Guid.NewGuid().ToString("N"))
            .Options;
        _db = new TestAppDbContext(dbOptions);
        _httpFactory = new TestHttpClientFactory();
    }

    private sealed class TestAppDbContext : AppDbContext
    {
        public TestAppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

        protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
        {
            base.ConfigureConventions(configurationBuilder);
            configurationBuilder
                .Properties<System.Text.Json.JsonDocument?>()
                .HaveConversion<JsonDocumentStringConverter>();
            configurationBuilder
                .Properties<System.Text.Json.JsonDocument>()
                .HaveConversion<JsonDocumentStringConverter>();
        }

        private sealed class JsonDocumentStringConverter : Microsoft.EntityFrameworkCore.Storage.ValueConversion.ValueConverter<System.Text.Json.JsonDocument, string>
        {
            public JsonDocumentStringConverter() : base(
                d => d == null ? "{}" : d.RootElement.GetRawText(),
                s => System.Text.Json.JsonDocument.Parse(string.IsNullOrWhiteSpace(s) ? "{}" : s, default)) { }
        }
    }

    private sealed class TestHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new HttpClient();
    }

    public void Dispose()
    {
        _db.Dispose();
        try { Directory.Delete(_testAppDataDir, true); } catch { }
    }

    private sealed class NoOpScanner : IUploadMalwareScanner
    {
        public Task<UploadScanResult> ScanAsync(Microsoft.AspNetCore.Http.IFormFile file, CancellationToken cancellationToken = default)
            => Task.FromResult(UploadScanResult.Safe());
    }

    [Fact]
    public async Task InitiateAsync_WithNudityInTitle_IsAutoBlockedByModerationAgent()
    {
        var sut = new StreamTransferService(
            _db,
            new NoOpScanner(),
            _httpFactory,
            _config,
            NullLogger<StreamTransferService>.Instance,
            _userStore);

        var req = new InitiateTransferRequest(
            SourceContentId: "post_123",
            SourceCreatorId: "creator_abc",
            VideoUrl: "https://spaces.wiseravenshare.com/videos/summer_clip.mp4",
            Title: "Beach Trip Uncut Naked Nude Party",
            Description: "Fun in the sun",
            FileSizeBytes: 1024 * 1024,
            MimeType: "video/mp4");

        var result = await sut.InitiateAsync(req);

        Assert.Equal(StreamTransferStatus.AutoBlocked.ToString(), result.Status);
        Assert.NotNull(result.RubricResult);
        var point4 = result.RubricResult.Points.FirstOrDefault(p => p.PointId == 4);
        Assert.NotNull(point4);
        Assert.Equal("FAIL", point4.Result);
        Assert.Contains("Explicit adult term", point4.Evidence, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("nudity", point4.Notes, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task InitiateAsync_WithCleanMusicVideo_IsPassedUnderLaxGuidelines()
    {
        var sut = new StreamTransferService(
            _db,
            new NoOpScanner(),
            _httpFactory,
            _config,
            NullLogger<StreamTransferService>.Instance,
            _userStore);

        var req = new InitiateTransferRequest(
            SourceContentId: "post_456",
            SourceCreatorId: "creator_xyz",
            VideoUrl: "https://spaces.wiseravenshare.com/videos/jazz_evening.mp4",
            Title: "Acoustic Sunset Guitar Session",
            Description: "Live performance at the studio, casual music jam",
            FileSizeBytes: 2048 * 1024,
            MimeType: "video/mp4");

        var result = await sut.InitiateAsync(req);

        Assert.Equal(StreamTransferStatus.Approved.ToString(), result.Status);
        Assert.NotNull(result.RubricResult);
        var point4 = result.RubricResult.Points.FirstOrDefault(p => p.PointId == 4);
        Assert.NotNull(point4);
        Assert.Equal("PASS", point4.Result);
    }
}
