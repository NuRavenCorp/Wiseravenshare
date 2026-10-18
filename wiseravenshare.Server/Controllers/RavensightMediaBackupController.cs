using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Authorize]
[Route("api/ravensight/media/backup")]
public sealed class RavensightMediaBackupController : ControllerBase
{
    private readonly RavensightMediaCatalogStore _catalog;
    private readonly IBlobStorageService _blobStorage;
    private readonly IWebHostEnvironment _environment;
    private readonly IConfiguration _configuration;
    private readonly ILogger<RavensightMediaBackupController> _logger;

    public RavensightMediaBackupController(
        RavensightMediaCatalogStore catalog,
        IBlobStorageService blobStorage,
        IWebHostEnvironment environment,
        IConfiguration configuration,
        ILogger<RavensightMediaBackupController> logger)
    {
        _catalog = catalog;
        _blobStorage = blobStorage;
        _environment = environment;
        _configuration = configuration;
        _logger = logger;
    }

    [HttpPost]
    public async Task<IActionResult> Backup(CancellationToken cancellationToken)
    {
        var rawUserId = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue("sub")
            ?? User.FindFirstValue("id");
        if (!Guid.TryParse(rawUserId, out var userId) || userId == Guid.Empty)
            return Unauthorized(new { message = "Unable to determine current user." });

        var assets = await _catalog.GetUserAssetsAsync(userId, limit: 10000, cancellationToken: cancellationToken);
        var backedUp = 0;
        var failed = new List<string>();
        foreach (var asset in assets)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var safeName = Path.GetFileName(asset.FileName);
            try
            {
                if (_blobStorage.IsConfigured)
                {
                    var sourceKey = string.IsNullOrWhiteSpace(asset.RelativePath)
                        ? _blobStorage.ResolveObjectKey(asset.PublicUrl ?? string.Empty)
                        : asset.RelativePath;
                    await using var source = string.IsNullOrWhiteSpace(sourceKey)
                        ? null
                        : await _blobStorage.OpenReadAsync(sourceKey, cancellationToken);
                    if (source is not null)
                    {
                        var backupKey = $"backups/media/{userId:N}/{asset.Id}/{safeName}";
                        await _blobStorage.UploadAsync(backupKey, source, asset.ContentType, cancellationToken);
                        backedUp++;
                        continue;
                    }
                }

                if (!string.IsNullOrWhiteSpace(asset.AbsolutePath) && System.IO.File.Exists(asset.AbsolutePath))
                {
                    var configuredRoot = _configuration["MediaBackup:LocalRoot"];
                    var root = Path.GetFullPath(string.IsNullOrWhiteSpace(configuredRoot)
                        ? Path.Combine(_environment.ContentRootPath, "App_Data", "MediaBackups")
                        : Path.IsPathRooted(configuredRoot) ? configuredRoot : Path.Combine(_environment.ContentRootPath, configuredRoot));
                    var target = Path.GetFullPath(Path.Combine(root, userId.ToString("N"), asset.Id, safeName));
                    if (!target.StartsWith(root.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                        throw new InvalidOperationException("Invalid backup path.");
                    Directory.CreateDirectory(Path.GetDirectoryName(target)!);
                    await using var input = System.IO.File.OpenRead(asset.AbsolutePath);
                    await using var output = new FileStream(target, FileMode.Create, FileAccess.Write, FileShare.None, 81920, useAsync: true);
                    await input.CopyToAsync(output, cancellationToken);
                    backedUp++;
                    continue;
                }

                failed.Add(asset.Id);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning(ex, "Could not back up media asset {AssetId} for user {UserId}.", asset.Id, userId);
                failed.Add(asset.Id);
            }
        }

        return Ok(new { total = assets.Count, backedUp, failed = failed.Count, failedAssetIds = failed });
    }
}
