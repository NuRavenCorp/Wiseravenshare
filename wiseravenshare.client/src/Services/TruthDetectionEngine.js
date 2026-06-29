// JavaScript source code
// Truth Detection Engine - Real-time misinformation detection
class TruthEngine {
    constructor() {
        this.knowledgeBase = new Map();
        this.initializeKnowledgeBase();
        this.disputeHistory = [];
    }

    initializeKnowledgeBase() {
        // Verified facts database
        this.knowledgeBase.set('earth is flat', {
            truth: false,
            correction: 'The Earth is an oblate spheroid (approximately spherical).',
            source: 'NASA',
            confidence: 0.99
        });
        this.knowledgeBase.set('climate change is fake', {
            truth: false,
            correction: '97% of climate scientists agree that climate change is real and human-caused.',
            source: 'IPCC',
            confidence: 0.98
        });
        this.knowledgeBase.set('moon landing fake', {
            truth: false,
            correction: 'The Apollo moon landings were real, verified by multiple independent sources including Soviet tracking data.',
            source: 'NASA',
            confidence: 0.99
        });
        this.knowledgeBase.set('vaccines cause autism', {
            truth: false,
            correction: 'Extensive studies show no link between vaccines and autism. The original study was retracted for fraud.',
            source: 'CDC',
            confidence: 0.99
        });
        this.knowledgeBase.set('5g causes covid', {
            truth: false,
            correction: '5G technology does not cause COVID-19. Viruses cannot be transmitted by radio waves.',
            source: 'WHO',
            confidence: 0.99
        });
        this.knowledgeBase.set('birds are real', {
            truth: true,
            correction: null,
            source: 'Common knowledge',
            confidence: 0.5
        });
        this.knowledgeBase.set('water boils at 100c', {
            truth: true,
            correction: null,
            source: 'Science',
            confidence: 0.99
        });

        // Sky color facts
        this.knowledgeBase.set('sky is blue', {
            truth: true,
            correction: null,
            source: 'Atmospheric Physics',
            confidence: 0.99
        });
        this.knowledgeBase.set('sky is purple', {
            truth: false,
            correction: 'The sky appears blue due to Rayleigh scattering of sunlight by the atmosphere.',
            source: 'Atmospheric Physics',
            confidence: 0.99
        });
        this.knowledgeBase.set('sky is green', {
            truth: false,
            correction: 'The sky appears blue due to Rayleigh scattering, not green.',
            source: 'Atmospheric Physics',
            confidence: 0.99
        });
        this.knowledgeBase.set('sky is red', {
            truth: false,
            correction: 'The sky appears blue during daytime. Red skies occur only at sunrise/sunset.',
            source: 'Atmospheric Physics',
            confidence: 0.97
        });
        this.knowledgeBase.set('sky is yellow', {
            truth: false,
            correction: 'The sky appears blue due to Rayleigh scattering of sunlight.',
            source: 'Atmospheric Physics',
            confidence: 0.99
        });
        this.knowledgeBase.set('sky is pink', {
            truth: false,
            correction: 'The sky appears blue during the day. Pink hues only occur briefly at sunrise/sunset.',
            source: 'Atmospheric Physics',
            confidence: 0.97
        });

        // Physical / biological facts
        this.knowledgeBase.set('sun revolves around earth', {
            truth: false,
            correction: 'The Earth revolves around the Sun, not the other way around.',
            source: 'Astronomy',
            confidence: 0.99
        });
        this.knowledgeBase.set('planets are square', {
            truth: false,
            correction: 'Planets are not square. They are approximately spherical due to gravity.',
            source: 'Astronomy',
            confidence: 0.99
        });
        this.knowledgeBase.set('the planets are square', {
            truth: false,
            correction: 'Planets are not square. They are approximately spherical due to gravity.',
            source: 'Astronomy',
            confidence: 0.99
        });
        this.knowledgeBase.set('the sky is frozen', {
            truth: false,
            correction: 'The sky is the atmosphere and cannot be frozen as a whole.',
            source: 'Atmospheric Physics',
            confidence: 0.99
        });
        this.knowledgeBase.set('humans have 3 lungs', {
            truth: false,
            correction: 'Humans have 2 lungs.',
            source: 'Human Anatomy',
            confidence: 0.99
        });
        this.knowledgeBase.set('water is dry', {
            truth: false,
            correction: 'Water is a liquid and is wet by definition.',
            source: 'Physics',
            confidence: 0.99
        });
        this.knowledgeBase.set('fire is cold', {
            truth: false,
            correction: 'Fire produces heat and is hot.',
            source: 'Physics',
            confidence: 0.99
        });
        this.knowledgeBase.set('grass is blue', {
            truth: false,
            correction: 'Grass is green due to chlorophyll.',
            source: 'Botany',
            confidence: 0.99
        });
        this.knowledgeBase.set('grass is red', {
            truth: false,
            correction: 'Grass is green due to chlorophyll.',
            source: 'Botany',
            confidence: 0.99
        });
    }

