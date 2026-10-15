using System.Text.Json;

namespace Wiseravenshare.Server.Services;

public sealed class PodcastVideoBridgeStateService
{
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<PodcastVideoBridgeStateService> _logger;
    private readonly object _lock = new();
    private PodcastVideoBridgeState _state = new();
    private bool _loaded;
    private string? _stateFilePath;

    public PodcastVideoBridgeStateService(IWebHostEnvironment environment, ILogger<PodcastVideoBridgeStateService> logger)
    {
        _environment = environment;
        _logger = logger;
    }

    public PodcastBridgeRoomSnapshot GetSnapshot(string? roomKey)
    {
        EnsureLoaded();
        var normalizedRoomKey = NormalizeRoomKey(roomKey);

        lock (_lock)
        {
            var room = GetOrCreateRoomUnsafe(normalizedRoomKey);
            return ToSnapshot(room);
        }
    }

    public PodcastBridgeRoomSnapshot UpsertFootage(string? roomKey, PodcastBridgeFootageSelection selection)
    {
        EnsureLoaded();
        var normalizedRoomKey = NormalizeRoomKey(roomKey);

        lock (_lock)
        {
            var room = GetOrCreateRoomUnsafe(normalizedRoomKey);
            room.ActiveFootage = new PodcastBridgeFootageSelection
            {
                FootageId = string.IsNullOrWhiteSpace(selection.FootageId) ? Guid.NewGuid().ToString("N") : selection.FootageId.Trim(),
                VideoId = (selection.VideoId ?? string.Empty).Trim(),
                Title = (selection.Title ?? string.Empty).Trim(),
                MediaUrl = (selection.MediaUrl ?? string.Empty).Trim(),
                ThumbnailUrl = (selection.ThumbnailUrl ?? string.Empty).Trim(),
                SourceUserId = (selection.SourceUserId ?? string.Empty).Trim(),
                SourceUserName = (selection.SourceUserName ?? string.Empty).Trim(),
                SelectedAtUtc = DateTime.UtcNow
            };
            room.UpdatedAtUtc = DateTime.UtcNow;
            PersistUnsafe();
            return ToSnapshot(room);
        }
    }

    public PodcastBridgeCommandRecord AddCommand(string? roomKey, PodcastBridgeCommandRecord command)
    {
        EnsureLoaded();
        var normalizedRoomKey = NormalizeRoomKey(roomKey);

        lock (_lock)
        {
            var room = GetOrCreateRoomUnsafe(normalizedRoomKey);
            var safeCommand = new PodcastBridgeCommandRecord
            {
                CommandId = string.IsNullOrWhiteSpace(command.CommandId) ? Guid.NewGuid().ToString("N") : command.CommandId.Trim(),
                Command = (command.Command ?? string.Empty).Trim().ToLowerInvariant(),
                Note = (command.Note ?? string.Empty).Trim(),
                IssuedByUserId = (command.IssuedByUserId ?? string.Empty).Trim(),
                IssuedByUserName = (command.IssuedByUserName ?? string.Empty).Trim(),
                TargetUserId = (command.TargetUserId ?? string.Empty).Trim(),
                IssuedAtUtc = DateTime.UtcNow,
                Status = "issued",
                Responses = []
            };

            room.CommandLog.Add(safeCommand);
            if (room.CommandLog.Count > 100)
            {
                room.CommandLog = room.CommandLog
                    .OrderByDescending(item => item.IssuedAtUtc)
                    .Take(100)
                    .OrderBy(item => item.IssuedAtUtc)
                    .ToList();
            }

            room.UpdatedAtUtc = DateTime.UtcNow;
            PersistUnsafe();
            return CloneCommand(safeCommand);
        }
    }

    public PodcastBridgeCommandRecord? AddCommandResponse(string? roomKey, string? commandId, PodcastBridgeCommandResponse response)
    {
        EnsureLoaded();
        var normalizedRoomKey = NormalizeRoomKey(roomKey);
        var normalizedCommandId = (commandId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedCommandId))
        {
            return null;
        }

