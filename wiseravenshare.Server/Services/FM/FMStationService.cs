using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Wiseravenshare.Server.DTOs.FM;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Entities.FM;
using Wiseravenshare.Server.Exceptions;
using Wiseravenshare.Server.Infrastructure.Data;

namespace Wiseravenshare.Server.Services.FM;

public interface IFMStationService
{
    Task<FMStationDto> CreateStationAsync(CreateFMStationDto dto, Guid userId, CancellationToken cancellationToken = default);
    Task<FMStationDto> GetStationAsync(Guid stationId, Guid userId, CancellationToken cancellationToken = default);
    Task<FMStationDto> UpdateStationAsync(Guid stationId, UpdateFMStationDto dto, Guid userId, CancellationToken cancellationToken = default);
    Task<bool> DeleteStationAsync(Guid stationId, Guid userId, CancellationToken cancellationToken = default);
    Task<IEnumerable<FMStationDto>> SearchStationsAsync(FMStationSearchDto searchDto, Guid userId, CancellationToken cancellationToken = default);
    Task<IEnumerable<FMStationDto>> GetFeaturedStationsAsync(int count, Guid userId, CancellationToken cancellationToken = default);
    Task<IEnumerable<FMStationDto>> GetRecommendedStationsAsync(Guid userId, int count, CancellationToken cancellationToken = default);
    Task<IEnumerable<FMStationDto>> GetPopularStationsAsync(int count, Guid userId, CancellationToken cancellationToken = default);
    Task<FMStationPlaybackDto> GetPlaybackInfoAsync(Guid stationId, CancellationToken cancellationToken = default);
    Task<FMStationDto> LikeStationAsync(Guid stationId, Guid userId, CancellationToken cancellationToken = default);
    Task<bool> UnlikeStationAsync(Guid stationId, Guid userId, CancellationToken cancellationToken = default);
    Task<FMStationDto> BookmarkStationAsync(Guid stationId, Guid userId, CancellationToken cancellationToken = default);
    Task<bool> UnbookmarkStationAsync(Guid stationId, Guid userId, CancellationToken cancellationToken = default);
    Task<IEnumerable<FMStationDto>> GetUserLikedStationsAsync(Guid userId, CancellationToken cancellationToken = default);
    Task<IEnumerable<FMStationDto>> GetUserBookmarkedStationsAsync(Guid userId, CancellationToken cancellationToken = default);
    Task<IEnumerable<FMStationDto>> GetListeningHistoryAsync(Guid userId, int limit = 50, CancellationToken cancellationToken = default);
    Task<FMNowPlayingDto> GetNowPlayingAsync(Guid stationId, CancellationToken cancellationToken = default);
    Task TrackListeningAsync(Guid stationId, Guid userId, int duration, CancellationToken cancellationToken = default);
    Task<FMUserPreferenceDto> GetUserPreferencesAsync(Guid userId, CancellationToken cancellationToken = default);
    Task UpdateUserPreferencesAsync(Guid userId, FMUserPreferenceDto preferences, CancellationToken cancellationToken = default);
}

public sealed class FMStationService : IFMStationService
{
    private readonly AppDbContext _db;
    private readonly ILogger<FMStationService> _logger;
    private readonly IMemoryCache _cache;
    private readonly IFrequencyIntegrityService _frequencyIntegrity;

    private const string StationCacheKeyFormat = "fm_station_{0}";
    private const string FeaturedCacheKeyFormat = "fm_featured_{0}_{1}";
    private const string PopularCacheKeyFormat = "fm_popular_{0}_{1}";

    public FMStationService(AppDbContext db, ILogger<FMStationService> logger, IMemoryCache cache, IFrequencyIntegrityService frequencyIntegrity)
    {
        _db = db;
        _logger = logger;
        _cache = cache;
        _frequencyIntegrity = frequencyIntegrity;
    }

    public async Task<FMStationDto> CreateStationAsync(CreateFMStationDto dto, Guid userId, CancellationToken cancellationToken = default)
    {
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId && !u.IsDeleted, cancellationToken);
        if (user is null)
        {
            throw new NotFoundException("User not found.");
        }

