namespace Wiseravenshare.Server.Services.Media;

public static class MediaUrlResolver
{
    public static string CreateDatabaseMediaUrl(Guid mediaId)
    {
        return $"/api/media-library/{mediaId}/stream";
    }
}
