// Wiseravenshare.Server/Infrastructure/Data/AppDbContextCurrencyConfig.cs
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities.Currency;

namespace Wiseravenshare.Server.Infrastructure.Data;

// Currency system model configuration (WiseCoin / Badges / Work Hours)
public static class AppDbContextCurrencyConfig
{
    public static void ConfigureCurrency(this ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<WiseCoin>(entity =>
        {
            entity.ToTable("WiseCoins");
            entity.HasOne(w => w.User)
                .WithOne()
                .HasForeignKey<WiseCoin>(w => w.UserId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(w => w.UserId).IsUnique();
            entity.Property(w => w.Balance).HasPrecision(18, 2);
        });

        modelBuilder.Entity<CoinTransaction>(entity =>
        {
            entity.ToTable("CoinTransactions");
            entity.HasOne(t => t.User)
                .WithMany()
                .HasForeignKey(t => t.UserId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(t => t.TargetUser)
                .WithMany()
                .HasForeignKey(t => t.TargetUserId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(t => t.UserId);
            entity.HasIndex(t => t.CreatedAt);
            entity.Property(t => t.Amount).HasPrecision(18, 2);
            entity.Property(t => t.Fee).HasPrecision(18, 2);
        });

        modelBuilder.Entity<CoinStake>(entity =>
        {
            entity.ToTable("CoinStakes");
            entity.HasOne(s => s.User)
                .WithMany()
                .HasForeignKey(s => s.UserId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(s => new { s.UserId, s.IsActive });
        });

        modelBuilder.Entity<Badge>(entity =>
        {
            entity.ToTable("Badges");
            entity.HasIndex(b => b.Name).IsUnique();
        });

        modelBuilder.Entity<UserBadge>(entity =>
        {
            entity.ToTable("UserBadges");
            entity.HasOne(ub => ub.User)
                .WithMany()
                .HasForeignKey(ub => ub.UserId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(ub => ub.Badge)
                .WithMany(b => b.UserBadges)
                .HasForeignKey(ub => ub.BadgeId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(ub => new { ub.UserId, ub.BadgeId }).IsUnique();
        });

        modelBuilder.Entity<BadgeEvolution>(entity =>
        {
            entity.ToTable("BadgeEvolutions");
            entity.HasOne(e => e.SourceBadge)
                .WithMany()
                .HasForeignKey(e => e.SourceBadgeId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.TargetBadge)
                .WithMany(b => b.Evolutions)
                .HasForeignKey(e => e.TargetBadgeId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<WorkHourValuation>(entity =>
        {
            entity.ToTable("WorkHourValuations");
            entity.HasIndex(v => v.Date);
        });

        modelBuilder.Entity<WorkHourContribution>(entity =>
        {
            entity.ToTable("WorkHourContributions");
            entity.HasOne(w => w.User)
                .WithMany()
                .HasForeignKey(w => w.UserId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(w => w.Verifier)
                .WithMany()
                .HasForeignKey(w => w.VerifiedBy)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(w => new { w.UserId, w.IsVerified });
        });
    }
}