        var normalizedFrequency = await _frequencyIntegrity.NormalizeOrGenerateAvailableAsync(dto.Frequency, dto.Band, userId, null, cancellationToken);
        await _frequencyIntegrity.EnsureFrequencyAvailableAsync(normalizedFrequency.Key, normalizedFrequency.Band, userId, null, cancellationToken);

        var station = new FMStation
        {
            Name = dto.Name.Trim(),
            Description = TrimOrNull(dto.Description),
            Frequency = normalizedFrequency.Display,
            FrequencyKey = normalizedFrequency.Key,
            Band = normalizedFrequency.Band,
            City = TrimOrNull(dto.City),
            Country = TrimOrNull(dto.Country),
            State = TrimOrNull(dto.State),
            Latitude = dto.Latitude,
            Longitude = dto.Longitude,
            StreamUrl = dto.StreamUrl.Trim(),
            Website = TrimOrNull(dto.Website),
            LogoUrl = TrimOrNull(dto.LogoUrl),
            CoverImageUrl = TrimOrNull(dto.CoverImageUrl),
            Genre = string.IsNullOrWhiteSpace(dto.Genre) ? "General" : dto.Genre.Trim(),
            Language = string.IsNullOrWhiteSpace(dto.Language) ? "English" : dto.Language.Trim(),
            Bitrate = dto.Bitrate <= 0 ? 128 : dto.Bitrate,
            Codec = TrimOrNull(dto.Codec),
            IsFeatured = dto.IsFeatured,
            IsActive = true,
            CreatedBy = userId
        };

        _db.FMStations.Add(station);
        await _db.SaveChangesAsync(cancellationToken);

        InvalidateStationCaches(station.Id);
        _logger.LogInformation("FM station created: {Station} ({Frequency} {Band}) by {UserId}", station.Name, station.Frequency, station.Band, userId);

