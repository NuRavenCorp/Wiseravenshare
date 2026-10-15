using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Authorize]
[Route("api/ravensight/media/preferences")]
public sealed class RavensightMediaPreferencesController : ControllerBase
{
    private readonly RavensightMediaCatalogStore _catalogStore;

    public RavensightMediaPreferencesController(RavensightMediaCatalogStore catalogStore)
    {
        _catalogStore = catalogStore;
    }

    [HttpGet("local-folder")]
    public async Task<IActionResult> GetLocalFolderPreference(CancellationToken cancellationToken)
    {
        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Unable to determine current user." });
        }

        var preference = await _catalogStore.GetUserPreferenceAsync(userId, cancellationToken);
        if (preference is null)
        {
            return Ok(new
            {
                localFolderPermissionGranted = false,
                localFolderAlias = (string?)null,
                localSaveRoot = "auto",
                folderIdentityKey = (string?)null,
                grantedAtUtc = (DateTime?)null
            });
        }

        return Ok(new
        {
            localFolderPermissionGranted = preference.LocalFolderPermissionGranted,
            localFolderAlias = preference.LocalFolderAlias,
            localSaveRoot = preference.LocalSaveRoot,
            folderIdentityKey = preference.FolderIdentityKey,
            grantedAtUtc = preference.GrantedAtUtc,
            updatedAtUtc = preference.UpdatedAtUtc
        });
    }

    [HttpPut("local-folder")]
    public async Task<IActionResult> UpsertLocalFolderPreference([FromBody] SaveRavensightMediaPreferenceRequest request, CancellationToken cancellationToken)
    {
        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Unable to determine current user." });
        }

        var saved = await _catalogStore.UpsertUserPreferenceAsync(userId, request, cancellationToken);

        return Ok(new
        {
            localFolderPermissionGranted = saved.LocalFolderPermissionGranted,
            localFolderAlias = saved.LocalFolderAlias,
            localSaveRoot = saved.LocalSaveRoot,
            folderIdentityKey = saved.FolderIdentityKey,
            grantedAtUtc = saved.GrantedAtUtc,
            updatedAtUtc = saved.UpdatedAtUtc
        });
    }

    private bool TryResolveUserId(out Guid userId)
    {
        var userIdRaw = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue("sub")
            ?? User.FindFirstValue("id");

        return Guid.TryParse(userIdRaw, out userId) && userId != Guid.Empty;
    }
}
