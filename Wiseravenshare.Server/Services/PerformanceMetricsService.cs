using System.Collections.Concurrent;
using System.Globalization;
using System.Text.RegularExpressions;

namespace Wiseravenshare.Server.Services;

public sealed class PerformanceMetricsService
{
    private static readonly Regex GuidSegmentRegex = new(@"/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?=/|$)", RegexOptions.Compiled);
    private static readonly Regex NumericSegmentRegex = new(@"/\d+(?=/|$)", RegexOptions.Compiled);

    private readonly ConcurrentDictionary<string, RollingSeries> _latencyByEndpoint = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, long> _requestCountByEndpoint = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, int> _lastStatusByEndpoint = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, DateTime> _lastSeenByEndpoint = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, long> _cacheCounters = new(StringComparer.OrdinalIgnoreCase);
    private readonly RollingSeries _globalLatencySeries = new(2048);

    public void RecordRequest(string method, string path, int statusCode, double elapsedMilliseconds)
    {
        if (string.IsNullOrWhiteSpace(path) || elapsedMilliseconds < 0)
        {
            return;
        }

        var endpointKey = BuildEndpointKey(method, path);
        _globalLatencySeries.Add(elapsedMilliseconds);

        var endpointSeries = _latencyByEndpoint.GetOrAdd(endpointKey, _ => new RollingSeries(512));
        endpointSeries.Add(elapsedMilliseconds);

        _requestCountByEndpoint.AddOrUpdate(endpointKey, 1, (_, value) => value + 1);
        _lastStatusByEndpoint.AddOrUpdate(endpointKey, statusCode, (_, _) => statusCode);
        _lastSeenByEndpoint.AddOrUpdate(endpointKey, DateTime.UtcNow, (_, _) => DateTime.UtcNow);
    }

    public void RecordCacheHit(string area, string layer)
    {
        IncrementCounter($"cache.{NormalizeCounterPart(area)}.{NormalizeCounterPart(layer)}.hit");
        IncrementCounter("cache.total.hit");
    }

    public void RecordCacheMiss(string area, string layer)
    {
        IncrementCounter($"cache.{NormalizeCounterPart(area)}.{NormalizeCounterPart(layer)}.miss");
        IncrementCounter("cache.total.miss");
    }

    public void RecordCacheInvalidation(string tag)
    {
        IncrementCounter($"cache.tag.{NormalizeCounterPart(tag)}.invalidations");
        IncrementCounter("cache.total.invalidations");
    }

