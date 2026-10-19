// Application/Services/Craft/CraftDomainSeeder.cs
using NuRavenCorpLLM.Application.Services.Assistant;
using NuRavenCorpLLM.Core.Interfaces.Repositories.Craft;
using NuRavenCorpLLM.Entities.Craft;

namespace NuRavenCorpLLM.Application.Services.Craft;

public interface ICraftDomainSeeder { Task SeedAsync(); }

public class CraftDomainSeeder : ICraftDomainSeeder
{
    private readonly ICraftDomainRepository _domains;
    private readonly ICraftSkillRepository _skills;
    private readonly ICraftPrincipleRepository _principles;
    private readonly IEmbeddingService _embed;
    private readonly ILogger<CraftDomainSeeder> _logger;

    public CraftDomainSeeder(
        ICraftDomainRepository domains,
        ICraftSkillRepository skills,
        ICraftPrincipleRepository principles,
        IEmbeddingService embed,
        ILogger<CraftDomainSeeder> logger)
    {
        _domains = domains; _skills = skills; _principles = principles; _embed = embed; _logger = logger;
    }

    public async Task SeedAsync()
    {
        foreach (var seed in CraftDomainRegistry.Domains)
        {
            var domain = await _domains.GetByKeyAsync(seed.Key);
            if (domain == null)
            {
                domain = new CraftDomain
                {
                    Key = seed.Key,
                    Name = seed.Name,
                    Description = seed.Description,
                    IconEmoji = seed.Icon
                };
                await _domains.AddAsync(domain);
            }

            // Skills
            foreach (var s in seed.Skills)
            {
                var skill = await _skills.GetByKeyAsync(s.Key);
                if (skill == null)
                {
                    skill = new CraftSkill
                    {
                        CraftDomainId = domain.Id,
                        Key = s.Key,
                        Name = s.Name,
                        Description = s.Desc
                    };
                    await _skills.AddAsync(skill);
                }
            }

            // Principles
            foreach (var p in seed.Principles)
            {
                var exists = await _principles.ExistsAsync(domain.Id, p.Title);
                if (!exists)
                {
                    var principle = new CraftPrinciple
                    {
                        CraftDomainId = domain.Id,
                        Title = p.Title,
                        Body = p.Body,
                        Kind = p.Kind,
                        Importance = p.Importance,
                        Embedding = await _embed.EmbedAsync($"{p.Title}. {p.Body}")
                    };
                    await _principles.AddAsync(principle);
                }
            }
        }

        _logger.LogInformation("Craft domains seeded");
    }
}