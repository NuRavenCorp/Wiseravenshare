using WiseRavenShare.Server.Core.Entities.Craft;
using Microsoft.EntityFrameworkCore;

namespace WiseRavenShare.Server.Application.Services.Craft;

public static class CraftDomainSeeder
{
    public static async Task SeedAsync(IServiceProvider serviceProvider)
    {
        using var scope = serviceProvider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<Wiseravenshare.Server.Infrastructure.Data.AppDbContext>();

        if (await context.CraftDomains.AnyAsync())
            return;

        var domains = new List<CraftDomain>();

        // Domain 1: Content Creation
        var contentCreationDomain = new CraftDomain
        {
            Id = Guid.NewGuid(),
            Key = "content_creation",
            Name = "Content Creation",
            Description = "Ideation, hooks, formats, pacing, CTAs, distribution, and iteration for any content type.",
            IconEmoji = "✨",
            SortOrder = 1,
            IsActive = true
        };
        domains.Add(contentCreationDomain);

        // Domain 2: Journalism
        var journalismDomain = new CraftDomain
        {
            Id = Guid.NewGuid(),
            Key = "journalism",
            Name = "Journalism",
            Description = "Reporting, sourcing, verification, structure, ethics, and clarity of public-interest writing.",
            IconEmoji = "📰",
            SortOrder = 2,
            IsActive = true
        };
        domains.Add(journalismDomain);

        // Domain 3: Radio
        var radioDomain = new CraftDomain
        {
            Id = Guid.NewGuid(),
            Key = "radio",
            Name = "Radio",
            Description = "Live broadcasting, voice work, pacing, segues, listener callouts, and legal compliance.",
            IconEmoji = "📻",
            SortOrder = 3,
            IsActive = true
        };
        domains.Add(radioDomain);

        // Domain 4: Podcast
        var podcastDomain = new CraftDomain
        {
            Id = Guid.NewGuid(),
            Key = "podcast",
            Name = "Podcasting",
            Description = "Episode structure, interview craft, sound design, narrative arcs, and audience retention.",
            IconEmoji = "🎙️",
            SortOrder = 4,
            IsActive = true
        };
        domains.Add(podcastDomain);

        // Domain 5: Videography
        var videographyDomain = new CraftDomain
        {
            Id = Guid.NewGuid(),
            Key = "videography",
            Name = "Videography",
            Description = "Shot composition, editing rhythm, color, sound, story, and platform-native delivery.",
            IconEmoji = "🎬",
            SortOrder = 5,
            IsActive = true
        };
        domains.Add(videographyDomain);

        // Domain 6: Writing
        var writingDomain = new CraftDomain
        {
            Id = Guid.NewGuid(),
            Key = "writing",
            Name = "Writing",
            Description = "Clarity, rhythm, structure, voice, and revision for essays, articles, and books.",
            IconEmoji = "✍️",
            SortOrder = 6,
            IsActive = true
        };
        domains.Add(writingDomain);

        // Domain 7: Photography
        var photographyDomain = new CraftDomain
        {
            Id = Guid.NewGuid(),
            Key = "photography",
            Name = "Photography",
            Description = "Light, composition, moment, color theory, post-processing, and storytelling through images.",
            IconEmoji = "📷",
            SortOrder = 7,
            IsActive = true
        };
        domains.Add(photographyDomain);

        // Domain 8: Music Production
        var musicProductionDomain = new CraftDomain
        {
            Id = Guid.NewGuid(),
            Key = "music_production",
            Name = "Music Production",
            Description = "Sound design, mixing, arrangement, production techniques, and modern studio workflow.",
            IconEmoji = "🎵",
            SortOrder = 8,
            IsActive = true
        };
        domains.Add(musicProductionDomain);

        // Domain 9: Community Building
        var communityBuildingDomain = new CraftDomain
        {
            Id = Guid.NewGuid(),
            Key = "community_building",
            Name = "Community Building",
            Description = "Engagement, moderation, culture, inclusivity, and sustainable community governance.",
            IconEmoji = "🤝",
            SortOrder = 9,
            IsActive = true
        };
        domains.Add(communityBuildingDomain);

        // Add domains first
        context.CraftDomains.AddRange(domains);
        await context.SaveChangesAsync();

        // Add principles for each domain
        var principles = GeneratePrinciples(domains);
        context.CraftPrinciples.AddRange(principles);

        // Add skills for each domain
        var skills = GenerateSkills(domains);
        context.CraftSkills.AddRange(skills);

        await context.SaveChangesAsync();
    }

