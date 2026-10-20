using System.Collections.Concurrent;

namespace Wiseravenshare.Server.Services;

public sealed class LiveStreamStateStore
{
    private readonly ConcurrentDictionary<string, LiveStreamState> _streams = new(StringComparer.OrdinalIgnoreCase);

    public LiveStreamState Create(LiveStreamState stream)
    {
        _streams[stream.id] = stream;
        return stream;
    }

    public bool TryGet(string id, out LiveStreamState stream) => _streams.TryGetValue(id, out stream!);

    public LiveStreamState? Update(string id, Action<LiveStreamState> apply)
    {
        if (!_streams.TryGetValue(id, out var current))
        {
            return null;
        }

        lock (current)
        {
            apply(current);
            current.updated_date = DateTime.UtcNow;
        }

        return current;
    }

    public IReadOnlyList<LiveStreamState> GetAll() =>
        _streams.Values
            .OrderByDescending(s => s.updated_date)
            .ToList();
}

public sealed class LiveStreamState
{
    public string id { get; set; } = Guid.NewGuid().ToString("N");
    public string created_by_id { get; set; } = string.Empty;
    public string title { get; set; } = "Untitled stream";
    public string? description { get; set; }
    public string streamer_id { get; set; } = string.Empty;
    public string status { get; set; } = "live";
    public string? current_chunk_uri { get; set; }
    public int chunk_sequence { get; set; }
    public bool is_audio_only { get; set; }
    public DateTime? started_at { get; set; }
    public DateTime? ended_at { get; set; }
    public DateTime created_date { get; set; } = DateTime.UtcNow;
    public DateTime updated_date { get; set; } = DateTime.UtcNow;
}
