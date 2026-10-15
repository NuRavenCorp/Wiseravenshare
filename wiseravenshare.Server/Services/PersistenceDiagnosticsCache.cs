namespace Wiseravenshare.Server.Services;

public sealed class PersistenceDiagnosticsCache
{
    private readonly object _sync = new();

    public PersistenceDiagnosticsSnapshot GetSnapshot()
    {
        lock (_sync)
        {
            return _snapshot with { };
        }
    }

    public void SetSnapshot(PersistenceDiagnosticsSnapshot snapshot)
    {
        lock (_sync)
        {
            _snapshot = snapshot;
        }
    }

    private PersistenceDiagnosticsSnapshot _snapshot = new()
    {
        LastCheckedAtUtc = DateTime.UtcNow,
        Users = new PersistenceDiagnosticsEntry
        {
            DatabaseConfigured = false,
            DatabaseAvailable = false,
            RequiresDatabase = true,
            ActiveTable = "unknown",
            LastError = "Not checked yet.",
            TimedOut = false
        },
        Videos = new PersistenceDiagnosticsEntry
        {
            DatabaseConfigured = false,
            DatabaseAvailable = false,
            RequiresDatabase = false,
            ActiveTable = "unknown",
            LastError = "Not checked yet.",
            TimedOut = false
        }
    };
}

public sealed record PersistenceDiagnosticsSnapshot
{
    public DateTime LastCheckedAtUtc { get; init; }
    public PersistenceDiagnosticsEntry Users { get; init; } = new();
    public PersistenceDiagnosticsEntry Videos { get; init; } = new();
}

public sealed record PersistenceDiagnosticsEntry
{
    public bool DatabaseConfigured { get; init; }
    public bool DatabaseAvailable { get; init; }
    public bool RequiresDatabase { get; init; }
    public string ActiveTable { get; init; } = string.Empty;
    public string LastError { get; init; } = string.Empty;
    public bool TimedOut { get; init; }
}
