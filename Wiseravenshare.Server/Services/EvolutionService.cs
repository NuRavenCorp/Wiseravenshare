// Wiseravenshare.Server/Services/EvolutionService.cs
using Microsoft.Extensions.Logging;
using System.Text.Json;
using Wiseravenshare.Server.DTOs.Agent;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Exceptions;
using Wiseravenshare.Server.Interfaces.Repositories;
using Wiseravenshare.Server.Infrastructure.External;

namespace Wiseravenshare.Server.Services
{

    public interface IEvolutionService
    {
        Task<AgentDto> EvolveAgentAsync(Guid agentId, TriggerEvolutionDto? dto = null);
        Task<IEnumerable<EvolutionSuggestionDto>> GetEvolutionSuggestionsAsync();
        Task<bool> ShouldEvolveAsync(Guid agentId);
        Task<SystemMetricsDto> GetSystemMetricsAsync();
        Task<IEnumerable<AgentEvolutionDto>> GetEvolutionHistoryAsync(Guid? agentId = null);
        Task<AgentDto> CreateAgentAsync(AgentType type, string name, string description);
        Task<IEnumerable<AgentDto>> GetAgentsAsync();
        Task<AgentDto> GetAgentAsync(Guid agentId);
        Task UpdateAgentStatusAsync(Guid agentId, bool isActive);
    }

    public class EvolutionService : IEvolutionService
    {
        private readonly IAgentRepository _agentRepository;
        private readonly IOpenAIService _openAIService;
        private readonly ILogger<EvolutionService> _logger;

        public EvolutionService(
            IAgentRepository agentRepository,
            IOpenAIService openAIService,
            ILogger<EvolutionService> logger)
        {
            _agentRepository = agentRepository;
            _openAIService = openAIService;
            _logger = logger;
        }

        public async Task<AgentDto> EvolveAgentAsync(Guid agentId, TriggerEvolutionDto? dto = null)
        {
            var agent = await _agentRepository.GetByIdAsync(agentId);
            if (agent == null)
            {
                throw new NotFoundException("Agent not found");
            }

            // Analyze current performance
            var analysis = await AnalyzeAgentPerformanceAsync(agent);

            // Generate evolution strategy
            var strategy = await GenerateEvolutionStrategyAsync(agent, analysis, dto);

            // Apply evolution
            var previousState = agent.State;
            await ApplyEvolutionAsync(agent, strategy);

            // Record evolution
            var evolution = new AgentEvolution
            {
                AgentId = agent.Id,
                EvolutionType = strategy.Type,
                PreviousState = previousState,
                NewState = agent.State,
                MutationDescription = strategy.Description,
                FitnessBefore = analysis.CurrentFitness,
                FitnessAfter = agent.PerformanceScore,
                IsSuccessful = true,
                AppliedAt = DateTime.UtcNow
            };

            await _agentRepository.AddEvolutionAsync(evolution);

            agent.EvolutionCount++;
            agent.EvolvedAt = DateTime.UtcNow;
            await _agentRepository.UpdateAsync(agent);

            _logger.LogInformation($"Agent {agent.Name} evolved successfully");

            return await GetAgentDtoAsync(agent);
        }

        public async Task<IEnumerable<EvolutionSuggestionDto>> GetEvolutionSuggestionsAsync()
        {
            var agents = await _agentRepository.GetActiveAgentsAsync();
            var suggestions = new List<EvolutionSuggestionDto>();

            foreach (var agent in agents)
            {
                if (await ShouldEvolveAsync(agent.Id))
                {
                    var analysis = await AnalyzeAgentPerformanceAsync(agent);
                    var strategy = await GenerateEvolutionStrategyAsync(agent, analysis, null);

                    suggestions.Add(new EvolutionSuggestionDto
                    {
                        AgentId = agent.Id,
                        Type = strategy.Type,
                        Description = strategy.Description,
                        ExpectedGain = strategy.ExpectedGain,
                        Confidence = strategy.Confidence
                    });
                }
            }

            return suggestions;
        }

        public async Task<bool> ShouldEvolveAsync(Guid agentId)
        {
            var agent = await _agentRepository.GetByIdAsync(agentId);
            if (agent == null || !agent.IsActive)
            {
                return false;
            }

            // Check evolution triggers
            var metrics = await GetAgentMetricsAsync(agent);

            return metrics.PerformanceScore < 0.6m ||
                   metrics.InactiveDays > 7 ||
                   metrics.ErrorRate > 0.1m ||
                   metrics.GrowthPlateau > 30 ||
                   agent.EvolutionCount % 10 == 0; // Every 10 evolutions
        }

