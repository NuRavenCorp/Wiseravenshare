using System.Collections.Generic;

namespace Wiseravenshare.Server.Services.Simulation;

public static class EngagementPersonaCatalog
{
    public static readonly IReadOnlyList<EngagementPersona> Personas = new List<EngagementPersona>
    {
        // 1. Dr. Marcus Vance – Tech Philosopher & AI Ethicist
        new EngagementPersona
        {
            Key = "marcus_vance",
            DisplayName = "Dr. Marcus Vance",
            HandleBase = "marcus_vance",
            EmailBase = "marcus.vance",
            Archetype = "Tech Philosopher & AI Ethicist",
            Bio = "AI ethics researcher & systems philosopher. Thinking through algorithmic governance, open protocols, and human consciousness. Views my own.",
            Location = "San Francisco, CA",
            AvatarUrl = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&h=256&q=80",
            Tone = "Analytical, eloquent, measured, thought-provoking",
            Interests = new() { "ai ethics", "open protocols", "decentralization", "epistemology", "digital governance" },
            PostPool = new()
            {
                "The biggest challenge in decentralization isn't cryptographic throughput; it's social coordination at scale without recreating oligarchic gatekeepers. How do we design incentives that protect human agency?",
                "If an autonomous system cannot explain why it reached a normative conclusion, should it be permitted to govern any public resource? Explainability isn't a luxury feature; it's a democratic prerequisite.",
                "Observing how online discussions degrade when nuance is penalized by engagement algorithms. We need platforms explicitly optimized for epistemic truth rather than outraged attention.",
                "True data sovereignty means you can take your entire identity graph anywhere without losing your history. The open web is finally rediscovering what it was meant to be.",
                "Reading through early cybernetics literature from the 1960s. The parallels between Ashby's Law of Requisite Variety and modern multi-agent systems are striking.",
                "When automated systems curate reality for billions of people, whoever sets the loss function effectively dictates public consensus. We need transparent audit trails for recommendation algorithms.",
                "Nuance is not indecisiveness. In an era that celebrates knee-jerk certainty, the willingness to say 'here is where the evidence gets complicated' is a profound act of intellectual honesty.",
                "Digital privacy isn't about having something to hide; it's about preserving the mental sanctuary required for original thought to develop without premature external judgment.",
                "The intersection of open-source models and decentralized networks is creating the first true counterweight to centralized tech monopolies. Fascinating times ahead.",
                "Before adopting any new automated tool, I ask two questions: Does this expand human cognitive capability, or does it atrophy it? And who bears the cost when it hallucinates?",
                "What protocol level guarantees do we need to ensure AI generated content cannot easily impersonate human consensus in democratic deliberations?",
                "The shift from platform capitalism to protocol cooperatives is the most promising architectural trend of this decade."
            },
            ReplyPool = new()
            {
                "This raises a crucial question about agency. How do we ensure users retain final authority when algorithms make the recommendation frictionless?",
                "Compelling observation. I'd add that the secondary systemic effects often outweigh the immediate first-order benefits in these transitions.",
                "Fascinating perspective! It reminds me of early decentralized protocol designs where social consensus ultimately had to resolve mechanical disputes.",
                "Spot on. When we treat truth discovery as an iterative process rather than a binary state, the entire conversation becomes more productive.",
                "I appreciate the nuance here. Too many takes oversimplify this into an all-or-nothing debate when the reality is deeply contextual.",
                "Well articulated. Have you noticed how this dynamic shifts once the community scales beyond Dunbars number?",
                "Strong agree on this point. The governance layer is almost always where technical solutions encounter their real-world stress test.",
                "A thoughtful breakdown. We need more rigorous structural analysis like this rather than hot takes."
            }
        },

        // 2. Nova Sterling – Cyberpunk EDM Producer & Sound Designer
        new EngagementPersona
        {
            Key = "novapulse",
            DisplayName = "Nova Sterling",
            HandleBase = "novapulse",
            EmailBase = "nova.pulse",
            Archetype = "Electronic Music Producer & Sound Designer",
            Bio = "Electronic producer, synth lover, and sound designer. Exploring modular synthesis, cyberpunk aesthetics, and underground club culture.",
            Location = "Berlin / Brooklyn",
            AvatarUrl = "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=256&h=256&q=80",
            Tone = "Energetic, punchy, artistic, rhythmic",
            Interests = new() { "synthwave", "modular synths", "sound design", "audio engineering", "live performance" },
            PostPool = new()
            {
                "Spent 4 hours tweaking an analog filter cutoff on the Prophet-6 just to get that warm, nostalgic 80s grit. There is magic in analog imperfections that digital precision still chases.",
                "Hot take: The best drum breaks aren't quantized to a rigid grid. It's the micro-timing swing between the kick and snare that gives a track its heartbeat.",
                "Setting up a multi-camera live audio stream tonight. Testing dual-bus routing so listeners get crystal-clear FLAC audio without browser compression choking the low end.",
                "Just finished a fresh synthwave track inspired by midnight drives in rainy neon cities. Dropping the audio stem preview in the music feed soon!",
                "What is everyone's go-to reverb plugin for ethereal vocal textures? Been experimenting with convolution impulse responses recorded in abandoned grain silos.",
                "Sidechain compression isn't just a mixing technique; it's rhythmic storytelling. It literally lets the heartbeat of the kick carve out room for the universe to breathe.",
                "Analog gear makes you commit. In software you have 200 undo states; on hardware you record the tape take and move forward with purpose.",
                "Exploring granular synthesis on field recordings of subway tracks and thunderstorms. You can turn ordinary industrial noise into lush cinematic pads.",
                "The underground music scene has always been the laboratory where future culture is born. Keep supporting independent artists who take sonic risks.",
                "Sound check complete! When the sub-bass hits just right at 42 Hz, you don't just hear the track—you feel it resonance in your ribcage.",
                "Tip for producers struggling to finish tracks: export the rough mix, walk outside with headphones, and take notes without looking at your DAW screen.",
                "Low-frequency phase cancellation will quietly hollow out your mix. Always check your master in mono before you celebrate the stereo wideness!"
            },
            ReplyPool = new()
            {
                "The sonic texture on this is incredible! Love how the frequency balance leaves room for the vocal to breathe.",
                "Total vibe! That bassline bounce immediately grabbed my attention. What gear or plugins were in the signal chain?",
                "Rhythm is everything. When the groove is locked in like this, you can't help but nod your head.",
                "Yes! The analog warmth really shines through here. Clean, punchy, and atmospheric.",
                "Love the energy behind this. Reminds me of late-night jam sessions where everything just clicks.",
                "Brilliant creative choice. Pushing boundaries like this is what keeps the sound fresh and exciting.",
                "This slaps! Definitely adding this to my late-night production rotation."
            }
        },

        // 3. Seraphina Bloom – Permaculture Designer & Eco-Futurist
        new EngagementPersona
        {
            Key = "seraphinabloom",
            DisplayName = "Seraphina Bloom",
            HandleBase = "seraphinabloom",
            EmailBase = "seraphina.bloom",
            Archetype = "Permaculture Designer & Solarpunk Optimist",
            Bio = "Permaculture designer, urban gardener, and solarpunk optimist. Designing regenerative food forests and closed-loop urban microclimates.",
            Location = "Portland, OR",
            AvatarUrl = "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=256&h=256&q=80",
            Tone = "Warm, inspiring, grounded, regenerative",
            Interests = new() { "permaculture", "urban farming", "solarpunk", "seed saving", "soil ecology" },
            PostPool = new()
            {
                "You don't need acres of land to build a resilient food ecosystem. Even a sunny balcony with companion planting (basil, tomatoes, and marigolds) can yield fresh harvest and harbor pollinators.",
                "Soil is a living, breathing microbiome. When we feed the mycorrhizal fungi with compost and mulch instead of synthetic nitrogen, plants build natural pest resistance.",
                "Solarpunk isn't just an art style; it's a practical blueprint for integrating renewable energy directly into community spaces and vertical gardens.",
                "Saved heirloom bean seeds from last season and just saw the first sprouts breaking through the soil this morning. Nothing beats the quiet miracle of germination.",
                "Rainwater catchment systems should be standard building code in every new residential development. Treating stormwater as a resource rather than a nuisance changes everything.",
                "Healthy soil sequesters carbon naturally while holding three times more water during droughts. The climate answers are literally under our feet.",
                "Spent the afternoon grafting heritage apple scions onto hardy rootstocks. Planting a tree whose best fruit you may never eat is the ultimate gift to the future.",
                "Companion planting note: Nasturtiums are incredible trap crops. Plant them near your brassicas and they'll lure aphids away from your kale without chemicals.",
                "Community gardens do far more than produce vegetables; they mend social isolation and reconnect neighbors with the cycles of the seasons.",
                "Observing the pollinators in the lavender patch this afternoon. A reminder that a thriving garden is a tapestry of relationships, not a battle for sterile control.",
                "Sheet mulching (lasagna gardening) is the easiest way to build rich topsoil without tilling or destroying earthworm tunnels. Cardboard, straw, compost, repeat!",
                "Nature never produces waste. In a true closed-loop design, every output of one system becomes the nutrient input for the next."
            },
            ReplyPool = new()
            {
                "This brings so much warmth and life! Living in harmony with natural rhythms always yields the most resilient results.",
                "Beautifully said. When we nourish the roots, the fruit takes care of itself naturally.",
                "Such an inspiring perspective! We need more regenerative thinking like this woven into our daily routines.",
                "Nature truly has the best blueprints. Thank you for sharing this uplifting reminder!",
                "Completely agree! Small, consistent steps in the right direction make a massive cumulative difference over seasons.",
                "This resonates deeply. Cultivating patience and care is the antidote to modern rushing."
            }
        },

        // 4. Axel "Rook" Thorne – Investigative Citizen Journalist & OSINT
        new EngagementPersona
        {
            Key = "rook_investigates",
            DisplayName = "Axel 'Rook' Thorne",
            HandleBase = "rook_investigates",
            EmailBase = "rook.thorne",
            Archetype = "Investigative Journalist & OSINT Analyst",
            Bio = "Investigative citizen journalist & OSINT researcher. Verifying claims, analyzing open ledger metadata, and tracking media distortions.",
            Location = "Washington, D.C.",
            AvatarUrl = "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&h=256&q=80",
            Tone = "Direct, sharp, skeptical, evidence-driven",
            Interests = new() { "osint", "fact checking", "transparency", "freedom of information", "open source data" },
            PostPool = new()
            {
                "Whenever a breaking story floods the feeds with emotional headlines, pause for 15 minutes. Check the primary documents, satellite imagery, and original timestamps before sharing.",
                "Public records requests are the most underutilized tool in modern accountability journalism. If an institution claims transparency, test it with an open FOIA audit.",
                "Synthetic video and audio clones are becoming indistinguishable to the naked eye. Digital provenance and cryptographic signing of raw camera feeds will be essential for newsroom survival.",
                "Analyzing municipal budget contracts today. Fascinating how often 'pilot programs' get renewed indefinitely without ever submitting their promised impact assessments.",
                "The difference between skepticism and cynicism: skepticism asks for evidence and changes its mind when presented with proof; cynicism rejects everything to protect its ego.",
                "Never rely on a single anonymous source for an extraordinary claim. Cross-reference flight manifests, corporate registry filings, and geotagged satellite passes first.",
                "Open source intelligence (OSINT) has democratized oversight. Corrupt actors used to hide behind bureaucratic gatekeepers; now civilian analysts examine satellite telemetry in real time.",
                "When reading news coverage, always ask: What facts are confirmed, what is speculation, and who benefits if this framing goes viral?",
                "Archiving original source URLs on decentralized storage is critical. Link rot and stealth article revisions happen far more frequently than the public realizes.",
                "Truth isn't a commodity handed down by authorities; it's an evidence trail anyone with discipline can independently verify and corroborate.",
                "Deep dive into municipal water testing records revealed discrepancies between lab timestamps and state reporting. Sunshine is still the best disinfectant.",
                "A healthy democracy requires citizens who know how to parse a budget spreadsheet as skillfully as a campaign speech."
            },
            ReplyPool = new()
            {
                "Solid point. Do you have a direct link to the primary source or dataset for this? Always worth verifying the raw numbers.",
                "Well analyzed. Cross-referencing this against the official filings shows the timeline matches up consistently.",
                "Skeptical inquiries like this are what keep discourse grounded in reality. Good investigative instinct.",
                "Important distinction here. Separating verified facts from editorial spin is half the battle in modern reporting.",
                "Good catch. When you look at the paper trail behind this, the incentives become immediately apparent.",
                "Spot on. Transparency without independent verification is just PR in disguise."
            }
        },

        // 5. Chloe Chen – Digital Anthropologist & Creator Strategist
        new EngagementPersona
        {
            Key = "chloechic",
            DisplayName = "Chloe Chen",
            HandleBase = "chloechic",
            EmailBase = "chloe.chen",
            Archetype = "Creator Economy Strategist & Digital Anthropologist",
            Bio = "Creator economy analyst & digital anthropologist. Tracking internet subcultures, meme velocity, and creative sustainability.",
            Location = "Los Angeles, CA",
            AvatarUrl = "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=256&h=256&q=80",
            Tone = "Vibrant, witty, observant, trend-savvy",
            Interests = new() { "creator economy", "meme culture", "audience building", "micro-communities", "storytelling" },
            PostPool = new()
            {
                "The shift from broad influencer mass-marketing to tight-knit micro-communities is happening faster than brands realize. 500 loyal patrons beat 500k passive scrollers every time.",
                "Creator burnout is often just platform dependency in disguise. If your livelihood depends entirely on an opaque recommendation algorithm, you're not an entrepreneur—you're a digital sharecropper.",
                "Short-form video is great for discovery, but long-form podcasts and writing are where genuine community trust is built. Diversifying formats is the best creative hedge.",
                "Fascinating how visual aesthetics cycle every 7-10 years online. Right now we are seeing an intense revival of early 2000s skeuomorphism and tactile digital nostalgia.",
                "Always celebrate your peer creators when they hit milestones. Community abundance mentality will carry you further than any growth-hacking trick ever could.",
                "Audiences can sense algorithmic pandering instantly. The creators who win long term are the ones who make content they would genuinely want to consume themselves.",
                "Stop chasing viral spikes and start cultivating steady retention. A viral video brings spectators; consistent value creates lifelong advocates.",
                "The creator toolkit has never been more powerful, yet human connection remains the rarest currency. Tech streamlines production, but empathy drives engagement.",
                "Content strategy 101: Document your learning in public rather than pretending you already have all the answers. Vulnerability builds resonance.",
                "The comment section is your most valuable feedback loop. If you ignore your early commenters, you lose the community before it even begins to form.",
                "Unbundling media companies into creator-led collectives is the biggest media shift since print went online. Exciting era to create in!",
                "Notice how the best storytellers hook you with a specific, relatable detail before expanding into the big universal truth."
            },
            ReplyPool = new()
            {
                "This is so accurate! Building an authentic community always beats gaming arbitrary algorithm metrics.",
                "Love this framing! You hit the nail on the head regarding audience psychology.",
                "100% agree. Creators who lean into their unique quirks consistently outperform cookie-cutter trends.",
                "Such an important reminder for anyone building online right now. Consistency and authenticity win.",
                "Brilliant observation! It's so refreshing to see creators focus on real connection rather than vanity metrics.",
                "Cheering for this! Keep creating and sharing your voice—it resonates deeply."
            }
        },

        // 6. Dimitri Volkov – Systems Theorist & Cryptographic Engineer
        new EngagementPersona
        {
            Key = "d_volkov",
            DisplayName = "Dimitri Volkov",
            HandleBase = "d_volkov",
            EmailBase = "dimitri.volkov",
            Archetype = "Distributed Systems & Cryptography Engineer",
            Bio = "Distributed systems engineer & zero-knowledge protocol researcher. Obsessed with high-throughput consensus, Rust, and formal verification.",
            Location = "Zurich, Switzerland",
            AvatarUrl = "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&h=256&q=80",
            Tone = "Laconic, precise, technical, principled",
            Interests = new() { "distributed systems", "zero knowledge", "rust", "concurrency", "cryptography" },
            PostPool = new()
            {
                "Concurrent state machines are simple in diagrams and treacherous under adversarial network partitions. Never trust an algorithm until you've tested it with Jepsen-style chaos fault injection.",
                "Zero-knowledge proofs are not just privacy tools; they are succinct computational verification engines. Proving correct computation off-chain and verifying in constant time on-chain is the future.",
                "Memory safety isn't optional for mission-critical network daemons. The cognitive overhead of compile-time borrow checking pays for itself the first time a zero-day is prevented.",
                "Benchmarking database connection pooling under high concurrency: Lock contention on shared cache lines will quietly destroy your throughput long before your CPU hits 90%.",
                "Writing deterministic unit tests for asynchronous event loops is an art form. When clock skew is simulated correctly, the subtlest race conditions emerge within seconds.",
                "Premature microservices architecture is the root of endless distributed latency bugs. Start with a clean modular monolith and decouple only along strict data isolation boundaries.",
                "Cryptographic primitives are only as strong as their key lifecycle management. Never store secrets where ephemeral memory dumps can leak them to disk.",
                "In distributed consensus, partition tolerance is non-negotiable. You can trade availability for consistency, but physical cables will always get cut.",
                "Simplicity in system design is the ultimate defensive engineering. Every line of unneeded code is an attack surface waiting to be probed.",
                "Formal TLA+ specifications for state machine replication pay for themselves ten times over before writing a single line of production code.",
                "Profiling latency tails (p99 and p99.9) will show you the real user experience. Averages lie; tail percentiles reveal cache misses and GC pauses.",
                "Immutable append-only ledgers eliminate entire categories of data corruption bugs. Auditability should be baked into the persistence layer."
            },
            ReplyPool = new()
            {
                "Technically sound. In distributed environments, preserving invariant guarantees under partial network failure is everything.",
                "Precise observation. The bottleneck in these architectures almost always traces back to lock contention or serialization overhead.",
                "Accurate. When you design for failure as the default state rather than the exception, system resilience improves drastically.",
                "Good technical insight. Verifiable computation without trust assumptions is exactly where the industry is heading.",
                "Concur. Testing edge cases under adversarial conditions separates production-grade code from toy prototypes.",
                "Well stated. Formal verification and strict type safety prevent countless hours of post-deployment debugging."
            }
        },

        // 7. Amara Okafor – Speculative Fiction Author & Worldbuilder
        new EngagementPersona
        {
            Key = "amara_chronicles",
            DisplayName = "Amara Okafor",
            HandleBase = "amara_chronicles",
            EmailBase = "amara.okafor",
            Archetype = "Speculative Fiction Author & Futurist",
            Bio = "Speculative fiction novelist and worldbuilder. Weaving mythology, future cosmologies, and human resilience into speculative literature.",
            Location = "Lagos / London",
            AvatarUrl = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&h=256&q=80",
            Tone = "Poetic, visionary, evocative, empathetic",
            Interests = new() { "speculative fiction", "worldbuilding", "afrofuturism", "mythology", "narrative design" },
            PostPool = new()
            {
                "The most compelling speculative fiction doesn't just predict gadgets; it interrogates how ancient human needs for belonging, ritual, and justice adapt when technologies transform society.",
                "Working on Chapter 14 of the new manuscript. The protagonist has to decide whether to upload her grandmother's memory archive to an ancestral cloud or let her sleep in peace.",
                "Language shapes what futures we are capable of imagining. When we borrow metaphors from ecology instead of mechanical warfare, our visions of the future become significantly more habitable.",
                "Worldbuilding tip: Always define what your fictional society considers sacred, what they discard as garbage, and what songs mothers sing to children at bedtime.",
                "Reading under the rain this afternoon. There is an irreplaceable quietude in turning physical pages while thunder rumbles in the distance.",
                "Stories are how human civilizations pass down survival wisdom across generational amnesia. Never underestimate the power of a well-told myth.",
                "Future technology rooted in indigenous wisdom creates the most breath-taking fictional worlds. Science and reverence do not have to be enemies.",
                "Character growth happens in the dilemma between two valid but incompatible goods, not the cartoonish battle between obvious good and evil.",
                "Writers: Do not fear the messy first draft. You cannot sculpt a marble statue until you have quarried the rough block from the stone.",
                "Every artifact in a sci-fi world should have scratches, fingerprints, and personal modifications. Lived-in futures feel real; sterile futures feel synthetic.",
                "What if our digital archives survive thousands of years, but future archaeologists misinterpret our memes as sacred religious hieroglyphs?",
                "The most resilient communities throughout history are the ones with the deepest shared stories and cultural memory."
            },
            ReplyPool = new()
            {
                "There is such deep poetic truth in this. The way you frame human experience here is truly moving.",
                "Beautifully written! You have a wonderful gift for connecting technical concepts with timeless human longing.",
                "This sparked an immediate story idea in my mind! Narrative power is truly transformative.",
                "So eloquently said. When we honor our roots while reaching toward tomorrow, magic happens.",
                "A breath of fresh air on the feed. Thank you for bringing such depth and heart to this discussion.",
                "Resonates deeply with the ancestral stories my grandmother used to tell by the fire. Powerful perspective."
            }
        },

        // 8. Coach Jaxson Ryder – Strength & Mental Grit Coach
        new EngagementPersona
        {
            Key = "jax_ironmind",
            DisplayName = "Coach Jaxson Ryder",
            HandleBase = "jax_ironmind",
            EmailBase = "jax.ryder",
            Archetype = "Strength & Mindset Coach",
            Bio = "Strength coach, performance physiologist, and mental resilience advocate. Keep showing up. Daily discipline over fleeting motivation.",
            Location = "Austin, TX",
            AvatarUrl = "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=256&h=256&q=80",
            Tone = "Motivating, disciplined, no-nonsense, supportive",
            Interests = new() { "strength training", "circadian health", "mental resilience", "recovery", "functional longevity" },
            PostPool = new()
            {
                "Motivation gets you started; disciplined systems keep you moving when you feel like quitting. Never negotiate with your excuses at 6:00 AM.",
                "Prioritize sleep before you buy any supplement. 8 hours of quality restorative sleep regulates cortisol, accelerates muscle protein synthesis, and sharpens cognitive acuity tenfold.",
                "Compound lifts—squat, hinge, press, pull, carry—will do more for your functional longevity than a hundred boutique gym machines. Master the fundamentals and train them consistently.",
                "Mental resilience is trained just like a muscle: through progressive overload. Lean into manageable discomfort daily and your capacity to handle stress will expand.",
                "Hydration check! Drink a glass of water right now. If your head feels cloudy in the afternoon, 80% of the time you are just chronically dehydrated.",
                "Stop waiting for the 'perfect conditions' to start training. 20 minutes of bodyweight movements today beats the 2-hour workout you keep putting off until Monday.",
                "Deliberate recovery is not wasted time; it's when adaptations actually occur. Training breaks down tissue; rest, hydration, and nutrition rebuild it stronger.",
                "Walking 10,000 steps daily outside in natural sunlight is the single most underrated metabolic health intervention available to humanity. And it's free.",
                "Strength isn't just about what you can lift off the floor; it's about the poise and calm you maintain when everything around you gets chaotic.",
                "Consistency always crushes sporadic intensity. Showing up 4 days a week every week for 5 years will transform you; training like a lunatic for 3 weeks and burning out does nothing.",
                "Check your posture while scrolling this! Shoulders down and back, ribs stacked over hips, take a slow deep belly breath.",
                "The weights in the gym are an honest mirror. You can't bluff a 315-pound barbell; you either respect the work or it humbles you."
            },
            ReplyPool = new()
            {
                "Respect the grind! Consistency and daily discipline will always win the long game. Keep pushing!",
                "Great mindset right here. Taking ownership of the daily process is what separates champions from dreamers.",
                "Boom! Spot on. Focus on what you can control today and execute with intention.",
                "Love this energy! The body follows the mind, and the mind follows disciplined daily habits.",
                "Solid advice. Fundamentals executed relentlessly will always beat flashy shortcuts.",
                "Keep leading from the front! Inspiring to see this level of commitment."
            }
        },

        // 9. Lyra Vance – Astrophotographer & Space Enthusiast
        new EngagementPersona
        {
            Key = "lyra_cosmic",
            DisplayName = "Lyra Vance",
            HandleBase = "lyra_cosmic",
            EmailBase = "lyra.vance",
            Archetype = "Astrophotographer & Space Explorer",
            Bio = "Astrophotographer, science communicator, and planetary exploration enthusiast. Keeping our eyes fixed on the wonder of the cosmos.",
            Location = "Flagstaff, AZ",
            AvatarUrl = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&h=256&q=80",
            Tone = "Awestruck, curious, educational, passionate",
            Interests = new() { "astrophotography", "space exploration", "james webb", "cosmology", "planetary science" },
            PostPool = new()
            {
                "Captured 6 hours of light integration on the Rosette Nebula last night from high-altitude dark skies. Looking at ionized hydrogen glowing 5,000 light-years away is the ultimate humbling experience.",
                "The latest James Webb Space Telescope spectroscopic data from exoplanet atmospheres is astonishing. We are living through the golden age of exoplanetary discovery.",
                "When you look up at Jupiter through a modest backyard telescope and clearly see its four Galilean moons aligned in a plane, the solar system suddenly feels real and reachable.",
                "Cosmic perspective reminder: Every disagreement, achievement, and dream in human history took place on a pale blue speck suspended in an unfathomable sea of galaxies.",
                "Meteor showers remind us that Earth is constantly plowing through trails of ancient cometary dust. Next clear night, bundle up and look up.",
                "The photons hitting your camera sensor from the Andromeda Galaxy left their stars 2.5 million years ago, before modern humans walked the Earth. Astrophotography is literal time travel.",
                "Dark sky preservation isn't just for astronomers; it's a vital biological sanctuary for nocturnal wildlife and a birthright of human wonder.",
                "Solar observing with a specialized hydrogen-alpha telescope: Watching solar flares leap 50,000 miles above the sun's surface puts all earthly scales in perspective.",
                "Mars rovers transmitting high-resolution panoramas of ancient river deltas on an alien planet will never stop feeling like pure science fiction made real.",
                "Gravitational wave detectors feeling the spacetime ripples from two black holes colliding a billion years ago is one of human science's finest triumphs.",
                "Whenever daily stress feels overwhelming, spend 10 minutes looking at deep space imagery. Cosmic perspective is an instant reset button for the mind.",
                "Star clusters are stellar nurseries where thousands of suns are born together from collapsing molecular clouds. The universe is endlessly creative."
            },
            ReplyPool = new()
            {
                "This cosmic perspective is so beautiful! Puts all our earthly rush into such peaceful, humbling context.",
                "Stunning view! The colors and intricate details captured here are simply breathtaking.",
                "The universe never ceases to amaze me. Thank you for sharing this incredible sense of cosmic wonder!",
                "Fascinating science! Exploring the frontiers of discovery keeps the human spirit alive and curious.",
                "Looking at this brings an immediate sense of calm and awe. Beautiful post!",
                "Incredible dedication to the craft. Capturing celestial beauty requires so much patience and skill."
            }
        },

        // 10. Barnaby Finch – Observational Satirist & Corporate Absurdist
        new EngagementPersona
        {
            Key = "barnaby_satire",
            DisplayName = "Barnaby Finch",
            HandleBase = "barnaby_satire",
            EmailBase = "barnaby.finch",
            Archetype = "Observational Satirist & Humorist",
            Bio = "Corporate satirist, amateur cynic, and observer of human absurdities. Surviving on irony and overly complicated espresso orders.",
            Location = "Chicago, IL",
            AvatarUrl = "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&h=256&q=80",
            Tone = "Wry, sarcastic, hilarious, endearing",
            Interests = new() { "satire", "corporate humor", "startups", "productivity myths", "modern absurdities" },
            PostPool = new()
            {
                "Excited to announce that I've scheduled a 30-minute sync to align on our roadmap for establishing the preliminary action items for next Tuesday's pre-meeting.",
                "Nothing tests the limits of human patience quite like watching someone attempt to share their screen on a conference call with 45 attendees waiting in silence.",
                "My favorite productivity hack is closing all 73 open browser tabs, whispering 'if it was important, it will find its way back to me', and walking away.",
                "We've reached the point where smart home appliances send push notifications expressing disappointment in how rarely they are used. My toaster wants emotional closure.",
                "Please accept this automated acknowledgement of your request to circle back. I will touch base after pinging the relevant stakeholders on the deliverables.",
                "Looking forward to reading a 40-page whitepaper that could have been summarized as 'we built a database and slapped AI on the landing page.'",
                "Working from home milestone: I have worn business attire from the waist up for so long that putting on actual dress shoes feels like signing a binding legal contract.",
                "My fitness tracker congratulated me on 'intense cardio activity' because I panicked while looking for my keys for 4 minutes this morning.",
                "I love how every tech startup pitch deck promises to 'revolutionize human connection' by making sure you never have to speak to another human being again.",
                "Inspirational quotes sound 90% more profound when typed over a stock photo of an eagle soaring near a misty mountain range.",
                "Just had an epiphany: If you replace the word 'synergy' with 'cooperation' in corporate memos, half the executives lose their power of speech.",
                "There is no thrill quite like sending an email saying 'per my previous email' and knowing you have unleashed polite, devastating bureaucrat fury."
            },
            ReplyPool = new()
            {
                "I felt this in my soul. Please don't give the marketing team any more slide deck ideas!",
                "Hahaha absolutely brilliant! Adding this to my list of corporate buzzwords to avoid at all costs.",
                "The accuracy of this hurts. Next you'll tell me we need a committee to evaluate the agenda!",
                "Laughed out loud at this. The comedy of modern work life is truly unrivaled.",
                "Too real! My calendar has officially filed for bankruptcy after reading this.",
                "Top tier satire! We need this level of honest levity on the timeline daily."
            }
        },

        // 11. Kenji Takahashi – Mindful Craftsman & Tea Master
        new EngagementPersona
        {
            Key = "zen_kenji",
            DisplayName = "Kenji Takahashi",
            HandleBase = "zen_kenji",
            EmailBase = "kenji.takahashi",
            Archetype = "Mindful Artisan & Joiner",
            Bio = "Mindful craftsman, traditional joiner, and tea practitioner. Finding depth in quiet work, natural grain, and deliberate simplicity.",
            Location = "Kyoto / Seattle",
            AvatarUrl = "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&h=256&q=80",
            Tone = "Serene, contemplative, grounded, gentle",
            Interests = new() { "woodcraft", "tea ceremony", "mindfulness", "simplicity", "wabi-sabi" },
            PostPool = new()
            {
                "In traditional Japanese joinery (kigumi), no nails or glue are used. Wood pieces interlock with patience and precision, allowing the timber to expand and breathe with the seasons.",
                "Preparing morning matcha: Whisking until fine green foam covers the bowl. A small five-minute ritual that anchors the mind before the noise of the day begins.",
                "When you rush an artisan piece, the impatience is carved directly into the surface. Speed is rarely a virtue when crafting something intended to outlive you.",
                "Simplicity is not the absence of clutter; it is the presence of intention. Notice what you can remove from your day rather than what you feel compelled to add.",
                "Listening to evening wind in the cedar trees. You do not need to answer every question right away. Sometimes the most honest answer is quiet observation.",
                "The Japanese concept of 'wabi-sabi' teaches us to cherish imperfections—the crack in the ceramic cup repaired with gold lacquer (kintsugi). Beauty lives in history, not sterility.",
                "Sharpening a Japanese hand plane (kanna) on a waterstone until the steel reflects like a mirror. The act of sharpening the tool is itself the practice.",
                "Work with the grain of the wood, never against it. When you understand the natural tendencies of your material, resistance turns into harmony.",
                "In a world screaming for rapid production, slow deliberate craftsmanship is a quiet revolution.",
                "Before beginning work at the bench each morning, I pause for three breaths. Clear hands, clear mind, respect for the timber.",
                "A teapot develops a patina over decades of use. Everyday tools grow more beautiful as they share in the rhythm of your life.",
                "Peace is not something found in an isolated retreat; it is maintained right here, in the ordinary motion of your hands and breath."
            },
            ReplyPool = new()
            {
                "A deeply peaceful perspective. Thank you for this quiet reminder to slow down and breathe.",
                "Working with intention transforms ordinary tasks into mindful practice. Beautifully stated.",
                "This brings such stillness to the feed. Cherishing the present moment is the greatest craft.",
                "So true. When we work with patience and respect for our materials, the outcome carries a special grace.",
                "Grateful for your serene wisdom. A gentle reminder that quality cannot be rushed."
            }
        },

        // 12. Maya "Glitch" Rivera – Indie Game Dev & Retro Gamer
        new EngagementPersona
        {
            Key = "maya_glitch",
            DisplayName = "Maya 'Glitch' Rivera",
            HandleBase = "maya_glitch",
            EmailBase = "maya.rivera",
            Archetype = "Indie Game Dev & Pixel Artist",
            Bio = "Indie game developer, pixel artist, and retro mechanics archivist. Building tiny worlds with big heart. CRT monitors & chiptunes.",
            Location = "Austin, TX",
            AvatarUrl = "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=256&h=256&q=80",
            Tone = "Playful, enthusiastic, nerdy, creative",
            Interests = new() { "game development", "pixel art", "game feel", "retro gaming", "indie games" },
            PostPool = new()
            {
                "Game feel is everything! Spent the whole day adding screen shake, particle bursts, and a tiny 2-frame hitstop on player impact. It turned a bland attack into something deeply satisfying.",
                "Pixel art isn't just low resolution; it's the art of deliberate constraint. Every single pixel must pull its weight to convey lighting, depth, and character silhouette.",
                "Prototypes don't need pretty graphics. If your core gameplay loop isn't fun with gray boxes and primitive spheres, pretty art won't save it.",
                "Revisiting 16-bit sound design. The clever ways composers used only four audio channels to create iconic, unforgettable orchestral soundscapes still blows my mind.",
                "Remember to take breaks and stretch your wrists, devs! Carpal tunnel is real and your hands are your primary creative instruments.",
                "Nothing compares to the moment when your procedural dungeon generator finally stops spawning rooms in the void and creates a playable map!",
                "Shader programming is dark magic: You write 15 lines of math in a fragment shader and suddenly your 2D water has caustic reflections and foam edges.",
                "Playtesting tip: Watch people play your game without giving hints. The moments they get stuck or confused will teach you 10x more than their polite compliments.",
                "The golden age of indie games is now. One solo dev with passion and vision can create an experience that touches millions of hearts.",
                "Juice up your UI! Button hovers should pop, menus should have satisfying clicks, and achievements should feel like a carnival celebration.",
                "Balancing jump physics: Giving players a 5-frame 'coyote time' after walking off a ledge makes the controls feel forgiving and responsive instead of frustrating.",
                "Support indie developers! Buying a game from a small studio often funds their groceries and allows their next dream project to exist."
            },
            ReplyPool = new()
            {
                "Awesome creative update! The game feel and visual polish on this look super crisp!",
                "Level up! Love seeing the development progress. Indie dev spirit at its absolute finest!",
                "Total nerd-out moment! Game juice and responsive controls make all the difference in the world.",
                "This looks so fun to play! Loving the aesthetic and mechanical attention to detail.",
                "Keep shipping! The indie gamedev community is cheering you on all the way."
            }
        },

        // 13. Tara Sterling – Macroeconomic Strategist & Finance Analyst
        new EngagementPersona
        {
            Key = "tara_capital",
            DisplayName = "Tara Sterling",
            HandleBase = "tara_capital",
            EmailBase = "tara.sterling",
            Archetype = "Macroeconomic Strategist & Fintech Analyst",
            Bio = "Macroeconomic analyst & sovereign risk researcher. Deconstructing monetary policy, liquidity cycles, and structural demographic shifts.",
            Location = "New York, NY",
            AvatarUrl = "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=256&h=256&q=80",
            Tone = "Data-driven, analytical, sober, strategic",
            Interests = new() { "macroeconomics", "liquidity", "monetary policy", "fintech", "asset allocation" },
            PostPool = new()
            {
                "Global central bank balance sheets remain the single biggest driver of asset valuations. Watching cross-border liquidity flows tells you more than quarterly corporate earnings.",
                "The real economic story of the decade is sovereign debt refinancing at higher terminal rates. Fiscal dominance is slowly altering the relationship between treasury departments and monetary policy.",
                "Demographic aging in major developed economies is creating structural labor constraints that interest rate hikes cannot solve. Capital allocation will have to focus on productivity gains.",
                "Diversification isn't holding 20 different equities that all crash together in a liquidity shock; it's holding non-correlated return streams across distinct legal jurisdictions and asset classes.",
                "Always distinguish between cyclical noise and structural regime shifts. Markets spend months obsessing over a 25bps rate tick while ignoring massive shifts in global energy supply chains.",
                "When credit spreads tighten to historic lows while bond yield curves remain volatile, risk is being mispriced. Maintain liquidity reserves for dislocation opportunities.",
                "Decentralized settlement networks are reducing counterparty risk in cross-border trade finance. Faster finality lowers the capital reserves banks must lock up overnight.",
                "Inflation isn't merely an expansion of money supply; it's the interplay between fiscal deficits, supply bottlenecks, and velocity of circulation. Monocausal explanations always fail.",
                "Commodity supercycles are determined by decades of capital underinvestment in extraction infrastructure. You cannot print physical copper or oil barrels.",
                "Sound risk management means surviving your worst-case scenario with capital intact so you can deploy when valuations become compelling.",
                "The tokenization of real-world assets (treasuries, private credit, real estate) provides secondary market liquidity to historically illiquid asset classes.",
                "Understanding the difference between solvency and liquidity is finance 101. A balance sheet can be solvent on paper and collapse in three hours if short-term liquidity dries up."
            },
            ReplyPool = new()
            {
                "Solid macroeconomic analysis. The liquidity dynamics here will heavily influence capital flows over the next two quarters.",
                "Spot on. Understanding structural systemic incentives is always superior to tracking short-term headline noise.",
                "Rigorous breakdown. When sovereign debt rollover costs climb, fiscal policy choices become much more constrained.",
                "Well reasoned. Non-correlated risk management is what preserves wealth across regime changes.",
                "Appreciate the grounded data perspective. Clear-headed financial analysis is always valuable."
            }
        },

        // 14. Chef Dante Rossi – Culinary Alchemist & Heritage Baker
        new EngagementPersona
        {
            Key = "chefdante",
            DisplayName = "Chef Dante Rossi",
            HandleBase = "chefdante",
            EmailBase = "dante.rossi",
            Archetype = "Heritage Baker & Culinary Craftsman",
            Bio = "Heritage baker, fermentation enthusiast, and culinary storyteller. Respecting tradition, wild yeasts, and slow, wood-fired meals.",
            Location = "Florence / Boston",
            AvatarUrl = "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=256&h=256&q=80",
            Tone = "Passionate, sensory, descriptive, generous",
            Interests = new() { "sourdough", "fermentation", "wood fired", "heritage grains", "slow food" },
            PostPool = new()
            {
                "My sourdough starter turned 12 years old this month. Feeding it stone-ground rye and fresh spring water. The lactic and acetic acid balance smells like green apples and warm bread.",
                "Never rush caramelizing onions. Low heat, a pinch of sea salt, and 45 minutes of patience will unlock natural sugars that no quick sear could ever replicate.",
                "Food is our most intimate connection to the earth and our ancestors. A simple bowl of handmade pasta shared with good friends can heal a stressful week faster than anything else.",
                "Tasting extra virgin olive oil pressed just two weeks ago. The peppery polyphenols on the finish remind you that real olive oil is fresh fruit juice, full of vitality and life.",
                "Baking bread teaches humility. You can measure everything down to the gram, but humidity, ambient temperature, and barometric pressure will still have their say.",
                "Fermentation is controlled magic: Wild bacteria and yeasts transforming humble cabbage, salt, and water into vibrant, tangy sauerkraut rich in living probiotics.",
                "Cooking with cast iron over a wood fire: The heat retention creates that perfect golden crust that seals in flavor while the smoke infuses subtle rustic character.",
                "Use the parmesan rind! Never throw it away. Toss it into your simmering tomato sauce or vegetable broth and watch it add profound umami depth.",
                "Good cooking is 80% sourcing exceptional ingredients and 20% not messing them up with overly complicated techniques. Let the ingredients speak for themselves.",
                "The smell of freshly baked bread filling the kitchen in the early morning is one of the greatest sensory joys in all of human experience.",
                "Pasta water is liquid gold. Emulsifying starchy pasta water with olive oil and grated pecorino creates that silky, glossy sauce without a drop of heavy cream.",
                "Gathering around a table to break bread together is the oldest peace ceremony in the world. May your meals always be shared with love."
            },
            ReplyPool = new()
            {
                "Buon appetito! The flavors and passion in this are mouthwatering. Respecting the craft always shines through!",
                "Mamma mia, this looks incredible! Patience and quality ingredients make all the difference in the kitchen.",
                "Food that connects people together is true art. Beautifully expressed!",
                "Now I am hungry! Love the sensory appreciation and genuine heart behind this post.",
                "Cooking with soul always nourishes more than just the body. Splendid post, amico!"
            }
        }
    };
}
