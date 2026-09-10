using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.DTOs.FM;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Entities.FM;
using Wiseravenshare.Server.Exceptions;
using Wiseravenshare.Server.Infrastructure.Data;

namespace Wiseravenshare.Server.Services.FM;

public interface ICreatorRadioStationService
{
    Task<CreatorRadioStationDto> CreateStationAsync(CreateCreatorRadioStationDto dto, Guid creatorId, CancellationToken cancellationToken = default);
    Task<CreatorRadioStationDto> GetStationAsync(Guid stationId, Guid userId, CancellationToken cancellationToken = default);
    Task<CreatorRadioStationDto> UpdateStationAsync(Guid stationId, UpdateCreatorRadioStationDto dto, Guid userId, CancellationToken cancellationToken = default);
    Task<bool> DeleteStationAsync(Guid stationId, Guid userId, CancellationToken cancellationToken = default);
    Task<CreatorRadioStationDto> UpdateStationStatusAsync(Guid stationId, RadioStationStatusUpdateDto dto, Guid userId, CancellationToken cancellationToken = default);
    Task<IEnumerable<CreatorRadioStationDto>> GetCreatorStationsAsync(Guid creatorId, Guid userId, CancellationToken cancellationToken = default);
    Task<IEnumerable<CreatorRadioStationDto>> GetPublicStationsAsync(int page, int pageSize, Guid userId, CancellationToken cancellationToken = default);
    Task<IEnumerable<CreatorRadioStationDto>> SearchStationsAsync(string query, string? genre, string? visibility, Guid userId, CancellationToken cancellationToken = default);
    Task StartLiveStreamAsync(Guid stationId, Guid userId, CancellationToken cancellationToken = default);
    Task EndLiveStreamAsync(Guid stationId, Guid userId, CancellationToken cancellationToken = default);
    Task<RadioStationScheduleDto> AddScheduleAsync(Guid stationId, CreateRadioStationScheduleDto dto, Guid userId, CancellationToken cancellationToken = default);
    Task<IEnumerable<RadioStationScheduleDto>> GetStationSchedulesAsync(Guid stationId, CancellationToken cancellationToken = default);
    Task<bool> DeleteScheduleAsync(Guid scheduleId, Guid userId, CancellationToken cancellationToken = default);
    Task<RadioStationFollowDto> FollowStationAsync(Guid stationId, Guid userId, CancellationToken cancellationToken = default);
    Task<bool> UnfollowStationAsync(Guid stationId, Guid userId, CancellationToken cancellationToken = default);
    Task<RadioStationRequestDto> CreateRequestAsync(Guid stationId, CreateRadioStationRequestDto dto, Guid userId, CancellationToken cancellationToken = default);
    Task<RadioStationShoutoutDto> CreateShoutoutAsync(Guid stationId, CreateRadioStationShoutoutDto dto, Guid userId, CancellationToken cancellationToken = default);
    Task<RadioStationAnalyticsDto> GetStationAnalyticsAsync(Guid stationId, Guid userId, CancellationToken cancellationToken = default);
}

public sealed class CreatorRadioStationService : ICreatorRadioStationService
{
    private readonly AppDbContext _db;
    private readonly IFrequencyIntegrityService _frequencyIntegrity;

    public CreatorRadioStationService(AppDbContext db, IFrequencyIntegrityService frequencyIntegrity)
    {
        _db = db;
        _frequencyIntegrity = frequencyIntegrity;
    }

    public async Task<CreatorRadioStationDto> CreateStationAsync(CreateCreatorRadioStationDto dto, Guid creatorId, CancellationToken cancellationToken = default)
    {
        var creator = await _db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == creatorId && !x.IsDeleted, cancellationToken);
        if (creator is null)
        {
            throw new NotFoundException("Creator not found.");
        }

        var normalized = await _frequencyIntegrity.NormalizeOrGenerateAvailableAsync(dto.Frequency, dto.Band, creatorId, null, cancellationToken);
        var visibility = ParseVisibility(dto.Visibility);

