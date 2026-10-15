namespace Wiseravenshare.Server.Models;

public sealed class CreateRavensightMediaAssetRequest
{
    public Guid UserId { get; init; }
    public RavensightMediaType MediaType { get; init; }
    public string FileName { get; init; } = string.Empty;
    public string RelativePath { get; init; } = string.Empty;
    public string? PublicUrl { get; init; }
    public string AbsolutePath { get; init; } = string.Empty;
    public string DestinationFolder { get; init; } = string.Empty;
    public string ContentType { get; init; } = "application/octet-stream";
    public long SizeBytes { get; init; }
    public DateTime SavedAtUtc { get; init; } = DateTime.UtcNow;
    public string MetadataJson { get; init; } = "{}";
}

public sealed class RavensightMediaAssetRecord
{
    public string Id { get; init; } = string.Empty;
    public Guid UserId { get; init; }
    public string MediaType { get; init; } = string.Empty;
    public string FileName { get; init; } = string.Empty;
    public string RelativePath { get; init; } = string.Empty;
    public string? PublicUrl { get; init; }
    public string AbsolutePath { get; init; } = string.Empty;
    public string DestinationFolder { get; init; } = string.Empty;
    public string ContentType { get; init; } = string.Empty;
    public long SizeBytes { get; init; }
    public DateTime SavedAtUtc { get; init; }
    public DateTime ExpiresAtUtc { get; init; }
    public bool AutoDeleteEnabled { get; init; }
    public string MetadataJson { get; init; } = "{}";
    public DateTime? DeletedAtUtc { get; init; }
}

public sealed class RavensightMediaUserPreference
{
    public Guid UserId { get; init; }
    public bool LocalFolderPermissionGranted { get; init; }
    public string? LocalFolderAlias { get; init; }
    public string LocalSaveRoot { get; init; } = "auto";
    public string? FolderIdentityKey { get; init; }
    public DateTime? GrantedAtUtc { get; init; }
    public DateTime UpdatedAtUtc { get; init; }
}

public sealed class SaveRavensightMediaPreferenceRequest
{
    public bool LocalFolderPermissionGranted { get; init; }
    public string? LocalFolderAlias { get; init; }
    public string LocalSaveRoot { get; init; } = "auto";
}
