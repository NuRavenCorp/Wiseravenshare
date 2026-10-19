namespace NuRavenCorpLLM.Entities;

public class User : BaseEntity
{
    public string DisplayName { get; set; } = string.Empty;
    public string? Email { get; set; }
}