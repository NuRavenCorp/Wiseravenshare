// Wiseravenshare.Server/DTOs/Social/LinkedinDto.cs
namespace Wiseravenshare.Server.DTOs.Social;

public class LinkedInDto
{
    public string Id { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string ProfilePictureUrl { get; set; } = string.Empty;
    public string PublicProfileUrl { get; set; } = string.Empty;
    public string Headline { get; set; } = string.Empty;
    public string Summary { get; set; } = string.Empty;
    public List<string> Skills { get; set; } = [];
    public WorkExperienceDto WorkExperience { get; set; } = new();
    public List<NetworkDto> Networks { get; set; } = [];
}

public class WorkExperienceDto
{
    public List<CompanyDto> Companies { get; set; } = [];
}

public class CompanyDto
{
    public string Name { get; set; } = string.Empty;
    public string LogoUrl { get; set; } = string.Empty;
}

public class NetworkDto
{
    /// <summary>e.g. "people"</summary>
    public string NetworkType { get; set; } = string.Empty;
    public string Network { get; set; } = string.Empty;
}
