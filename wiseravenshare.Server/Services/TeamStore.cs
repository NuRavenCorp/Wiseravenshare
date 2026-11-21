using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging;
using Wiseravenshare.Server.Models;

namespace Wiseravenshare.Server.Services;

public sealed class TeamStore
{
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<TeamStore> _logger;
    private readonly object _lock = new();
    private List<TeamRecord> _teams = new();
    private bool _loaded;
    private string? _filePath;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    public TeamStore(IWebHostEnvironment environment, ILogger<TeamStore> logger)
    {
        _environment = environment;
        _logger = logger;
    }

    private void EnsureLoaded()
    {
        if (_loaded) return;

        lock (_lock)
        {
            if (_loaded) return;

            try
            {
                _filePath = ResolveStoragePath();
                if (File.Exists(_filePath))
                {
                    var json = File.ReadAllText(_filePath);
                    var items = JsonSerializer.Deserialize<List<TeamRecord>>(json, JsonOptions);
                    _teams = items ?? new List<TeamRecord>();
                }
                else
                {
                    _teams = new List<TeamRecord>();
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to load teams from disk storage. Using in-memory team store.");
                _teams = new List<TeamRecord>();
            }

            _loaded = true;
        }
    }

    private void PersistUnsafe()
    {
        try
        {
            if (string.IsNullOrWhiteSpace(_filePath))
            {
                _filePath = ResolveStoragePath();
            }

            var dir = Path.GetDirectoryName(_filePath);
            if (!string.IsNullOrWhiteSpace(dir) && !Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
            }

            var json = JsonSerializer.Serialize(_teams, JsonOptions);
            var tempPath = _filePath + ".tmp";
            File.WriteAllText(tempPath, json);
            File.Move(tempPath, _filePath, overwrite: true);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to persist teams to {FilePath}.", _filePath);
        }
    }

    private string ResolveStoragePath()
    {
        var contentRoot = _environment?.ContentRootPath;
        var baseDir = !string.IsNullOrWhiteSpace(contentRoot) ? contentRoot : AppDomain.CurrentDomain.BaseDirectory;
        var appDataDir = Path.Combine(baseDir, "App_Data");
        if (!Directory.Exists(appDataDir))
        {
            Directory.CreateDirectory(appDataDir);
        }
        return Path.Combine(appDataDir, "teams.json");
    }

    private static bool IsIdMatch(string? a, string? b)
    {
        if (string.IsNullOrWhiteSpace(a) || string.IsNullOrWhiteSpace(b)) return false;
        if (string.Equals(a, b, StringComparison.OrdinalIgnoreCase)) return true;

        var cleanA = a.Replace("-", "").Trim();
        var cleanB = b.Replace("-", "").Trim();
        return string.Equals(cleanA, cleanB, StringComparison.OrdinalIgnoreCase);
    }

    public TeamRecord Create(TeamRecord team, string requestingUserId, string? requestingUserDisplayName = null)
    {
        EnsureLoaded();

        if (string.IsNullOrWhiteSpace(team.Id))
        {
            team.Id = Guid.NewGuid().ToString("N");
        }

        if (string.IsNullOrWhiteSpace(team.OwnerId))
        {
            team.OwnerId = requestingUserId;
        }

        team.Members ??= new List<string>();
        if (!team.Members.Any(m => IsIdMatch(m, team.OwnerId)))
        {
            team.Members.Insert(0, team.OwnerId);
        }

        team.MemberDetails ??= new List<TeamMemberDetail>();
        if (!team.MemberDetails.Any(m => IsIdMatch(m.UserId, team.OwnerId)))
        {
            team.MemberDetails.Insert(0, new TeamMemberDetail
            {
                UserId = team.OwnerId,
                DisplayName = !string.IsNullOrWhiteSpace(requestingUserDisplayName) ? requestingUserDisplayName : "Owner",
                Role = "Owner",
                Responsibility = "",
                JoinedDate = DateTime.UtcNow
            });
        }

        var now = DateTime.UtcNow;
        team.CreatedDate = team.CreatedDate == default ? now : team.CreatedDate;
        team.UpdatedDate = now;

        lock (_lock)
        {
            _teams.Insert(0, team);
            PersistUnsafe();
        }

        return team;
    }

    public TeamRecord? GetById(string id)
    {
        EnsureLoaded();
        lock (_lock)
        {
            return _teams.FirstOrDefault(t => IsIdMatch(t.Id, id));
        }
    }

    public List<TeamRecord> Filter(
        string? requestingUserId,
        string? ownerId = null,
        string? id = null,
        string? search = null,
        int limit = 50,
        string? sort = null,
        bool isAdmin = false)
    {
        EnsureLoaded();

        lock (_lock)
        {
            IEnumerable<TeamRecord> query = _teams;

            if (!string.IsNullOrWhiteSpace(id))
            {
                query = query.Where(t => IsIdMatch(t.Id, id));
            }
            else if (!string.IsNullOrWhiteSpace(ownerId))
            {
                query = query.Where(t => IsIdMatch(t.OwnerId, ownerId));
            }
            else if (!isAdmin && !string.IsNullOrWhiteSpace(requestingUserId))
            {
                query = query.Where(t =>
                    IsIdMatch(t.OwnerId, requestingUserId) ||
                    (t.Members != null && t.Members.Any(m => IsIdMatch(m, requestingUserId))) ||
                    (t.MemberDetails != null && t.MemberDetails.Any(m =>
                        IsIdMatch(m.UserId, requestingUserId) ||
                        string.Equals(m.DisplayName, requestingUserId, StringComparison.OrdinalIgnoreCase))));
            }

            if (!string.IsNullOrWhiteSpace(search))
            {
                var s = search.Trim();
                query = query.Where(t =>
                    (t.TeamName != null && t.TeamName.Contains(s, StringComparison.OrdinalIgnoreCase)) ||
                    (t.Description != null && t.Description.Contains(s, StringComparison.OrdinalIgnoreCase)) ||
                    (t.Focus != null && t.Focus.Contains(s, StringComparison.OrdinalIgnoreCase)) ||
                    (t.Purpose != null && t.Purpose.Contains(s, StringComparison.OrdinalIgnoreCase)));
            }

            var isAsc = sort != null && (sort.StartsWith("+") || sort.EndsWith("asc", StringComparison.OrdinalIgnoreCase));
            query = isAsc ? query.OrderBy(t => t.CreatedDate) : query.OrderByDescending(t => t.CreatedDate);

            var clampedLimit = Math.Clamp(limit <= 0 ? 50 : limit, 1, 200);
            return query.Take(clampedLimit).ToList();
        }
    }

    public TeamRecord? Update(string id, Action<TeamRecord> updateAction, string? requestingUserId = null, bool isAdmin = false)
    {
        EnsureLoaded();

        lock (_lock)
        {
            var existing = _teams.FirstOrDefault(t => IsIdMatch(t.Id, id));
            if (existing is null)
            {
                return null;
            }

            if (!isAdmin && !string.IsNullOrWhiteSpace(requestingUserId))
            {
                var isOwner = IsIdMatch(existing.OwnerId, requestingUserId);
                var isMember = existing.Members != null && existing.Members.Any(m => IsIdMatch(m, requestingUserId));
                if (!isOwner && !isMember)
                {
                    return null;
                }
            }

            updateAction(existing);
            existing.UpdatedDate = DateTime.UtcNow;
            PersistUnsafe();

            return existing;
        }
    }

    public bool Delete(string id, string? requestingUserId = null, bool isAdmin = false)
    {
        EnsureLoaded();

        lock (_lock)
        {
            var existing = _teams.FirstOrDefault(t => IsIdMatch(t.Id, id));
            if (existing is null)
            {
                return false;
            }

            if (!isAdmin && !string.IsNullOrWhiteSpace(requestingUserId))
            {
                var isOwner = IsIdMatch(existing.OwnerId, requestingUserId);
                if (!isOwner)
                {
                    return false;
                }
            }

            _teams.Remove(existing);
            PersistUnsafe();
            return true;
        }
    }

    public TeamMemberDetail? AddOrUpdateMember(
        string teamId,
        string memberUserId,
        string displayName,
        string role,
        string? responsibility = null,
        string? device = null)
    {
        EnsureLoaded();

        lock (_lock)
        {
            var existing = _teams.FirstOrDefault(t => IsIdMatch(t.Id, teamId));
            if (existing is null) return null;

            existing.Members ??= new List<string>();
            if (!existing.Members.Any(m => IsIdMatch(m, memberUserId)))
            {
                existing.Members.Add(memberUserId);
            }

            existing.MemberDetails ??= new List<TeamMemberDetail>();
            var member = existing.MemberDetails.FirstOrDefault(m => IsIdMatch(m.UserId, memberUserId));
            if (member is null)
            {
                member = new TeamMemberDetail
                {
                    UserId = memberUserId,
                    DisplayName = !string.IsNullOrWhiteSpace(displayName) ? displayName : memberUserId,
                    Role = !string.IsNullOrWhiteSpace(role) ? role : "Member",
                    Responsibility = responsibility,
                    Device = device,
                    JoinedDate = DateTime.UtcNow
                };
                existing.MemberDetails.Add(member);
            }
            else
            {
                if (!string.IsNullOrWhiteSpace(role)) member.Role = role;
                if (!string.IsNullOrWhiteSpace(displayName)) member.DisplayName = displayName;
                if (responsibility != null) member.Responsibility = responsibility;
                if (device != null) member.Device = device;
            }

            existing.UpdatedDate = DateTime.UtcNow;
            PersistUnsafe();

            return member;
        }
    }

    public bool RemoveMember(string teamId, string memberUserId, string? requestingUserId = null, bool isAdmin = false)
    {
        EnsureLoaded();

        lock (_lock)
        {
            var existing = _teams.FirstOrDefault(t => IsIdMatch(t.Id, teamId));
            if (existing is null) return false;

            if (!isAdmin && !string.IsNullOrWhiteSpace(requestingUserId))
            {
                var isOwner = IsIdMatch(existing.OwnerId, requestingUserId);
                var isSelf = IsIdMatch(memberUserId, requestingUserId);
                if (!isOwner && !isSelf)
                {
                    return false;
                }
            }

            existing.Members?.RemoveAll(m => IsIdMatch(m, memberUserId));
            existing.MemberDetails?.RemoveAll(m => IsIdMatch(m.UserId, memberUserId));
            existing.UpdatedDate = DateTime.UtcNow;
            PersistUnsafe();

            return true;
        }
    }
}
