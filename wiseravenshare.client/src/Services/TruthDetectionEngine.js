// JavaScript source code
// Truth Detection Engine - Real-time misinformation detection
class TruthEngine {
    constructor() {
        this.knowledgeBase = new Map();
        this.initializeKnowledgeBase();
        this.disputeHistory = [];
        this.sourceReliability = new Map([
            ['NASA', 0.99],
            ['ESA', 0.98],
            ['NOAA', 0.98],
            ['IPCC', 0.98],
            ['CDC', 0.98],
            ['WHO', 0.98],
            ['NIH', 0.98],
            ['Peer reviewed consensus', 0.97],
            ['Atmospheric Physics', 0.96],
            ['Astronomy', 0.96],
            ['Human Anatomy', 0.96],
            ['Physics', 0.95],
            ['Botany', 0.95],
            ['Science', 0.94],
            ['Common knowledge', 0.75],
            ['Truth Engine', 0.72]
        ]);

        this.corroborationProfiles = this.buildCorroborationProfiles();
    }

    buildCorroborationProfiles() {
        return new Map([
            ['earth is flat', {
                falseSources: ['NASA', 'ESA', 'Peer reviewed consensus'],
                trueSources: [],
                note: 'Geodesy and orbital observation consistently show Earth is an oblate spheroid.'
            }],
            ['earth is spherical', {
                trueSources: ['NASA', 'ESA', 'Peer reviewed consensus'],
                falseSources: [],
                note: 'Earth is near-spherical; more precisely an oblate spheroid.'
            }],
            ['earth is round', {
                trueSources: ['NASA', 'ESA', 'Peer reviewed consensus'],
                falseSources: [],
                note: 'Independent space and geodesy observations support this.'
            }],
            ['climate change is fake', {
                falseSources: ['IPCC', 'NOAA', 'NASA'],
                trueSources: [],
                note: 'Multiple independent climate institutions reject this claim.'
            }],
            ['moon landing fake', {
                falseSources: ['NASA', 'ESA', 'Peer reviewed consensus'],
                trueSources: [],
                note: 'Mission telemetry, material samples, and tracking records corroborate Apollo landings.'
            }],
            ['vaccines cause autism', {
                falseSources: ['CDC', 'WHO', 'NIH'],
                trueSources: [],
                note: 'Large population studies and reviews find no causal link.'
            }],
            ['5g causes covid', {
                falseSources: ['WHO', 'CDC', 'Peer reviewed consensus'],
                trueSources: [],
                note: 'No biological mechanism or evidence supports radio transmission of viruses.'
            }],
            ['sun revolves around earth', {
                falseSources: ['NASA', 'ESA', 'Astronomy'],
                trueSources: [],
                note: 'Heliocentric orbital mechanics are directly measured.'
            }],
            ['water boils at 100c', {
                trueSources: ['Science', 'Physics', 'Peer reviewed consensus'],
                falseSources: [],
                note: 'True at approximately 1 atm pressure; varies with altitude and pressure.'
            }]
        ]);
    }

