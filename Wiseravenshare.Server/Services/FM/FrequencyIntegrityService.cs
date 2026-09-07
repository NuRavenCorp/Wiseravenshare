using System.Globalization;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Exceptions;
using Wiseravenshare.Server.Infrastructure.Data;

namespace Wiseravenshare.Server.Services.FM;

public sealed record NormalizedFrequency(string Display, string Band, string Key, bool IsVirtual);

public interface IFrequencyIntegrityService
{
    Task<NormalizedFrequency> NormalizeOrGenerateAvailableAsync(string? requestedFrequency, string? requestedBand, Guid creatorId, Guid? stationId, CancellationToken cancellationToken = default);
    Task EnsureFrequencyAvailableAsync(string frequencyKey, string band, Guid creatorId, Guid? stationId, CancellationToken cancellationToken = default);
    Task ClaimProprietaryFrequencyAsync(Guid stationId, Guid creatorId, string frequency, string band, string frequencyKey, CancellationToken cancellationToken = default);
    Task ReleaseClaimsAsync(Guid stationId, CancellationToken cancellationToken = default);
}

public sealed class FrequencyIntegrityService : IFrequencyIntegrityService
{
    private const double FmMin = 87.5;
    private const double FmMax = 108.0;
    private const int AmMin = 520;
    private const int AmMax = 1710;

    private readonly AppDbContext _db;

    public FrequencyIntegrityService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<NormalizedFrequency> NormalizeOrGenerateAvailableAsync(string? requestedFrequency, string? requestedBand, Guid creatorId, Guid? stationId, CancellationToken cancellationToken = default)
    {
        var band = NormalizeBand(requestedBand);
        if (!string.IsNullOrWhiteSpace(requestedFrequency))
        {
            var normalized = Normalize(requestedFrequency, band);
            await EnsureFrequencyAvailableAsync(normalized.Key, normalized.Band, creatorId, stationId, cancellationToken);
            return normalized;
        }

        if (band == "AM")
        {
            for (var i = 0; i < 120; i++)
            {
                var value = RandomNumberGenerator.GetInt32(AmMin, AmMax + 1);
                var candidate = Normalize(value.ToString(CultureInfo.InvariantCulture), "AM");
                if (await IsAvailableAsync(candidate.Key, candidate.Band, creatorId, stationId, cancellationToken))
                {
                    return candidate;
                }
            }
        }
        else
        {
            for (var i = 0; i < 120; i++)
            {
                var step = RandomNumberGenerator.GetInt32(0, 205);
                var value = Math.Round(FmMin + (step * 0.1), 1);
                var candidate = Normalize(value.ToString("0.0", CultureInfo.InvariantCulture), band == "FM" ? "FM" : "ONLINE");
                if (await IsAvailableAsync(candidate.Key, candidate.Band, creatorId, stationId, cancellationToken))
                {
                    return candidate;
                }
            }
        }

        throw new BadRequestException("Unable to allocate an available frequency right now. Please provide a different value.");
    }

    public async Task EnsureFrequencyAvailableAsync(string frequencyKey, string band, Guid creatorId, Guid? stationId, CancellationToken cancellationToken = default)
    {
        if (!await IsAvailableAsync(frequencyKey, band, creatorId, stationId, cancellationToken))
        {
            throw new BadRequestException("This frequency is reserved by another station. Choose a different one.");
        }
    }

