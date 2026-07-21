// Wiseravenshare.Server/DTOs/Agent/AgentDto.cs
using System.ComponentModel.DataAnnotations;

namespace Wiseravenshare.Server.DTOs.Agent
{

    public class AgentDto
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string Type { get; set; } = "TruthSeeker";
        public decimal PerformanceScore { get; set; }
        public int PostCount { get; set; }
        public int InteractionCount { get; set; }
        public bool IsActive { get; set; }
        public DateTime? LastActiveAt { get; set; }
        public DateTime? EvolvedAt { get; set; }
        public int EvolutionCount { get; set; }
        public string Status { get; set; } = "Idle";
    }

    public class AgentEvolutionDto
    {
        public Guid Id { get; set; }
        public string EvolutionType { get; set; } = string.Empty;
        public string MutationDescription { get; set; } = string.Empty;
        public decimal FitnessBefore { get; set; }
        public decimal FitnessAfter { get; set; }
        public bool IsSuccessful { get; set; }
        public DateTime AppliedAt { get; set; }
    }

    public class TriggerEvolutionDto
    {
        [Required]
        public Guid AgentId { get; set; }

        public string? EvolutionType { get; set; }
        public string? MutationDescription { get; set; }
    }

    public class EvolutionSuggestionDto
    {
        public Guid AgentId { get; set; }
        public string Type { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public decimal ExpectedGain { get; set; }
        public decimal Confidence { get; set; }
    }

    public class SystemMetricsDto
    {
        public int TotalAgents { get; set; }
        public int ActiveAgents { get; set; }
        public decimal AverageFitness { get; set; }
        public int TotalEvolutions { get; set; }
        public string Uptime { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; }
    }
}