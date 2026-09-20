using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using BaseEntity = NuRavenCorpLLM.Server.Entities.BaseEntity;
using NuRavenCorpLLM.Server.Entities.Analytics;
using NuRavenCorpLLM.Server.Entities.Clients;
using NuRavenCorpLLM.Server.Entities.Conversations;
using NuRavenCorpLLM.Server.Entities.Craft;
using NuRavenCorpLLM.Server.Entities.Governance;
using NuRavenCorpLLM.Server.Entities.Ingestion;
using NuRavenCorpLLM.Server.Entities.Knowledge;
using NuRavenCorpLLM.Server.Entities.Learning;
using NuRavenCorpLLM.Server.Entities.Models;

namespace NuRavenCorpLLM.Server.Data;

public class ApplicationDbContext : DbContext
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : base(options) { }

    public DbSet<ClientSystem> ClientSystems => Set<ClientSystem>();
    public DbSet<ClientApiKey> ClientApiKeys => Set<ClientApiKey>();
    public DbSet<ClientScope> ClientScopes => Set<ClientScope>();
    public DbSet<ClientEvent> ClientEvents => Set<ClientEvent>();
    public DbSet<ClientSnapshot> ClientSnapshots => Set<ClientSnapshot>();
    public DbSet<ClientWebhook> ClientWebhooks => Set<ClientWebhook>();
    public DbSet<ClientRateLimit> ClientRateLimits => Set<ClientRateLimit>();

    public DbSet<Conversation> Conversations => Set<Conversation>();
    public DbSet<Message> Messages => Set<Message>();
    public DbSet<MessageAttachment> MessageAttachments => Set<MessageAttachment>();
    public DbSet<MessageCitation> MessageCitations => Set<MessageCitation>();
    public DbSet<ConversationSummary> ConversationSummaries => Set<ConversationSummary>();

    public DbSet<KnowledgeDocument> KnowledgeDocuments => Set<KnowledgeDocument>();
    public DbSet<KnowledgeChunk> KnowledgeChunks => Set<KnowledgeChunk>();
    public DbSet<KnowledgeCollection> KnowledgeCollections => Set<KnowledgeCollection>();
    public DbSet<KnowledgeCollectionItem> KnowledgeCollectionItems => Set<KnowledgeCollectionItem>();
    public DbSet<KnowledgeVersion> KnowledgeVersions => Set<KnowledgeVersion>();

    public DbSet<LearningSample> LearningSamples => Set<LearningSample>();
    public DbSet<LearningBatch> LearningBatches => Set<LearningBatch>();
    public DbSet<FeedbackSignal> FeedbackSignals => Set<FeedbackSignal>();
    public DbSet<PreferencePair> PreferencePairs => Set<PreferencePair>();
    public DbSet<FineTuneJob> FineTuneJobs => Set<FineTuneJob>();
    public DbSet<EvaluationRun> EvaluationRuns => Set<EvaluationRun>();
    public DbSet<EvaluationMetric> EvaluationMetrics => Set<EvaluationMetric>();

    public DbSet<ModelProvider> ModelProviders => Set<ModelProvider>();
    public DbSet<ModelDefinition> ModelDefinitions => Set<ModelDefinition>();
    public DbSet<ModelRoute> ModelRoutes => Set<ModelRoute>();
    public DbSet<ModelInvocation> ModelInvocations => Set<ModelInvocation>();
    public DbSet<EmbeddingModel> EmbeddingModels => Set<EmbeddingModel>();
    public DbSet<TokenBudget> TokenBudgets => Set<TokenBudget>();

    public DbSet<IngestionJob> IngestionJobs => Set<IngestionJob>();
    public DbSet<IngestionSource> IngestionSources => Set<IngestionSource>();
    public DbSet<IngestionItem> IngestionItems => Set<IngestionItem>();
    public DbSet<IngestionError> IngestionErrors => Set<IngestionError>();

    public DbSet<CraftDomain> CraftDomains => Set<CraftDomain>();
    public DbSet<CraftSkill> CraftSkills => Set<CraftSkill>();
    public DbSet<CraftPrinciple> CraftPrinciples => Set<CraftPrinciple>();
    public DbSet<CraftSource> CraftSources => Set<CraftSource>();
    public DbSet<CraftInsight> CraftInsights => Set<CraftInsight>();
    public DbSet<CraftPattern> CraftPatterns => Set<CraftPattern>();
    public DbSet<CraftMaster> CraftMasters => Set<CraftMaster>();
    public DbSet<CraftLesson> CraftLessons => Set<CraftLesson>();
    public DbSet<CraftObservation> CraftObservations => Set<CraftObservation>();
    public DbSet<UserCraftProfile> UserCraftProfiles => Set<UserCraftProfile>();
    public DbSet<UserCraftSkillScore> UserCraftSkillScores => Set<UserCraftSkillScore>();
    public DbSet<CraftCoachingSession> CraftCoachingSessions => Set<CraftCoachingSession>();
    public DbSet<CraftCoachingSuggestion> CraftCoachingSuggestions => Set<CraftCoachingSuggestion>();

    public DbSet<UsageMetric> UsageMetrics => Set<UsageMetric>();
    public DbSet<LatencyRecord> LatencyRecords => Set<LatencyRecord>();
    public DbSet<CostRecord> CostRecords => Set<CostRecord>();
    public DbSet<QualityScore> QualityScores => Set<QualityScore>();
    public DbSet<AnomalyDetection> AnomalyDetections => Set<AnomalyDetection>();

    public DbSet<SafetyPolicy> SafetyPolicies => Set<SafetyPolicy>();
    public DbSet<SafetyIncident> SafetyIncidents => Set<SafetyIncident>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<ComplianceRule> ComplianceRules => Set<ComplianceRule>();
    public DbSet<DataRetentionPolicy> DataRetentionPolicies => Set<DataRetentionPolicy>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        foreach (var entityType in modelBuilder.Model.GetEntityTypes())
        {
            if (!typeof(BaseEntity).IsAssignableFrom(entityType.ClrType)) continue;

            var parameter = Expression.Parameter(entityType.ClrType, "e");
            var propMethod = typeof(EF).GetMethod(nameof(EF.Property))!.MakeGenericMethod(typeof(bool));
            var isDeletedProp = Expression.Call(propMethod, parameter, Expression.Constant(nameof(BaseEntity.IsDeleted)));
            var compare = Expression.Equal(isDeletedProp, Expression.Constant(false));
            var lambda = Expression.Lambda(compare, parameter);
            modelBuilder.Entity(entityType.ClrType).HasQueryFilter(lambda);
        }
    }

    public override int SaveChanges()
    {
        ApplyAuditRules();
        return base.SaveChanges();
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        ApplyAuditRules();
        return base.SaveChangesAsync(cancellationToken);
    }

    private void ApplyAuditRules()
    {
        var entries = ChangeTracker.Entries<BaseEntity>();
        var now = DateTime.UtcNow;

        foreach (var entry in entries)
        {
            if (entry.State == EntityState.Added)
            {
                entry.Entity.CreatedAt = now;
                entry.Entity.UpdatedAt = now;
            }
            else if (entry.State == EntityState.Modified)
            {
                entry.Entity.UpdatedAt = now;
            }
            else if (entry.State == EntityState.Deleted)
            {
                entry.State = EntityState.Modified;
                entry.Entity.IsDeleted = true;
                entry.Entity.DeletedAt = now;
                entry.Entity.UpdatedAt = now;
            }
        }
    }
}
