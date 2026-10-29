using System.Text.Json.Serialization;

namespace Wiseravenshare.Server.Services;

public sealed record TranscriptTurn(
    [property: JsonPropertyName("turn_order")] int TurnOrder,
    [property: JsonPropertyName("transcript")] string Transcript,
    [property: JsonPropertyName("end_of_turn")] bool EndOfTurn = true);

public sealed record FinalTurn(
    int TurnOrder,
    string Transcript,
    long? StartMilliseconds = null,
    long? EndMilliseconds = null);

public sealed record LyricScoreRequest(
    [property: JsonPropertyName("performance_id")] string PerformanceId,
    [property: JsonPropertyName("reference_lyrics")] string ReferenceLyrics,
    [property: JsonPropertyName("turns")] IReadOnlyList<TranscriptTurn> Turns);

public sealed record AlignedWord(
    [property: JsonPropertyName("reference")] string? Reference,
    [property: JsonPropertyName("recognized")] string? Recognized,
    [property: JsonPropertyName("operation")] string Operation);

public sealed record LyricScoreResult(
    [property: JsonPropertyName("performance_id")] string PerformanceId,
    [property: JsonPropertyName("score")] double Score,
    [property: JsonPropertyName("matches")] int Matches,
    [property: JsonPropertyName("substitutions")] int Substitutions,
    [property: JsonPropertyName("missing")] int Missing,
    [property: JsonPropertyName("extras")] int Extras,
    [property: JsonPropertyName("reference_word_count")] int ReferenceWordCount,
    [property: JsonPropertyName("recognized_word_count")] int RecognizedWordCount,
    [property: JsonPropertyName("alignment")] IReadOnlyList<AlignedWord> Alignment);