    analyzeContent(content) {
        const lowerContent = content.toLowerCase();
        const findings = [];

        // --- Exact KB matches ---
        for (const [claim, data] of this.knowledgeBase) {
            if (lowerContent.includes(claim)) {
                findings.push({
                    claim,
                    isTrue: data.truth,
                    correction: data.correction,
                    source: data.source,
                    confidence: data.confidence
                });
            }
        }

        // --- Pattern-based checks (catch things the KB can't enumerate) ---

        // Sky property claims — catches ANY adjective/state that is physically invalid for the sky.
        // Uses a broad verb group: is/are/was/were/looks/appears/seems/turned/became
        const skyMatch = lowerContent.match(/\bthe sky (?:is|are|was|were|looks?|appears?|seems?|turned|became)\s+(?:a |an )?([\w]+)/);
        if (skyMatch) {
            const prop = skyMatch[1];
            // Recognised valid sky descriptions (appearance, color, weather)
            const validSkyProps = new Set([
                'blue', 'grey', 'gray', 'dark', 'white', 'black', 'clear', 'stormy',
                'cloudy', 'overcast', 'hazy', 'foggy', 'bright', 'sunny', 'beautiful',
                'amazing', 'stunning', 'lit', 'gloomy', 'dim', 'vivid', 'pale',
                'darkening', 'lightening', 'vast', 'endless', 'open', 'wide', 'deep'
            ]);
            // Colors/states only valid at dawn/dusk
            const dawnProps = new Set(['red', 'orange', 'pink', 'golden', 'purple', 'violet', 'crimson']);
            const isDawnContext = /\b(sunrise|sunset|dawn|dusk|morning|evening|twilight)\b/.test(lowerContent);

            const isValid = validSkyProps.has(prop) || (dawnProps.has(prop) && isDawnContext);
            if (!isValid) {
                const alreadyCaught = findings.some(f => f.claim.includes(`sky is ${prop}`) || f.claim.includes(`sky is ${prop}`));
                if (!alreadyCaught) {
                    const isDawnProp = dawnProps.has(prop);
                    findings.push({
                        claim: `the sky is ${prop}`,
                        isTrue: false,
                        correction: isDawnProp
                            ? `The sky only appears ${prop} briefly at sunrise or sunset, not as a general statement.`
                            : `The sky is part of Earth's atmosphere — it cannot be "${prop}". It appears blue during the day due to Rayleigh scattering.`,
                        source: 'Atmospheric Physics',
                        confidence: 0.97
                    });
                }
            }
        }

        // Grass/plant color — only green/brown/yellow variants are natural
        const grassMatch = lowerContent.match(/\b(?:the )?grass (?:is|are|was|were|looks?|appears?)\s+(?:a |an )?([\w]+)/);
        if (grassMatch) {
            const color = grassMatch[1];
            const validGrassColors = new Set(['green', 'brown', 'yellow', 'golden', 'dead', 'dry', 'lush', 'tall', 'short', 'wet', 'soft']);
            if (!validGrassColors.has(color)) {
                const alreadyCaught = findings.some(f => f.claim.includes(`grass is ${color}`));
                if (!alreadyCaught) {
                    findings.push({
                        claim: `the grass is ${color}`,
                        isTrue: false,
                        correction: `Grass is green due to chlorophyll, not ${color}.`,
                        source: 'Botany',
                        confidence: 0.97
                    });
                }
            }
        }

        // Celestial body / planet shape claims — handles singular AND plural, is/are/was/were
        const shapeWords = 'flat|square|cubed?|triangular|rectangular|cylindrical|pyramidal?|hexagonal|pentagonal|diamond|oval(?! shaped)';
        const bodyWords = 'sun|moon|earth|world|planets?|stars?|universe|cosmos|galaxy|galaxies';
        const shapeMatch = lowerContent.match(
            new RegExp(`\\b(?:the\\s+)?(${bodyWords})\\s+(?:is|are|was|were)\\s+(?:a\\s+|an\\s+)?(${shapeWords})\\b`)
        );
        if (shapeMatch) {
            const body = shapeMatch[1];
            const shape = shapeMatch[2];
            const alreadyCaught = findings.some(f => f.claim.includes(shape));
            if (!alreadyCaught) {
                findings.push({
                    claim: `the ${body} is ${shape}`,
                    isTrue: false,
                    correction: `${body.charAt(0).toUpperCase() + body.slice(1)} are not ${shape}. Planets, moons, and stars are roughly spherical due to gravitational forces.`,
                    source: 'Astronomy',
                    confidence: 0.99
                });
            }
        }

        // Milky Way planet count misinformation
        const mentionsMilkyWay = /\bmilky\s*way\b|\bmilkyway\b/.test(lowerContent);
        const claimsOnePlanet = /\bonly\s+one\s+planet\b|\bone\s+planet\s+only\b|\bthere\s+is\s+one\s+planet\b|\bone\s+planet\b/.test(lowerContent);
        if (mentionsMilkyWay && claimsOnePlanet) {
            const alreadyCaught = findings.some((f) => f.claim.includes('one planet') && f.claim.toLowerCase().includes('milky'));
            if (!alreadyCaught) {
                findings.push({
                    claim: 'there is one planet in the Milky Way',
                    isTrue: false,
                    correction: 'The Milky Way contains billions of planets, not one.',
                    source: 'Astronomy',
                    confidence: 0.99
                });
            }
        }

        // Impossible human anatomy counts
        const anatomyMatch = lowerContent.match(/humans? (?:have|has|possess(?:es)?)\s+(\w+)\s+(lungs?|hearts?|brains?|kidneys?|eyes?|ears?)/);
        if (anatomyMatch) {
            const countWord = anatomyMatch[1];
            const organ = anatomyMatch[2];
            const correctCounts = { lung: 2, lungs: 2, heart: 1, hearts: 1, brain: 1, brains: 1, kidney: 2, kidneys: 2, eye: 2, eyes: 2, ear: 2, ears: 2 };
            const correctCount = correctCounts[organ];
            const numberWords = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, zero: 0, a: 1 };
            const statedCount = numberWords[countWord] ?? parseInt(countWord, 10);
            if (!isNaN(statedCount) && correctCount !== undefined && statedCount !== correctCount) {
                const alreadyCaught = findings.some(f => f.claim.includes(`${statedCount} ${organ}`));
                if (!alreadyCaught) {
                    findings.push({
                        claim: `humans have ${statedCount} ${organ}`,
                        isTrue: false,
                        correction: `Humans normally have ${correctCount} ${organ}, not ${statedCount}.`,
                        source: 'Human Anatomy',
                        confidence: 0.99
                    });
                }
            }
        }

