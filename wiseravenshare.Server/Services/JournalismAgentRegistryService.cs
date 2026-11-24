using System.Net.Http.Json;
using System.Net.Http.Headers;
using System.Text.Json;

namespace Wiseravenshare.Server.Services;

public interface IJournalismAgentRegistryService
{
    Task<JournalismAgentRegistrationResult> EnsureRegisteredAsync(CancellationToken cancellationToken = default);
}

public sealed class JournalismAgentRegistryService : IJournalismAgentRegistryService
{
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(15);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<JournalismAgentRegistryService> _logger;
    private readonly SemaphoreSlim _lock = new(1, 1);

    private JournalismAgentRegistrationResult? _cachedRegistration;
    private DateTime _cachedAtUtc;

    public JournalismAgentRegistryService(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<JournalismAgentRegistryService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<JournalismAgentRegistrationResult> EnsureRegisteredAsync(CancellationToken cancellationToken = default)
    {
        if (_cachedRegistration is not null && DateTime.UtcNow - _cachedAtUtc <= CacheTtl)
        {
            return _cachedRegistration;
        }

        await _lock.WaitAsync(cancellationToken);
        try
        {
            if (_cachedRegistration is not null && DateTime.UtcNow - _cachedAtUtc <= CacheTtl)
            {
                return _cachedRegistration;
            }

            var registration = await RegisterAgentAsync(cancellationToken);
            _cachedRegistration = registration;
            _cachedAtUtc = DateTime.UtcNow;
            return registration;
        }
        finally
        {
            _lock.Release();
        }
    }

    private async Task<JournalismAgentRegistrationResult> RegisterAgentAsync(CancellationToken cancellationToken)
    {
        var assignedAgentId = (_configuration["NuRavenCorpLlm:AssignedJournalismAgentId"] ?? string.Empty).Trim();
        var assignedAgentName = (_configuration["NuRavenCorpLlm:AssignedJournalismAgentName"] ?? string.Empty).Trim();
        var assignedPersona = (_configuration["NuRavenCorpLlm:AssignedJournalismAgentPersona"] ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(assignedAgentId) || !string.IsNullOrWhiteSpace(assignedAgentName))
        {
            return new JournalismAgentRegistrationResult
            {
                IsRegistered = true,
                AgentId = string.IsNullOrWhiteSpace(assignedAgentId) ? "configured-assigned-agent" : assignedAgentId,
                AgentName = string.IsNullOrWhiteSpace(assignedAgentName) ? "Assigned Journalism Agent" : assignedAgentName,
                Persona = string.IsNullOrWhiteSpace(assignedPersona) ? "JournalismApproval" : assignedPersona,
                RegisteredAtUtc = DateTime.UtcNow,
                Source = "configuration"
            };
        }

        var baseUrl = (_configuration["NuRavenCorpLlm:BaseUrl"] ?? "http://localhost:5011").Trim().TrimEnd('/');
        var accessToken = (_configuration["NuRavenCorpLlm:AccessToken"] ?? string.Empty).Trim();
        var persona = (_configuration["NuRavenCorpLlm:JournalismAgentPersona"] ?? "JournalismApproval").Trim();
        var title = (_configuration["NuRavenCorpLlm:JournalismAgentTitle"] ?? "Wiseravenshare Journalism Approval Agent").Trim();
        var path = (_configuration["NuRavenCorpLlm:JournalismAgentRegistrationPath"] ?? "/api/assistant/conversations").Trim();
        if (!path.StartsWith("/", StringComparison.Ordinal))
        {
            path = "/" + path;
        }

        var endpoint = $"{baseUrl}{path}";

        try
        {
            using var client = _httpClientFactory.CreateClient("RavenAssistant");
            if (!string.IsNullOrWhiteSpace(accessToken))
            {
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            }
            using var createResponse = await client.PostAsJsonAsync(
                endpoint,
                new { title, persona },
                JsonOptions,
                cancellationToken);

            var body = await createResponse.Content.ReadAsStringAsync(cancellationToken);
            if (!createResponse.IsSuccessStatusCode)
            {
                _logger.LogWarning(
                    "Journalism agent registration failed at {Endpoint} ({Status}): {Body}",
                    endpoint,
                    (int)createResponse.StatusCode,
                    body);
                return JournalismAgentRegistrationResult.Failed(
                    $"registration failed with {(int)createResponse.StatusCode}");
            }

            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            var id = ReadCaseInsensitiveString(root, "id")
                ?? ReadCaseInsensitiveString(root, "agent_id")
                ?? ReadCaseInsensitiveString(root, "conversationId");
            var registeredPersona = ReadCaseInsensitiveString(root, "persona") ?? persona;
            var agentName = ReadCaseInsensitiveString(root, "title")
                ?? ReadCaseInsensitiveString(root, "name")
                ?? title;

            if (string.IsNullOrWhiteSpace(id))
            {
                _logger.LogWarning("Journalism agent registration did not return an id.");
                return JournalismAgentRegistrationResult.Failed("registration response missing id");
            }

            return new JournalismAgentRegistrationResult
            {
                IsRegistered = true,
                AgentId = id.Trim(),
                AgentName = string.IsNullOrWhiteSpace(agentName) ? title : agentName.Trim(),
                Persona = string.IsNullOrWhiteSpace(registeredPersona) ? persona : registeredPersona.Trim(),
                RegisteredAtUtc = DateTime.UtcNow,
                Source = endpoint
            };
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Journalism agent registration probe failed.");
            return JournalismAgentRegistrationResult.Failed(ex.Message);
        }
    }

    private static string? ReadCaseInsensitiveString(JsonElement root, string propertyName)
    {
        if (root.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        foreach (var property in root.EnumerateObject())
        {
            if (!string.Equals(property.Name, propertyName, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            return property.Value.ValueKind switch
            {
                JsonValueKind.String => property.Value.GetString(),
                JsonValueKind.Number => property.Value.ToString(),
                _ => null
            };
        }

        return null;
    }
}

public sealed class JournalismAgentRegistrationResult
{
    public bool IsRegistered { get; set; }
    public string? AgentId { get; set; }
    public string? AgentName { get; set; }
    public string? Persona { get; set; }
    public DateTime RegisteredAtUtc { get; set; }
    public string? Source { get; set; }
    public string? FailureReason { get; set; }
    public string DisplayKey =>
        !string.IsNullOrWhiteSpace(AgentName) && !string.IsNullOrWhiteSpace(AgentId)
            ? $"{AgentName} ({AgentId})"
            : (!string.IsNullOrWhiteSpace(AgentName) ? AgentName! : (AgentId ?? "nuravencorpllm-agent"));

    public static JournalismAgentRegistrationResult Failed(string reason) => new()
    {
        IsRegistered = false,
        FailureReason = reason,
        RegisteredAtUtc = DateTime.UtcNow
    };
}
