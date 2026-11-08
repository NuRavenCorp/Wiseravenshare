using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.RegularExpressions;

namespace Wiseravenshare.Server.Services;

public sealed class LyricScoringClient(HttpClient http, IConfiguration config, ILogger<LyricScoringClient>? logger = null)
{
    public async Task<LyricScoreResult> ScoreAsync(LyricScoreRequest request, CancellationToken cancellationToken = default)
    {
        var token = config["LyricScorer:Token"];
        if (!string.IsNullOrWhiteSpace(token) && http.BaseAddress is not null)
        {
            try
            {
                using var message = new HttpRequestMessage(HttpMethod.Post, "v1/score")
                {
                    Content = JsonContent.Create(request)
                };
                message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                using var response = await http.SendAsync(message, cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    var payload = await response.Content.ReadFromJsonAsync<LyricScoreResult>(cancellationToken: cancellationToken);
                    if (payload is not null)
                        return payload;
                }
            }
            catch (Exception ex)
            {
                logger?.LogWarning(ex, "Upstream lyric scorer failed. Falling back to local Levenshtein scoring.");
            }
        }

        // Robust in-process fallback
        return ComputeLocalScore(request);
    }

    public static LyricScoreResult ComputeLocalScore(LyricScoreRequest request)
    {
        var rawReference = request.ReferenceLyrics ?? string.Empty;
        // Strip LRC timestamps: [mm:ss.xx] and word timestamps <mm:ss.xx>
        var cleanReference = Regex.Replace(rawReference, @"\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]|<[^>]+>", " ");
        var refWords = Tokenise(cleanReference);

        var hypWords = (request.Turns ?? Array.Empty<TranscriptTurn>())
            .OrderBy(t => t.TurnOrder)
            .SelectMany(t => Tokenise(t.Transcript))
            .ToArray();

        if (refWords.Length == 0 && hypWords.Length == 0)
        {
            return new LyricScoreResult(
                request.PerformanceId,
                100.0,
                0, 0, 0, 0,
                0, 0,
                Array.Empty<AlignedWord>());
        }

        if (refWords.Length == 0)
        {
            var alignment = hypWords.Select(w => new AlignedWord(null, w, "insertion")).ToList();
            return new LyricScoreResult(
                request.PerformanceId,
                100.0,
                hypWords.Length, 0, 0, hypWords.Length,
                0, hypWords.Length,
                alignment);
        }

        if (hypWords.Length == 0)
        {
            var alignment = refWords.Select(w => new AlignedWord(w, null, "deletion")).ToList();
            return new LyricScoreResult(
                request.PerformanceId,
                0.0,
                0, 0, refWords.Length, 0,
                refWords.Length, 0,
                alignment);
        }

        int m = refWords.Length;
        int n = hypWords.Length;
        int[,] dp = new int[m + 1, n + 1];

        for (int i = 0; i <= m; i++) dp[i, 0] = i;
        for (int j = 0; j <= n; j++) dp[0, j] = j;

        for (int i = 1; i <= m; i++)
        {
            for (int j = 1; j <= n; j++)
            {
                int cost = string.Equals(refWords[i - 1], hypWords[j - 1], StringComparison.OrdinalIgnoreCase) ? 0 : 1;
                dp[i, j] = Math.Min(
                    Math.Min(dp[i - 1, j] + 1,      // deletion
                             dp[i, j - 1] + 1),     // insertion
                    dp[i - 1, j - 1] + cost);       // match / substitution
            }
        }

        // Traceback
        int ti = m, tj = n;
        var reversedAlignment = new List<AlignedWord>(Math.Max(m, n));
        int matches = 0;
        int substitutions = 0;
        int missing = 0;
        int extras = 0;

        while (ti > 0 || tj > 0)
        {
            if (ti > 0 && tj > 0)
            {
                bool isMatch = string.Equals(refWords[ti - 1], hypWords[tj - 1], StringComparison.OrdinalIgnoreCase);
                int cost = isMatch ? 0 : 1;
                if (dp[ti, tj] == dp[ti - 1, tj - 1] + cost)
                {
                    if (isMatch)
                    {
                        matches++;
                        reversedAlignment.Add(new AlignedWord(refWords[ti - 1], hypWords[tj - 1], "match"));
                    }
                    else
                    {
                        substitutions++;
                        reversedAlignment.Add(new AlignedWord(refWords[ti - 1], hypWords[tj - 1], "substitution"));
                    }
                    ti--;
                    tj--;
                    continue;
                }
            }

            if (ti > 0 && dp[ti, tj] == dp[ti - 1, tj] + 1)
            {
                missing++;
                reversedAlignment.Add(new AlignedWord(refWords[ti - 1], null, "deletion"));
                ti--;
            }
            else
            {
                extras++;
                reversedAlignment.Add(new AlignedWord(null, hypWords[tj - 1], "insertion"));
                tj--;
            }
        }

        reversedAlignment.Reverse();

        double score = Math.Max(0.0, Math.Min(100.0, ((double)matches / Math.Max(1, refWords.Length)) * 100.0));

        return new LyricScoreResult(
            request.PerformanceId,
            Math.Round(score, 2),
            matches,
            substitutions,
            missing,
            extras,
            refWords.Length,
            hypWords.Length,
            reversedAlignment);
    }

    private static string[] Tokenise(string text) =>
        text.ToLowerInvariant()
            .Split(new[] { ' ', '\r', '\n', '\t', ',', '.', '!', '?', ';', ':', '"', '(', ')', '[', ']', '<', '>', '-', '/' },
                   StringSplitOptions.RemoveEmptyEntries);
}
