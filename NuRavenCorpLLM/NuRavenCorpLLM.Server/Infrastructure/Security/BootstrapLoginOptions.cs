namespace NuRavenCorpLLM.Infrastructure.Security;

public class BootstrapLoginOptions
{
    public string AdminEmail { get; set; } = string.Empty;
    public string[] AdminEmails { get; set; } = Array.Empty<string>();
    public string AdminPassword { get; set; } = string.Empty;
}
