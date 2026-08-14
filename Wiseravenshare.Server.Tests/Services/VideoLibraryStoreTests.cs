using Wiseravenshare.Server.Services;
using Xunit;

namespace Wiseravenshare.Server.Tests.Services;

public sealed class VideoLibraryStoreTests
{
    [Fact]
    public void BuildSchemaBootstrapSql_UsesVersionedTablesWithRetentionColumns()
    {
        var sql = VideoLibraryStore.BuildSchemaBootstrapSql("app_data", "app_data.ravensight_videos_v2", "app_data.ravensight_video_comments_v2");

        Assert.Contains("app_data.ravensight_videos_v2", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("app_data.ravensight_video_comments_v2", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("storage_mode", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("retention_status", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("expires_at", sql, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task RunWithTimeoutAsync_ReturnsFallback_WhenOperationTimesOut()
    {
        var result = await RavensightPersistenceGuard.RunWithTimeoutAsync(
            async cancellationToken =>
            {
                await Task.Delay(TimeSpan.FromSeconds(1), cancellationToken);
                return "unexpected";
            },
            "fallback",
            TimeSpan.FromMilliseconds(50));

        Assert.Equal("fallback", result);
    }
}
