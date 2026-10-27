using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities.Identity;

namespace Wiseravenshare.Server.Infrastructure.Data;

/// <summary>
/// Dedicated EF Core context for ASP.NET Core Identity tables.
/// Kept separate from <see cref="AppDbContext"/> so the Identity <c>Users</c>
/// DbSet never collides with the existing custom <c>app_data.Users</c> table.
/// All Identity tables are placed in the <c>identity</c> Postgres schema.
/// </summary>
public sealed class WrIdentityDbContext : IdentityDbContext<ApplicationUser>
{
    public WrIdentityDbContext(DbContextOptions<WrIdentityDbContext> options)
        : base(options) { }

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        // Place every Identity table in its own "identity" schema so they
        // are completely isolated from the existing "app_data" schema.
        builder.HasDefaultSchema("identity");

        builder.Entity<ApplicationUser>(e =>
        {
            e.ToTable("Users");
            e.HasIndex(u => u.NormalizedUserName).IsUnique();
            e.HasIndex(u => u.NormalizedEmail).IsUnique();
        });

        builder.Entity<IdentityRole>         (e => e.ToTable("Roles"));
        builder.Entity<IdentityUserRole<string>>(e => e.ToTable("UserRoles"));
        builder.Entity<IdentityUserClaim<string>>(e => e.ToTable("UserClaims"));
        builder.Entity<IdentityUserLogin<string>>(e => e.ToTable("UserLogins"));
        builder.Entity<IdentityRoleClaim<string>>(e => e.ToTable("RoleClaims"));
        builder.Entity<IdentityUserToken<string>>(e => e.ToTable("UserTokens"));
    }
}