    initializeKnowledgeBase() {
        // Verified facts database
        this.knowledgeBase.set('earth is flat', {
            truth: false,
            correction: 'The Earth is an oblate spheroid (approximately spherical).',
            source: 'NASA',
            confidence: 0.99
        });
        this.knowledgeBase.set('earth is oblong', {
            truth: false,
            correction: 'The Earth is not oblong. It is an oblate spheroid (slightly flattened at the poles).',
            source: 'NASA',
            confidence: 0.98
        });
        this.knowledgeBase.set('earth is oblate spheroid', {
            truth: true,
            correction: null,
            source: 'NASA',
            confidence: 0.99
        });
        this.knowledgeBase.set('earth is spherical', {
            truth: true,
            correction: 'More precisely, Earth is an oblate spheroid rather than a perfect sphere.',
            source: 'NASA',
            confidence: 0.97
        });
        this.knowledgeBase.set('earth is round', {
            truth: true,
            correction: 'More precisely, Earth is an oblate spheroid.',
            source: 'NASA',
            confidence: 0.96
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

    normalizeClaim(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    clampConfidence(value, min = 0.35, max = 0.995) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            return min;
        }
        return Math.max(min, Math.min(max, numeric));
    }

    calibrateFinding(finding) {
        const evidenceMultiplier = {
            knowledge_base_exact: 1.0,
            pattern_rule: 0.93,
            soft_signal: 0.74
        }[finding.evidenceType] || 0.9;

        const baseConfidence = this.clampConfidence(finding.confidence, 0.2, 0.999);
        const sourceConfidence = this.sourceReliability.get(finding.source) || 0.72;
        const nullVerdictPenalty = finding.isTrue === null ? 0.72 : 1;

        const blended = ((baseConfidence * 0.75) + (sourceConfidence * 0.25)) * evidenceMultiplier * nullVerdictPenalty;

        return {
            ...finding,
            confidence: Number(this.clampConfidence(blended).toFixed(3))
        };
    }

    normalizeForCorroboration(claim) {
        const normalized = this.normalizeClaim(claim)
            .replace(/^not\s+/, '')
            .replace(/^\((.*)\)$/, '$1')
            .replace(/\bthe\b\s+/g, '')
            .trim();

        const aliases = new Map([
            ['there is one planet in milky way', 'there is one planet in the milky way'],
            ['earth is oblate spheroid', 'earth is spherical'],
            ['planets are square', 'the planets are square']
        ]);

        return aliases.get(normalized) || normalized;
    }

    isHighImpactClaim(claim) {
        const normalized = this.normalizeClaim(claim);
        return /\b(climate|vaccine|covid|5g|earth|moon landing|sun revolves|autism)\b/.test(normalized);
    }

    getCorroboration(claim, verdict) {
        const key = this.normalizeForCorroboration(claim);
        const profile = this.corroborationProfiles.get(key);
        if (!profile) {
            return null;
        }

        if (verdict === true) {
            return {
                sources: profile.trueSources || [],
                note: profile.note || ''
            };
        }

        if (verdict === false) {
            return {
                sources: profile.falseSources || [],
                note: profile.note || ''
            };
        }

        return {
            sources: [],
            note: profile.note || ''
        };
    }

    applySourceCorroboration(findings) {
        return findings.map((finding) => {
            if (finding.isTrue === null) {
                return finding;
            }

            const corroboration = this.getCorroboration(finding.claim, finding.isTrue);
            const highImpact = this.isHighImpactClaim(finding.claim);

            if (!corroboration) {
                const uncorrPenalty = highImpact ? 0.88 : 0.95;
                return {
                    ...finding,
                    confidence: Number(this.clampConfidence(finding.confidence * uncorrPenalty).toFixed(3)),
                    corroboration: {
                        corroborated: false,
                        sourceCount: 0,
                        sources: [],
                        note: highImpact
                            ? 'High-impact claim needs at least two independent authorities.'
                            : 'No independent corroboration profile available yet.'
                    }
                };
            }

            const sourceCount = corroboration.sources.length;
            const corroborated = sourceCount >= 2;
            const multiplier = corroborated ? 1.06 : (highImpact ? 0.86 : 0.93);

            return {
                ...finding,
                confidence: Number(this.clampConfidence(finding.confidence * multiplier).toFixed(3)),
                corroboration: {
                    corroborated,
                    sourceCount,
                    sources: corroboration.sources,
                    note: corroboration.note
                }
            };
        });
    }

    dedupeAndResolveFindings(findings) {
        const byClaim = new Map();

        for (const finding of findings) {
            const key = this.normalizeClaim(finding.claim);
            if (!key) {
                continue;
            }

            const existing = byClaim.get(key);
            if (!existing) {
                byClaim.set(key, finding);
                continue;
            }

            if (existing.isTrue === finding.isTrue) {
                if (finding.confidence > existing.confidence) {
                    byClaim.set(key, finding);
                }
                continue;
            }

            // Conflicting verdicts become explicitly inconclusive.
            byClaim.set(key, {
                claim: existing.claim,
                isTrue: null,
                correction: 'Conflicting evidence found for this claim. More authoritative sources are required.',
                source: 'Truth Engine',
                confidence: Number((Math.max(existing.confidence, finding.confidence) * 0.6).toFixed(3)),
                evidenceType: 'soft_signal'
            });
        }

        return Array.from(byClaim.values()).sort((a, b) => b.confidence - a.confidence);
    }

    addKnowledgeFinding(findings, claim) {
        const normalized = this.normalizeClaim(claim);
        const data = this.knowledgeBase.get(normalized);
        if (!data) {
            return;
        }

        const alreadyCaught = findings.some((finding) => this.normalizeClaim(finding.claim) === normalized);
        if (alreadyCaught) {
            return;
        }

        findings.push({
            claim: normalized,
            isTrue: data.truth,
            correction: data.correction,
            source: data.source,
            confidence: data.confidence,
            evidenceType: 'knowledge_base_exact'
        });
    }

    mapQuestionClaimsToKnowledge(findings, lowerContent) {
        const mappings = [
            { pattern: /\bis\s+(?:the\s+)?earth\s+flat\b/, claim: 'earth is flat' },
            { pattern: /\bis\s+(?:the\s+)?earth\s+oblong\b/, claim: 'earth is oblong' },
            { pattern: /\bis\s+(?:the\s+)?earth\s+round\b/, claim: 'earth is round' },
            { pattern: /\bis\s+(?:the\s+)?earth\s+spherical\b/, claim: 'earth is spherical' },
            { pattern: /\bis\s+(?:the\s+)?earth\s+(?:an\s+)?oblate\s+spheroid\b/, claim: 'earth is oblate spheroid' }
        ];

        for (const mapping of mappings) {
            if (mapping.pattern.test(lowerContent)) {
                this.addKnowledgeFinding(findings, mapping.claim);
            }
        }
    }

    splitIntoClaims(content) {
        return String(content || '')
            .split(/[\n\r]+|(?<=[.!?])\s+/)
            .map((part) => part.trim())
            .filter((part) => part.length > 0)
            .slice(0, 20);
    }

    isQuestion(sentence) {
        const str = String(sentence || '').trim();
        if (!str) return false;
        if (str.endsWith('?')) return true;

        const normalized = this.normalizeClaim(str);
        const questionPrefixes = /^(where|what|when|why|how|who|whom|whose|which|is\s+it|why\s+dont|why\s+don\s*t|why\s+not|why\s+cant|why\s+can\s*t|is|are|was|were|can|could|would|should|do|does|did|has|have|had|will|shall)\b/i;
        return questionPrefixes.test(normalized);
    }

    isOpinion(sentence) {
        const str = String(sentence || '').trim();
        if (!str) return false;
        const normalized = this.normalizeClaim(str);
        const opinionIndicators = /\b(i\s+think|i\s+feel|i\s+believe|in\s+my\s+opinion|my\s+favorite|best|worst|better|prettier|uglier|ugly|beautiful|awesome|terrible|horrible|overrated|underrated|should|ought\s+to|preference|subjective|coolest|dislike|like\s+more|i\s+prefer)\b/i;
        return opinionIndicators.test(normalized);
    }

    isIntent(sentence) {
        const str = String(sentence || '').trim();
        if (!str) return false;
        const normalized = this.normalizeClaim(str);
        const intentIndicators = /\b(i\s+intend|my\s+intention|i\s+plan|i\s+aim|i\s+commit|i\s+pledge|i\s+promise|my\s+goal|my\s+purpose|i\s+strive|i\s+vow|i\s+will|i\s+am\s+going\s+to|i\s+want\s+to|my\s+intentions|i\s+dedicate|my\s+ambition|i\s+hope\s+to|i\s+aspire|my\s+mission|i\s+seek\s+to|i\s+guarantee|i\s+swear)\b/i;
        return intentIndicators.test(normalized);
    }

    isLikelyVerifiableAssertion(sentence) {
        if (this.isQuestion(sentence) || this.isOpinion(sentence)) {
            return false;
        }
        const value = this.normalizeClaim(sentence);
        if (!value || value.length < 6) {
            return false;
        }

        const assertionSignals = /\b(is|are|was|were|has|have|causes?|cause|contains?|contains|includes?|means|revolves|boils|appears?)\b/;
        const subjectSignals = /\b(earth|sky|sun|moon|planets?|humans?|water|fire|grass|climate|vaccines?|5g|covid|milky\s*way|birds?)\b/;
        return assertionSignals.test(value) || subjectSignals.test(value);
    }

    addKnowledgeMatches(findings, lowerContent) {
        for (const [claim, data] of this.knowledgeBase) {
            const claimPattern = claim.replace(/\s+/g, '\\s+');

            // Direct polarity match.
            const directPattern = new RegExp(`\\b${claimPattern}\\b`);
            if (directPattern.test(lowerContent)) {
                findings.push({
                    claim,
                    isTrue: data.truth,
                    correction: data.correction,
                    source: data.source,
                    confidence: data.confidence,
                    evidenceType: 'knowledge_base_exact'
                });
            }

            // Negated polarity match (e.g. "earth is not spherical").
            const negatedPattern = new RegExp(`\\b${claimPattern.replace('\\s+', '\\s+(?:not\\s+|never\\s+)?')}\\b`);
            const negatedText = lowerContent.match(negatedPattern)?.[0] || '';
            const hasNegation = /\bnot\b|\bnever\b/.test(negatedText);

            if (hasNegation) {
                findings.push({
                    claim: `not (${claim})`,
                    isTrue: !data.truth,
                    correction: data.truth
                        ? `This negates an established fact: ${claim}.`
                        : `This rejects a known false claim: ${claim}.`,
                    source: data.source,
                    confidence: Math.max(0.78, Number(data.confidence || 0.9) * 0.88),
                    evidenceType: 'pattern_rule'
                });
            }
        }
    }

    analyzeContent(content) {
        const sentences = this.splitIntoClaims(content);
        if (sentences.length === 0) {
            return [];
        }

        const findings = [];

        for (const claimText of sentences) {
            if (this.isQuestion(claimText)) {
                findings.push({
                    claim: claimText,
                    isTrue: null,
                    isQuestion: true,
                    isOpinion: false,
                    correction: 'This is a question asking for information, not a factual assertion.',
                    source: 'Truth Engine',
                    confidence: 0.5,
                    evidenceType: 'question'
                });
                continue;
            }

            if (this.isOpinion(claimText)) {
                findings.push({
                    claim: claimText,
                    isTrue: null,
                    isOpinion: true,
                    isQuestion: false,
                    correction: 'This is an opinion or subjective statement and cannot be evaluated as an objective fact.',
                    source: 'Truth Engine',
                    confidence: 0.5,
                    evidenceType: 'opinion'
                });
                continue;
            }

            if (this.isIntent(claimText)) {
                findings.push({
                    claim: claimText,
                    isTrue: true,
                    isIntent: true,
                    isQuestion: false,
                    isOpinion: false,
                    correction: 'Declared personal intention — 100% subjective truth representing authentic individual agency and self-determined purpose.',
                    source: 'Self-Ascribed Intention (Personal Truth)',
                    confidence: 1.0,
                    evidenceType: 'personal_intention'
                });
                continue;
            }

            if (!this.isLikelyVerifiableAssertion(claimText)) {
                continue;
            }

            const lowerContent = claimText.toLowerCase();

            this.mapQuestionClaimsToKnowledge(findings, lowerContent);
            this.addKnowledgeMatches(findings, lowerContent);

            // --- Pattern-based checks (catch things the KB can't enumerate) ---

            // Sky property claims — catches invalid adjective/state assertions.
            const skyMatch = lowerContent.match(/\bthe sky (?:is|are|was|were|looks?|appears?|seems?|turned|became)\s+(?:a |an )?([\w]+)/);
            if (skyMatch) {
                const prop = skyMatch[1];
                const validSkyProps = new Set([
                    'blue', 'grey', 'gray', 'dark', 'white', 'black', 'clear', 'stormy',
                    'cloudy', 'overcast', 'hazy', 'foggy', 'bright', 'sunny', 'beautiful',
                    'amazing', 'stunning', 'lit', 'gloomy', 'dim', 'vivid', 'pale',
                    'darkening', 'lightening', 'vast', 'endless', 'open', 'wide', 'deep'
                ]);
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
                            confidence: 0.97,
                            evidenceType: 'pattern_rule'
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
                            confidence: 0.97,
                            evidenceType: 'pattern_rule'
                        });
                    }
                }
            }