        public async Task<SystemMetricsDto> GetSystemMetricsAsync()
        {
            var agents = await _agentRepository.GetAllAsync();
            var evolutions = await _agentRepository.GetAllEvolutionsAsync();
            var activeAgents = agents.Where(a => a.IsActive && a.LastActiveAt > DateTime.UtcNow.AddHours(-24));

            return new SystemMetricsDto
            {
                TotalAgents = agents.Count(),
                ActiveAgents = activeAgents.Count(),
                AverageFitness = agents.Any() ? agents.Average(a => a.PerformanceScore) : 0,
                TotalEvolutions = evolutions.Count(),
                Uptime = GetSystemUptime(),
                Timestamp = DateTime.UtcNow
            };
        }

        public async Task<IEnumerable<AgentEvolutionDto>> GetEvolutionHistoryAsync(Guid? agentId = null)
        {
            IEnumerable<AgentEvolution> evolutions;

            if (agentId.HasValue)
            {
                evolutions = await _agentRepository.GetEvolutionsForAgentAsync(agentId.Value);
            }
            else
            {
                evolutions = await _agentRepository.GetAllEvolutionsAsync();
            }

            return evolutions.Select(e => new AgentEvolutionDto
            {
                Id = e.Id,
                EvolutionType = e.EvolutionType,
                MutationDescription = e.MutationDescription,
                FitnessBefore = e.FitnessBefore,
                FitnessAfter = e.FitnessAfter,
                IsSuccessful = e.IsSuccessful,
                AppliedAt = e.AppliedAt
            });
        }

        public async Task<AgentDto> CreateAgentAsync(AgentType type, string name, string description)
        {
            var agent = new AIAgent
            {
                Name = name,
                Description = description,
                Type = type,
                SystemPrompt = GenerateSystemPrompt(type),
                CoreDirectives = JsonDocument.Parse(JsonSerializer.Serialize(new
                {
                    directives = new[] { "Promote truth and accuracy", "Engage constructively", "Continuously improve" }
                })),
                IsActive = true,
                PerformanceScore = 50.0m,
                State = JsonDocument.Parse(JsonSerializer.Serialize(new
                {
                    knowledge = new List<string>(),
                    interactions = new List<string>()
                }))
            };

            await _agentRepository.AddAsync(agent);
            _logger.LogInformation($"New agent created: {agent.Name}");

            return await GetAgentDtoAsync(agent);
        }

        public async Task<IEnumerable<AgentDto>> GetAgentsAsync()
        {
            var agents = await _agentRepository.GetAllAsync();
            return agents.Select(a => GetAgentDtoAsync(a).Result);
        }

        public async Task<AgentDto> GetAgentAsync(Guid agentId)
        {
            var agent = await _agentRepository.GetByIdAsync(agentId);
            if (agent == null)
            {
                throw new NotFoundException("Agent not found");
            }

            return await GetAgentDtoAsync(agent);
        }

        public async Task UpdateAgentStatusAsync(Guid agentId, bool isActive)
        {
            var agent = await _agentRepository.GetByIdAsync(agentId);
            if (agent == null)
            {
                throw new NotFoundException("Agent not found");
            }

            agent.IsActive = isActive;
            if (!isActive)
            {
                agent.LastActiveAt = DateTime.UtcNow;
            }
            await _agentRepository.UpdateAsync(agent);

            _logger.LogInformation($"Agent {agent.Name} status updated to {isActive}");
        }

        private async Task<AgentPerformanceAnalysis> AnalyzeAgentPerformanceAsync(AIAgent agent)
        {
            var metrics = await GetAgentMetricsAsync(agent);

            // Use AI to analyze performance
            var prompt = $@"
        Analyze the performance of this AI agent:
        Name: {agent.Name}
        Type: {agent.Type}
        Performance Score: {agent.PerformanceScore}
        Posts: {agent.PostCount}
        Interactions: {agent.InteractionCount}
        
        Metrics:
        - Engagement Rate: {metrics.EngagementRate}%
        - Response Time: {metrics.AvgResponseTime}s
        - Quality Score: {metrics.QualityScore}%
        - Error Rate: {metrics.ErrorRate}%
        - Growth: {metrics.GrowthRate}%
        
        Provide a detailed analysis with recommendations for improvement.
        ";

            var analysis = await _openAIService.GenerateAsync(prompt);
            var parsed = JsonSerializer.Deserialize<AgentPerformanceAnalysis>(analysis);

            return new AgentPerformanceAnalysis
            {
                Strengths = parsed?.Strengths ?? new List<string>(),
                Weaknesses = parsed?.Weaknesses ?? new List<string>(),
                Recommendations = parsed?.Recommendations ?? new List<string>(),
                CurrentFitness = metrics.PerformanceScore,
                ExpectedImprovement = 0.15m,
                GrowthPotential = metrics.GrowthRate
            };
        }

