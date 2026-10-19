using Microsoft.EntityFrameworkCore;
using NuRavenCorpLLM.Entities;
using NuRavenCorpLLM.Entities.Ai;
using NuRavenCorpLLM.Entities.Craft;

namespace NuRavenCorpLLM.Infrastructure.Data;

public class ApplicationDbContext : DbContext
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : base(options)
    {
    }

    public DbSet<User> Users => Set<User>();
    public DbSet<AssistantConversation> AssistantConversations => Set<AssistantConversation>();
    public DbSet<AssistantMessage> AssistantMessages => Set<AssistantMessage>();
    public DbSet<AssistantFeedback> AssistantFeedback => Set<AssistantFeedback>();
    public DbSet<AssistantKnowledge> AssistantKnowledge => Set<AssistantKnowledge>();
    public DbSet<AssistantLearningSample> AssistantLearningSamples => Set<AssistantLearningSample>();

    public DbSet<DataQuery> DataQueries => Set<DataQuery>();
    public DbSet<DataQueryTemplate> DataQueryTemplates => Set<DataQueryTemplate>();
    public DbSet<DataSourceRegistry> DataSourceRegistries => Set<DataSourceRegistry>();

    public DbSet<CraftDomain> CraftDomains => Set<CraftDomain>();
    public DbSet<CraftSkill> CraftSkills => Set<CraftSkill>();
    public DbSet<CraftPrinciple> CraftPrinciples => Set<CraftPrinciple>();
    public DbSet<CraftObservation> CraftObservations => Set<CraftObservation>();
    public DbSet<CraftSource> CraftSources => Set<CraftSource>();
    public DbSet<CraftInsight> CraftInsights => Set<CraftInsight>();
    public DbSet<CraftLesson> CraftLessons => Set<CraftLesson>();
    public DbSet<CraftLessonCompletion> CraftLessonCompletions => Set<CraftLessonCompletion>();
    public DbSet<CraftMaster> CraftMasters => Set<CraftMaster>();
    public DbSet<CraftCoachingSession> CraftCoachingSessions => Set<CraftCoachingSession>();
    public DbSet<CraftCoachingSuggestion> CraftCoachingSuggestions => Set<CraftCoachingSuggestion>();
    public DbSet<UserCraftProfile> UserCraftProfiles => Set<UserCraftProfile>();
}