            // Celestial body / planet shape claims.
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
                        confidence: 0.99,
                        evidenceType: 'pattern_rule'
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
                        confidence: 0.99,
                        evidenceType: 'pattern_rule'
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
                            confidence: 0.99,
                            evidenceType: 'pattern_rule'
                        });
                    }
                }
            }

            // --- Soft signals ---
            const numberPattern = /\d+%/g;
            if (claimText.match(numberPattern)) {
                findings.push({
                    claim: 'Unverified statistic detected',
                    isTrue: null,
                    correction: 'Please provide a source for this statistic.',
                    source: 'Truth Engine',
                    confidence: 0.5,
                    evidenceType: 'soft_signal'
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
                        confidence: 0.7,
                        evidenceType: 'soft_signal'
                    });
                }
            });
        }

        const calibrated = findings.map((finding) => this.calibrateFinding(finding));
        const deduped = this.dedupeAndResolveFindings(calibrated);
        return this.applySourceCorroboration(deduped);
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
        if (this.isIntent(content)) {
            return 100;
        }

        const analysis = this.analyzeContent(content);
        if (analysis.length > 0 && analysis.every(f => f.isIntent)) {
            return 100;
        }

        // Exclude questions and opinions from factoring into truth score calculations
        const verifiableAnalysis = analysis.filter(f => !f.isQuestion && !f.isOpinion);

        const trueClaims = verifiableAnalysis.filter((f) => f.isTrue === true);
        const falseClaims = verifiableAnalysis.filter((f) => f.isTrue === false);
        const unknownClaims = verifiableAnalysis.filter((f) => f.isTrue === null);

        // Conservative abstention: no hard evidence should not imply correctness.
        if (trueClaims.length === 0 && falseClaims.length === 0) {
            return 50;
        }

        const weightedConfidence = (finding) => {
            const base = finding.confidence * finding.confidence;
            const corroborationBoost = finding.corroboration?.corroborated ? 1.08 : 1.0;
            const uncorrPenalty = this.isHighImpactClaim(finding.claim) && !finding.corroboration?.corroborated ? 0.86 : 1.0;
            return base * corroborationBoost * uncorrPenalty;
        };

        const trueWeight = trueClaims.reduce((sum, finding) => sum + weightedConfidence(finding), 0);
        const falseWeight = falseClaims.reduce((sum, finding) => sum + weightedConfidence(finding), 0);
        const evidenceWeight = trueWeight + falseWeight;

        if (evidenceWeight < 0.55) {
            return 50;
        }

        // Jeffreys prior preserves uncertainty while allowing strong single facts to be decisive.
        const posteriorMean = (trueWeight + 0.5) / (evidenceWeight + 1);
        let score = posteriorMean * 100;

        const uncertaintyPenalty = Math.min(12, unknownClaims.length * 3);
        const contradictionPenalty = (trueClaims.length > 0 && falseClaims.length > 0) ? 10 : 0;
        const coverage = Math.min(1, evidenceWeight / Math.max(1, analysis.length));
        const shrink = 0.78 + (0.22 * coverage);

        score = 50 + ((score - 50) * shrink);
        score -= uncertaintyPenalty;
        score -= contradictionPenalty;

        return Math.max(0, Math.min(100, Math.round(score)));
    }

    getTruthBadge(score) {
        if (score >= 90) return { text: `✓ Truth Score: ${score}%`, class: 'truth-score', icon: '✅' };
        if (score >= 70) return { text: `📊 Highly Supported: ${score}%`, class: 'truth-partial', icon: '📊' };
        if (score >= 55) return { text: `🟡 Mixed Evidence: ${score}%`, class: 'truth-partial', icon: '🟡' };
        if (score >= 45) return { text: `❔ Inconclusive: ${score}%`, class: 'truth-inconclusive', icon: '❔' };
        if (score >= 30) return { text: `⚠️ Questionable: ${score}%`, class: 'truth-questionable', icon: '⚠️' };
        return { text: `❗ Needs Fact Check: ${score}%`, class: 'truth-false', icon: '❗' };
    }

    verifyWithSources(content) {
        const findings = this.analyzeContent(content);
        const sourceRows = [];

        for (const finding of findings) {
            const corroborationSources = finding.corroboration?.sources || [];
            const canonicalSources = [finding.source, ...corroborationSources]
                .filter(Boolean)
                .filter((value, index, arr) => arr.indexOf(value) === index);

            canonicalSources.forEach((sourceName) => {
                const confidence = Math.round((this.sourceReliability.get(sourceName) || 0.72) * 100);
                sourceRows.push({
                    name: sourceName,
                    type: finding.evidenceType || 'verification',
                    confidence,
                    verdict: finding.isTrue === true ? 'supports' : finding.isTrue === false ? 'contradicts' : 'neutral',
                    url: `https://example.org/sources/${encodeURIComponent(sourceName.toLowerCase().replace(/\s+/g, '-'))}`
                });
            });
        }

        const dedupedSources = sourceRows.filter((row, index, arr) => {
            return arr.findIndex((candidate) => candidate.name === row.name && candidate.verdict === row.verdict) === index;
        });

        const confidence = dedupedSources.length === 0
            ? 50
            : Math.round(dedupedSources.reduce((sum, row) => sum + row.confidence, 0) / dedupedSources.length);

        return { sources: dedupedSources, confidence };
    }

    findRelatedClaims(content) {
        const query = this.normalizeClaim(content);
        const tokens = new Set(query.split(' ').filter((token) => token.length > 3));

        const matches = [];
        for (const [claim, data] of this.knowledgeBase) {
            const claimTokens = claim.split(' ');
            const overlap = claimTokens.filter((token) => tokens.has(token)).length;
            if (overlap > 0 && claim !== query) {
                matches.push({
                    text: claim,
                    overlap,
                    confidence: Math.round(Number(data.confidence || 0.7) * 100)
                });
            }
        }

        return matches
            .sort((a, b) => b.overlap - a.overlap || b.confidence - a.confidence)
            .slice(0, 6)
            .map(({ text, confidence }) => ({ text, confidence }));
    }

    calculateTruthScore(findings, sourcesResult) {
        const safeFindings = Array.isArray(findings) ? findings : [];
        if (safeFindings.length === 0) {
            return 50;
        }

        const trueCount = safeFindings.filter((item) => item.isTrue === true).length;
        const falseCount = safeFindings.filter((item) => item.isTrue === false).length;
        const weightedBase = safeFindings.reduce((sum, item) => {
            const sign = item.isTrue === true ? 1 : item.isTrue === false ? -1 : 0;
            return sum + (sign * (Number(item.confidence) || 0.5));
        }, 0);

        const sourceConfidence = Number(sourcesResult?.confidence || 50) / 100;
        const normalized = 50 + (weightedBase / Math.max(1, safeFindings.length)) * 50;
        const contradictionPenalty = trueCount > 0 && falseCount > 0 ? 8 : 0;
        const score = (normalized * 0.82) + (sourceConfidence * 100 * 0.18) - contradictionPenalty;
        return Math.max(0, Math.min(100, Math.round(score)));
    }

    generateExplanation(result) {
        const findings = Array.isArray(result?.findings) ? result.findings : [];
        if (findings.length === 0) {
            return 'No strongly verifiable assertion was detected. Add a more specific factual claim to improve verification quality.';
        }

        const strongest = [...findings].sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
        if (strongest.isTrue === false) {
            return `This claim conflicts with established evidence. ${strongest.correction || 'Use authoritative sources for confirmation.'}`;
        }

        if (strongest.isTrue === true) {
            return `This claim is supported by known evidence${strongest.source ? ` from ${strongest.source}` : ''}.`;
        }

        return strongest.correction || 'Available signals are mixed or incomplete.';
    }

    verifySource(url) {
        const trustedDomains = ['nasa.gov', 'who.int', 'cdc.gov', 'ipcc.ch', 'noaa.gov', 'nih.gov'];
        const questionableDomains = ['example-news-now.biz', 'totallytruefacts.invalid'];

        let hostname = '';
        try {
            hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
        } catch {
            hostname = String(url || '').toLowerCase();
        }

        const isTrusted = trustedDomains.some((domain) => hostname.endsWith(domain));
        const isQuestionable = questionableDomains.some((domain) => hostname.endsWith(domain));
        const score = isTrusted ? 92 : isQuestionable ? 28 : 58;

        return {
            reliabilityScore: score,
            domain: hostname,
            verdict: isTrusted ? 'reliable' : isQuestionable ? 'unreliable' : 'mixed',
            summary: isTrusted
                ? 'Domain appears in trusted institutional sources list.'
                : isQuestionable
                    ? 'Domain appears in low-credibility watchlist.'
                    : 'Domain is not in the trusted or blocked source lists.'
        };
    }

    getTruthAnalytics(timeRange = 'week') {
        const multiplier = { day: 1, week: 7, month: 30, year: 365 }[timeRange] || 7;
        const totalClaims = Math.max(20, (this.disputeHistory.length * 5) + multiplier);
        const truePercentage = 61;
        const falsePercentage = 27;
        const uncertainPercentage = 12;
        const trueCount = Math.round(totalClaims * (truePercentage / 100));
        const falseCount = Math.round(totalClaims * (falsePercentage / 100));
        const uncertainCount = Math.max(0, totalClaims - trueCount - falseCount);

        return {
            totalClaims,
            growth: 12,
            truePercentage,
            falsePercentage,
            uncertainPercentage,
            trueCount,
            falseCount,
            uncertainCount,
            timeframe: timeRange
        };
    }

    downloadAnalyticsReport(analytics) {
        const report = JSON.stringify({
            generatedAt: new Date().toISOString(),
            analytics: analytics || this.getTruthAnalytics('week')
        }, null, 2);

        if (typeof window === 'undefined' || typeof document === 'undefined') {
            return report;
        }

        const blob = new Blob([report], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `truth-analytics-${Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return true;
    }

    getTruthLeaderboard(timeframe = 'all') {
        const base = [
            { name: 'Ari Vector', handle: '@arivector', truthScore: 97, claimsVerified: 186, accuracy: 95 },
            { name: 'Lena Quill', handle: '@lenaquill', truthScore: 93, claimsVerified: 152, accuracy: 91 },
            { name: 'Nova Grant', handle: '@novagrant', truthScore: 90, claimsVerified: 130, accuracy: 88 },
            { name: 'Kai Ember', handle: '@kaiember', truthScore: 86, claimsVerified: 104, accuracy: 84 }
        ];

        const decay = timeframe === 'day' ? 0.94 : timeframe === 'week' ? 0.97 : timeframe === 'month' ? 0.99 : 1;
        return base.map((row) => ({
            ...row,
            truthScore: Math.max(40, Math.round(row.truthScore * decay))
        }));
    }

    verifyClaim(claimText) {
        const claim = String(claimText || '').trim();
        const findings = this.analyzeContent(claim);
        const strongest = findings[0] || null;

        if (this.isIntent(claim) || strongest?.isIntent) {
            return {
                id: String(Date.now()),
                claim,
                normalizedClaim: this.normalizeClaim(claim),
                isTrue: true,
                isIntent: true,
                truthScore: 100,
                confidence: 100,
                confidenceScore: 1.0,
                correction: null,
                explanation: 'This statement expresses personal intention and self-determined purpose. Personal intentions represent 100% personal truth and individual agency rather than empirical external physical facts.',
                sources: [
                    {
                        name: 'Self-Ascribed Intention (Personal Truth)',
                        type: 'personal_intention',
                        confidence: 100,
                        verdict: 'supports',
                        url: 'self://personal-intention'
                    }
                ],
                findings: findings.length > 0 ? findings : [{
                    claim,
                    isTrue: true,
                    isIntent: true,
                    isQuestion: false,
                    isOpinion: false,
                    correction: 'Declared personal intention — 100% subjective truth representing authentic individual agency.',
                    source: 'Self-Ascribed Intention (Personal Truth)',
                    confidence: 1.0,
                    evidenceType: 'personal_intention'
                }],
                timestamp: new Date(),
                verificationDepth: 'standard',
                breakdown: {
                    knowledgeBaseScore: 100,
                    aiScore: 100,
                    sourceScore: 100,
                    temporalScore: 100,
                    consensusScore: 100
                }
            };
        }

        const sourcesResult = this.verifyWithSources(claim);
        const truthScore = this.calculateTruthScore(findings, sourcesResult);

        return {
            id: String(Date.now()),
            claim,
            normalizedClaim: this.normalizeClaim(claim),
            isTrue: strongest?.isTrue ?? null,
            truthScore,
            confidence: Math.round((strongest?.confidence || 0.5) * 100),
            confidenceScore: Number(((strongest?.confidence || 0.5)).toFixed(3)),
            correction: strongest?.correction || null,
            explanation: this.generateExplanation({ findings }),
            sources: sourcesResult.sources,
            findings,
            timestamp: new Date(),
            verificationDepth: 'standard',
            breakdown: {
                knowledgeBaseScore: Math.round((findings.filter((item) => item.evidenceType === 'knowledge_base_exact').length / Math.max(1, findings.length)) * 100),
                aiScore: 0,
                sourceScore: sourcesResult.confidence,
                temporalScore: 55,
                consensusScore: Math.round((truthScore + sourcesResult.confidence) / 2)
            }
        };
    }
}

export const truthEngine = new TruthEngine();