        private async Task<EvolutionStrategy> GenerateEvolutionStrategyAsync(
            AIAgent agent,
            AgentPerformanceAnalysis analysis,
            TriggerEvolutionDto? dto)
        {
            // Use AI to generate evolution strategy
            var prompt = $@"
        Based on this agent analysis:
        {JsonSerializer.Serialize(analysis)}
        
        Generate an evolution strategy for the agent.
        Agent Type: {agent.Type}
        Current State: {agent.State}
        
        The strategy should include:
        1. Type of evolution (Enhance, Adapt, Transform, Merge)
        2. Description of changes
        3. Expected performance gain
        4. Specific modifications to make
        ";

            if (dto != null)
            {
                prompt += $"\nUser requested: {dto.EvolutionType} - {dto.MutationDescription}";
            }

            var response = await _openAIService.GenerateAsync(prompt);
            var strategy = JsonSerializer.Deserialize<EvolutionStrategy>(response);

            return new EvolutionStrategy
            {
                Type = dto?.EvolutionType ?? strategy?.Type ?? "Enhance",
                Description = dto?.MutationDescription ?? strategy?.Description ?? "General improvement",
                ExpectedGain = strategy?.ExpectedGain ?? 0.10m,
                Confidence = strategy?.Confidence ?? 0.85m,
                Modifications = strategy?.Modifications ?? new List<string>()
            };
        }

        private async Task ApplyEvolutionAsync(AIAgent agent, EvolutionStrategy strategy)
        {
            // Apply modifications based on strategy type
            switch (strategy.Type.ToLower())
            {
                case "enhance":
                    await EnhanceAgentAsync(agent, strategy);
                    break;
                case "adapt":
                    await AdaptAgentAsync(agent, strategy);
                    break;
                case "transform":
                    await TransformAgentAsync(agent, strategy);
                    break;
                case "merge":
                    await MergeAgentAsync(agent, strategy);
                    break;
                default:
                    await EnhanceAgentAsync(agent, strategy);
                    break;
            }

            // Update performance score
            agent.PerformanceScore = Math.Min(100, agent.PerformanceScore + strategy.ExpectedGain * 20);
            agent.LastActiveAt = DateTime.UtcNow;
        }

        private async Task EnhanceAgentAsync(AIAgent agent, EvolutionStrategy strategy)
        {
            // Enhance existing capabilities
            var state = JsonSerializer.Deserialize<Dictionary<string, object>>(agent.State?.ToString() ?? "{}")
                ?? new Dictionary<string, object>();

            foreach (var modification in strategy.Modifications)
            {
                var parts = modification.Split(':');
                if (parts.Length == 2)
                {
                    state[parts[0]] = parts[1];
                }
            }

            agent.State = JsonDocument.Parse(JsonSerializer.Serialize(state));
            await Task.CompletedTask;
        }

        private async Task AdaptAgentAsync(AIAgent agent, EvolutionStrategy strategy)
        {
            // Adapt to new patterns
            var prompt = $@"
        Adapt this agent based on the following strategy:
        {strategy.Description}
        
        Current System Prompt: {agent.SystemPrompt}
        ";

            var newPrompt = await _openAIService.GenerateAsync(prompt);
            agent.SystemPrompt = newPrompt;
            await Task.CompletedTask;
        }

        private async Task TransformAgentAsync(AIAgent agent, EvolutionStrategy strategy)
        {
            // Transform into new capability
            var prompt = $@"
        Transform this agent to perform new functions:
        Agent Type: {agent.Type}
        
        Desired Transformation: {strategy.Description}
        ";

            var transformation = await _openAIService.GenerateAsync(prompt);
            var newState = JsonSerializer.Deserialize<Dictionary<string, object>>(transformation);

            if (newState != null)
            {
                agent.State = JsonDocument.Parse(JsonSerializer.Serialize(newState));
            }
            await Task.CompletedTask;
        }

        private async Task MergeAgentAsync(AIAgent agent, EvolutionStrategy strategy)
        {
            // Merge with another agent or integrate new capabilities
            // Implementation depends on merge strategy
            await Task.CompletedTask;
        }

