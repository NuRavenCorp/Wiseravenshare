using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Wiseravenshare.Server.Services;
using Xunit;

namespace Wiseravenshare.Server.Tests.Services;

public sealed class DigitalOceanSpacesBlobStorageServiceTests
{
    [Fact]
    public void IsConfigured_UsesAccessKeyIdVariant()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Storage:Blob:BucketName"] = "bucket-wrs-01010",
                ["Storage:Blob:AccessKeyId"] = "access-key-id-value",
                ["Storage:Blob:SecretKey"] = "secret-key-value",
                ["Storage:Blob:Endpoint"] = "https://nyc3.digitaloceanspaces.com"
            })
            .Build();

        var service = new DigitalOceanSpacesBlobStorageService(configuration, NullLogger<DigitalOceanSpacesBlobStorageService>.Instance);

        Assert.True(service.IsConfigured);
    }

    [Fact]
    public void IsConfigured_UsesLegacyAccessKeIdTypoVariant()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Storage:Blob:BucketName"] = "bucket-wrs-01010",
                ["Storage__Blob__AccessKeId"] = "access-key-legacy-typo",
                ["Storage:Blob:SecretKey"] = "secret-key-value",
                ["Storage:Blob:Endpoint"] = "https://nyc3.digitaloceanspaces.com"
            })
            .Build();

        var service = new DigitalOceanSpacesBlobStorageService(configuration, NullLogger<DigitalOceanSpacesBlobStorageService>.Instance);

        Assert.True(service.IsConfigured);
    }

    [Fact]
    public void IsConfigured_UsesNestedAccessKeyIdNotation()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Storage:Blob:BucketName"] = "bucket-wrs-01010",
                ["Storage:Blob:AccessKey:Id"] = "DO00LFFG6M78HVGH4JPM",
                ["Storage:Blob:SecretKey"] = "XRN6tVESAGBsVH5fb9ND001hyoZ6GlB86m3FbJZzyyE",
                ["Storage:Blob:Endpoint"] = "https://nyc3.digitaloceanspaces.com"
            })
            .Build();

        var service = new DigitalOceanSpacesBlobStorageService(configuration, NullLogger<DigitalOceanSpacesBlobStorageService>.Instance);

        Assert.True(service.IsConfigured);
    }

    [Fact]
    public void IsConfigured_UsesDoubleUnderscoreNestedAccessKeyIdNotation()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Storage__Blob__BucketName"] = "bucket-wrs-01010",
                ["Storage__Blob__AccessKey__Id"] = "DO00LFFG6M78HVGH4JPM",
                ["Storage__Blob__SecretKey"] = "XRN6tVESAGBsVH5fb9ND001hyoZ6GlB86m3FbJZzyyE",
                ["Storage__Blob__Endpoint"] = "https://nyc3.digitaloceanspaces.com"
            })
            .Build();

        var service = new DigitalOceanSpacesBlobStorageService(configuration, NullLogger<DigitalOceanSpacesBlobStorageService>.Instance);

        Assert.True(service.IsConfigured);
    }
}
