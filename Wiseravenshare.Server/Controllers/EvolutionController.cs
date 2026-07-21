using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using Wiseravenshare.Server.Models.Evolution;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Route("[controller]")]
public sealed class EvolutionController : ControllerBase
{
    private const string ModulesCacheKey = "registered_modules";
    private readonly IEvolutionService _evolutionService;
    private readonly IMemoryCache _cache;

    public EvolutionController(IEvolutionService evolutionService, IMemoryCache cache)
    {
        _evolutionService = evolutionService;
        _cache = cache;
    }

    [HttpGet("updates")]
    public IActionResult GetUpdates()
    {
        EnsureSeededModules();

        var modules = _cache.Get<List<ModuleDefinition>>(ModulesCacheKey) ?? new List<ModuleDefinition>();
        var updates = modules.Select(module => new
        {
            ModuleId = module.Id,
            CurrentVersion = module.Version,
            LatestVersion = BumpPatchVersion(module.Version),
            UpdateAvailable = true
        });

        var response = updates.Select(u => new
        {
            id = u.ModuleId,
            version = u.LatestVersion,
            currentVersion = u.CurrentVersion,
            updateAvailable = u.UpdateAvailable
        });

        return Ok(response);
    }

    [HttpGet("modules/{moduleId}")]
    public IActionResult GetModule(string moduleId)
    {
        EnsureSeededModules();

        var modules = _cache.Get<List<ModuleDefinition>>(ModulesCacheKey) ?? new List<ModuleDefinition>();
        var module = modules.FirstOrDefault(m => string.Equals(m.Id, moduleId, StringComparison.OrdinalIgnoreCase));
        if (module is null)
        {
            return NotFound(new { message = $"Module '{moduleId}' not found." });
        }

        return Ok(ToModulePayload(module));
    }

    [HttpGet("modules/{moduleId}/latest")]
    public IActionResult GetLatestModule(string moduleId)
    {
        EnsureSeededModules();

        var modules = _cache.Get<List<ModuleDefinition>>(ModulesCacheKey) ?? new List<ModuleDefinition>();
        var module = modules.FirstOrDefault(m => string.Equals(m.Id, moduleId, StringComparison.OrdinalIgnoreCase));
        if (module is null)
        {
            return NotFound(new { message = $"Module '{moduleId}' not found." });
        }

        var nextVersion = BumpPatchVersion(module.Version);

        return Ok(new
        {
            id = module.Id,
            version = nextVersion,
            component = module.EntryPoint,
            dependencies = module.Dependencies
        });
    }

    [HttpGet("plugins/discover")]
    public IActionResult DiscoverPlugins()
    {
        EnsureSeededModules();

        var plugins = new[]
        {
            new
            {
                id = "analytics-pack",
                version = "1.0.0",
                autoload = false,
                enabled = true,
                entry = "/plugins/analytics/index.js",
                modules = new[]
                {
                    new
                    {
                        id = "analytics-widget",
                        name = "Analytics Widget",
                        version = "1.0.0",
                        component = "AnalyticsWidget",
                        dependencies = Array.Empty<string>()
                    }
                }
            }
        };

        return Ok(new { plugins });
    }

    [HttpGet("metrics")]
    public async Task<IActionResult> GetMetrics()
    {
        var metrics = await _evolutionService.GetSystemMetricsAsync();
        return Ok(metrics);
    }

    [HttpGet("history")]
    public async Task<IActionResult> GetHistory([FromQuery] Guid? agentId = null)
    {
        var history = await _evolutionService.GetEvolutionHistoryAsync(agentId);
        return Ok(history);
    }

    private void EnsureSeededModules()
    {
        if (_cache.TryGetValue(ModulesCacheKey, out List<ModuleDefinition>? modules) && modules is not null && modules.Count > 0)
        {
            return;
        }

        var seeded = new List<ModuleDefinition>
        {
            new()
            {
                Id = "feed-core",
                Name = "Feed Core",
                Version = "1.0.0",
                EntryPoint = "FeedPage",
                Description = "Core feed rendering module.",
                Dependencies = new List<string>()
            },
            new()
            {
                Id = "ravensight-video",
                Name = "Ravensight Video",
                Version = "1.0.0",
                EntryPoint = "RavensightVideo",
                Description = "Short-form video subsystem.",
                Dependencies = new List<string> { "feed-core" }
            },
            new()
            {
                Id = "truth-seeker",
                Name = "Truth Seeker",
                Version = "1.0.0",
                EntryPoint = "TruthSeeker",
                Description = "Truth analysis and verification module.",
                Dependencies = new List<string> { "feed-core" }
            }
        };

        _cache.Set(ModulesCacheKey, seeded, TimeSpan.FromHours(12));
    }

    private static object ToModulePayload(ModuleDefinition module)
    {
        return new
        {
            id = module.Id,
            name = module.Name,
            version = module.Version,
            component = module.EntryPoint,
            description = module.Description,
            dependencies = module.Dependencies,
            enabled = module.IsEnabled,
            deprecated = module.IsDeprecated,
            priority = module.Priority
        };
    }

    private static string BumpPatchVersion(string version)
    {
        var parts = version.Split('.').Select(p => int.TryParse(p, out var n) ? n : 0).ToList();
        while (parts.Count < 3)
        {
            parts.Add(0);
        }

        parts[2] += 1;
        return $"{parts[0]}.{parts[1]}.{parts[2]}";
    }
}
