using System.Diagnostics;
using System.Runtime.InteropServices;

namespace Wiseravenshare.Server.Services;

/// <summary>
/// IHostedService that manages all Python microservices for the lifetime of the
/// ASP.NET Core application.
///
/// On startup for each configured service it:
///   1. Locates (or creates) an isolated Python venv next to the service folder.
///   2. Runs `pip install -r requirements.txt --quiet` inside that venv so
///      dependencies are always in sync with the committed requirements file.
///   3. Launches `uvicorn main:app` on the configured port using the venv Python.
///   4. Monitors the process and auto-restarts it if it crashes (up to MaxRestarts).
///
/// On graceful ASP.NET shutdown it sends SIGTERM / Ctrl-C to every managed
/// process and waits up to ShutdownGracePeriod before force-killing.
///
/// Configuration (appsettings.json → PythonServices section):
/// <code>
/// "PythonServices": {
///   "Enabled": true,
///   "PipInstallOnStartup": true,
///   "MaxRestarts": 5,
///   "ShutdownGracePeriodSeconds": 10,
///   "Services": [
///     { "Name": "karaoke-engine",  "Port": 8002, "Enabled": true },
///     { "Name": "karaoke-speech",  "Port": 8003, "Enabled": true },
///     { "Name": "audio-processor", "Port": 8001, "Enabled": true }
///   ]
/// }
/// </code>
///
/// The orchestrator resolves each service folder as:
///   <ContentRoot>/../../services/<Name>/   (repo layout)
/// and the shared venv as:
///   <ContentRoot>/../../services/<Name>/.venv/
/// </summary>
public sealed class PythonServiceOrchestrator : IHostedService, IDisposable
{
    // ── configuration model ──────────────────────────────────────────────────
    public sealed class ServiceConfig
    {
        public string Name    { get; set; } = string.Empty;
        public int    Port    { get; set; } = 8000;
        public bool   Enabled { get; set; } = true;
    }

    public sealed class OrchestratorConfig
    {
        public bool            Enabled                  { get; set; } = true;
        public bool            PipInstallOnStartup      { get; set; } = true;
        public int             MaxRestarts              { get; set; } = 5;
        public int             ShutdownGracePeriodSeconds { get; set; } = 10;
        public List<ServiceConfig> Services             { get; set; } = [];
    }

    // ── runtime state per service ────────────────────────────────────────────
    private sealed class ManagedService
    {
        public ServiceConfig Config      { get; init; } = new();
        public string        ServiceDir  { get; init; } = string.Empty;
        public string        VenvPython  { get; init; } = string.Empty;
        public Process?      Process     { get; set; }
        public int           RestartCount{ get; set; }
        public CancellationTokenSource Cts { get; } = new();
    }

    // ── fields ───────────────────────────────────────────────────────────────
    private readonly ILogger<PythonServiceOrchestrator> _logger;
    private readonly IWebHostEnvironment _env;
    private readonly OrchestratorConfig _cfg;
    private readonly List<ManagedService> _managed = [];

    private static readonly bool IsWindows = RuntimeInformation.IsOSPlatform(OSPlatform.Windows);

    public PythonServiceOrchestrator(
        ILogger<PythonServiceOrchestrator> logger,
        IWebHostEnvironment env,
        IConfiguration configuration)
    {
        _logger = logger;
        _env    = env;
        _cfg    = configuration
                      .GetSection("PythonServices")
                      .Get<OrchestratorConfig>()
                  ?? new OrchestratorConfig();
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  IHostedService
    // ─────────────────────────────────────────────────────────────────────────

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        if (!_cfg.Enabled)
        {
            _logger.LogInformation("[PythonOrchestrator] Disabled — skipping Python service startup.");
            return;
        }

        var servicesRoot = ResolveServicesRoot();
        _logger.LogInformation("[PythonOrchestrator] Services root: {Root}", servicesRoot);

        // Verify Python is available
        var pythonExe = FindSystemPython();
        if (pythonExe is null)
        {
            _logger.LogWarning("[PythonOrchestrator] Python not found in PATH — Python services will not start. " +
                               "Install Python 3.10+ and ensure it is on the system PATH.");
            return;
        }

        _logger.LogInformation("[PythonOrchestrator] System Python: {Exe}", pythonExe);

        foreach (var svc in _cfg.Services.Where(s => s.Enabled))
        {
            if (cancellationToken.IsCancellationRequested) break;

            var serviceDir = Path.Combine(servicesRoot, svc.Name);
            if (!Directory.Exists(serviceDir))
            {
                _logger.LogWarning("[PythonOrchestrator] Service directory not found: {Dir} — skipping {Name}",
                    serviceDir, svc.Name);
                continue;
            }

            var venvPython = await EnsureVenvAsync(pythonExe, serviceDir, svc.Name, cancellationToken);
            if (venvPython is null)
            {
                _logger.LogError("[PythonOrchestrator] Failed to create venv for {Name}", svc.Name);
                continue;
            }

            if (_cfg.PipInstallOnStartup)
            {
                await PipInstallAsync(venvPython, serviceDir, svc.Name, cancellationToken);
            }

            var managed = new ManagedService
            {
                Config     = svc,
                ServiceDir = serviceDir,
                VenvPython = venvPython,
            };

            _managed.Add(managed);
            _ = Task.Run(() => SuperviseAsync(managed, managed.Cts.Token), CancellationToken.None);
        }
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("[PythonOrchestrator] Shutting down {Count} Python service(s)…", _managed.Count);

        foreach (var m in _managed)
        {
            m.Cts.Cancel();
        }

        var gracePeriod = TimeSpan.FromSeconds(_cfg.ShutdownGracePeriodSeconds);
        var deadline    = Task.Delay(gracePeriod, CancellationToken.None);

        foreach (var m in _managed)
        {
            var proc = m.Process;
            if (proc is null || proc.HasExited) continue;

            try
            {
                if (IsWindows)
                    proc.Kill(entireProcessTree: true);
                else
                    proc.Kill();            // sends SIGKILL; we already cancelled the supervisor

                _logger.LogInformation("[PythonOrchestrator] Stopped {Name} (pid {Pid})",
                    m.Config.Name, proc.Id);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[PythonOrchestrator] Error stopping {Name}", m.Config.Name);
            }
        }

        await deadline;
    }

