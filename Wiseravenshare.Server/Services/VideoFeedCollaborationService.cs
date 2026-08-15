using System.Text.Json;

namespace Wiseravenshare.Server.Services;

public sealed class VideoFeedCollaborationService
{
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<VideoFeedCollaborationService> _logger;
    private readonly object _lock = new();
    private VideoFeedCollaborationState _state = new();
    private bool _loaded;
    private string? _stateFilePath;

    public VideoFeedCollaborationService(IWebHostEnvironment environment, ILogger<VideoFeedCollaborationService> logger)
    {
        _environment = environment;
        _logger = logger;
    }

    public VideoFeedScriptWorkspace GetOrCreateWorkspace(string feedId, string feedTitle)
    {
        EnsureLoaded();

        var normalizedFeedId = NormalizeFeedId(feedId);
        var safeTitle = (feedTitle ?? string.Empty).Trim();

        lock (_lock)
        {
            var workspace = _state.Workspaces.FirstOrDefault(item => item.FeedId == normalizedFeedId);
            if (workspace is null)
            {
                workspace = new VideoFeedScriptWorkspace
                {
                    WorkspaceId = Guid.NewGuid().ToString("N"),
                    FeedId = normalizedFeedId,
                    FeedTitle = safeTitle,
                    CreatedAtUtc = DateTime.UtcNow,
                    UpdatedAtUtc = DateTime.UtcNow
                };
                _state.Workspaces.Add(workspace);
                PersistUnsafe();
            }
            else if (!string.IsNullOrWhiteSpace(safeTitle) && !string.Equals(workspace.FeedTitle, safeTitle, StringComparison.Ordinal))
            {
                workspace.FeedTitle = safeTitle;
                workspace.UpdatedAtUtc = DateTime.UtcNow;
                PersistUnsafe();
            }

            return CloneWorkspace(workspace);
        }
    }

    public VideoFeedScriptWorkspace UpsertLine(string feedId, string feedTitle, UpsertVideoFeedScriptLineRequest request, string actorUserId, string actorEmail)
    {
        EnsureLoaded();

        var normalizedFeedId = NormalizeFeedId(feedId);
        var safeTitle = (feedTitle ?? string.Empty).Trim();
        var safeActorId = (actorUserId ?? string.Empty).Trim();
        var safeActorEmail = (actorEmail ?? string.Empty).Trim();

        lock (_lock)
        {
            var workspace = GetOrCreateWorkspaceUnsafe(normalizedFeedId, safeTitle);
            var now = DateTime.UtcNow;

            var lineId = (request.LineId ?? string.Empty).Trim();
            var existingLine = workspace.Lines.FirstOrDefault(line =>
                !string.IsNullOrWhiteSpace(lineId)
                && line.LineId.Equals(lineId, StringComparison.OrdinalIgnoreCase));

            if (existingLine is null)
            {
                var sequence = request.Sequence > 0 ? request.Sequence : (workspace.Lines.Count == 0 ? 1 : workspace.Lines.Max(line => line.Sequence) + 1);
                workspace.Lines.Add(new VideoFeedScriptLine
                {
                    LineId = Guid.NewGuid().ToString("N"),
                    Sequence = sequence,
                    Speaker = (request.Speaker ?? string.Empty).Trim(),
                    Text = (request.Text ?? string.Empty).Trim(),
                    Status = string.IsNullOrWhiteSpace(request.Status) ? "draft" : request.Status.Trim(),
                    ContributorUserId = safeActorId,
                    ContributorEmail = safeActorEmail,
                    ContributorName = (request.ContributorName ?? string.Empty).Trim(),
                    CreatedAtUtc = now,
                    UpdatedAtUtc = now
                });
            }
            else
            {
                existingLine.Sequence = request.Sequence > 0 ? request.Sequence : existingLine.Sequence;
                existingLine.Speaker = (request.Speaker ?? existingLine.Speaker).Trim();
                existingLine.Text = (request.Text ?? existingLine.Text).Trim();
                existingLine.Status = string.IsNullOrWhiteSpace(request.Status) ? existingLine.Status : request.Status.Trim();
                existingLine.ContributorUserId = safeActorId;
                existingLine.ContributorEmail = safeActorEmail;
                if (!string.IsNullOrWhiteSpace(request.ContributorName))
                {
                    existingLine.ContributorName = request.ContributorName.Trim();
                }
                existingLine.UpdatedAtUtc = now;
            }

            workspace.Lines = workspace.Lines
                .OrderBy(line => line.Sequence)
                .ThenBy(line => line.CreatedAtUtc)
                .ToList();
            workspace.UpdatedAtUtc = now;

            PersistUnsafe();
            return CloneWorkspace(workspace);
        }
    }

    public VideoFeedScriptWorkspace? DeleteLine(string feedId, string lineId)
    {
        EnsureLoaded();

        var normalizedFeedId = NormalizeFeedId(feedId);
        var normalizedLineId = (lineId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedLineId))
        {
            return null;
        }

