using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WiseRavenShare.Server.Core.Entities.Craft;

namespace WiseRavenShare.Server.Infrastructure.Data.Configuration;

public class CraftDomainConfiguration : IEntityTypeConfiguration<CraftDomain>
{
    public void Configure(EntityTypeBuilder<CraftDomain> builder)
    {
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Key)
            .IsRequired()
            .HasMaxLength(100);

        builder.Property(x => x.Name)
            .IsRequired()
            .HasMaxLength(200);

        builder.HasIndex(x => x.Key)
            .IsUnique();

        builder.HasMany(x => x.Skills)
            .WithOne(x => x.Domain)
            .HasForeignKey(x => x.CraftDomainId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(x => x.Principles)
            .WithOne(x => x.Domain)
            .HasForeignKey(x => x.CraftDomainId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(x => x.Lessons)
            .WithOne(x => x.Domain)
            .HasForeignKey(x => x.CraftDomainId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public class CraftSkillConfiguration : IEntityTypeConfiguration<CraftSkill>
{
    public void Configure(EntityTypeBuilder<CraftSkill> builder)
    {
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Key)
            .IsRequired()
            .HasMaxLength(100);

        builder.HasIndex(x => new { x.CraftDomainId, x.Key });

        builder.HasMany(x => x.Children)
            .WithOne(x => x.ParentSkill)
            .HasForeignKey(x => x.ParentSkillId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasMany(x => x.UserScores)
            .WithOne(x => x.Skill)
            .HasForeignKey(x => x.SkillId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public class CraftPrincipleConfiguration : IEntityTypeConfiguration<CraftPrinciple>
{
    public void Configure(EntityTypeBuilder<CraftPrinciple> builder)
    {
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Title)
            .IsRequired()
            .HasMaxLength(300);

        builder.Property(x => x.Description)
            .IsRequired()
            .HasMaxLength(2000);

        builder.HasIndex(x => new { x.CraftDomainId, x.Kind });

        // Embedding managed via raw SQL (pgvector); excluded from EF model
        builder.Ignore(x => x.Embedding);
    }
}

public class UserCraftProfileConfiguration : IEntityTypeConfiguration<UserCraftProfile>
{
    public void Configure(EntityTypeBuilder<UserCraftProfile> builder)
    {
        builder.HasKey(x => x.Id);

        // One profile per user; UserId is the natural unique FK.
        builder.HasIndex(x => x.UserId)
            .IsUnique();

        // Explicit navigation avoids the shadow UserId1 duplicate that occurs when
        // HasOne<User>() (without nav property) is used alongside the User property.
        builder.HasOne(x => x.User)
            .WithOne()
            .HasForeignKey<UserCraftProfile>(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        // SkillScores are collected via UserCraftProfile.SkillScores ↔ UserCraftSkillScore.
        // The shadow UserCraftProfileId column that EF generated previously is preserved
        // for compatibility; new rows should use UserId instead.
        builder.HasMany(x => x.SkillScores)
            .WithOne()
            .HasForeignKey("UserCraftProfileId")
            .IsRequired(false)
            .OnDelete(DeleteBehavior.SetNull);
    }
}

public class UserCraftSkillScoreConfiguration : IEntityTypeConfiguration<UserCraftSkillScore>
{
    public void Configure(EntityTypeBuilder<UserCraftSkillScore> builder)
    {
        builder.HasKey(x => x.Id);

        builder.HasIndex(x => new { x.UserId, x.SkillId })
            .IsUnique();

        builder.Property(x => x.Score)
            .HasPrecision(5, 2);

        builder.Property(x => x.Confidence)
            .HasPrecision(3, 2);

        // Explicit FK to User prevents EF from creating a shadow navigation.
        builder.HasOne(x => x.User)
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public class CraftObservationConfiguration : IEntityTypeConfiguration<CraftObservation>
{
    public void Configure(EntityTypeBuilder<CraftObservation> builder)
    {
        builder.HasKey(x => x.Id);

        builder.HasIndex(x => new { x.UserId, x.DomainKey, x.CreatedAt });

        // Embedding managed via raw SQL (pgvector); excluded from EF model
        builder.Ignore(x => x.Embedding);

        builder.HasOne(x => x.User)
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public class CraftDraftReviewConfiguration : IEntityTypeConfiguration<CraftDraftReview>
{
    public void Configure(EntityTypeBuilder<CraftDraftReview> builder)
    {
        builder.HasKey(x => x.Id);

        builder.HasIndex(x => new { x.UserId, x.CraftDomainId, x.ReviewedAt });

        // Without these explicit mappings EF generated a shadow UserId1 column (FK to Users)
        // while using UserId as FK to UserCraftProfiles (wrong). Both must be declared here.
        builder.HasOne(x => x.User)
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(x => x.Domain)
            .WithMany()
            .HasForeignKey(x => x.CraftDomainId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasMany(x => x.Feedback)
            .WithOne(x => x.Review)
            .HasForeignKey(x => x.ReviewId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public class CraftFeedbackConfiguration : IEntityTypeConfiguration<CraftFeedback>
{
    public void Configure(EntityTypeBuilder<CraftFeedback> builder)
    {
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Feedback)
            .IsRequired()
            .HasMaxLength(500);

        builder.HasIndex(x => x.ReviewId);
    }
}

public class CraftLessonConfiguration : IEntityTypeConfiguration<CraftLesson>
{
    public void Configure(EntityTypeBuilder<CraftLesson> builder)
    {
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Title)
            .IsRequired()
            .HasMaxLength(300);

        builder.HasIndex(x => new { x.CraftDomainId, x.Level, x.OrderIndex });

        // Embedding managed via raw SQL (pgvector); excluded from EF model
        builder.Ignore(x => x.Embedding);

        // Completions are configured fully in CraftLessonCompletionConfiguration;
        // only declare the inverse here to register the collection nav.
        builder.HasMany(x => x.Completions)
            .WithOne(x => x.Lesson)
            .HasForeignKey(x => x.LessonId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public class CraftLessonCompletionConfiguration : IEntityTypeConfiguration<CraftLessonCompletion>
{
    public void Configure(EntityTypeBuilder<CraftLessonCompletion> builder)
    {
        builder.HasKey(x => x.Id);

        builder.HasIndex(x => new { x.UserId, x.LessonId })
            .IsUnique();

        builder.HasOne(x => x.Lesson)
            .WithMany(x => x.Completions)
            .HasForeignKey(x => x.LessonId)
            .OnDelete(DeleteBehavior.Cascade);

        // Explicit User FK so EF does not shadow-name it UserId1.
        builder.HasOne<Wiseravenshare.Server.Entities.User>()
            .WithMany()
            .HasForeignKey(nameof(CraftLessonCompletion.UserId))
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public class CraftPerformanceMetricConfiguration : IEntityTypeConfiguration<CraftPerformanceMetric>
{
    public void Configure(EntityTypeBuilder<CraftPerformanceMetric> builder)
    {
        builder.HasKey(x => x.Id);

        builder.HasIndex(x => new { x.UserId, x.DomainKey, x.MeasuredAt });

        builder.Property(x => x.EngagementRate)
            .HasPrecision(5, 2);

        builder.Property(x => x.CompletionRate)
            .HasPrecision(5, 2);

        builder.HasOne(x => x.User)
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(x => x.Domain)
            .WithMany()
            .HasForeignKey(x => x.CraftDomainId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public class CraftPatternConfiguration : IEntityTypeConfiguration<CraftPattern>
{
    public void Configure(EntityTypeBuilder<CraftPattern> builder)
    {
        builder.HasKey(x => x.Id);

        builder.HasIndex(x => new { x.CraftDomainId, x.Status, x.Confidence });

        builder.Property(x => x.Confidence)
            .HasPrecision(3, 2);

        builder.Property(x => x.AverageImpact)
            .HasPrecision(5, 2);

        // Embedding managed via raw SQL (pgvector); excluded from EF model
        builder.Ignore(x => x.Embedding);
    }
}

public class CraftPrincipleRefinementConfiguration : IEntityTypeConfiguration<CraftPrincipleRefinement>
{
    public void Configure(EntityTypeBuilder<CraftPrincipleRefinement> builder)
    {
        builder.HasKey(x => x.Id);

        builder.HasIndex(x => new { x.PrincipleId, x.Status });

        builder.HasOne(x => x.Principle)
            .WithMany()
            .HasForeignKey(x => x.PrincipleId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