        lock (_lock)
        {
            var room = GetOrCreateRoomUnsafe(normalizedRoomKey);
            var command = room.CommandLog.FirstOrDefault(item =>
                item.CommandId.Equals(normalizedCommandId, StringComparison.OrdinalIgnoreCase));
            if (command is null)
            {
                return null;
            }

            command.Responses ??= [];
            command.Responses.Add(new PodcastBridgeCommandResponse
            {
                ResponseId = string.IsNullOrWhiteSpace(response.ResponseId) ? Guid.NewGuid().ToString("N") : response.ResponseId.Trim(),
                ResponderUserId = (response.ResponderUserId ?? string.Empty).Trim(),
                ResponderUserName = (response.ResponderUserName ?? string.Empty).Trim(),
                Message = (response.Message ?? string.Empty).Trim(),
                RespondedAtUtc = DateTime.UtcNow
            });
            command.Status = "acknowledged";

            room.UpdatedAtUtc = DateTime.UtcNow;
            PersistUnsafe();
            return CloneCommand(command);
        }
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
                    var parsed = JsonSerializer.Deserialize<PodcastVideoBridgeState>(json);
                    _state = parsed ?? new PodcastVideoBridgeState();
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Unable to load podcast video bridge state. Starting fresh state.");
                    _state = new PodcastVideoBridgeState();
                }
            }

            _state.Rooms ??= [];
            _loaded = true;
        }
    }

    private PodcastBridgeRoomState GetOrCreateRoomUnsafe(string roomKey)
    {
        var room = _state.Rooms.FirstOrDefault(item =>
            item.RoomKey.Equals(roomKey, StringComparison.OrdinalIgnoreCase));
        if (room is not null)
        {
            room.CommandLog ??= [];
            return room;
        }

        room = new PodcastBridgeRoomState
        {
            RoomKey = roomKey,
            ActiveFootage = null,
            CommandLog = [],
            UpdatedAtUtc = DateTime.UtcNow
        };
        _state.Rooms.Add(room);
        return room;
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
        return Path.Combine(appDataPath, "podcast-video-bridge-state.json");
    }

    private static string NormalizeRoomKey(string? roomKey)
    {
        var normalized = (roomKey ?? string.Empty).Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return "main";
        }

        var safe = new string(normalized.Where(ch => char.IsLetterOrDigit(ch) || ch is '-' or '_').ToArray());
        return string.IsNullOrWhiteSpace(safe) ? "main" : safe;
    }

    private static PodcastBridgeRoomSnapshot ToSnapshot(PodcastBridgeRoomState room)
    {
        return new PodcastBridgeRoomSnapshot
        {
            RoomKey = room.RoomKey,
            ActiveFootage = room.ActiveFootage is null ? null : new PodcastBridgeFootageSelection
            {
                FootageId = room.ActiveFootage.FootageId,
                VideoId = room.ActiveFootage.VideoId,
                Title = room.ActiveFootage.Title,
                MediaUrl = room.ActiveFootage.MediaUrl,
                ThumbnailUrl = room.ActiveFootage.ThumbnailUrl,
                SourceUserId = room.ActiveFootage.SourceUserId,
                SourceUserName = room.ActiveFootage.SourceUserName,
                SelectedAtUtc = room.ActiveFootage.SelectedAtUtc
            },
            CommandLog = room.CommandLog
                .OrderBy(item => item.IssuedAtUtc)
                .Select(CloneCommand)
                .ToList(),
            UpdatedAtUtc = room.UpdatedAtUtc
        };
    }

    private static PodcastBridgeCommandRecord CloneCommand(PodcastBridgeCommandRecord command)
    {
        return new PodcastBridgeCommandRecord
        {
            CommandId = command.CommandId,
            Command = command.Command,
            Note = command.Note,
            IssuedByUserId = command.IssuedByUserId,
            IssuedByUserName = command.IssuedByUserName,
            TargetUserId = command.TargetUserId,
            IssuedAtUtc = command.IssuedAtUtc,
            Status = command.Status,
            Responses = (command.Responses ?? [])
                .OrderBy(item => item.RespondedAtUtc)
                .Select(item => new PodcastBridgeCommandResponse
                {
                    ResponseId = item.ResponseId,
                    ResponderUserId = item.ResponderUserId,
                    ResponderUserName = item.ResponderUserName,
                    Message = item.Message,
                    RespondedAtUtc = item.RespondedAtUtc
                })
                .ToList()
        };
    }
}

public sealed class PodcastVideoBridgeState
{
    public List<PodcastBridgeRoomState> Rooms { get; set; } = [];
}

public sealed class PodcastBridgeRoomState
{
    public string RoomKey { get; set; } = "main";
    public PodcastBridgeFootageSelection? ActiveFootage { get; set; }
    public List<PodcastBridgeCommandRecord> CommandLog { get; set; } = [];
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class PodcastBridgeRoomSnapshot
{
    public string RoomKey { get; set; } = "main";
    public PodcastBridgeFootageSelection? ActiveFootage { get; set; }
    public List<PodcastBridgeCommandRecord> CommandLog { get; set; } = [];
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class PodcastBridgeFootageSelection
{
    public string FootageId { get; set; } = string.Empty;
    public string VideoId { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string MediaUrl { get; set; } = string.Empty;
    public string ThumbnailUrl { get; set; } = string.Empty;
    public string SourceUserId { get; set; } = string.Empty;
    public string SourceUserName { get; set; } = string.Empty;
    public DateTime SelectedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class PodcastBridgeCommandRecord
{
    public string CommandId { get; set; } = string.Empty;
    public string Command { get; set; } = string.Empty;
    public string Note { get; set; } = string.Empty;
    public string IssuedByUserId { get; set; } = string.Empty;
    public string IssuedByUserName { get; set; } = string.Empty;
    public string TargetUserId { get; set; } = string.Empty;
    public DateTime IssuedAtUtc { get; set; } = DateTime.UtcNow;
    public string Status { get; set; } = "issued";
    public List<PodcastBridgeCommandResponse> Responses { get; set; } = [];
}

public sealed class PodcastBridgeCommandResponse
{
    public string ResponseId { get; set; } = string.Empty;
    public string ResponderUserId { get; set; } = string.Empty;
    public string ResponderUserName { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public DateTime RespondedAtUtc { get; set; } = DateTime.UtcNow;
}