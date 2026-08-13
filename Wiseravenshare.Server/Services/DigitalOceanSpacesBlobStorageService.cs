using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using Wiseravenshare.Server.Models;

namespace Wiseravenshare.Server.Services;

public interface IBlobStorageService
{
    bool IsConfigured { get; }

    string? ResolvePublicUrl(string objectKey);

    string? ResolveObjectKey(string location);

    Task<StoredBlobResult> UploadAsync(string objectKey, Stream content, string contentType, CancellationToken cancellationToken = default);

    Task<Stream?> OpenReadAsync(string objectKey, CancellationToken cancellationToken = default);

    Task<bool> DeleteAsync(string objectKey, CancellationToken cancellationToken = default);
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

    public string? ResolveObjectKey(string location)
    {
        if (string.IsNullOrWhiteSpace(location))
        {
            return null;
        }

        var normalizedLocation = location.Trim();
        if (!Uri.TryCreate(normalizedLocation, UriKind.Absolute, out var uri)
            && normalizedLocation.StartsWith('/', StringComparison.Ordinal))
        {
            Uri.TryCreate("http://localhost" + normalizedLocation, UriKind.Absolute, out uri);
        }

        if (uri is not null)
        {
            var fileName = TryReadQueryParameter(uri.Query, "fileName");
            if (!string.IsNullOrWhiteSpace(fileName) && uri.AbsolutePath.Contains("videostreaming/stream", StringComparison.OrdinalIgnoreCase))
            {
                return fileName.Trim('/');
            }

            var path = uri.AbsolutePath.Trim('/');
            if (string.IsNullOrWhiteSpace(path))
            {
                return null;
            }

            if (!string.IsNullOrWhiteSpace(_bucketName))
            {
                var bucketPrefix = _bucketName.Trim().Trim('/');
                if (path.StartsWith(bucketPrefix + "/", StringComparison.OrdinalIgnoreCase))
                {
                    return path[(bucketPrefix.Length + 1)..].Trim('/');
                }
            }

            return path;
        }

        if (normalizedLocation.StartsWith("/", StringComparison.Ordinal))
        {
            return normalizedLocation.Trim('/');
        }

        return normalizedLocation;
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

    public async Task<bool> DeleteAsync(string objectKey, CancellationToken cancellationToken = default)
    {
        if (!IsConfigured || string.IsNullOrWhiteSpace(objectKey))
        {
            return false;
        }

        try
        {
            var client = CreateClient();
            await client.DeleteObjectAsync(new DeleteObjectRequest
            {
                BucketName = _bucketName,
                Key = NormalizeObjectKey(objectKey)
            }, cancellationToken);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Unable to delete object {ObjectKey} from DigitalOcean Spaces bucket {BucketName}", objectKey, _bucketName);
            return false;
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

    private static string? TryReadQueryParameter(string query, string key)
    {
        if (string.IsNullOrWhiteSpace(query) || string.IsNullOrWhiteSpace(key))
        {
            return null;
        }

        var trimmedQuery = query.TrimStart('?');
        foreach (var pair in trimmedQuery.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var parts = pair.Split('=', 2);
            var currentKey = Uri.UnescapeDataString(parts[0]);
            if (!string.Equals(currentKey, key, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            return parts.Length > 1 ? Uri.UnescapeDataString(parts[1]) : string.Empty;
        }

        return null;
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