        var station = new CreatorRadioStation
        {
            Name = dto.Name.Trim(),
            Description = TrimOrNull(dto.Description),
            Frequency = normalized.Display,
            FrequencyKey = normalized.Key,
            Band = normalized.Band,
            Genre = TrimOrNull(dto.Genre),
            SubGenre = TrimOrNull(dto.SubGenre),
            LogoUrl = TrimOrNull(dto.LogoUrl),
            CoverImageUrl = TrimOrNull(dto.CoverImageUrl),
            Website = TrimOrNull(dto.Website),
            SocialLinks = TrimOrNull(dto.SocialLinks),
            StreamUrl = null,
            StreamKey = $"wr-{Guid.NewGuid():N}"[..16],
            CreatorId = creatorId,
            Status = RadioStationStatus.Draft,
            Visibility = visibility,
            AllowChat = dto.AllowChat,
            AllowRequests = dto.AllowRequests,
            AllowShoutouts = dto.AllowShoutouts,
            IsProprietaryFrequency = dto.ClaimProprietaryFrequency,
            FrequencyLockedAt = dto.ClaimProprietaryFrequency ? DateTime.UtcNow : null,
            // Monetization
            IsMonetized = dto.IsMonetized,
            SubscriptionPrice = dto.SubscriptionPrice,
            AllowDonations = dto.AllowDonations,
            DonationLink = TrimOrNull(dto.DonationLink),
            // Extended metadata serialised into Settings
            Settings = BuildSettingsJson(dto),
            CreatedAt = DateTime.UtcNow
        };

        _db.Set<CreatorRadioStation>().Add(station);
        await _db.SaveChangesAsync(cancellationToken);

        if (dto.ClaimProprietaryFrequency)
        {
            await _frequencyIntegrity.ClaimProprietaryFrequencyAsync(station.Id, creatorId, station.Frequency, station.Band, station.FrequencyKey, cancellationToken);
        }

