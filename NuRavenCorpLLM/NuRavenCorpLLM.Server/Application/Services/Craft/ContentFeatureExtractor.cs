// Application/Services/Craft/ContentFeatureExtractor.cs
using System.Text.Json;
using NuRavenCorpLLM.Core.Interfaces.Repositories.Craft;

namespace NuRavenCorpLLM.Application.Services.Craft;

public interface IContentFeatureExtractor
{
    Task<ContentFeatures> ExtractAsync(Guid contentId, string domain, CancellationToken ct = default);
}

public class ContentFeatureExtractor : IContentFeatureExtractor
{
    private readonly IPostRepository _posts;
    private readonly IVideoRepository _videos;

    public ContentFeatureExtractor(IPostRepository posts, IVideoRepository videos)
    {
        _posts = posts; _videos = videos;
    }

    public async Task<ContentFeatures> ExtractAsync(Guid contentId, string domain, CancellationToken ct = default)
    {
        if (domain == "videography" || domain == "podcast")
        {
            object? videoObj = await LoadByIdAsync(_videos, contentId, ct);
            if (videoObj != null)
            {
                dynamic video = videoObj;
                var hook = video.Description?.Split('.', '!', '?').FirstOrDefault()?.Trim();
                return new ContentFeatures(
                    video.Id, video.UserId, domain,
                    video.Title, hook,
                    0, video.Duration ?? 0,
                    video.GetType().Name,
                    new Dictionary<string, double>
                    {
                        ["titleLength"] = video.Title.Length,
                        ["tagCount"] = video.Tags?.Length ?? 0
                    });
            }
        }

        object? postObj = await LoadByIdAsync(_posts, contentId, ct);
        if (postObj == null) return new ContentFeatures(contentId, Guid.Empty, domain, null, null, 0, 0, null, new());

        dynamic post = postObj;

        var words = post.Content?.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length ?? 0;
        var firstSentence = post.Content?.Split('.', '!', '?').FirstOrDefault()?.Trim();

        return new ContentFeatures(
            post.Id, post.UserId, domain,
            firstSentence, firstSentence,
            words, 0, post.Type.ToString(),
            new Dictionary<string, double>
            {
                ["wordCount"] = words,
                ["hasMedia"] = post.MediaUrls?.Length > 0 ? 1 : 0
            });
    }

    private static async Task<object?> LoadByIdAsync(object repository, Guid contentId, CancellationToken ct)
    {
        var method = repository.GetType().GetMethod("GetByIdAsync", new[] { typeof(Guid), typeof(CancellationToken) })
            ?? repository.GetType().GetMethod("GetByIdAsync", new[] { typeof(Guid) });

        if (method == null)
        {
            return null;
        }

        var arguments = method.GetParameters().Length switch
        {
            2 => new object?[] { contentId, ct },
            1 => new object?[] { contentId },
            _ => Array.Empty<object?>()
        };

        var invocation = method.Invoke(repository, arguments);
        if (invocation is Task task)
        {
            await task;
            return task.GetType().GetProperty("Result")?.GetValue(task);
        }

        return invocation;
    }
}