    public void Dispose()
    {
        foreach (var m in _managed)
        {
            m.Cts.Dispose();
            m.Process?.Dispose();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  venv management
    // ─────────────────────────────────────────────────────────────────────────

    private async Task<string?> EnsureVenvAsync(
        string systemPython, string serviceDir, string serviceName,
        CancellationToken ct)
    {
        var venvDir    = Path.Combine(serviceDir, ".venv");
        var venvPython = VenvPythonPath(venvDir);

        if (!File.Exists(venvPython))
        {
            _logger.LogInformation("[PythonOrchestrator] Creating venv for {Name} at {VenvDir}…",
                serviceName, venvDir);

            var result = await RunProcessAsync(
                systemPython, $"-m venv \"{venvDir}\"",
                workingDir: serviceDir, ct: ct);

            if (result != 0)
            {
                _logger.LogError("[PythonOrchestrator] `python -m venv` exited {Code} for {Name}",
                    result, serviceName);
                return null;
            }
        }
        else
        {
            _logger.LogInformation("[PythonOrchestrator] Existing venv for {Name}: {Exe}",
                serviceName, venvPython);
        }

        return venvPython;
    }

    private async Task PipInstallAsync(
        string venvPython, string serviceDir, string serviceName,
        CancellationToken ct)
    {
        var reqFile = Path.Combine(serviceDir, "requirements.txt");
        if (!File.Exists(reqFile))
        {
            _logger.LogWarning("[PythonOrchestrator] No requirements.txt for {Name} — skipping pip install",
                serviceName);
            return;
        }

        _logger.LogInformation("[PythonOrchestrator] Installing dependencies for {Name}…", serviceName);

        // Upgrade pip first (suppresses pip version warnings)
        await RunProcessAsync(venvPython, "-m pip install --upgrade pip --quiet",
            workingDir: serviceDir, ct: ct);

        var result = await RunProcessAsync(
            venvPython,
            $"-m pip install -r \"{reqFile}\" --quiet",
            workingDir: serviceDir, ct: ct);

        if (result != 0)
            _logger.LogWarning("[PythonOrchestrator] pip install returned {Code} for {Name} — service may have import errors",
                result, serviceName);
        else
            _logger.LogInformation("[PythonOrchestrator] Dependencies ready for {Name}", serviceName);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  process supervision
    // ─────────────────────────────────────────────────────────────────────────

    private async Task SuperviseAsync(ManagedService m, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested && m.RestartCount <= _cfg.MaxRestarts)
        {
            try
            {
                await StartServiceProcessAsync(m, ct);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[PythonOrchestrator] Unhandled error in supervisor for {Name}", m.Config.Name);
            }

            if (ct.IsCancellationRequested) break;

            m.RestartCount++;
            if (m.RestartCount > _cfg.MaxRestarts)
            {
                _logger.LogError("[PythonOrchestrator] {Name} crashed {Count} times — giving up. " +
                                 "Check logs in the service directory.", m.Config.Name, m.RestartCount);
                break;
            }

            var backoff = TimeSpan.FromSeconds(Math.Min(5 * m.RestartCount, 30));
            _logger.LogWarning("[PythonOrchestrator] {Name} exited — restarting in {Secs}s (attempt {N}/{Max})…",
                m.Config.Name, backoff.TotalSeconds, m.RestartCount, _cfg.MaxRestarts);

            await Task.Delay(backoff, ct);
        }
    }

    private async Task StartServiceProcessAsync(ManagedService m, CancellationToken ct)
    {
        // uvicorn main:app --host 0.0.0.0 --port <port> --log-level warning
        var args = $"-m uvicorn main:app --host 0.0.0.0 --port {m.Config.Port} --log-level info --no-access-log";

        var psi = new ProcessStartInfo
        {
            FileName         = m.VenvPython,
            Arguments        = args,
            WorkingDirectory = m.ServiceDir,
            UseShellExecute  = false,
            RedirectStandardOutput = true,
            RedirectStandardError  = true,
            CreateNoWindow   = true,
        };

        using var proc = new Process { StartInfo = psi, EnableRaisingEvents = true };
        m.Process = proc;

        proc.OutputDataReceived += (_, e) =>
        {
            if (e.Data is { Length: > 0 })
                _logger.LogInformation("[{Name}] {Line}", m.Config.Name, e.Data);
        };
        proc.ErrorDataReceived += (_, e) =>
        {
            if (e.Data is { Length: > 0 })
                _logger.LogWarning("[{Name}] {Line}", m.Config.Name, e.Data);
        };

        proc.Start();
        proc.BeginOutputReadLine();
        proc.BeginErrorReadLine();

        _logger.LogInformation("[PythonOrchestrator] Started {Name} (pid {Pid}) on port {Port}",
            m.Config.Name, proc.Id, m.Config.Port);

        // Wait for process exit or cancellation
        await proc.WaitForExitAsync(ct).ConfigureAwait(false);

        if (!ct.IsCancellationRequested)
            _logger.LogWarning("[PythonOrchestrator] {Name} (pid {Pid}) exited with code {Code}",
                m.Config.Name, proc.Id, proc.ExitCode);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  helpers
    // ─────────────────────────────────────────────────────────────────────────

    private string ResolveServicesRoot()
    {
        // Repo layout: Wiseravenshare.Server/  sits inside the repo root.
        // services/ is two levels up from ContentRootPath (the .csproj directory).
        var serverDir = _env.ContentRootPath.TrimEnd(Path.DirectorySeparatorChar,
                                                      Path.AltDirectorySeparatorChar);
        var repoRoot = Path.GetFullPath(Path.Combine(serverDir, ".."));
        var servicesRoot = Path.Combine(repoRoot, "services");

        // Allow override via env var or config
        var configPath = Environment.GetEnvironmentVariable("WRS_SERVICES_ROOT")
                      ?? Environment.GetEnvironmentVariable("PYTHON_SERVICES_ROOT");
        if (!string.IsNullOrWhiteSpace(configPath) && Directory.Exists(configPath))
            return configPath;

        return servicesRoot;
    }

    private static string? FindSystemPython()
    {
        // Prefer the env var override (useful in Docker / DO)
        var envPython = Environment.GetEnvironmentVariable("WRS_PYTHON_EXE")
                     ?? Environment.GetEnvironmentVariable("PYTHON_EXE");
        if (!string.IsNullOrWhiteSpace(envPython) && File.Exists(envPython))
            return envPython;

        // Try common names in order of preference
        var candidates = IsWindows
            ? new[] { "python3.exe", "python.exe" }
            : new[] { "python3", "python" };

        foreach (var name in candidates)
        {
            var found = FindInPath(name);
            if (found is not null) return found;
        }

        return null;
    }

    private static string? FindInPath(string fileName)
    {
        var pathEnv = Environment.GetEnvironmentVariable("PATH") ?? string.Empty;
        foreach (var dir in pathEnv.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            var full = Path.Combine(dir.Trim(), fileName);
            if (File.Exists(full)) return full;
        }

        return null;
    }

    private static string VenvPythonPath(string venvDir) =>
        IsWindows
            ? Path.Combine(venvDir, "Scripts", "python.exe")
            : Path.Combine(venvDir, "bin", "python");

    private static async Task<int> RunProcessAsync(
        string exe, string args, string workingDir, CancellationToken ct)
    {
        var psi = new ProcessStartInfo
        {
            FileName         = exe,
            Arguments        = args,
            WorkingDirectory = workingDir,
            UseShellExecute  = false,
            RedirectStandardOutput = true,
            RedirectStandardError  = true,
            CreateNoWindow   = true,
        };

        using var proc = new Process { StartInfo = psi };
        proc.Start();
        proc.BeginOutputReadLine();
        proc.BeginErrorReadLine();
        await proc.WaitForExitAsync(ct);
        return proc.ExitCode;
    }
}
