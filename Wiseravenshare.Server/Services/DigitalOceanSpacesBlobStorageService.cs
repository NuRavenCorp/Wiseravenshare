using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using Wiseravenshare.Server.Models;

namespace Wiseravenshare.Server.Services;

public interface IBlobStorageService
{
    bool IsConfigured { get; }

    string? ResolvePublicUrl(string objectKey);

    Task<StoredBlobResult> UploadAsync(string objectKey, Stream content, string contentType, CancellationToken cancellationToken = default);

    Task<Stream?> OpenReadAsync(string objectKey, CancellationToken cancellationToken = default);
}

public sealed record StoredBlobResult(string ObjectKey, string PublicUrl);

public sealed class DigitalOceanSpacesBlobStorageService : IBlobStorageService
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<DigitalOceanSpacesBlobStorageService> _logger;
    private readonly string? _bucketName;
    private readonly string? _accessKey;
    private readonly string? _secretKey;
    private readonly string? _endpoint;
    private readonly string? _region;
    private readonly string? _publicBaseUrl;
    private readonly bool _enabled;

    public DigitalOceanSpacesBlobStorageService(IConfiguration configuration, ILogger<DigitalOceanSpacesBlobStorageService> logger)
    {
        _configuration = configuration;
        _logger = logger;

        _enabled = bool.TryParse(configuration["Storage:Blob:Enabled"], out var enabled) ? enabled : true;
        _bucketName = configuration["Storage:Blob:BucketName"]?.Trim();
        _accessKey = configuration["Storage:Blob:AccessKey"]?.Trim() ?? configuration["Storage__Blob__AccessKey"]?.Trim();
        _secretKey = configuration["Storage:Blob:SecretKey"]?.Trim() ?? configuration["Storage__Blob__SecretKey"]?.Trim();
        _endpoint = configuration["Storage:Blob:Endpoint"]?.Trim() ?? configuration["Storage__Blob__Endpoint"]?.Trim();
        _region = configuration["Storage:Blob:Region"]?.Trim() ?? configuration["Storage__Blob__Region"]?.Trim();
        _publicBaseUrl = configuration["Storage:Blob:PublicBaseUrl"]?.Trim() ?? configuration["Storage__Blob__PublicBaseUrl"]?.Trim();
    }

    public bool IsConfigured => _enabled && !string.IsNullOrWhiteSpace(_bucketName) && !string.IsNullOrWhiteSpace(_accessKey) && !string.IsNullOrWhiteSpace(_secretKey);

    public string? ResolvePublicUrl(string objectKey)
    {
        if (string.IsNullOrWhiteSpace(objectKey))
        {
            return null;
        }

        if (!string.IsNullOrWhiteSpace(_publicBaseUrl))
        {
            return CombineUrl(_publicBaseUrl, objectKey);
        }

        if (string.IsNullOrWhiteSpace(_endpoint) || string.IsNullOrWhiteSpace(_bucketName))
        {
            return null;
        }

        var normalizedEndpoint = _endpoint.Trim().Trim('/');
        return CombineUrl(normalizedEndpoint, $"{_bucketName}/{objectKey.Trim('/')}");
    }

    public async Task<StoredBlobResult> UploadAsync(string objectKey, Stream content, string contentType, CancellationToken cancellationToken = default)
    {
        if (!IsConfigured)
        {
            throw new InvalidOperationException("DigitalOcean Spaces storage is not configured.");
        }

        if (content is null)
        {
            throw new ArgumentNullException(nameof(content));
        }

        var normalizedObjectKey = NormalizeObjectKey(objectKey);
        var client = CreateClient();
        var request = new PutObjectRequest
        {
            BucketName = _bucketName,
            Key = normalizedObjectKey,
            ContentType = string.IsNullOrWhiteSpace(contentType) ? "application/octet-stream" : contentType,
            InputStream = content,
            CannedACL = S3CannedACL.Private
        };

        await client.PutObjectAsync(request, cancellationToken);

        var publicUrl = ResolvePublicUrl(normalizedObjectKey) ?? BuildFallbackPublicUrl(normalizedObjectKey);
        return new StoredBlobResult(normalizedObjectKey, publicUrl);
    }

    public async Task<Stream?> OpenReadAsync(string objectKey, CancellationToken cancellationToken = default)
    {
        if (!IsConfigured)
        {
            return null;
        }

        try
        {
            var client = CreateClient();
            var response = await client.GetObjectAsync(new GetObjectRequest
            {
                BucketName = _bucketName,
                Key = NormalizeObjectKey(objectKey)
            }, cancellationToken);

            return response.ResponseStream;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Unable to read object {ObjectKey} from DigitalOcean Spaces bucket {BucketName}", objectKey, _bucketName);
            return null;
        }
    }

    private AmazonS3Client CreateClient()
    {
        var config = new AmazonS3Config
        {
            ForcePathStyle = true,
            ServiceURL = string.IsNullOrWhiteSpace(_endpoint) ? "https://nyc3.digitaloceanspaces.com" : _endpoint.Trim()
        };

        var credentials = new BasicAWSCredentials(_accessKey, _secretKey);
        return new AmazonS3Client(credentials, config);
    }

    private static string NormalizeObjectKey(string objectKey)
    {
        if (string.IsNullOrWhiteSpace(objectKey))
        {
            return string.Empty;
        }

        var normalized = objectKey.Replace('\\', '/').Trim('/');
        return normalized;
    }

    private string BuildFallbackPublicUrl(string objectKey)
    {
        if (string.IsNullOrWhiteSpace(_endpoint))
        {
            return $"/storage/{objectKey}";
        }

        if (string.IsNullOrWhiteSpace(_bucketName))
        {
            return CombineUrl(_endpoint, objectKey);
        }

        return CombineUrl(_endpoint, $"{_bucketName}/{objectKey}");
    }

    private static string CombineUrl(string baseUrl, string relativePath)
    {
        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            return relativePath;
        }

        if (Uri.TryCreate(baseUrl, UriKind.Absolute, out var baseUri))
        {
            var combined = new Uri(baseUri, relativePath.TrimStart('/'));
            return combined.ToString().TrimEnd('/');
        }

        return baseUrl.TrimEnd('/') + "/" + relativePath.TrimStart('/');
    }
}
