using System.Security.Cryptography;
using System.Text;

namespace Wiseravenshare.Server.Services;

public interface IMediaBlobSignatureService
{
    bool IsSignatureEnforced { get; }
    string SignKey(string objectKey);
    bool VerifyKeySignature(string objectKey, string? signature);
}

public sealed class MediaBlobSignatureService : IMediaBlobSignatureService
{
    private readonly string? _signingSecret;

    public MediaBlobSignatureService(IConfiguration configuration)
    {
        _signingSecret = configuration["MEDIA_SIGNING_SECRET"]?.Trim();
    }

    public bool IsSignatureEnforced => !string.IsNullOrWhiteSpace(_signingSecret);

    public string SignKey(string objectKey)
    {
        var normalized = NormalizeObjectKey(objectKey);
        if (string.IsNullOrWhiteSpace(_signingSecret) || string.IsNullOrWhiteSpace(normalized))
        {
            return string.Empty;
        }

        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(_signingSecret));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(normalized));
        var hex = Convert.ToHexString(hash).ToLowerInvariant();
        return hex[..32];
    }

    public bool VerifyKeySignature(string objectKey, string? signature)
    {
        if (!IsSignatureEnforced)
        {
            return true;
        }

        var expected = SignKey(objectKey);
        var provided = (signature ?? string.Empty).Trim().ToLowerInvariant();
        if (expected.Length == 0 || expected.Length != provided.Length)
        {
            return false;
        }

        var expectedBytes = Encoding.UTF8.GetBytes(expected);
        var providedBytes = Encoding.UTF8.GetBytes(provided);
        return CryptographicOperations.FixedTimeEquals(expectedBytes, providedBytes);
    }

    private static string NormalizeObjectKey(string objectKey)
    {
        return (objectKey ?? string.Empty).Replace('\\', '/').Trim('/');
    }
}

