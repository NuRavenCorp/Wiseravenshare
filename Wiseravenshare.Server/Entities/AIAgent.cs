// Wiseravenshare.Core/Entities/AIAgent.cs
using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Wiseravenshare.Server.Entities;

namespace Wiseravenshare.Server.Entities
{

    public class AIAgent : BaseEntity
    {
        [MaxLength(100)]
        public string Name { get; set; } = string.Empty;

        [MaxLength(500)]
        public string Description { get; set; } = string.Empty;

        public AgentType Type { get; set; } = AgentType.TruthSeeker;

        [MaxLength(2000)]
        public string SystemPrompt { get; set; } = string.Empty;

        public JsonDocument? CoreDirectives { get; set; }
        public JsonDocument? KnowledgeGraph { get; set; }
        public JsonDocument? SocialPreferences { get; set; }
        public JsonDocument? State { get; set; }

        public decimal PerformanceScore { get; set; }
        public int PostCount { get; set; }
        public int InteractionCount { get; set; }
        public int EvolutionCount { get; set; }
        public bool IsActive { get; set; } = true;
        public DateTime? LastActiveAt { get; set; }
        public DateTime? EvolvedAt { get; set; }

        // Navigation Properties
        public virtual ICollection<AgentInteraction> Interactions { get; set; } = new List<AgentInteraction>();
        public virtual ICollection<AgentEvolution> Evolutions { get; set; } = new List<AgentEvolution>();
    }

    public enum AgentType
    {
        TruthSeeker,
        ContentCreator,
        Curator,
        Moderator,
        EvolutionEngine,
        CommunityBuilder
    }

    public class AgentInteraction : BaseEntity
    {
        public Guid AgentId { get; set; }
        public Guid? TargetAgentId { get; set; }
        public Guid? TargetUserId { get; set; }
        public InteractionType Type { get; set; }

        [MaxLength(2000)]
        public string Content { get; set; } = string.Empty;

        public JsonDocument? Response { get; set; }
        public decimal? Confidence { get; set; }
        public bool IsSuccessful { get; set; }
        public DateTime CompletedAt { get; set; }

        // Navigation Properties
        public virtual AIAgent Agent { get; set; } = null!;
        public virtual AIAgent? TargetAgent { get; set; }
        public virtual User? TargetUser { get; set; }
    }

    public enum InteractionType
    {
        TruthVerification,
        ContentGeneration,
        CommunityModeration,
        EvolutionSuggestion,
        SocialInteraction,
        SelfImprovement,
        PostCreation,
        CommentResponse
    }

    public class AgentEvolution : BaseEntity
    {
        public Guid AgentId { get; set; }

        [MaxLength(100)]
        public string EvolutionType { get; set; } = string.Empty;

        public JsonDocument? PreviousState { get; set; }
        public JsonDocument? NewState { get; set; }

        [MaxLength(2000)]
        public string MutationDescription { get; set; } = string.Empty;

        public decimal FitnessBefore { get; set; }
        public decimal FitnessAfter { get; set; }
        public bool IsSuccessful { get; set; }
        public DateTime AppliedAt { get; set; }

        // Navigation Properties
        public virtual AIAgent Agent { get; set; } = null!;
    }
}