// Wiseravenshare.Server/Validators/CollaborationValidators.cs
using System.ComponentModel.DataAnnotations;
using Wiseravenshare.Server.DTOs.Collaboration;
using Wiseravenshare.Server.Enums;

namespace Wiseravenshare.Server.Validators;

/// <summary>
/// Domain-rule validation beyond data annotations. Enum DTO fields arrive as strings
/// so bad values surface here with clear messages instead of parsing failures deep
/// inside services.
/// </summary>
public static class CollaborationValidators
{
    public static void Validate(this CreateProjectDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Title))
            throw new ValidationException("Project title is required.");
        if (dto.Title.Length > 255)
            throw new ValidationException("Project title cannot exceed 255 characters.");
        if (!Enum.TryParse<ProjectType>(dto.Type, true, out _))
            throw new ValidationException($"'{dto.Type}' is not a valid project type.");
        if (!Enum.TryParse<ProjectVisibility>(dto.Visibility, true, out _))
            throw new ValidationException($"'{dto.Visibility}' is not a valid project visibility.");
        if (dto.RevenueShareModel is not null && !Enum.TryParse<RevenueShareModel>(dto.RevenueShareModel, true, out _))
            throw new ValidationException($"'{dto.RevenueShareModel}' is not a valid revenue share model.");
        if (dto.MaxCollaborators is < 1 or > 500)
            throw new ValidationException("MaxCollaborators must be between 1 and 500.");
        if (dto.StartDate.HasValue && dto.EndDate.HasValue && dto.EndDate < dto.StartDate)
            throw new ValidationException("EndDate must be on or after StartDate.");
    }

    public static void Validate(this AddMemberDto dto)
    {
        if (!Enum.TryParse<ProjectRole>(dto.Role, true, out _))
            throw new ValidationException($"'{dto.Role}' is not a valid project role.");
        if (dto.Level is not null && !Enum.TryParse<ProjectRoleLevel>(dto.Level, true, out _))
            throw new ValidationException($"'{dto.Level}' is not a valid project role level.");
        if (dto.RevenueSharePercentage is < 0 or > 100)
            throw new ValidationException("RevenueSharePercentage must be between 0 and 100.");
    }

    public static void Validate(this InviteCollaboratorDto dto)
    {
        if (!Enum.TryParse<ProjectRole>(dto.Role, true, out _))
            throw new ValidationException($"'{dto.Role}' is not a valid project role.");
        if (dto.Level is not null && !Enum.TryParse<ProjectRoleLevel>(dto.Level, true, out _))
            throw new ValidationException($"'{dto.Level}' is not a valid project role level.");
    }

    public static void Validate(this AddContentDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Title))
            throw new ValidationException("Content title is required.");
        if (!Enum.TryParse<ContentType>(dto.Type, true, out _))
            throw new ValidationException($"'{dto.Type}' is not a valid content type.");
    }

    public static void Validate(this PublishContentDto dto)
    {
        if (dto.Platforms.Count == 0)
            throw new ValidationException("At least one platform must be specified.");
        var unsupported = dto.Platforms
            .Select(NormalizePlatformKey)
            .Where(key => key is null)
            .ToList();
        if (unsupported.Count > 0)
            throw new ValidationException("All requested platforms must be supported for publishing.");
    }

    public static void Validate(this ScheduleEntry dto)
    {
        if (dto.ScheduledTime <= DateTime.UtcNow)
            throw new ValidationException("ScheduledTime must be in the future.");
    }

    /// <summary>Platform keys the shared cross-platform publisher infrastructure supports.</summary>
    private static readonly HashSet<string> SupportedPlatforms = new(StringComparer.OrdinalIgnoreCase)
    {
        "facebook", "instagram", "youtube", "tiktok", "twitter", "linkedin"
    };

    public static string? NormalizePlatformKey(SocialPlatform platform)
    {
        var key = platform.ToString().ToLowerInvariant() switch
        {
            "youtube" => "youtube",
            "tiktok" => "tiktok",
            "facebook" => "facebook",
            "instagram" => "instagram",
            "twitter" => "twitter",
            "linkedin" => "linkedin",
            _ => null
        };
        return key is not null && SupportedPlatforms.Contains(key) ? key : null;
    }
}