    public PerformanceMetricsSnapshot GetSnapshot(int topEndpoints = 20)
    {
        var globalValues = _globalLatencySeries.GetValues();
        var endpointSnapshots = _requestCountByEndpoint
            .Select(item =>
            {
                var endpoint = item.Key;
                var latencies = _latencyByEndpoint.TryGetValue(endpoint, out var series)
                    ? series.GetValues()
                    : Array.Empty<double>();

                _lastStatusByEndpoint.TryGetValue(endpoint, out var statusCode);
                _lastSeenByEndpoint.TryGetValue(endpoint, out var lastSeenAtUtc);

                return new EndpointLatencySnapshot
                {
                    Endpoint = endpoint,
                    RequestCount = item.Value,
                    P50Ms = ComputePercentile(latencies, 50),
                    P95Ms = ComputePercentile(latencies, 95),
                    P99Ms = ComputePercentile(latencies, 99),
                    LastStatusCode = statusCode,
                    LastSeenAtUtc = lastSeenAtUtc
                };
            })
            .OrderByDescending(item => item.RequestCount)
            .Take(Math.Max(topEndpoints, 1))
            .ToList();

        var counters = _cacheCounters
            .OrderBy(item => item.Key, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(item => item.Key, item => item.Value, StringComparer.OrdinalIgnoreCase);

        counters.TryGetValue("cache.total.hit", out var totalHits);
        counters.TryGetValue("cache.total.miss", out var totalMisses);
        counters.TryGetValue("cache.total.invalidations", out var totalInvalidations);

        var totalHitMiss = totalHits + totalMisses;
        var hitRate = totalHitMiss > 0
            ? Math.Round((double)totalHits / totalHitMiss * 100.0, 2)
            : 0;

        return new PerformanceMetricsSnapshot
        {
            GeneratedAtUtc = DateTime.UtcNow,
            Requests = new RequestLatencySnapshot
            {
                TotalRequests = _requestCountByEndpoint.Values.Sum(),
                WindowSampleSize = globalValues.Length,
                P50Ms = ComputePercentile(globalValues, 50),
                P95Ms = ComputePercentile(globalValues, 95),
                P99Ms = ComputePercentile(globalValues, 99),
                Endpoints = endpointSnapshots
            },
            Cache = new CacheCountersSnapshot
            {
                Counters = counters,
                TotalHits = totalHits,
                TotalMisses = totalMisses,
                TotalInvalidations = totalInvalidations,
                HitRatePercent = hitRate
            }
        };
    }

    private static string BuildEndpointKey(string method, string path)
    {
        var safeMethod = string.IsNullOrWhiteSpace(method) ? "GET" : method.Trim().ToUpperInvariant();
        var safePath = path.Trim();
        safePath = GuidSegmentRegex.Replace(safePath, "/{id}");
        safePath = NumericSegmentRegex.Replace(safePath, "/{n}");

        if (safePath.Length > 180)
        {
            safePath = safePath[..180];
        }

        return string.Create(CultureInfo.InvariantCulture, $"{safeMethod} {safePath}");
    }

    private static string NormalizeCounterPart(string value)
    {
        return string.IsNullOrWhiteSpace(value)
            ? "unknown"
            : value.Trim().Replace(' ', '_').ToLowerInvariant();
    }

    private void IncrementCounter(string key)
    {
        _cacheCounters.AddOrUpdate(key, 1, (_, value) => value + 1);
    }

    private static double ComputePercentile(double[] values, int percentile)
    {
        if (values.Length == 0)
        {
            return 0;
        }

        var sorted = values.OrderBy(value => value).ToArray();
        var rank = (percentile / 100.0) * (sorted.Length - 1);
        var lower = (int)Math.Floor(rank);
        var upper = (int)Math.Ceiling(rank);

        if (lower == upper)
        {
            return Math.Round(sorted[lower], 3);
        }

        var fraction = rank - lower;
        var interpolated = sorted[lower] + ((sorted[upper] - sorted[lower]) * fraction);
        return Math.Round(interpolated, 3);
    }

    private sealed class RollingSeries
    {
        private readonly object _sync = new();
        private readonly Queue<double> _values = new();
        private readonly int _capacity;

        public RollingSeries(int capacity)
        {
            _capacity = Math.Max(capacity, 16);
        }

        public void Add(double value)
        {
            lock (_sync)
            {
                _values.Enqueue(value);
                while (_values.Count > _capacity)
                {
                    _values.Dequeue();
                }
            }
        }

        public double[] GetValues()
        {
            lock (_sync)
            {
                return _values.ToArray();
            }
        }
    }
}

public sealed class PerformanceMetricsSnapshot
{
    public DateTime GeneratedAtUtc { get; set; }
    public RequestLatencySnapshot Requests { get; set; } = new();
    public CacheCountersSnapshot Cache { get; set; } = new();
}

public sealed class RequestLatencySnapshot
{
    public long TotalRequests { get; set; }
    public int WindowSampleSize { get; set; }
    public double P50Ms { get; set; }
    public double P95Ms { get; set; }
    public double P99Ms { get; set; }
    public IReadOnlyList<EndpointLatencySnapshot> Endpoints { get; set; } = Array.Empty<EndpointLatencySnapshot>();
}

public sealed class EndpointLatencySnapshot
{
    public string Endpoint { get; set; } = string.Empty;
    public long RequestCount { get; set; }
    public double P50Ms { get; set; }
    public double P95Ms { get; set; }
    public double P99Ms { get; set; }
    public int LastStatusCode { get; set; }
    public DateTime LastSeenAtUtc { get; set; }
}

public sealed class CacheCountersSnapshot
{
    public IReadOnlyDictionary<string, long> Counters { get; set; } = new Dictionary<string, long>();
    public long TotalHits { get; set; }
    public long TotalMisses { get; set; }
    public long TotalInvalidations { get; set; }
    public double HitRatePercent { get; set; }
}