        lock (_lock)
        {
            var workspace = _state.Workspaces.FirstOrDefault(item => item.FeedId == normalizedFeedId);
            if (workspace is null)
            {
                return null;
            }

            var removed = workspace.Lines.RemoveAll(line => line.LineId.Equals(normalizedLineId, StringComparison.OrdinalIgnoreCase));
            if (removed == 0)
            {
                return CloneWorkspace(workspace);
            }

            workspace.UpdatedAtUtc = DateTime.UtcNow;
            PersistUnsafe();
            return CloneWorkspace(workspace);
        }
    }

    private VideoFeedScriptWorkspace GetOrCreateWorkspaceUnsafe(string normalizedFeedId, string feedTitle)
    {
        var workspace = _state.Workspaces.FirstOrDefault(item => item.FeedId == normalizedFeedId);
        if (workspace is not null)
        {
            if (!string.IsNullOrWhiteSpace(feedTitle))
            {
                workspace.FeedTitle = feedTitle;
            }
            return workspace;
        }

        workspace = new VideoFeedScriptWorkspace
        {
            WorkspaceId = Guid.NewGuid().ToString("N"),
            FeedId = normalizedFeedId,
            FeedTitle = feedTitle,
            CreatedAtUtc = DateTime.UtcNow,
            UpdatedAtUtc = DateTime.UtcNow
        };

        _state.Workspaces.Add(workspace);
        return workspace;
    }

    private static VideoFeedScriptWorkspace CloneWorkspace(VideoFeedScriptWorkspace workspace)
    {
        return new VideoFeedScriptWorkspace
        {
            WorkspaceId = workspace.WorkspaceId,
            FeedId = workspace.FeedId,
            FeedTitle = workspace.FeedTitle,
            CreatedAtUtc = workspace.CreatedAtUtc,
            UpdatedAtUtc = workspace.UpdatedAtUtc,
            Lines = workspace.Lines
                .OrderBy(line => line.Sequence)
                .ThenBy(line => line.CreatedAtUtc)
                .Select(line => new VideoFeedScriptLine
                {
                    LineId = line.LineId,
                    Sequence = line.Sequence,
                    Speaker = line.Speaker,
                    Text = line.Text,
                    Status = line.Status,
                    ContributorUserId = line.ContributorUserId,
                    ContributorEmail = line.ContributorEmail,
                    ContributorName = line.ContributorName,
                    CreatedAtUtc = line.CreatedAtUtc,
                    UpdatedAtUtc = line.UpdatedAtUtc
                })
                .ToList()
        };
    }

    private void EnsureLoaded()
    {
        if (_loaded)
        {
            return;
        }

        lock (_lock)
        {
            if (_loaded)
            {
                return;
            }

            _stateFilePath = ResolveStateFilePath();
            if (File.Exists(_stateFilePath))
            {
                try
                {
                    var json = File.ReadAllText(_stateFilePath);
                    var loaded = JsonSerializer.Deserialize<VideoFeedCollaborationState>(json);
                    _state = loaded ?? new VideoFeedCollaborationState();
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Unable to load video feed collaboration state. A clean state will be used.");
                    _state = new VideoFeedCollaborationState();
                }
            }

            _state.Workspaces ??= new List<VideoFeedScriptWorkspace>();
            _loaded = true;
        }
    }

    private void PersistUnsafe()
    {
        if (string.IsNullOrWhiteSpace(_stateFilePath))
        {
            _stateFilePath = ResolveStateFilePath();
        }

        var directory = Path.GetDirectoryName(_stateFilePath);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        var payload = JsonSerializer.Serialize(_state, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(_stateFilePath!, payload);
    }

    private string ResolveStateFilePath()
    {
        var appDataPath = Path.Combine(_environment.ContentRootPath, "App_Data");
        return Path.Combine(appDataPath, "video-feed-collaboration.json");
    }

    private static string NormalizeFeedId(string? feedId)
    {
        var value = (feedId ?? string.Empty).Trim();
        return string.IsNullOrWhiteSpace(value) ? "default-feed" : value;
    }
}

public sealed class VideoFeedCollaborationState
{
    public List<VideoFeedScriptWorkspace> Workspaces { get; set; } = new();
}

public sealed class VideoFeedScriptWorkspace
{
    public string WorkspaceId { get; set; } = Guid.NewGuid().ToString("N");
    public string FeedId { get; set; } = string.Empty;
    public string FeedTitle { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public List<VideoFeedScriptLine> Lines { get; set; } = new();
}

public sealed class VideoFeedScriptLine
{
    public string LineId { get; set; } = Guid.NewGuid().ToString("N");
    public int Sequence { get; set; }
    public string Speaker { get; set; } = string.Empty;
    public string Text { get; set; } = string.Empty;
    public string Status { get; set; } = "draft";
    public string ContributorUserId { get; set; } = string.Empty;
    public string ContributorEmail { get; set; } = string.Empty;
    public string ContributorName { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class UpsertVideoFeedScriptLineRequest
{
    public string LineId { get; set; } = string.Empty;
    public int Sequence { get; set; }
    public string Speaker { get; set; } = string.Empty;
    public string Text { get; set; } = string.Empty;
    public string Status { get; set; } = "draft";
    public string ContributorName { get; set; } = string.Empty;
}