        return await ToStationDtoAsync(station, userId, cancellationToken);
    }

    public async Task<FMStationDto> GetStationAsync(Guid stationId, Guid userId, CancellationToken cancellationToken = default)
    {
        var cacheKey = string.Format(StationCacheKeyFormat, stationId);
        if (_cache.TryGetValue(cacheKey, out FMStationDto? cached) && cached is not null && userId == Guid.Empty)
        {
            return cached;
        }

        var station = await _db.FMStations.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == stationId && x.IsActive && !x.IsDeleted, cancellationToken);
        if (station is null)
        {
            throw new NotFoundException("Station not found.");
        }

        var dto = await ToStationDtoAsync(station, userId, cancellationToken);
        if (userId == Guid.Empty)
        {
            _cache.Set(cacheKey, dto, TimeSpan.FromMinutes(15));
        }

        return dto;
    }

    public async Task<FMStationDto> UpdateStationAsync(Guid stationId, UpdateFMStationDto dto, Guid userId, CancellationToken cancellationToken = default)
    {
        var station = await _db.FMStations.FirstOrDefaultAsync(x => x.Id == stationId && !x.IsDeleted, cancellationToken);
        if (station is null)
        {
            throw new NotFoundException("Station not found.");
        }

        if (station.CreatedBy != userId && !await IsAdminAsync(userId, cancellationToken))
        {
            throw new UnauthorizedException("You don't have permission to update this station.");
        }

        if (!string.IsNullOrWhiteSpace(dto.Name)) station.Name = dto.Name.Trim();
        if (!string.IsNullOrWhiteSpace(dto.Description)) station.Description = dto.Description.Trim();
        if (!string.IsNullOrWhiteSpace(dto.Frequency) || !string.IsNullOrWhiteSpace(dto.Band))
        {
            var normalized = await _frequencyIntegrity.NormalizeOrGenerateAvailableAsync(dto.Frequency ?? station.Frequency, dto.Band ?? station.Band, userId, station.Id, cancellationToken);
            await _frequencyIntegrity.EnsureFrequencyAvailableAsync(normalized.Key, normalized.Band, userId, station.Id, cancellationToken);
            station.Frequency = normalized.Display;
            station.FrequencyKey = normalized.Key;
            station.Band = normalized.Band;
        }
        if (!string.IsNullOrWhiteSpace(dto.City)) station.City = dto.City.Trim();
        if (!string.IsNullOrWhiteSpace(dto.Country)) station.Country = dto.Country.Trim();
        if (!string.IsNullOrWhiteSpace(dto.State)) station.State = dto.State.Trim();
        if (dto.Latitude.HasValue) station.Latitude = dto.Latitude.Value;
        if (dto.Longitude.HasValue) station.Longitude = dto.Longitude.Value;
        if (!string.IsNullOrWhiteSpace(dto.StreamUrl)) station.StreamUrl = dto.StreamUrl.Trim();
        if (!string.IsNullOrWhiteSpace(dto.Website)) station.Website = dto.Website.Trim();
        if (!string.IsNullOrWhiteSpace(dto.LogoUrl)) station.LogoUrl = dto.LogoUrl.Trim();
        if (!string.IsNullOrWhiteSpace(dto.CoverImageUrl)) station.CoverImageUrl = dto.CoverImageUrl.Trim();
        if (!string.IsNullOrWhiteSpace(dto.Genre)) station.Genre = dto.Genre.Trim();
        if (!string.IsNullOrWhiteSpace(dto.Language)) station.Language = dto.Language.Trim();
        if (dto.Bitrate.HasValue) station.Bitrate = Math.Max(16, dto.Bitrate.Value);
        if (!string.IsNullOrWhiteSpace(dto.Codec)) station.Codec = dto.Codec.Trim();
        if (dto.IsActive.HasValue) station.IsActive = dto.IsActive.Value;
        if (dto.IsFeatured.HasValue) station.IsFeatured = dto.IsFeatured.Value;
        station.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(cancellationToken);
        InvalidateStationCaches(station.Id);
        return await ToStationDtoAsync(station, userId, cancellationToken);
    }

    public async Task<bool> DeleteStationAsync(Guid stationId, Guid userId, CancellationToken cancellationToken = default)
    {
        var station = await _db.FMStations.FirstOrDefaultAsync(x => x.Id == stationId && !x.IsDeleted, cancellationToken);
        if (station is null)
        {
            throw new NotFoundException("Station not found.");
        }

        if (station.CreatedBy != userId && !await IsAdminAsync(userId, cancellationToken))
        {
            throw new UnauthorizedException("You don't have permission to delete this station.");
        }

        station.IsActive = false;
        station.IsDeleted = true;
        station.DeletedAt = DateTime.UtcNow;
        station.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        InvalidateStationCaches(stationId);
        return true;
    }

    public async Task<IEnumerable<FMStationDto>> SearchStationsAsync(FMStationSearchDto searchDto, Guid userId, CancellationToken cancellationToken = default)
    {
        var page = Math.Max(1, searchDto.Page);
        var pageSize = Math.Clamp(searchDto.PageSize, 1, 100);

        IQueryable<FMStation> query = _db.FMStations.AsNoTracking()
            .Where(x => !x.IsDeleted);

        if (searchDto.IsActive.HasValue)
        {
            query = query.Where(x => x.IsActive == searchDto.IsActive.Value);
        }
        else
        {
            query = query.Where(x => x.IsActive);
        }

        if (!string.IsNullOrWhiteSpace(searchDto.Query))
        {
            var term = searchDto.Query.Trim().ToLower();
            query = query.Where(x =>
                x.Name.ToLower().Contains(term)
                || (x.Description != null && x.Description.ToLower().Contains(term))
                || (x.City != null && x.City.ToLower().Contains(term))
                || (x.Country != null && x.Country.ToLower().Contains(term))
                || x.Frequency.ToLower().Contains(term));
        }

        if (!string.IsNullOrWhiteSpace(searchDto.Genre)) query = query.Where(x => x.Genre == searchDto.Genre);
        if (!string.IsNullOrWhiteSpace(searchDto.Language)) query = query.Where(x => x.Language == searchDto.Language);
        if (!string.IsNullOrWhiteSpace(searchDto.City)) query = query.Where(x => x.City == searchDto.City);
        if (!string.IsNullOrWhiteSpace(searchDto.Country)) query = query.Where(x => x.Country == searchDto.Country);
        if (!string.IsNullOrWhiteSpace(searchDto.Band)) query = query.Where(x => x.Band == searchDto.Band);
        if (searchDto.IsFeatured.HasValue) query = query.Where(x => x.IsFeatured == searchDto.IsFeatured.Value);

        query = ApplySort(query, searchDto.SortBy, searchDto.SortOrder);
        var items = await query.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(cancellationToken);

        var result = new List<FMStationDto>(items.Count);
        foreach (var station in items)
        {
            result.Add(await ToStationDtoAsync(station, userId, cancellationToken));
        }

        return result;
    }

    public async Task<IEnumerable<FMStationDto>> GetFeaturedStationsAsync(int count, Guid userId, CancellationToken cancellationToken = default)
    {
        var safeCount = Math.Clamp(count, 1, 100);
        var cacheKey = string.Format(FeaturedCacheKeyFormat, safeCount, userId == Guid.Empty ? "anon" : "auth");
        if (_cache.TryGetValue(cacheKey, out List<FMStationDto>? cached) && cached is not null)
        {
            return cached;
        }

        var stations = await _db.FMStations.AsNoTracking()
            .Where(x => !x.IsDeleted && x.IsActive && x.IsFeatured)
            .OrderByDescending(x => x.Listeners)
            .ThenBy(x => x.Name)
            .Take(safeCount)
            .ToListAsync(cancellationToken);

        var dtos = new List<FMStationDto>(stations.Count);
        foreach (var station in stations)
        {
            dtos.Add(await ToStationDtoAsync(station, userId, cancellationToken));
        }

        _cache.Set(cacheKey, dtos, TimeSpan.FromMinutes(30));
        return dtos;
    }

    public async Task<IEnumerable<FMStationDto>> GetRecommendedStationsAsync(Guid userId, int count, CancellationToken cancellationToken = default)
    {
        if (userId == Guid.Empty)
        {
            return await GetPopularStationsAsync(count, Guid.Empty, cancellationToken);
        }

        var safeCount = Math.Clamp(count, 1, 100);
        var preference = await _db.FMUserPreferences.AsNoTracking()
            .FirstOrDefaultAsync(x => x.UserId == userId && !x.IsDeleted, cancellationToken);

        var genres = preference?.FavoriteGenres?.Where(x => !string.IsNullOrWhiteSpace(x)).Select(x => x.Trim()).Distinct().ToArray() ?? Array.Empty<string>();
        if (genres.Length == 0)
        {
            return await GetPopularStationsAsync(safeCount, userId, cancellationToken);
        }

        var stations = await _db.FMStations.AsNoTracking()
            .Where(x => !x.IsDeleted && x.IsActive && genres.Contains(x.Genre))
            .OrderByDescending(x => x.Listeners)
            .Take(safeCount)
            .ToListAsync(cancellationToken);

        var result = new List<FMStationDto>(stations.Count);
        foreach (var station in stations)
        {
            result.Add(await ToStationDtoAsync(station, userId, cancellationToken));
        }

        return result;
    }

    public async Task<IEnumerable<FMStationDto>> GetPopularStationsAsync(int count, Guid userId, CancellationToken cancellationToken = default)
    {
        var safeCount = Math.Clamp(count, 1, 100);
        var cacheKey = string.Format(PopularCacheKeyFormat, safeCount, userId == Guid.Empty ? "anon" : "auth");
        if (_cache.TryGetValue(cacheKey, out List<FMStationDto>? cached) && cached is not null)
        {
            return cached;
        }

        var stations = await _db.FMStations.AsNoTracking()
            .Where(x => !x.IsDeleted && x.IsActive)
            .OrderByDescending(x => x.Listeners)
            .ThenBy(x => x.Name)
            .Take(safeCount)
            .ToListAsync(cancellationToken);

        var dtos = new List<FMStationDto>(stations.Count);
        foreach (var station in stations)
        {
            dtos.Add(await ToStationDtoAsync(station, userId, cancellationToken));
        }

        _cache.Set(cacheKey, dtos, TimeSpan.FromMinutes(15));
        return dtos;
    }

    public async Task<FMStationPlaybackDto> GetPlaybackInfoAsync(Guid stationId, CancellationToken cancellationToken = default)
    {
        var station = await _db.FMStations.FirstOrDefaultAsync(x => x.Id == stationId && x.IsActive && !x.IsDeleted, cancellationToken);
        if (station is null)
        {
            throw new NotFoundException("Station not found.");
        }

        station.Listeners = Math.Max(0, station.Listeners + 1);
        station.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        InvalidateStationCaches(stationId);
        return new FMStationPlaybackDto
        {
            StationId = station.Id,
            StreamUrl = station.StreamUrl,
            StationName = station.Name,
            LogoUrl = station.LogoUrl,
            Genre = station.Genre,
            Listeners = station.Listeners,
            Bitrate = station.Bitrate,
            Codec = station.Codec
        };
    }

    public async Task<FMStationDto> LikeStationAsync(Guid stationId, Guid userId, CancellationToken cancellationToken = default)
    {
        if (userId == Guid.Empty)
        {
            throw new UnauthorizedException("Authentication required.");
        }

        var station = await _db.FMStations.FirstOrDefaultAsync(x => x.Id == stationId && x.IsActive && !x.IsDeleted, cancellationToken);
        if (station is null)
        {
            throw new NotFoundException("Station not found.");
        }

        var existing = await _db.FMStationLikes.FirstOrDefaultAsync(x => x.StationId == stationId && x.UserId == userId, cancellationToken);
        if (existing is null)
        {
            _db.FMStationLikes.Add(new FMStationLike { StationId = stationId, UserId = userId });
            await _db.SaveChangesAsync(cancellationToken);
            InvalidateStationCaches(stationId);
        }

        var dto = await ToStationDtoAsync(station, userId, cancellationToken);
        dto.IsLiked = true;
        return dto;
    }

    public async Task<bool> UnlikeStationAsync(Guid stationId, Guid userId, CancellationToken cancellationToken = default)
    {
        if (userId == Guid.Empty)
        {
            throw new UnauthorizedException("Authentication required.");
        }

        var like = await _db.FMStationLikes.FirstOrDefaultAsync(x => x.StationId == stationId && x.UserId == userId, cancellationToken);
        if (like is not null)
        {
            _db.FMStationLikes.Remove(like);
            await _db.SaveChangesAsync(cancellationToken);
            InvalidateStationCaches(stationId);
        }

        return true;
    }

    public async Task<FMStationDto> BookmarkStationAsync(Guid stationId, Guid userId, CancellationToken cancellationToken = default)
    {
        if (userId == Guid.Empty)
        {
            throw new UnauthorizedException("Authentication required.");
        }

        var station = await _db.FMStations.FirstOrDefaultAsync(x => x.Id == stationId && x.IsActive && !x.IsDeleted, cancellationToken);
        if (station is null)
        {
            throw new NotFoundException("Station not found.");
        }

        var existing = await _db.FMStationBookmarks.FirstOrDefaultAsync(x => x.StationId == stationId && x.UserId == userId, cancellationToken);
        if (existing is null)
        {
            _db.FMStationBookmarks.Add(new FMStationBookmark { StationId = stationId, UserId = userId });
            await _db.SaveChangesAsync(cancellationToken);
            InvalidateStationCaches(stationId);
        }

        var dto = await ToStationDtoAsync(station, userId, cancellationToken);
        dto.IsBookmarked = true;
        return dto;
    }

    public async Task<bool> UnbookmarkStationAsync(Guid stationId, Guid userId, CancellationToken cancellationToken = default)
    {
        if (userId == Guid.Empty)
        {
            throw new UnauthorizedException("Authentication required.");
        }

        var bookmark = await _db.FMStationBookmarks.FirstOrDefaultAsync(x => x.StationId == stationId && x.UserId == userId, cancellationToken);
        if (bookmark is not null)
        {
            _db.FMStationBookmarks.Remove(bookmark);
            await _db.SaveChangesAsync(cancellationToken);
            InvalidateStationCaches(stationId);
        }

        return true;
    }

    public async Task<IEnumerable<FMStationDto>> GetUserLikedStationsAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        if (userId == Guid.Empty)
        {
            return Array.Empty<FMStationDto>();
        }

        var stations = await _db.FMStationLikes.AsNoTracking()
            .Where(x => x.UserId == userId && !x.Station.IsDeleted && x.Station.IsActive)
            .OrderByDescending(x => x.CreatedAt)
            .Select(x => x.Station)
            .ToListAsync(cancellationToken);

        var dtos = new List<FMStationDto>(stations.Count);
        foreach (var station in stations)
        {
            var dto = await ToStationDtoAsync(station, userId, cancellationToken);
            dto.IsLiked = true;
            dtos.Add(dto);
        }

        return dtos;
    }

    public async Task<IEnumerable<FMStationDto>> GetUserBookmarkedStationsAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        if (userId == Guid.Empty)
        {
            return Array.Empty<FMStationDto>();
        }

        var stations = await _db.FMStationBookmarks.AsNoTracking()
            .Where(x => x.UserId == userId && !x.Station.IsDeleted && x.Station.IsActive)
            .OrderByDescending(x => x.CreatedAt)
            .Select(x => x.Station)
            .ToListAsync(cancellationToken);

        var dtos = new List<FMStationDto>(stations.Count);
        foreach (var station in stations)
        {
            var dto = await ToStationDtoAsync(station, userId, cancellationToken);
            dto.IsBookmarked = true;
            dtos.Add(dto);
        }

        return dtos;
    }

    public async Task<IEnumerable<FMStationDto>> GetListeningHistoryAsync(Guid userId, int limit = 50, CancellationToken cancellationToken = default)
    {
        if (userId == Guid.Empty)
        {
            return Array.Empty<FMStationDto>();
        }

        var safeLimit = Math.Clamp(limit, 1, 200);
        var stationIds = await _db.FMStationHistories.AsNoTracking()
            .Where(x => x.UserId == userId && !x.Station.IsDeleted && x.Station.IsActive)
            .OrderByDescending(x => x.ListenedAt)
            .Select(x => x.StationId)
            .Take(safeLimit)
            .ToListAsync(cancellationToken);

        var uniqueIds = stationIds.Distinct().ToArray();
        if (uniqueIds.Length == 0)
        {
            return Array.Empty<FMStationDto>();
        }

        var stations = await _db.FMStations.AsNoTracking()
            .Where(x => uniqueIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, cancellationToken);

        var results = new List<FMStationDto>();
        foreach (var id in stationIds)
        {
            if (stations.TryGetValue(id, out var station))
            {
                results.Add(await ToStationDtoAsync(station, userId, cancellationToken));
            }
        }

        return results;
    }

    public Task<FMNowPlayingDto> GetNowPlayingAsync(Guid stationId, CancellationToken cancellationToken = default)
    {
        return Task.FromResult(new FMNowPlayingDto
        {
            StationId = stationId,
            StationName = "Live Broadcast",
            SongTitle = "Now Playing",
            ArtistName = "Unknown Artist",
            StartedAt = DateTime.UtcNow,
            Duration = 180
        });
    }

    public async Task TrackListeningAsync(Guid stationId, Guid userId, int duration, CancellationToken cancellationToken = default)
    {
        if (userId == Guid.Empty)
        {
            return;
        }

        var stationExists = await _db.FMStations.AsNoTracking()
            .AnyAsync(x => x.Id == stationId && x.IsActive && !x.IsDeleted, cancellationToken);
        if (!stationExists)
        {
            return;
        }

        _db.FMStationHistories.Add(new FMStationHistory
        {
            StationId = stationId,
            UserId = userId,
            ListenedAt = DateTime.UtcNow,
            Duration = Math.Max(0, duration)
        });

        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task<FMUserPreferenceDto> GetUserPreferencesAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        if (userId == Guid.Empty)
        {
            return new FMUserPreferenceDto();
        }

        var pref = await _db.FMUserPreferences.FirstOrDefaultAsync(x => x.UserId == userId && !x.IsDeleted, cancellationToken);
        if (pref is null)
        {
            pref = new FMUserPreference
            {
                UserId = userId,
                Volume = 80,
                AutoPlay = false,
                ShowLyrics = false,
                ShowAlbumArt = true,
                LowQualityMode = false
            };
            _db.FMUserPreferences.Add(pref);
            await _db.SaveChangesAsync(cancellationToken);
        }

        return new FMUserPreferenceDto
        {
            FavoriteGenres = pref.FavoriteGenres,
            FavoriteLanguages = pref.FavoriteLanguages,
            Volume = pref.Volume,
            AutoPlay = pref.AutoPlay,
            ShowLyrics = pref.ShowLyrics,
            ShowAlbumArt = pref.ShowAlbumArt,
            LowQualityMode = pref.LowQualityMode
        };
    }

    public async Task UpdateUserPreferencesAsync(Guid userId, FMUserPreferenceDto preferences, CancellationToken cancellationToken = default)
    {
        if (userId == Guid.Empty)
        {
            throw new UnauthorizedException("Authentication required.");
        }

        var pref = await _db.FMUserPreferences.FirstOrDefaultAsync(x => x.UserId == userId && !x.IsDeleted, cancellationToken);
        if (pref is null)
        {
            pref = new FMUserPreference { UserId = userId };
            _db.FMUserPreferences.Add(pref);
        }

        pref.FavoriteGenres = NormalizeArray(preferences.FavoriteGenres);
        pref.FavoriteLanguages = NormalizeArray(preferences.FavoriteLanguages);
        pref.Volume = Math.Clamp(preferences.Volume, 0, 100);
        pref.AutoPlay = preferences.AutoPlay;
        pref.ShowLyrics = preferences.ShowLyrics;
        pref.ShowAlbumArt = preferences.ShowAlbumArt;
        pref.LowQualityMode = preferences.LowQualityMode;
        pref.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(cancellationToken);
    }

    private async Task<FMStationDto> ToStationDtoAsync(FMStation station, Guid userId, CancellationToken cancellationToken)
    {
        var dto = new FMStationDto
        {
            Id = station.Id,
            Name = station.Name,
            Description = station.Description,
            Frequency = station.Frequency,
            Band = station.Band,
            City = station.City,
            Country = station.Country,
            State = station.State,
            Latitude = station.Latitude,
            Longitude = station.Longitude,
            StreamUrl = station.StreamUrl,
            Website = station.Website,
            LogoUrl = station.LogoUrl,
            CoverImageUrl = station.CoverImageUrl,
            Genre = station.Genre,
            Language = station.Language,
            Listeners = station.Listeners,
            IsActive = station.IsActive,
            IsFeatured = station.IsFeatured,
            Bitrate = station.Bitrate,
            Codec = station.Codec,
            CreatedAt = station.CreatedAt
        };

        if (userId != Guid.Empty)
        {
            dto.IsLiked = await _db.FMStationLikes.AsNoTracking()
                .AnyAsync(x => x.StationId == station.Id && x.UserId == userId, cancellationToken);
            dto.IsBookmarked = await _db.FMStationBookmarks.AsNoTracking()
                .AnyAsync(x => x.StationId == station.Id && x.UserId == userId, cancellationToken);
        }

        return dto;
    }

    private static IQueryable<FMStation> ApplySort(IQueryable<FMStation> query, string? sortBy, string? sortOrder)
    {
        var descending = !string.Equals(sortOrder, "asc", StringComparison.OrdinalIgnoreCase);
        return (sortBy ?? string.Empty).Trim().ToLowerInvariant() switch
        {
            "name" => descending ? query.OrderByDescending(x => x.Name) : query.OrderBy(x => x.Name),
            "createdat" => descending ? query.OrderByDescending(x => x.CreatedAt) : query.OrderBy(x => x.CreatedAt),
            "frequency" => descending ? query.OrderByDescending(x => x.Frequency) : query.OrderBy(x => x.Frequency),
            _ => descending ? query.OrderByDescending(x => x.Listeners) : query.OrderBy(x => x.Listeners)
        };
    }

    private async Task<bool> IsAdminAsync(Guid userId, CancellationToken cancellationToken)
    {
        var user = await _db.Users.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == userId && !x.IsDeleted, cancellationToken);
        if (user is null)
        {
            return false;
        }

        return user.Role is UserRole.Admin or UserRole.Moderator;
    }

    private void InvalidateStationCaches(Guid stationId)
    {
        _cache.Remove(string.Format(StationCacheKeyFormat, stationId));
    }

    private static string? TrimOrNull(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string[]? NormalizeArray(string[]? values)
    {
        if (values is null || values.Length == 0)
        {
            return null;
        }

        var cleaned = values
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        return cleaned.Length == 0 ? null : cleaned;
    }
}