    private static List<CraftPrinciple> GeneratePrinciples(List<CraftDomain> domains)
    {
        var contentCreation = domains.First(d => d.Key == "content_creation");
        var journalism = domains.First(d => d.Key == "journalism");
        var radio = domains.First(d => d.Key == "radio");
        var podcast = domains.First(d => d.Key == "podcast");
        var videography = domains.First(d => d.Key == "videography");
        var writing = domains.First(d => d.Key == "writing");
        var photography = domains.First(d => d.Key == "photography");
        var musicProduction = domains.First(d => d.Key == "music_production");
        var communityBuilding = domains.First(d => d.Key == "community_building");

        var principles = new List<CraftPrinciple>();

        // Content Creation Principles
        principles.AddRange(new[]
        {
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = contentCreation.Id, Title = "Specificity beats generality", Description = "Concrete nouns, numbers, and names outperform abstractions.", Example = "❌ 'It was popular' ✓ '500K views in 48 hours'", Kind = PrincipleKind.Rule, Importance = 90 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = contentCreation.Id, Title = "Show, don't tell", Description = "Replace adjectives with scenes the audience can feel.", Example = "❌ 'She was sad.' ✓ 'Tears ran down her cheeks.'", Kind = PrincipleKind.Rule, Importance = 85 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = contentCreation.Id, Title = "One idea per piece", Description = "If you can't summarize in one sentence, split it.", Example = "One article = ONE deep question answered", Kind = PrincipleKind.Rule, Importance = 80 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = contentCreation.Id, Title = "Edit until it hurts", Description = "Every sentence must earn its place.", Example = "Professional writers remove 30-50% of first draft.", Kind = PrincipleKind.BestPractice, Importance = 75 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = contentCreation.Id, Title = "Ship, measure, iterate", Description = "Velocity plus feedback beats perfection.", Example = "10 imperfect pieces > 1 perfect piece", Kind = PrincipleKind.Heuristic, Importance = 85 },
        });

