using System.Security.Cryptography;
namespace NuRavenCorpLLM.Infrastructure.Security;

public sealed class JwtAuthSettings
{
    public required string Issuer { get; init; }
    public required string Audience { get; init; }
    public required string SigningKey { get; init; }
    public int ExpiresMinutes { get; init; }
    public bool IsEphemeralKey { get; init; }

    public static JwtAuthSettings Create(IConfiguration configuration, bool isDevelopment)
    {
        var issuer = configuration["Authentication:Jwt:Issuer"] ?? "NuRavenCorpLLM";
        var audience = configuration["Authentication:Jwt:Audience"] ?? "NuRavenCorpLLM.Client";

        var expiresMinutes = 1440;
        if (int.TryParse(configuration["Authentication:Jwt:ExpiresMinutes"], out var parsedExpires) && parsedExpires > 0)
        {
            expiresMinutes = parsedExpires;
        }

        var configuredKey = configuration["Authentication:Jwt:Key"]?.Trim();
        if (!string.IsNullOrWhiteSpace(configuredKey))
        {
            if (configuredKey.Length < 32)
            {
                throw new InvalidOperationException(
                    "Authentication:Jwt:Key must be at least 32 characters long.");
            }

            return new JwtAuthSettings
            {
                Issuer = issuer,
                Audience = audience,
                SigningKey = configuredKey,
                ExpiresMinutes = expiresMinutes,
                IsEphemeralKey = false
            };
        }

        if (!isDevelopment)
        {
            throw new InvalidOperationException(
                "Authentication:Jwt:Key is required outside Development.");
        }

        var randomKey = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));
        return new JwtAuthSettings
        {
            Issuer = issuer,
            Audience = audience,
            SigningKey = randomKey,
            ExpiresMinutes = expiresMinutes,
            IsEphemeralKey = true
        };
    }
}
