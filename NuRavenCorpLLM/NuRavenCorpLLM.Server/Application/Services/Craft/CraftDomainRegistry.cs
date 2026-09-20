// Application/Services/Craft/CraftDomainRegistry.cs
using NuRavenCorpLLM.Entities.Craft;

namespace NuRavenCorpLLM.Application.Services.Craft;

public static class CraftDomainRegistry
{
    public static readonly CraftDomainSeed[] Domains = new[]
    {
        new CraftDomainSeed(
            Key: "content_creation",
            Name: "Content Creation",
            Description: "Ideation, hooks, formats, pacing, CTAs, distribution, and iteration for any content type.",
            Icon: "✨",
            Skills: new[]
            {
                ("hook_writing", "Hook Writing", "First-line and first-frame techniques that stop the scroll."),
                ("idea_generation", "Idea Generation", "Turning observations into original angles."),
                ("format_selection", "Format Selection", "Matching idea to medium: listicle, essay, series, short, long."),
                ("call_to_action", "Call to Action", "Asking for the next action without breaking trust."),
                ("iteration", "Iteration", "Learning from metrics to make the next piece better.")
            },
            Principles: new[]
            {
                ("Specificity beats generality", "Concrete nouns, numbers, and names outperform abstractions.", PrincipleKind.Rule, 90),
                ("Show, don't tell", "Replace adjectives with scenes the audience can feel.", PrincipleKind.Rule, 85),
                ("One idea per piece", "If you can't say it in one sentence, split it.", PrincipleKind.Rule, 80),
                ("Edit until it hurts", "If a sentence doesn't earn its place, cut it.", PrincipleKind.BestPractice, 75),
                ("Ship, measure, iterate", "Velocity plus feedback beats perfection.", PrincipleKind.Heuristic, 85)
            }),

        new CraftDomainSeed(
            Key: "journalism",
            Name: "Journalism",
            Description: "Reporting, sourcing, verification, structure, ethics, and clarity of public-interest writing.",
            Icon: "📰",
            Skills: new[]
            {
                ("lede_writing", "Lede Writing", "The opening sentence that carries the story."),
                ("sourcing", "Sourcing", "On-record, primary, document-based, and multi-source reporting."),
                ("verification", "Verification", "Corroboration, chain of custody, and red-flag detection."),
                ("inverted_pyramid", "Inverted Pyramid", "Most important facts first, then descending importance."),
                ("interview_technique", "Interview Technique", "Question craft, follow-ups, silence, tone."),
                ("ethics", "Ethics", "Fairness, harm reduction, conflicts, right-of-reply, transparency.")
            },
            Principles: new[]
            {
                ("Two sources, minimum", "Every claim needs corroboration unless it is direct observation.", PrincipleKind.Rule, 95),
                ("Follow the money", "Funding, ownership, and incentives often explain the story.", PrincipleKind.Heuristic, 80),
                ("If your mother says she loves you, check it out", "Attributed to Chicago newsrooms — verify even the obvious.", PrincipleKind.Quote, 90),
                ("Report the void", "The absence of information is itself a story.", PrincipleKind.Rule, 70),
                ("Never burn the source", "Protection of sources is non-negotiable.", PrincipleKind.Rule, 100),
                ("Show your work", "Transparency of method builds trust.", PrincipleKind.BestPractice, 75)
            }),

        new CraftDomainSeed(
            Key: "radio",
            Name: "Radio",
            Description: "Live broadcasting, voice work, pacing, segues, listener callouts, and legal compliance.",
            Icon: "📻",
            Skills: new[]
            {
                ("voice_presence", "Voice Presence", "Breath control, proximity, warmth, energy over long sets."),
                ("talkup", "Talk-Up", "Talking over the intro or outro without stepping on the vocal."),
                ("segue_craft", "Segue Craft", "Musical or verbal bridges between tracks or segments."),
                ("listener_callouts", "Listener Callouts", "Naming listeners, cities, requests without breaking flow."),
                ("daypart_awareness", "Daypart Awareness", "Adjusting energy and content to the hour.")
            },
            Principles: new[]
            {
                ("Dead air is a lie", "Silence on air needs purpose. Every second is produced.", PrincipleKind.Rule, 80),
                ("Know the story behind every track", "Backstory earns attention.", PrincipleKind.Heuristic, 70),
                ("Speak to one listener", "Never the crowd.", PrincipleKind.Rule, 85),
                ("Respect the music", "Do not talk over the hook.", PrincipleKind.BestPractice, 75),
                ("Log everything", "Royalty compliance is the price of airplay.", PrincipleKind.Rule, 90)
            }),

        new CraftDomainSeed(
            Key: "podcast",
            Name: "Podcasting",
            Description: "Episode structure, interview craft, sound design, narrative arcs, and audience retention.",
            Icon: "🎙️",
            Skills: new[]
            {
                ("cold_open", "Cold Open", "Opening 30–90 seconds that promises a reason to stay."),
                ("interview_arc", "Interview Arc", "Building a conversation toward a payoff."),
                ("sound_design", "Sound Design", "Music, ambience, silence as storytelling tools."),
                ("episode_structure", "Episode Structure", "Acts, transitions, recaps, calls to action."),
                ("retention_craft", "Retention Craft", "Hooks every few minutes to prevent drop-off.")
            },
            Principles: new[]
            {
                ("The first 60 seconds decide everything", "Pre-plan the cold open as carefully as the interview.", PrincipleKind.Rule, 90),
                ("Edit for the ear, not the page", "Read every line aloud before shipping.", PrincipleKind.Rule, 80),
                ("Ask the second question", "The follow-up is where the real answer lives.", PrincipleKind.Heuristic, 85),
                ("Silence is a tool", "Two seconds of silence after a big answer.", PrincipleKind.BestPractice, 70),
                ("Every episode needs a thesis", "If you can't say it in one sentence, you're not ready.", PrincipleKind.Rule, 85)
            }),

        new CraftDomainSeed(
            Key: "videography",
            Name: "Videography",
            Description: "Shot composition, editing rhythm, color, sound, story, and platform-native delivery.",
            Icon: "🎬",
            Skills: new[]
            {
                ("shot_composition", "Shot Composition", "Rule of thirds, leading lines, depth, negative space."),
                ("editing_rhythm", "Editing Rhythm", "Cutting to music, tension, and story beats."),
                ("story_structure", "Story Structure", "Beginning, turn, payoff in video form."),
                ("color_grading", "Color Grading", "Mood through palette and contrast."),
                ("sound_design", "Sound Design", "Diegetic, non-diegetic, and mix balance.")
            },
            Principles: new[]
            {
                ("Cut on emotion, not on action", "The edit should follow feeling, not choreography.", PrincipleKind.Rule, 85),
                ("Move the camera with purpose", "Any movement must serve the story.", PrincipleKind.Rule, 80),
                ("Sound is 50% of the image", "An audience forgives bad picture, not bad audio.", PrincipleKind.Heuristic, 90),
                ("Start with a hook frame", "First image must earn the second.", PrincipleKind.Rule, 85),
                ("Every frame is a choice", "Nothing on screen is accidental in a great film.", PrincipleKind.BestPractice, 75)
            }),

        new CraftDomainSeed(
            Key: "writing",
            Name: "Writing",
            Description: "Clarity, rhythm, structure, voice, and revision for essays, articles, and books.",
            Icon: "✍️",
            Skills: new[]
            {
                ("clarity", "Clarity", "Sentence-level readability and precision."),
                ("voice", "Voice", "Consistent and recognizable style."),
                ("structure", "Structure", "Arc, rhythm, and pacing of the whole piece."),
                ("revision", "Revision", "Cuts, compression, and improvement passes."),
                ("research", "Research", "Primary sources and original thinking.")
            },
            Principles: new[]
            {
                ("Cut 10% every pass", "Every revision shrinks the piece.", PrincipleKind.Rule, 80),
                ("Write drunk, edit sober", "Attributed to Hemingway — create then critique.", PrincipleKind.Quote, 75),
                ("Verbs do the work", "Strong verbs carry prose. Adverbs apologize for them.", PrincipleKind.Rule, 85),
                ("Read it aloud", "The ear catches what the eye misses.", PrincipleKind.BestPractice, 80),
                ("Kill your darlings", "Favorites often don't serve the piece.", PrincipleKind.Rule, 80)
            }),

        new CraftDomainSeed(
            Key: "photography",
            Name: "Photography",
            Description: "Light, composition, moment, storytelling, and post-processing discipline.",
            Icon: "📷",
            Skills: new[]
            {
                ("light_reading", "Reading Light", "Direction, quality, color temperature."),
                ("composition", "Composition", "Framing, balance, tension, negative space."),
                ("moment", "The Moment", "Anticipation and shutter discipline."),
                ("story_frame", "Story in One Frame", "Narrative density in a single image."),
                ("post_processing", "Post-Processing", "Restraint, tone, and local vs global edits.")
            },
            Principles: new[]
            {
                ("Chase the light, not the subject", "Great light makes ordinary subjects extraordinary.", PrincipleKind.Heuristic, 80),
                ("Get closer", "Capà's rule — the subject is almost always closer than you think.", PrincipleKind.Quote, 85),
                ("Composition is subtraction", "Remove until only the essential remains.", PrincipleKind.Rule, 80),
                ("Anticipate, don't react", "The great frame is often ½ second before the action.", PrincipleKind.BestPractice, 75),
                ("Edit like a chef, not a painter", "Season. Don't repaint.", PrincipleKind.Heuristic, 70)
            }),

        new CraftDomainSeed(
            Key: "music_production",
            Name: "Music Production",
            Description: "Arrangement, mixing, mastering, sound design, and emotional shape.",
            Icon: "🎵",
            Skills: new[]
            {
                ("arrangement", "Arrangement", "Space, layering, and dynamic arc."),
                ("mixing", "Mixing", "Balance, EQ, compression, depth."),
                ("mastering", "Mastering", "Loudness, tone, translation across systems."),
                ("sound_design", "Sound Design", "Synth, sample, texture, character."),
                ("emotion", "Emotional Shape", "Tension, release, and the journey.")
            },
            Principles: new[]
            {
                ("Mixing is subtraction", "Cut frequencies you don't need. Don't boost what you do.", PrincipleKind.Heuristic, 80),
                ("Reference everything", "A/B against pro tracks on every device.", PrincipleKind.Rule, 85),
                ("The low end is 80% of the mix", "Kick, bass, and their relationship decide the record.", PrincipleKind.Heuristic, 75),
                ("Arrangement solves mixing problems", "If it's not working, take something out.", PrincipleKind.Rule, 80),
                ("Serve the song, not the stems", "The mix exists for the listener.", PrincipleKind.BestPractice, 85)
            }),

        new CraftDomainSeed(
            Key: "community",
            Name: "Community Building",
            Description: "Culture, rituals, moderation, onboarding, and shared identity.",
            Icon: "🤝",
            Skills: new[]
            {
                ("ritual_design", "Ritual Design", "Recurring moments that become identity."),
                ("onboarding", "Onboarding", "First 24 hours, first win, first connection."),
                ("moderation", "Moderation", "Norms, enforcement, and repair."),
                ("evangelism", "Evangelism", "Turning members into advocates."),
                ("governance", "Governance", "Decisions, transparency, evolution.")
            },
            Principles: new[]
            {
                ("Culture is what you celebrate and what you tolerate", "Every community teaches itself what matters.", PrincipleKind.Rule, 90),
                ("Design for the 1% and the 99%", "Core contributors and lurkers need different paths.", PrincipleKind.Heuristic, 75),
                ("First win within 24 hours", "New members must succeed fast.", PrincipleKind.Rule, 85),
                ("Rituals over rules", "Repeated moments create culture faster than documents.", PrincipleKind.Rule, 80),
                ("Moderation is product design", "Norms are features, not policy.", PrincipleKind.BestPractice, 85)
            })
    };

    public record CraftDomainSeed(string Key, string Name, string Description, string Icon,
        (string Key, string Name, string Desc)[] Skills,
        (string Title, string Body, PrincipleKind Kind, int Importance)[] Principles);
}