    public async Task ClaimProprietaryFrequencyAsync(Guid stationId, Guid creatorId, string frequency, string band, string frequencyKey, CancellationToken cancellationToken = default)
    {
        var existing = await _db.Set<Entities.FM.RadioStationFrequencyClaim>()
            .Where(x => x.FrequencyKey == frequencyKey && x.Band == band && !x.IsDeleted)
            .FirstOrDefaultAsync(cancellationToken);

        if (existing is not null && existing.CreatorId != creatorId)
        {
            throw new BadRequestException("Frequency ownership conflict. This proprietary frequency already belongs to another creator.");
        }

        var previousClaims = await _db.Set<Entities.FM.RadioStationFrequencyClaim>()
            .Where(x => x.StationId == stationId && !x.IsDeleted && (x.FrequencyKey != frequencyKey || x.Band != band))
            .ToListAsync(cancellationToken);
        if (previousClaims.Count > 0)
        {
            _db.Set<Entities.FM.RadioStationFrequencyClaim>().RemoveRange(previousClaims);
        }

        var stationClaim = await _db.Set<Entities.FM.RadioStationFrequencyClaim>()
            .Where(x => x.StationId == stationId && x.FrequencyKey == frequencyKey && x.Band == band && !x.IsDeleted)
            .FirstOrDefaultAsync(cancellationToken);

        if (stationClaim is null)
        {
            _db.Set<Entities.FM.RadioStationFrequencyClaim>().Add(new Entities.FM.RadioStationFrequencyClaim
            {
                StationId = stationId,
                CreatorId = creatorId,
                Frequency = frequency,
                Band = band,
                FrequencyKey = frequencyKey,
                IsLocked = true,
                LockedAt = DateTime.UtcNow
            });
        }
        else
        {
            stationClaim.Frequency = frequency;
            stationClaim.CreatorId = creatorId;
            stationClaim.IsLocked = true;
            stationClaim.LockedAt = DateTime.UtcNow;
            stationClaim.UpdatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task ReleaseClaimsAsync(Guid stationId, CancellationToken cancellationToken = default)
    {
        var claims = await _db.Set<Entities.FM.RadioStationFrequencyClaim>()
            .Where(x => x.StationId == stationId && !x.IsDeleted)
            .ToListAsync(cancellationToken);
        if (claims.Count == 0)
        {
            return;
        }

        _db.Set<Entities.FM.RadioStationFrequencyClaim>().RemoveRange(claims);
        await _db.SaveChangesAsync(cancellationToken);
    }

    private async Task<bool> IsAvailableAsync(string frequencyKey, string band, Guid creatorId, Guid? stationId, CancellationToken cancellationToken)
    {
        var hasForeignClaim = await _db.Set<Entities.FM.RadioStationFrequencyClaim>()
            .AsNoTracking()
            .AnyAsync(x => !x.IsDeleted
                && x.FrequencyKey == frequencyKey
                && x.Band == band
                && x.CreatorId != creatorId
                && (stationId == null || x.StationId != stationId.Value), cancellationToken);
        if (hasForeignClaim)
        {
            return false;
        }

        var usedByFmStation = await _db.FMStations.AsNoTracking()
            .AnyAsync(x => !x.IsDeleted
                && x.IsActive
                && x.FrequencyKey == frequencyKey
                && x.Band == band
                && (stationId == null || x.Id != stationId.Value), cancellationToken);
        if (usedByFmStation)
        {
            return false;
        }

        var usedByCreatorStation = await _db.Set<Entities.FM.CreatorRadioStation>()
            .AsNoTracking()
            .AnyAsync(x => !x.IsDeleted
                && x.Status != Entities.FM.RadioStationStatus.Archived
                && x.FrequencyKey == frequencyKey
                && x.Band == band
                && (stationId == null || x.Id != stationId.Value), cancellationToken);
        return !usedByCreatorStation;
    }

    private static string NormalizeBand(string? band)
    {
        var value = string.IsNullOrWhiteSpace(band) ? "ONLINE" : band.Trim().ToUpperInvariant();
        return value switch
        {
            "ONLINE" => "ONLINE",
            "FM" => "FM",
            "AM" => "AM",
            _ => "ONLINE"
        };
    }

    private static NormalizedFrequency Normalize(string rawFrequency, string normalizedBand)
    {
        var trimmed = rawFrequency.Trim();
        if (normalizedBand == "AM")
        {
            var digits = Regex.Replace(trimmed.ToUpperInvariant(), @"[^0-9]", string.Empty);
            if (!int.TryParse(digits, NumberStyles.Integer, CultureInfo.InvariantCulture, out var am) || am < AmMin || am > AmMax)
            {
                throw new BadRequestException("AM frequency must be between 520 and 1710.");
            }

            return new NormalizedFrequency($"{am} AM", "AM", $"AM:{am:0000}", false);
        }

        var numeric = ExtractNumeric(trimmed);
        if (numeric.HasValue)
        {
            if (numeric.Value < FmMin || numeric.Value > FmMax)
            {
                throw new BadRequestException("FM frequency must be between 87.5 and 108.0.");
            }

            var value = Math.Round(numeric.Value, 1);
            var band = normalizedBand == "FM" ? "FM" : "ONLINE";
            var display = band == "FM" ? $"{value:0.0} FM" : $"Channel {value:0.0}";
            return new NormalizedFrequency(display, band, $"{band}:{value:000.0}", band == "ONLINE");
        }

        var token = Regex.Replace(trimmed.ToUpperInvariant(), @"[^A-Z0-9\.\-]", "-");
        token = Regex.Replace(token, @"\-{2,}", "-").Trim('-');
        if (string.IsNullOrWhiteSpace(token))
        {
            throw new BadRequestException("Frequency format is invalid.");
        }

        var safeToken = token.Length > 60 ? token[..60] : token;
        return new NormalizedFrequency(safeToken, "ONLINE", $"ONLINE:{safeToken}", true);
    }

    private static double? ExtractNumeric(string value)
    {
        var match = Regex.Match(value.ToUpperInvariant(), @"\d{2,3}(\.\d)?");
        if (!match.Success)
        {
            return null;
        }

        return double.TryParse(match.Value, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : null;
    }
}
