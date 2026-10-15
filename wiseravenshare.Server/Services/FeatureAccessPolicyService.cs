using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Entities.Access;
using Wiseravenshare.Server.Infrastructure.Data;

namespace Wiseravenshare.Server.Services;

public interface IFeatureAccessPolicyService
{
    Task<bool> IsFeatureAllowedAsync(Guid userId, string featureKey, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<UserPresence>> GetVisibleUserPresenceAsync(Guid adminUserId, CancellationToken cancellationToken = default);
    Task SetFeatureStateAsync(string featureKey, FeatureScope scope, string? scopeValue, FeatureState state, string? reason = null, Guid? actorUserId = null, CancellationToken cancellationToken = default);
    Task SetUserCompartmentAsync(Guid userId, UserCompartment compartment, bool enabled, bool isOverride = false, CancellationToken cancellationToken = default);
}

public sealed class FeatureAccessPolicyService : IFeatureAccessPolicyService
{
    private readonly AppDbContext _db;

    public FeatureAccessPolicyService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<bool> IsFeatureAllowedAsync(Guid userId, string featureKey, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(featureKey))
        {
            return false;
        }

        var user = await _db.Users
            .AsNoTracking()
            .SingleOrDefaultAsync(u => u.Id == userId, cancellationToken);

        if (user is null)
        {
            return false;
        }

        var scopedUserValue = userId.ToString();

        var explicitUserFlags = await _db.FeatureFlags
            .AsNoTracking()
            .Where(f => f.FeatureKey == featureKey && f.Scope == FeatureScope.User && f.ScopeValue == scopedUserValue)
            .ToListAsync(cancellationToken);

        var globalFlags = await _db.FeatureFlags
            .AsNoTracking()
            .Where(f => f.FeatureKey == featureKey && f.Scope == FeatureScope.Global)
            .ToListAsync(cancellationToken);

        var compartmentFlags = await _db.FeatureFlags
            .AsNoTracking()
            .Where(f => f.FeatureKey == featureKey && f.Scope == FeatureScope.Compartment)
            .ToListAsync(cancellationToken);

        var userFlags = await _db.UserCompartmentAssignments
            .AsNoTracking()
            .Where(x => x.UserId == userId && x.IsActive)
            .ToListAsync(cancellationToken);

        foreach (var flag in explicitUserFlags)
        {
            if (flag.State == FeatureState.Disabled)
            {
                return false;
            }

            if (flag.State == FeatureState.Enabled)
            {
                return true;
            }
        }

        foreach (var flag in globalFlags)
        {
            if (flag.State == FeatureState.Disabled)
            {
                return false;
            }

            if (flag.State == FeatureState.Enabled)
            {
                return true;
            }
        }

        foreach (var assignment in userFlags)
        {
            var matchingCompartmentFlag = compartmentFlags
                .FirstOrDefault(f => string.Equals(f.ScopeValue, assignment.Compartment.ToString(), StringComparison.OrdinalIgnoreCase));

            if (matchingCompartmentFlag is null)
            {
                continue;
            }

            if (matchingCompartmentFlag.State == FeatureState.Disabled)
            {
                return false;
            }

            if (matchingCompartmentFlag.State == FeatureState.Enabled)
            {
                return true;
            }
        }

        return true;
    }

    public async Task<IReadOnlyList<UserPresence>> GetVisibleUserPresenceAsync(Guid adminUserId, CancellationToken cancellationToken = default)
    {
        var adminUser = await _db.Users
            .AsNoTracking()
            .SingleOrDefaultAsync(u => u.Id == adminUserId, cancellationToken);

        if (adminUser is null)
        {
            return Array.Empty<UserPresence>();
        }

        var isAdmin = adminUser.Role == UserRole.Admin || adminUser.Role == UserRole.Moderator || adminUser.Role == UserRole.TruthGuardian;
        if (!isAdmin)
        {
            return Array.Empty<UserPresence>();
        }

        return await _db.UserPresence
            .AsNoTracking()
            .Where(x => x.IsAdminVisible)
            .OrderByDescending(x => x.LastSeenUtc)
            .ToListAsync(cancellationToken);
    }

    public async Task SetFeatureStateAsync(string featureKey, FeatureScope scope, string? scopeValue, FeatureState state, string? reason = null, Guid? actorUserId = null, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(featureKey))
        {
            throw new ArgumentException("featureKey is required.", nameof(featureKey));
        }

        var existing = await _db.FeatureFlags
            .SingleOrDefaultAsync(f => f.FeatureKey == featureKey && f.Scope == scope && f.ScopeValue == scopeValue, cancellationToken);

        if (existing is null)
        {
            existing = new FeatureFlag
            {
                FeatureKey = featureKey,
                Scope = scope,
                ScopeValue = scopeValue,
                State = state,
                Notes = reason,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            _db.FeatureFlags.Add(existing);
        }
        else
        {
            existing.State = state;
            existing.Notes = reason;
            existing.UpdatedAt = DateTime.UtcNow;
        }

        _db.FeatureAuditLogs.Add(new FeatureAuditLog
        {
            ActorUserId = actorUserId,
            FeatureKey = featureKey,
            Scope = scope,
            ScopeValue = scopeValue,
            OldState = existing.State,
            NewState = state,
            Reason = reason,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        });

        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task SetUserCompartmentAsync(Guid userId, UserCompartment compartment, bool enabled, bool isOverride = false, CancellationToken cancellationToken = default)
    {
        var assignment = await _db.UserCompartmentAssignments
            .SingleOrDefaultAsync(x => x.UserId == userId && x.Compartment == compartment && x.IsActive, cancellationToken);

        if (assignment is null)
        {
            assignment = new UserCompartmentAssignment
            {
                UserId = userId,
                Compartment = compartment,
                IsOverride = isOverride,
                IsActive = enabled,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            _db.UserCompartmentAssignments.Add(assignment);
        }
        else
        {
            assignment.IsActive = enabled;
            assignment.IsOverride = isOverride;
            assignment.UpdatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync(cancellationToken);
    }
}
