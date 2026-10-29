using System.Net.Http.Headers;
using System.Net.Http.Json;

namespace Wiseravenshare.Server.Services;

public sealed class LyricScoringClient(HttpClient http, IConfiguration config)
{
    public async Task<LyricScoreResult> ScoreAsync(LyricScoreRequest request, CancellationToken cancellationToken = default)
    {
        using var message = new HttpRequestMessage(HttpMethod.Post, "v1/score")
        {
            Content = JsonContent.Create(request)
        };

        var token = config["LyricScorer:Token"]
            ?? throw new InvalidOperationException("Lyric scorer token is missing");

        message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        using var response = await http.SendAsync(message, cancellationToken);
        response.EnsureSuccessStatusCode();

        var payload = await response.Content.ReadFromJsonAsync<LyricScoreResult>(cancellationToken: cancellationToken);
        return payload ?? throw new InvalidOperationException("Empty scoring response");
    }
}
