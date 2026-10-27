using Microsoft.AspNetCore.Identity;

namespace Wiseravenshare.Server.Entities.Identity;

/// <summary>
/// ASP.NET Core Identity user. Lives alongside the legacy <see cref="User"/> entity.
/// Underlying tables are mapped to the <c>identity</c> schema so they never conflict
/// with the existing <c>app_data.Users</c> table.
/// </summary>
public sealed class ApplicationUser : IdentityUser
{
    public string FirstName   { get; set; } = string.Empty;
    public string LastName    { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
