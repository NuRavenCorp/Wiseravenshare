using System.ComponentModel.DataAnnotations;
using Wiseravenshare.Server.Enums;
using System.Text.Json;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Entities.Collaboration;

namespace Wiseravenshare.Server.Entities.Roles;

public class UserRole : BaseEntity
{
    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    public RoleType Type { get; set; }
    public RoleLevel Level { get; set; }
    public bool IsSystemRole { get; set; }
    public bool IsActive { get; set; } = true;

    // Permissions
    public JsonDocument? Permissions { get; set; }
    public JsonDocument? PlatformPermissions { get; set; }
    public JsonDocument? PublishingPermissions { get; set; }

    // Hierarchical
    public Guid? ParentRoleId { get; set; }
    public int HierarchyLevel { get; set; }

    // Navigation Properties
    public virtual ICollection<UserRoleAssignment> Assignments { get; set; } = new List<UserRoleAssignment>();
    public virtual ICollection<RolePermission> RolePermissions { get; set; } = new List<RolePermission>();
    public virtual UserRole? ParentRole { get; set; }
    public virtual ICollection<UserRole> ChildRoles { get; set; } = new List<UserRole>();
}

public class UserRoleAssignment : BaseEntity
{
    public Guid UserId { get; set; }
    public Guid RoleId { get; set; }
    public Guid? ProjectId { get; set; }
    public DateTime AssignedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ExpiresAt { get; set; }
    public bool IsActive { get; set; } = true;
    public Guid? AssignedById { get; set; }
    public JsonDocument? Metadata { get; set; }

    public virtual User User { get; set; } = null!;
    public virtual UserRole Role { get; set; } = null!;
    public virtual Project? Project { get; set; }
    public virtual User? AssignedBy { get; set; }
}

public class RolePermission : BaseEntity
{
    public Guid RoleId { get; set; }

    [MaxLength(100)]
    public string PermissionKey { get; set; } = string.Empty;

    [MaxLength(100)]
    public string ResourceType { get; set; } = string.Empty;

    public PermissionAction Action { get; set; }
    public bool IsAllowed { get; set; } = true;
    public JsonDocument? Conditions { get; set; }

    public virtual UserRole Role { get; set; } = null!;
}