        // --- Soft signals ---
        const numberPattern = /\d+%/g;
        if (content.match(numberPattern)) {
            findings.push({
                claim: 'Unverified statistic detected',
                isTrue: null,
                correction: 'Please provide a source for this statistic.',
                source: 'Truth Engine',
                confidence: 0.5
            });
        }

        const extremeWords = ['always', 'never', 'everyone', 'no one', 'completely', 'totally'];
        extremeWords.forEach(word => {
            if (lowerContent.includes(word)) {
                findings.push({
                    claim: `Absolute language: "${word}"`,
                    isTrue: null,
                    correction: 'Consider using more nuanced language as absolute statements are rarely accurate.',
                    source: 'Truth Engine',
                    confidence: 0.7
                });
            }
        });

        return findings;
    }

    async disputePost(postId, postContent, reason) {
        const analysis = this.analyzeContent(postContent);
        const dispute = {
            id: Date.now(),
            postId: postId,
            reason: reason,
            analysis: analysis,
            timestamp: new Date(),
            resolved: false
        };

        this.disputeHistory.push(dispute);

        // Auto-correct if clear falsehood detected
        const falseClaims = analysis.filter(f => f.isTrue === false && f.confidence > 0.9);
        if (falseClaims.length > 0) {
            return {
                disputed: true,
                corrections: falseClaims.map(f => f.correction),
                sources: falseClaims.map(f => f.source)
            };
        }

        return { disputed: true, corrections: null };
    }

    getTruthScore(content) {
        const analysis = this.analyzeContent(content);
        const falseClaims = analysis.filter(f => f.isTrue === false && f.confidence > 0.8);
        const trueClaims = analysis.filter(f => f.isTrue === true && f.confidence > 0.8);
        const totalVerifiable = falseClaims.length + trueClaims.length;

        // No known claims matched — content is unverified, not automatically true
        if (totalVerifiable === 0) return 72;

        const falseWeight = falseClaims.reduce((sum, f) => sum + f.confidence, 0);
        const trueWeight = trueClaims.reduce((sum, f) => sum + f.confidence, 0);
        const totalWeight = falseWeight + trueWeight;

        if (totalWeight === 0) return 72;

        const rawScore = (trueWeight / totalWeight) * 100;
        return Math.max(0, Math.min(100, Math.round(rawScore)));
    }

    getTruthBadge(score) {
        if (score >= 90) return { text: `✓ Truth Score: ${score}%`, class: 'truth-score', icon: '✅' };
        if (score >= 60) return { text: `📊 Partially Verified: ${score}%`, class: 'truth-partial', icon: '📊' };
        if (score >= 30) return { text: `⚠️ Questionable: ${score}%`, class: 'truth-questionable', icon: '⚠️' };
        return { text: `❗ Needs Fact Check: ${score}%`, class: 'truth-false', icon: '❗' };
    }
}

export const truthEngine = new TruthEngine();