namespace Wiseravenshare.Server.DTOs;

/// <summary>Request: Create or update a workspace page</summary>
public class CreateOrUpdateWorkspacePageRequest
{
    public string SessionId { get; set; } = null!;
    public string PageType { get; set; } = "custom"; // "script", "subject-matter", "props", "references", or "custom"
    public string Title { get; set; } = null!;
    public string? Description { get; set; }
    public string Content { get; set; } = string.Empty;
    public string? Tags { get; set; }
    public string? MetadataJson { get; set; }
}

/// <summary>Request: Archive a page (soft delete)</summary>
public class ArchiveWorkspacePageRequest
{
    public string PageId { get; set; } = null!;
}

/// <summary>Response: Workspace page DTO</summary>
public class WorkspacePageDto
{
    public string Id { get; set; } = null!;
    public string SessionId { get; set; } = null!;
    public string TeamId { get; set; } = null!;
    public string PageType { get; set; } = null!;
    public string Title { get; set; } = null!;
    public string? Description { get; set; }
    public string Content { get; set; } = null!;
    public int Version { get; set; }
    public string? Tags { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public string? LastEditedByUserId { get; set; }
    public bool IsArchived { get; set; }
}