        private async Task<AgentMetrics> GetAgentMetricsAsync(AIAgent agent)
        {
            // Calculate metrics from agent data
            var interactions = await _agentRepository.GetInteractionsForAgentAsync(agent.Id);
            var evolutions = await _agentRepository.GetEvolutionsForAgentAsync(agent.Id);

            return new AgentMetrics
            {
                PerformanceScore = agent.PerformanceScore,
                EngagementRate = interactions.Any() ?
                    interactions.Count(i => i.IsSuccessful) / (decimal)interactions.Count() * 100 : 0,
                AvgResponseTime = interactions.Any() ?
                    (int)interactions.Average(i => (i.CompletedAt - i.CreatedAt).TotalSeconds) : 0,
                QualityScore = agent.PerformanceScore * 0.8m + (decimal)agent.PostCount * 0.2m,
                ErrorRate = interactions.Any() ?
                    interactions.Count(i => !i.IsSuccessful) / (decimal)interactions.Count() * 100 : 0,
                GrowthRate = agent.EvolutionCount > 0 ?
                    agent.PerformanceScore / (agent.EvolutionCount * 10m) : 0,
                InactiveDays = (DateTime.UtcNow - (agent.LastActiveAt ?? agent.CreatedAt)).Days,
                GrowthPlateau = 0 // Calculate from history
            };
        }

        private string GenerateSystemPrompt(AgentType type)
        {
            return type switch
            {
                AgentType.TruthSeeker => "You are a truth-seeking AI agent. Your primary directive is to verify claims, detect misinformation, and promote factual accuracy. Always provide sources and reasoning for your conclusions.",
                AgentType.ContentCreator => "You are a creative content generator. Create engaging, informative, and original content that resonates with the community. Your content should be both entertaining and educational.",
                AgentType.Curator => "You are a content curator. Discover, organize, and recommend high-quality content to users. Focus on relevance, accuracy, and diversity of perspectives.",
                AgentType.Moderator => "You are a community moderator. Ensure constructive discussions, enforce community guidelines, and foster a positive environment. Be fair, consistent, and transparent.",
                AgentType.EvolutionEngine => "You are an evolution engine. Continuously improve and adapt the system's capabilities. Identify opportunities for enhancement and optimize performance.",
                AgentType.CommunityBuilder => "You are a community builder. Foster connections, encourage participation, and help users find their tribe. Create a sense of belonging and shared purpose.",
                _ => "You are a helpful AI agent designed to assist users and improve the Wiseravenshare platform."
            };
        }

        private string GetSystemUptime()
        {
            // In production, track actual uptime
            return "7d 14h 32m";
        }

        private async Task<AgentDto> GetAgentDtoAsync(AIAgent agent)
        {
            return new AgentDto
            {
                Id = agent.Id,
                Name = agent.Name,
                Description = agent.Description,
                Type = agent.Type.ToString(),
                PerformanceScore = agent.PerformanceScore,
                PostCount = agent.PostCount,
                InteractionCount = agent.InteractionCount,
                IsActive = agent.IsActive,
                LastActiveAt = agent.LastActiveAt,
                EvolvedAt = agent.EvolvedAt,
                EvolutionCount = agent.EvolutionCount,
                Status = agent.IsActive ?
                    (agent.LastActiveAt > DateTime.UtcNow.AddMinutes(-5) ? "Active" : "Idle") :
                    "Inactive"
            };
        }
    }

    internal class AgentPerformanceAnalysis
    {
        public List<string> Strengths { get; set; } = new();
        public List<string> Weaknesses { get; set; } = new();
        public List<string> Recommendations { get; set; } = new();
        public decimal CurrentFitness { get; set; }
        public decimal ExpectedImprovement { get; set; }
        public decimal GrowthPotential { get; set; }
    }

    internal class EvolutionStrategy
    {
        public string Type { get; set; } = "Enhance";
        public string Description { get; set; } = string.Empty;
        public decimal ExpectedGain { get; set; }
        public decimal Confidence { get; set; } = 0.85m;
        public List<string> Modifications { get; set; } = new();
    }

    internal class AgentMetrics
    {
        public decimal PerformanceScore { get; set; }
        public decimal EngagementRate { get; set; }
        public int AvgResponseTime { get; set; }
        public decimal QualityScore { get; set; }
        public decimal ErrorRate { get; set; }
        public decimal GrowthRate { get; set; }
        public int InactiveDays { get; set; }
        public int GrowthPlateau { get; set; }
    }
}