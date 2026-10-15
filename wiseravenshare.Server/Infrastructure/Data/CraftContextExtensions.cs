using Microsoft.EntityFrameworkCore;
using WiseRavenShare.Server.Infrastructure.Data.Configuration;

namespace WiseRavenShare.Server.Infrastructure.Data;

public static class CraftContextExtensions
{
    public static ModelBuilder ConfigureCraft(this ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfiguration(new CraftDomainConfiguration());
        modelBuilder.ApplyConfiguration(new CraftSkillConfiguration());
        modelBuilder.ApplyConfiguration(new CraftPrincipleConfiguration());
        modelBuilder.ApplyConfiguration(new UserCraftProfileConfiguration());
        modelBuilder.ApplyConfiguration(new UserCraftSkillScoreConfiguration());
        modelBuilder.ApplyConfiguration(new CraftObservationConfiguration());
        modelBuilder.ApplyConfiguration(new CraftDraftReviewConfiguration());
        modelBuilder.ApplyConfiguration(new CraftFeedbackConfiguration());
        modelBuilder.ApplyConfiguration(new CraftLessonConfiguration());
        modelBuilder.ApplyConfiguration(new CraftLessonCompletionConfiguration());
        modelBuilder.ApplyConfiguration(new CraftPerformanceMetricConfiguration());
        modelBuilder.ApplyConfiguration(new CraftPatternConfiguration());
        modelBuilder.ApplyConfiguration(new CraftPrincipleRefinementConfiguration());

        return modelBuilder;
    }
}
