// Wiseravenshare.Server.Infrastructure/Data/Repositories/AgentRepository.cs
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Interfaces.Repositories;


namespace Wiseravenshare.Server.Infrastructure.Data.Repositories
{

    public class AgentRepository : Repository<AIAgent>, IAgentRepository
    {
        public AgentRepository(AppDbContext context) : base(context)
        {
        }

        public async Task<IEnumerable<AIAgent>> GetActiveAgentsAsync()
        {
            return await _dbSet
                .Where(a => a.IsActive)
                .OrderByDescending(a => a.PerformanceScore)
                .ToListAsync();
        }

        public async Task<IEnumerable<AIAgent>> GetAgentsByTypeAsync(AgentType type)
        {
            return await _dbSet
                .Where(a => a.Type == type && a.IsActive)
                .OrderByDescending(a => a.PerformanceScore)
                .ToListAsync();
        }

        public async Task<IEnumerable<AgentEvolution>> GetEvolutionsForAgentAsync(Guid agentId)
        {
            return await _context.AgentEvolutions
                .Where(e => e.AgentId == agentId)
                .OrderByDescending(e => e.AppliedAt)
                .ToListAsync();
        }

        public async Task<IEnumerable<AgentInteraction>> GetInteractionsForAgentAsync(Guid agentId)
        {
            return await _context.AgentInteractions
                .Where(i => i.AgentId == agentId)
                .OrderByDescending(i => i.CreatedAt)
                .ToListAsync();
        }

        public async Task<IEnumerable<AIAgent>> GetTopPerformingAgentsAsync(int count)
        {
            return await _dbSet
                .Where(a => a.IsActive)
                .OrderByDescending(a => a.PerformanceScore)
                .Take(count)
                .ToListAsync();
        }

        public async Task<decimal> GetAveragePerformanceScoreAsync()
        {
            if (!await _dbSet.AnyAsync())
                return 0;

            return await _dbSet
                .Where(a => a.IsActive)
                .AverageAsync(a => a.PerformanceScore);
        }

        public async Task<IEnumerable<AgentEvolution>> GetAllEvolutionsAsync()
        {
            return await _context.AgentEvolutions
                .OrderByDescending(e => e.AppliedAt)
                .Include(e => e.Agent)
                .ToListAsync();
        }

        public async Task AddEvolutionAsync(AgentEvolution evolution)
        {
            await _context.AgentEvolutions.AddAsync(evolution);
            await _context.SaveChangesAsync();
        }
    }
}