        // Journalism Principles
        principles.AddRange(new[]
        {
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = journalism.Id, Title = "Two sources, minimum", Description = "Every claim needs corroboration.", Example = "Always get comment from accused party.", Kind = PrincipleKind.Rule, Importance = 95 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = journalism.Id, Title = "Follow the money", Description = "Funding and incentives often explain the story.", Example = "Who benefits? Who loses?", Kind = PrincipleKind.Heuristic, Importance = 80 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = journalism.Id, Title = "Lede structure", Description = "Answer Who, What, When, Where, Why in first 1-2 sentences.", Example = "✓ 'City approved 25% tax increase, affecting 150K homeowners.'", Kind = PrincipleKind.Rule, Importance = 90 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = journalism.Id, Title = "Show your work", Description = "Be transparent about sources and methods.", Example = "Disclose: 'Based on 12 interviews, 50 documents.'", Kind = PrincipleKind.BestPractice, Importance = 75 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = journalism.Id, Title = "Right of reply", Description = "Give subjects chance to respond before publishing.", Example = "Document that opportunity was offered.", Kind = PrincipleKind.Rule, Importance = 85 },
        });

        // Radio Principles
        principles.AddRange(new[]
        {
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = radio.Id, Title = "Dead air is a sin", Description = "Every second must be produced.", Example = "2+ seconds of silence feels like eternity.", Kind = PrincipleKind.Rule, Importance = 80 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = radio.Id, Title = "Speak to one listener", Description = "Never broadcast to the crowd.", Example = "Use 'you' and 'I', not 'listeners' and 'we all'.", Kind = PrincipleKind.Rule, Importance = 85 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = radio.Id, Title = "Respect the music", Description = "Don't talk over the hook or melody.", Example = "Silence after drop lets listeners soak it in.", Kind = PrincipleKind.BestPractice, Importance = 75 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = radio.Id, Title = "Daypart awareness", Description = "Adjust energy to listener context.", Example = "Morning: energetic; Evening: mellow", Kind = PrincipleKind.Heuristic, Importance = 70 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = radio.Id, Title = "Log everything", Description = "Royalty compliance: log every song.", Example = "Even 3-second drops must be logged.", Kind = PrincipleKind.Rule, Importance = 90 },
        });

        // Podcast Principles
        principles.AddRange(new[]
        {
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = podcast.Id, Title = "First 60 seconds decide everything", Description = "Pre-plan cold open as carefully as interview.", Example = "Hook in 10s, promise in 30s, then deliver.", Kind = PrincipleKind.Rule, Importance = 90 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = podcast.Id, Title = "Ask the second question", Description = "Follow-up is where real answer lives.", Example = "First answer is surface-level; dig deeper.", Kind = PrincipleKind.Heuristic, Importance = 85 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = podcast.Id, Title = "Edit for the ear", Description = "Read aloud before shipping.", Example = "Remove tongue twisters, clarify jargon.", Kind = PrincipleKind.Rule, Importance = 80 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = podcast.Id, Title = "Silence is a tool", Description = "2s of silence after big point lets it land.", Example = "Don't fill every gap.", Kind = PrincipleKind.BestPractice, Importance = 70 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = podcast.Id, Title = "Every episode needs a thesis", Description = "State what episode teaches in one sentence.", Example = "'How to build personal brand on social media'", Kind = PrincipleKind.Rule, Importance = 85 },
        });

        // Videography Principles
        principles.AddRange(new[]
        {
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = videography.Id, Title = "Cut on emotion, not action", Description = "Edit follows feeling, not choreography.", Example = "Cut to reaction BEFORE action. Build tension.", Kind = PrincipleKind.Rule, Importance = 85 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = videography.Id, Title = "Move camera with purpose", Description = "Every movement must serve the story.", Example = "Pan/zoom = distraction unless it reveals something.", Kind = PrincipleKind.Rule, Importance = 80 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = videography.Id, Title = "Sound is 50% of image", Description = "Audiences forgive bad picture, not bad audio.", Example = "Clear dialogue + good music > Beautiful shots + muffled sound", Kind = PrincipleKind.Heuristic, Importance = 90 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = videography.Id, Title = "Start with hook frame", Description = "First image must earn the second.", Example = "Show surprise, beauty, or intrigue.", Kind = PrincipleKind.Rule, Importance = 85 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = videography.Id, Title = "Every frame is a choice", Description = "Nothing on screen is accidental.", Example = "Color, lighting, composition = all reinforce story", Kind = PrincipleKind.BestPractice, Importance = 75 },
        });

        // Writing Principles
        principles.AddRange(new[]
        {
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = writing.Id, Title = "Cut 10% every pass", Description = "Every revision shrinks the piece.", Example = "1000 → 900 → 800 words", Kind = PrincipleKind.Rule, Importance = 80 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = writing.Id, Title = "Verbs do the work", Description = "Strong verbs carry prose. Adverbs apologize.", Example = "❌ 'quickly ran' ✓ 'sprinted' ❌ 'carefully placed' ✓ 'positioned'", Kind = PrincipleKind.Rule, Importance = 85 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = writing.Id, Title = "Read it aloud", Description = "Ear catches what eye misses.", Example = "Clunky sentences sound worse spoken.", Kind = PrincipleKind.BestPractice, Importance = 80 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = writing.Id, Title = "Kill your darlings", Description = "Favorite passages often don't serve piece.", Example = "If it confuses readers, it must go.", Kind = PrincipleKind.Rule, Importance = 80 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = writing.Id, Title = "Show, don't tell", Description = "Replace abstract description with imagery.", Example = "❌ 'She was angry.' ✓ 'Door slammed so hard windows shook.'", Kind = PrincipleKind.Rule, Importance = 85 },
        });

        // Photography Principles
        principles.AddRange(new[]
        {
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = photography.Id, Title = "Light is everything", Description = "Photography = art of capturing light.", Example = "Best camera + terrible light = mediocre photo", Kind = PrincipleKind.Rule, Importance = 95 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = photography.Id, Title = "Rule of thirds", Description = "Place subjects on grid intersections.", Example = "Subject eyes on upper third = stronger portrait", Kind = PrincipleKind.BestPractice, Importance = 75 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = photography.Id, Title = "Depth and layers", Description = "Foreground, midground, background create dimension.", Example = "Tree in foreground + mountain in background = 3D feel", Kind = PrincipleKind.BestPractice, Importance = 80 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = photography.Id, Title = "Color tells story", Description = "Color palette evokes emotion.", Example = "Warm = intimate; Cool = distant; Muted = melancholy", Kind = PrincipleKind.Heuristic, Importance = 75 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = photography.Id, Title = "Negative space matters", Description = "Empty space as important as subject.", Example = "Lone person in vast landscape = more powerful", Kind = PrincipleKind.BestPractice, Importance = 70 },
        });

        // Music Production Principles
        principles.AddRange(new[]
        {
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = musicProduction.Id, Title = "Mix on treated monitors", Description = "Acoustic environment determines mixes.", Example = "Untreated rooms lie about frequencies.", Kind = PrincipleKind.Rule, Importance = 90 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = musicProduction.Id, Title = "Compression is tone", Description = "Use compression to shape sound character.", Example = "Good compressor = drums punch or vocals sit right", Kind = PrincipleKind.Heuristic, Importance = 80 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = musicProduction.Id, Title = "Reference on multiple systems", Description = "Mix should translate: car, earbuds, club, headphones.", Example = "Don't mix only on headphones.", Kind = PrincipleKind.Rule, Importance = 85 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = musicProduction.Id, Title = "Arrangement is 50% of production", Description = "What plays when matters more than how polished.", Example = "Sparse, well-arranged > busy with perfect sound", Kind = PrincipleKind.BestPractice, Importance = 80 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = musicProduction.Id, Title = "Silence creates impact", Description = "Strategic silence makes moments hit harder.", Example = "Remove everything 2 bars before drop = anticipation", Kind = PrincipleKind.BestPractice, Importance = 75 },
        });

        // Community Building Principles
        principles.AddRange(new[]
        {
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = communityBuilding.Id, Title = "Culture beats rules", Description = "Shared values more powerful than policies.", Example = "Model culture you want.", Kind = PrincipleKind.Rule, Importance = 90 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = communityBuilding.Id, Title = "Elevate voices, not egos", Description = "Amplify others. Stay in background.", Example = "Celebrate members, not yourself.", Kind = PrincipleKind.BestPractice, Importance = 85 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = communityBuilding.Id, Title = "Moderation is invisible", Description = "Good moderation noticed only when missing.", Example = "Handle conflicts privately.", Kind = PrincipleKind.Heuristic, Importance = 80 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = communityBuilding.Id, Title = "Clear expectations prevent conflict", Description = "Share guidelines early. Ambiguity breeds resentment.", Example = "New members know rules before enforcement.", Kind = PrincipleKind.BestPractice, Importance = 85 },
            new CraftPrinciple { Id = Guid.NewGuid(), CraftDomainId = communityBuilding.Id, Title = "Consistency builds trust", Description = "Show up regularly. Presence matters.", Example = "Weekly check-in > monthly marathon", Kind = PrincipleKind.Rule, Importance = 80 },
        });

        return principles;
    }

    private static List<CraftSkill> GenerateSkills(List<CraftDomain> domains)
    {
        var contentCreation = domains.First(d => d.Key == "content_creation");
        var skills = new List<CraftSkill>();

        skills.AddRange(new[]
        {
            new CraftSkill { Id = Guid.NewGuid(), CraftDomainId = contentCreation.Id, Key = "hook_writing", Name = "Hook Writing", Description = "First-line and first-frame techniques.", Difficulty = SkillLevel.Intermediate, Weight = 100 },
            new CraftSkill { Id = Guid.NewGuid(), CraftDomainId = contentCreation.Id, Key = "idea_generation", Name = "Idea Generation", Description = "Turning observations into original angles.", Difficulty = SkillLevel.Intermediate, Weight = 80 },
            new CraftSkill { Id = Guid.NewGuid(), CraftDomainId = contentCreation.Id, Key = "format_selection", Name = "Format Selection", Description = "Matching idea to medium.", Difficulty = SkillLevel.Beginner, Weight = 70 },
            new CraftSkill { Id = Guid.NewGuid(), CraftDomainId = contentCreation.Id, Key = "call_to_action", Name = "Call to Action", Description = "Asking for next action.", Difficulty = SkillLevel.Intermediate, Weight = 60 },
            new CraftSkill { Id = Guid.NewGuid(), CraftDomainId = contentCreation.Id, Key = "iteration", Name = "Iteration", Description = "Learning from metrics to improve.", Difficulty = SkillLevel.Advanced, Weight = 90 },
        });

        return skills;
    }
}
