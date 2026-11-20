using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Wiseravenshare.Server.Services;

/// <summary>
/// Minimal DigitalOcean Spaces helper backed by S3-compatible API.
/// </summary>
public sealed class DigitalOceanSpacesService
{
    private readonly IAmazonS3 _spacesClient;
    private readonly string _spaceName;
    private readonly string _cdnBaseUrl;
    private readonly ILogger<DigitalOceanSpacesService> _logger;

    public DigitalOceanSpacesService(IConfiguration config, ILogger<DigitalOceanSpacesService> logger)
    {
        _logger = logger;

        _spaceName = config["DigitalOcean:Spaces:SpaceName"]
                     ?? config["Spaces:BucketName"]
                     ?? throw new ArgumentNullException("DigitalOcean:Spaces:SpaceName missing");

        var region = config["DigitalOcean:Spaces:Region"] ?? "nyc3";
        var serviceUrl = config["DigitalOcean:Spaces:ServiceUrl"]
                         ?? $"https://{region}.digitaloceanspaces.com";

        _cdnBaseUrl = (config["DigitalOcean:Spaces:CdnBaseUrl"]
                      ?? $"https://{_spaceName}.{region}.cdn.digitaloceanspaces.com").TrimEnd('/');

        var accessKey = config["DigitalOcean:Spaces:AccessKey"] ?? config["Spaces:AccessKey"];
        var secretKey = config["DigitalOcean:Spaces:SecretKey"] ?? config["Spaces:SecretKey"];

        if (string.IsNullOrWhiteSpace(accessKey) || string.IsNullOrWhiteSpace(secretKey))
        {
            throw new ArgumentNullException("DigitalOcean Spaces credentials are not configured.");
        }

        _spacesClient = new AmazonS3Client(accessKey, secretKey, new AmazonS3Config
        {
            ServiceURL = serviceUrl,
            ForcePathStyle = false,
        });
    }

    public async Task<string> UploadAsync(Stream fileStream, string objectKey, string contentType, CancellationToken ct = default)
    {
        if (fileStream is null) throw new ArgumentNullException(nameof(fileStream));
        if (string.IsNullOrWhiteSpace(objectKey)) throw new ArgumentException("Object key is required.", nameof(objectKey));

        var request = new PutObjectRequest
        {
            BucketName = _spaceName,
            Key = objectKey,
            InputStream = fileStream,
            ContentType = string.IsNullOrWhiteSpace(contentType) ? "application/octet-stream" : contentType,
            CannedACL = S3CannedACL.PublicRead,
        };

        await _spacesClient.PutObjectAsync(request, ct);
        var publicUrl = $"{_cdnBaseUrl}/{objectKey.TrimStart('/')}";
        _logger.LogInformation("Uploaded object {ObjectKey} to space {SpaceName}", objectKey, _spaceName);
        return publicUrl;
    }
}