        return await ToDtoAsync(station, creatorId, cancellationToken);
    }

    public async Task<CreatorRadioStationDto> GetStationAsync(Guid stationId, Guid userId, CancellationToken cancellationToken = default)
    {
        var station = await _db.Set<CreatorRadioStation>()
            .Include(x => x.Creator)
            .Include(x => x.ScheduledShows.Where(s => !s.IsDeleted && s.IsActive))
            .Include(x => x.Episodes.Where(e => !e.IsDeleted && e.IsPublished))
            .FirstOrDefaultAsync(x => x.Id == stationId && !x.IsDeleted, cancellationToken);
        if (station is null)
        {
            throw new NotFoundException("Station not found.");
        }

        var canView = station.Visibility != RadioStationVisibility.Private || station.CreatorId == userId || await IsAdminAsync(userId, cancellationToken);
        if (!canView)
        {
            throw new UnauthorizedException("You don't have permission to view this station.");
        }

        return await ToDtoAsync(station, userId, cancellationToken);
    }

    public async Task<CreatorRadioStationDto> UpdateStationAsync(Guid stationId, UpdateCreatorRadioStationDto dto, Guid userId, CancellationToken cancellationToken = default)
    {
        var station = await _db.Set<CreatorRadioStation>()
            .Include(x => x.Creator)
            .FirstOrDefaultAsync(x => x.Id == stationId && !x.IsDeleted, cancellationToken);
        if (station is null)
        {
            throw new NotFoundException("Station not found.");
        }

        await EnsureStationWriteAccessAsync(station, userId, cancellationToken);

        if (!string.IsNullOrWhiteSpace(dto.Name)) station.Name = dto.Name.Trim();
        if (dto.Description is not null) station.Description = TrimOrNull(dto.Description);
        if (dto.Genre is not null) station.Genre = TrimOrNull(dto.Genre);
        if (dto.SubGenre is not null) station.SubGenre = TrimOrNull(dto.SubGenre);
        if (dto.LogoUrl is not null) station.LogoUrl = TrimOrNull(dto.LogoUrl);
        if (dto.CoverImageUrl is not null) station.CoverImageUrl = TrimOrNull(dto.CoverImageUrl);
        if (dto.Website is not null) station.Website = TrimOrNull(dto.Website);
        if (dto.SocialLinks is not null) station.SocialLinks = TrimOrNull(dto.SocialLinks);
        if (dto.StreamUrl is not null) station.StreamUrl = TrimOrNull(dto.StreamUrl);
        if (dto.StreamKey is not null) station.StreamKey = TrimOrNull(dto.StreamKey);
        if (dto.AllowChat.HasValue) station.AllowChat = dto.AllowChat.Value;
        if (dto.AllowRequests.HasValue) station.AllowRequests = dto.AllowRequests.Value;
        if (dto.AllowShoutouts.HasValue) station.AllowShoutouts = dto.AllowShoutouts.Value;
        if (!string.IsNullOrWhiteSpace(dto.Visibility)) station.Visibility = ParseVisibility(dto.Visibility);

        var frequencyChanged = !string.IsNullOrWhiteSpace(dto.Frequency) || !string.IsNullOrWhiteSpace(dto.Band);
        if (frequencyChanged)
        {
            var normalized = await _frequencyIntegrity.NormalizeOrGenerateAvailableAsync(dto.Frequency ?? station.Frequency, dto.Band ?? station.Band, station.CreatorId, station.Id, cancellationToken);
            station.Frequency = normalized.Display;
            station.FrequencyKey = normalized.Key;
            station.Band = normalized.Band;
        }

        if (dto.IsProprietaryFrequency.HasValue)
        {
            station.IsProprietaryFrequency = dto.IsProprietaryFrequency.Value;
        }

        if (station.IsProprietaryFrequency)
        {
            station.FrequencyLockedAt ??= DateTime.UtcNow;
            await _frequencyIntegrity.ClaimProprietaryFrequencyAsync(station.Id, station.CreatorId, station.Frequency, station.Band, station.FrequencyKey, cancellationToken);
        }
        else
        {
            station.FrequencyLockedAt = null;
            await _frequencyIntegrity.ReleaseClaimsAsync(station.Id, cancellationToken);
        }

        station.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        return await ToDtoAsync(station, userId, cancellationToken);
    }

    public async Task<bool> DeleteStationAsync(Guid stationId, Guid userId, CancellationToken cancellationToken = default)
    {
        var station = await _db.Set<CreatorRadioStation>().FirstOrDefaultAsync(x => x.Id == stationId && !x.IsDeleted, cancellationToken);
        if (station is null)
        {
            throw new NotFoundException("Station not found.");
        }

        await EnsureStationWriteAccessAsync(station, userId, cancellationToken);
        station.Status = RadioStationStatus.Archived;
        station.IsDeleted = true;
        station.IsLive = false;
        station.DeletedAt = DateTime.UtcNow;
        station.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        await _frequencyIntegrity.ReleaseClaimsAsync(stationId, cancellationToken);
        return true;
    }

    public async Task<CreatorRadioStationDto> UpdateStationStatusAsync(Guid stationId, RadioStationStatusUpdateDto dto, Guid userId, CancellationToken cancellationToken = default)
    {
        var station = await _db.Set<CreatorRadioStation>()
            .Include(x => x.Creator)
            .FirstOrDefaultAsync(x => x.Id == stationId && !x.IsDeleted, cancellationToken);
        if (station is null)
        {
            throw new NotFoundException("Station not found.");
        }

        await EnsureStationWriteAccessAsync(station, userId, cancellationToken);
        station.Status = ParseStatus(dto.Status);
        station.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        return await ToDtoAsync(station, userId, cancellationToken);
    }

    public async Task<IEnumerable<CreatorRadioStationDto>> GetCreatorStationsAsync(Guid creatorId, Guid userId, CancellationToken cancellationToken = default)
    {
        var isSelfOrAdmin = creatorId == userId || await IsAdminAsync(userId, cancellationToken);
        IQueryable<CreatorRadioStation> query = _db.Set<CreatorRadioStation>()
            .Include(x => x.Creator)
            .Where(x => x.CreatorId == creatorId && !x.IsDeleted);
        if (!isSelfOrAdmin)
        {
            query = query.Where(x => x.Visibility != RadioStationVisibility.Private);
        }

        var stations = await query.OrderByDescending(x => x.CreatedAt).ToListAsync(cancellationToken);
        var result = new List<CreatorRadioStationDto>(stations.Count);
        foreach (var station in stations)
        {
            result.Add(await ToDtoAsync(station, userId, cancellationToken));
        }
        return result;
    }

    public async Task<IEnumerable<CreatorRadioStationDto>> GetPublicStationsAsync(int page, int pageSize, Guid userId, CancellationToken cancellationToken = default)
    {
        var safePage = Math.Max(1, page);
        var safeSize = Math.Clamp(pageSize, 1, 100);
        var stations = await _db.Set<CreatorRadioStation>()
            .AsNoTracking()
            .Include(x => x.Creator)
            .Where(x => !x.IsDeleted && x.Status == RadioStationStatus.Active && x.Visibility == RadioStationVisibility.Public)
            .OrderByDescending(x => x.IsLive)
            .ThenByDescending(x => x.Listeners)
            .ThenByDescending(x => x.CreatedAt)
            .Skip((safePage - 1) * safeSize)
            .Take(safeSize)
            .ToListAsync(cancellationToken);

        var result = new List<CreatorRadioStationDto>(stations.Count);
        foreach (var station in stations)
        {
            result.Add(await ToDtoAsync(station, userId, cancellationToken));
        }
        return result;
    }

    public async Task<IEnumerable<CreatorRadioStationDto>> SearchStationsAsync(string query, string? genre, string? visibility, Guid userId, CancellationToken cancellationToken = default)
    {
        IQueryable<CreatorRadioStation> search = _db.Set<CreatorRadioStation>()
            .AsNoTracking()
            .Include(x => x.Creator)
            .Where(x => !x.IsDeleted && x.Visibility != RadioStationVisibility.Private);

        if (!string.IsNullOrWhiteSpace(query))
        {
            var term = query.Trim().ToLowerInvariant();
            search = search.Where(x => x.Name.ToLower().Contains(term)
                || (x.Description != null && x.Description.ToLower().Contains(term))
                || x.Frequency.ToLower().Contains(term));
        }

        if (!string.IsNullOrWhiteSpace(genre))
        {
            var term = genre.Trim().ToLowerInvariant();
            search = search.Where(x => x.Genre != null && x.Genre.ToLower() == term);
        }

        if (!string.IsNullOrWhiteSpace(visibility) && Enum.TryParse<RadioStationVisibility>(visibility, true, out var parsedVisibility))
        {
            search = search.Where(x => x.Visibility == parsedVisibility);
        }

        var stations = await search
            .OrderByDescending(x => x.IsLive)
            .ThenByDescending(x => x.Listeners)
            .Take(60)
            .ToListAsync(cancellationToken);

        var result = new List<CreatorRadioStationDto>(stations.Count);
        foreach (var station in stations)
        {
            result.Add(await ToDtoAsync(station, userId, cancellationToken));
        }
        return result;
    }

    public async Task StartLiveStreamAsync(Guid stationId, Guid userId, CancellationToken cancellationToken = default)
    {
        var station = await _db.Set<CreatorRadioStation>().FirstOrDefaultAsync(x => x.Id == stationId && !x.IsDeleted, cancellationToken);
        if (station is null)
        {
            throw new NotFoundException("Station not found.");
        }

        await EnsureStationWriteAccessAsync(station, userId, cancellationToken);
        if (string.IsNullOrWhiteSpace(station.StreamKey))
        {
            station.StreamKey = $"wr-{Guid.NewGuid():N}"[..16];
        }

        station.IsLive = true;
        station.Status = RadioStationStatus.Active;
        station.LastLiveAt = DateTime.UtcNow;
        station.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task EndLiveStreamAsync(Guid stationId, Guid userId, CancellationToken cancellationToken = default)
    {
        var station = await _db.Set<CreatorRadioStation>().FirstOrDefaultAsync(x => x.Id == stationId && !x.IsDeleted, cancellationToken);
        if (station is null)
        {
            throw new NotFoundException("Station not found.");
        }

        await EnsureStationWriteAccessAsync(station, userId, cancellationToken);
        station.IsLive = false;
        station.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task<RadioStationScheduleDto> AddScheduleAsync(Guid stationId, CreateRadioStationScheduleDto dto, Guid userId, CancellationToken cancellationToken = default)
    {
        var station = await _db.Set<CreatorRadioStation>().FirstOrDefaultAsync(x => x.Id == stationId && !x.IsDeleted, cancellationToken);
        if (station is null)
        {
            throw new NotFoundException("Station not found.");
        }

        await EnsureStationWriteAccessAsync(station, userId, cancellationToken);
        if (!TimeSpan.TryParse(dto.StartTime, out var start) || !TimeSpan.TryParse(dto.EndTime, out var end) || end <= start)
        {
            throw new BadRequestException("Schedule times are invalid.");
        }

        var schedule = new RadioStationSchedule
        {
            StationId = stationId,
            Title = dto.Title.Trim(),
            Description = TrimOrNull(dto.Description),
            DayOfWeek = Enum.IsDefined(typeof(DayOfWeek), dto.DayOfWeek) ? (DayOfWeek)dto.DayOfWeek : DayOfWeek.Monday,
            StartTime = start,
            EndTime = end,
            Timezone = string.IsNullOrWhiteSpace(dto.Timezone) ? "UTC" : dto.Timezone.Trim(),
            IsRecurring = dto.IsRecurring,
            SpecificDate = dto.SpecificDate,
            HostName = TrimOrNull(dto.HostName),
            Genre = TrimOrNull(dto.Genre),
            IsActive = true
        };

        _db.Set<RadioStationSchedule>().Add(schedule);
        await _db.SaveChangesAsync(cancellationToken);
        return ToScheduleDto(schedule);
    }

    public async Task<IEnumerable<RadioStationScheduleDto>> GetStationSchedulesAsync(Guid stationId, CancellationToken cancellationToken = default)
    {
        var schedules = await _db.Set<RadioStationSchedule>()
            .AsNoTracking()
            .Where(x => x.StationId == stationId && !x.IsDeleted && x.IsActive)
            .OrderBy(x => x.DayOfWeek)
            .ThenBy(x => x.StartTime)
            .ToListAsync(cancellationToken);
        return schedules.Select(ToScheduleDto).ToList();
    }

    public async Task<bool> DeleteScheduleAsync(Guid scheduleId, Guid userId, CancellationToken cancellationToken = default)
    {
        var schedule = await _db.Set<RadioStationSchedule>()
            .Include(x => x.Station)
            .FirstOrDefaultAsync(x => x.Id == scheduleId && !x.IsDeleted, cancellationToken);
        if (schedule is null)
        {
            throw new NotFoundException("Schedule not found.");
        }

        await EnsureStationWriteAccessAsync(schedule.Station, userId, cancellationToken);
        schedule.IsDeleted = true;
        schedule.IsActive = false;
        schedule.DeletedAt = DateTime.UtcNow;
        schedule.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<RadioStationFollowDto> FollowStationAsync(Guid stationId, Guid userId, CancellationToken cancellationToken = default)
    {
        var station = await _db.Set<CreatorRadioStation>()
            .FirstOrDefaultAsync(x => x.Id == stationId && !x.IsDeleted, cancellationToken);
        if (station is null)
        {
            throw new NotFoundException("Station not found.");
        }

        var follow = await _db.Set<RadioStationFollow>()
            .FirstOrDefaultAsync(x => x.StationId == stationId && x.UserId == userId && !x.IsDeleted, cancellationToken);
        if (follow is null)
        {
            follow = new RadioStationFollow
            {
                StationId = stationId,
                UserId = userId,
                FollowedAt = DateTime.UtcNow,
                IsNotified = true
            };
            _db.Set<RadioStationFollow>().Add(follow);
            station.FollowerCount += 1;
            station.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(cancellationToken);
        }

        return new RadioStationFollowDto
        {
            StationId = station.Id,
            StationName = station.Name,
            StationLogo = station.LogoUrl,
            FollowedAt = follow.FollowedAt,
            IsNotified = follow.IsNotified
        };
    }

    public async Task<bool> UnfollowStationAsync(Guid stationId, Guid userId, CancellationToken cancellationToken = default)
    {
        var follow = await _db.Set<RadioStationFollow>()
            .FirstOrDefaultAsync(x => x.StationId == stationId && x.UserId == userId && !x.IsDeleted, cancellationToken);
        if (follow is null)
        {
            return true;
        }

        var station = await _db.Set<CreatorRadioStation>().FirstOrDefaultAsync(x => x.Id == stationId && !x.IsDeleted, cancellationToken);
        follow.IsDeleted = true;
        follow.DeletedAt = DateTime.UtcNow;
        follow.UpdatedAt = DateTime.UtcNow;

        if (station is not null)
        {
            station.FollowerCount = Math.Max(0, station.FollowerCount - 1);
            station.UpdatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<RadioStationRequestDto> CreateRequestAsync(Guid stationId, CreateRadioStationRequestDto dto, Guid userId, CancellationToken cancellationToken = default)
    {
        var station = await _db.Set<CreatorRadioStation>().FirstOrDefaultAsync(x => x.Id == stationId && !x.IsDeleted, cancellationToken);
        if (station is null)
        {
            throw new NotFoundException("Station not found.");
        }
        if (!station.AllowRequests)
        {
            throw new BadRequestException("Song requests are disabled for this station.");
        }

        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == userId && !x.IsDeleted, cancellationToken)
            ?? throw new NotFoundException("User not found.");

        var request = new RadioStationRequest
        {
            StationId = stationId,
            UserId = userId,
            SongTitle = dto.SongTitle.Trim(),
            ArtistName = TrimOrNull(dto.ArtistName),
            Message = TrimOrNull(dto.Message),
            Status = RequestStatus.Pending,
            RequestedAt = DateTime.UtcNow
        };

        _db.Set<RadioStationRequest>().Add(request);
        await _db.SaveChangesAsync(cancellationToken);

        return new RadioStationRequestDto
        {
            Id = request.Id,
            SongTitle = request.SongTitle,
            ArtistName = request.ArtistName,
            Message = request.Message,
            Status = request.Status.ToString(),
            RequestedAt = request.RequestedAt,
            PlayedAt = request.PlayedAt,
            Requester = new SimpleRequesterDto
            {
                Id = user.Id,
                Username = user.Username,
                DisplayName = user.DisplayName,
                AvatarUrl = user.AvatarUrl
            }
        };
    }

    public async Task<RadioStationShoutoutDto> CreateShoutoutAsync(Guid stationId, CreateRadioStationShoutoutDto dto, Guid userId, CancellationToken cancellationToken = default)
    {
        var station = await _db.Set<CreatorRadioStation>().FirstOrDefaultAsync(x => x.Id == stationId && !x.IsDeleted, cancellationToken);
        if (station is null)
        {
            throw new NotFoundException("Station not found.");
        }
        if (!station.AllowShoutouts)
        {
            throw new BadRequestException("Shoutouts are disabled for this station.");
        }

        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == userId && !x.IsDeleted, cancellationToken)
            ?? throw new NotFoundException("User not found.");

        var shoutout = new RadioStationShoutout
        {
            StationId = stationId,
            UserId = userId,
            Message = dto.Message.Trim(),
            Status = ShoutoutStatus.Pending,
            RequestedAt = DateTime.UtcNow
        };

        _db.Set<RadioStationShoutout>().Add(shoutout);
        await _db.SaveChangesAsync(cancellationToken);

        return new RadioStationShoutoutDto
        {
            Id = shoutout.Id,
            Message = shoutout.Message,
            Status = shoutout.Status.ToString(),
            RequestedAt = shoutout.RequestedAt,
            User = new SimpleRequesterDto
            {
                Id = user.Id,
                Username = user.Username,
                DisplayName = user.DisplayName,
                AvatarUrl = user.AvatarUrl
            }
        };
    }

    public async Task<RadioStationAnalyticsDto> GetStationAnalyticsAsync(Guid stationId, Guid userId, CancellationToken cancellationToken = default)
    {
        var station = await _db.Set<CreatorRadioStation>()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == stationId && !x.IsDeleted, cancellationToken);
        if (station is null)
        {
            throw new NotFoundException("Station not found.");
        }

        if (station.CreatorId != userId && !await IsAdminAsync(userId, cancellationToken))
        {
            throw new UnauthorizedException("You don't have permission to view station analytics.");
        }

        var listens = await _db.Set<RadioStationListen>()
            .AsNoTracking()
            .Where(x => x.StationId == stationId && !x.IsDeleted)
            .ToListAsync(cancellationToken);
        var totalDuration = listens.Sum(x => Math.Max(0, x.Duration));
        var totalRequests = await _db.Set<RadioStationRequest>().AsNoTracking()
            .CountAsync(x => x.StationId == stationId && !x.IsDeleted, cancellationToken);
        var totalShoutouts = await _db.Set<RadioStationShoutout>().AsNoTracking()
            .CountAsync(x => x.StationId == stationId && !x.IsDeleted, cancellationToken);

        return new RadioStationAnalyticsDto
        {
            StationId = station.Id,
            StationName = station.Name,
            TotalListeners = station.TotalListeners,
            PeakListeners = station.PeakListeners,
            AverageListeners = listens.Count == 0 ? station.Listeners : (int)Math.Round(listens.Average(x => Math.Max(0, x.Duration)) / 60.0),
            TotalListeningHours = (int)Math.Round(totalDuration / 3600d),
            FollowerCount = station.FollowerCount,
            TotalRequests = totalRequests,
            TotalShoutouts = totalShoutouts
        };
    }

    private async Task<CreatorRadioStationDto> ToDtoAsync(CreatorRadioStation station, Guid userId, CancellationToken cancellationToken)
    {
        var creator = station.Creator;
        if (creator is null)
        {
            creator = await _db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == station.CreatorId, cancellationToken)
                ?? new User { Id = station.CreatorId, Username = "creator", DisplayName = "Creator" };
        }

        var isFollowing = userId != Guid.Empty
            && await _db.Set<RadioStationFollow>().AsNoTracking()
                .AnyAsync(x => x.StationId == station.Id && x.UserId == userId && !x.IsDeleted, cancellationToken);

        var schedules = await _db.Set<RadioStationSchedule>().AsNoTracking()
            .Where(x => x.StationId == station.Id && !x.IsDeleted && x.IsActive)
            .OrderBy(x => x.DayOfWeek).ThenBy(x => x.StartTime)
            .ToListAsync(cancellationToken);
        var episodes = await _db.Set<RadioStationEpisode>().AsNoTracking()
            .Where(x => x.StationId == station.Id && !x.IsDeleted && x.IsPublished)
            .OrderByDescending(x => x.BroadcastDate)
            .Take(25)
            .ToListAsync(cancellationToken);

        return new CreatorRadioStationDto
        {
            Id = station.Id,
            Name = station.Name,
            Description = station.Description,
            Frequency = station.Frequency,
            Band = station.Band,
            Genre = station.Genre,
            SubGenre = station.SubGenre,
            LogoUrl = station.LogoUrl,
            CoverImageUrl = station.CoverImageUrl,
            StreamUrl = station.StreamUrl,
            Website = station.Website,
            SocialLinks = station.SocialLinks,
            CreatorId = station.CreatorId,
            CreatorName = string.IsNullOrWhiteSpace(creator.DisplayName) ? creator.Username : creator.DisplayName,
            CreatorAvatar = creator.AvatarUrl,
            Status = station.Status.ToString(),
            Visibility = station.Visibility.ToString(),
            IsLive = station.IsLive,
            LastLiveAt = station.LastLiveAt,
            ScheduledLiveAt = station.ScheduledLiveAt,
            ScheduledEndAt = station.ScheduledEndAt,
            Listeners = station.Listeners,
            TotalListeners = station.TotalListeners,
            PeakListeners = station.PeakListeners,
            FollowerCount = station.FollowerCount,
            AllowChat = station.AllowChat,
            AllowRequests = station.AllowRequests,
            AllowShoutouts = station.AllowShoutouts,
            IsFollowing = isFollowing,
            IsProprietaryFrequency = station.IsProprietaryFrequency,
            FrequencyLockedAt = station.FrequencyLockedAt,
            CreatedAt = station.CreatedAt,
            IsMonetized = station.IsMonetized,
            SubscriptionPrice = station.SubscriptionPrice,
            AllowDonations = station.AllowDonations,
            DonationLink = station.DonationLink,
            BrandColor = ReadSettingsString(station.Settings, "brandColor"),
            ContentRating = ReadSettingsString(station.Settings, "contentRating") ?? "General",
            TargetLanguage = ReadSettingsString(station.Settings, "targetLanguage"),
            TargetRegion = ReadSettingsString(station.Settings, "targetRegion"),
            Schedule = schedules.Select(ToScheduleDto).ToList(),
            Episodes = episodes.Select(e => new RadioStationEpisodeDto
            {
                Id = e.Id,
                Title = e.Title,
                Description = e.Description,
                AudioUrl = e.AudioUrl,
                Duration = e.Duration,
                BroadcastDate = e.BroadcastDate,
                ListenCount = e.ListenCount,
                LikeCount = e.LikeCount,
                CommentCount = e.CommentCount,
                ShareCount = e.ShareCount,
                IsLiveRecording = e.IsLiveRecording,
                IsPublished = e.IsPublished
            }).ToList()
        };
    }

    private static RadioStationScheduleDto ToScheduleDto(RadioStationSchedule schedule) =>
        new()
        {
            Id = schedule.Id,
            Title = schedule.Title,
            Description = schedule.Description,
            DayOfWeek = (int)schedule.DayOfWeek,
            StartTime = schedule.StartTime.ToString("hh\\:mm"),
            EndTime = schedule.EndTime.ToString("hh\\:mm"),
            Timezone = schedule.Timezone,
            IsRecurring = schedule.IsRecurring,
            SpecificDate = schedule.SpecificDate,
            HostName = schedule.HostName,
            Genre = schedule.Genre,
            IsActive = schedule.IsActive
        };

    private static string? TrimOrNull(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static System.Text.Json.JsonDocument BuildSettingsJson(CreateCreatorRadioStationDto dto)
    {
        var obj = new
        {
            brandColor       = dto.BrandColor,
            contentRating    = dto.ContentRating,
            targetLanguage   = dto.TargetLanguage,
            targetRegion     = dto.TargetRegion,
            bitrate          = dto.Bitrate,
            streamFormat     = dto.StreamFormat,
            tagline          = dto.Tagline,
            licenseNumber    = dto.LicenseNumber,
            licenseType      = dto.LicenseType,
            licenseAuthority = dto.LicenseIssuingAuthority,
            licenseDocUrl    = dto.LicenseDocumentUrl,
            licenseIssuedAt  = dto.LicenseIssuedAt,
            licenseExpiresAt = dto.LicenseExpiresAt,
            licenseCoversMusic  = dto.LicenseCoversMusicBroadcast,
            licenseCoversTalk   = dto.LicenseCoversTalkContent,
            licenseCoversLive   = dto.LicenseCoversLiveShows,
            licensePROs         = dto.LicensePROs
        };
        return System.Text.Json.JsonDocument.Parse(System.Text.Json.JsonSerializer.Serialize(obj));
    }

    private static string? ReadSettingsString(System.Text.Json.JsonDocument? doc, string key)
    {
        if (doc is null) return null;
        try
        {
            if (doc.RootElement.TryGetProperty(key, out var el) && el.ValueKind == System.Text.Json.JsonValueKind.String)
                return el.GetString();
        }
        catch { }
        return null;
    }

    private static RadioStationVisibility ParseVisibility(string? value)
    {
        if (Enum.TryParse<RadioStationVisibility>(value, true, out var parsed))
        {
            return parsed;
        }

        return RadioStationVisibility.Public;
    }

    private static RadioStationStatus ParseStatus(string value)
    {
        if (Enum.TryParse<RadioStationStatus>(value, true, out var status))
        {
            return status;
        }

        throw new BadRequestException("Invalid station status.");
    }

    private async Task EnsureStationWriteAccessAsync(CreatorRadioStation station, Guid userId, CancellationToken cancellationToken)
    {
        if (station.CreatorId != userId && !await IsAdminAsync(userId, cancellationToken))
        {
            throw new UnauthorizedException("You don't have permission to modify this station.");
        }
    }

    private async Task<bool> IsAdminAsync(Guid userId, CancellationToken cancellationToken)
    {
        if (userId == Guid.Empty)
        {
            return false;
        }

        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == userId && !x.IsDeleted, cancellationToken);
        return user?.Role is UserRole.Admin or UserRole.Moderator;
    }
}
