import { truthEngine } from './TruthDetectionEngine.js';
import api from './api.js';

// Re-export truthEngine for backward compatibility
export { truthEngine };

// ============================================================================
// TYPE DEFINITIONS (consolidated from truthApiService.ts)
// ============================================================================

export interface SourceDto {
    url: string;
    title: string;
    sourceType: string;
    reliabilityScore: number;
    verdict: string;
    publishedDate?: string;
}

export interface VerificationBreakdownDto {
    knowledgeBaseScore: number;
    aiScore: number;
    sourceScore: number;
    temporalScore: number;
    consensusScore: number;
}

export interface TruthVerificationResponseDto {
    claim: string;
    normalizedClaim: string;
    isTrue: boolean | null;
    isIntent?: boolean;
    isQuestion?: boolean;
    isOpinion?: boolean;
    confidenceScore: number;
    explanation: string;
    sources: SourceDto[];
    breakdown?: VerificationBreakdownDto;
    timestamp: string;
    verificationDepth?: string;
}

export interface BatchVerificationResponseDto {
    results: TruthVerificationResponseDto[];
    totalClaims: number;
    averageConfidence: number;
    verifiedCount: number;
    disputedCount: number;
    falseCount: number;
}

export interface TruthScoreDto {
    score: number;
    confidence: number;
    accuracy: number;
    claims: Array<{
        claim: string;
        score: number;
        isTrue: boolean | null;
        evidence: string[];
    }>;
}

export interface ConsensusResponseDto {
    claimId?: string;
    claim?: string;
    confidence: number;
    consensusStatus?: string;
    totalVotes?: number;
    supportVotes?: number;
    againstVotes?: number;
}

export interface ContradictionResponseDto {
    claim: string;
    hasContradictions: boolean;
    contradictions: Array<{
        existingClaim: string;
        existingVerdict: boolean;
        confidence: number;
    }>;
}

export interface TemporalEvolutionPointDto {
    timestamp?: string;
    verdict?: boolean | null;
    confidence: number;
}

export interface TemporalAnalysisResponseDto {
    claim: string;
    firstAppearance?: string;
    evolution: TemporalEvolutionPointDto[];
    trend: string;
}

export interface TruthStatsResponseDto {
    totalClaimsVerified: number;
    averageConfidence: number;
    falseClaimRate: number;
    activeVerifiers: number;
    categoryBreakdown: Record<string, number>;
    recentActivity: unknown[];
}

// ============================================================================
// INTERNAL STORAGE & UTILITY
// ============================================================================

const VERIFICATION_HISTORY_KEY = 'wiseTruthHistory';
const VOTE_CACHE_KEY = 'wiseTruthVotes';

const toClaimText = (input: unknown): string => {
    if (typeof input === 'string') {
        return input.trim();
    }

    if (input && typeof input === 'object') {
        if ('claim' in input && typeof (input as { claim?: unknown }).claim === 'string') {
            return String((input as { claim?: unknown }).claim || '').trim();
        }
        if ('claimText' in input && typeof (input as { claimText?: unknown }).claimText === 'string') {
            return String((input as { claimText?: unknown }).claimText || '').trim();
        }
        if ('content' in input && typeof (input as { content?: unknown }).content === 'string') {
            return String((input as { content?: unknown }).content || '').trim();
        }
    }

    return '';
};

const safeReadHistory = () => {
    try {
        const raw = localStorage.getItem(VERIFICATION_HISTORY_KEY);
        return Array.isArray(JSON.parse(raw || '[]')) ? JSON.parse(raw || '[]') : [];
    } catch {
        return [];
    }
};

const safeSaveHistory = (items: unknown[]) => {
    try {
        localStorage.setItem(VERIFICATION_HISTORY_KEY, JSON.stringify(items.slice(0, 100)));
    } catch {
        // Ignore storage write failures.
    }
};

const safeReadVotes = (): Record<string, { vote: boolean; confidence: number; timestamp: string }> => {
    try {
        const raw = localStorage.getItem(VOTE_CACHE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
};

const safeSaveVotes = (votes: Record<string, { vote: boolean; confidence: number; timestamp: string }>) => {
    try {
        localStorage.setItem(VOTE_CACHE_KEY, JSON.stringify(votes));
    } catch {
        // Ignore storage write failures.
    }
};

// ============================================================================
// FALLACY DETECTION (from EnhancedTruthCheckerService.js)
// ============================================================================

export const localFallacyDetector = {
    isAdHominem: (text: string): boolean => {
        const patterns = [
            /\b(person|guy|she|he|they)\s+(is|are)\s+(stupid|idiotic|dumb|crazy|insane)\b/i,
            /\b(you|they)\s+(are|is)\s+(an? )?(fool|idiot|moron|retard)/i,
            /\byou\s+(can't|don't|won't)\s+understand\b/i
        ];
        return patterns.some(p => p.test(text));
    },

    isStrawMan: (text: string): boolean => {
        const patterns = [
            /\b(they|you|opponents?)\s+want\s+to\s+(ban|destroy|eliminate|get rid of)\b/i,
            /\bso you're\s+saying\s+that\b/i,
            /\byour\s+argument\s+(is|amounts to)\b/i
        ];
        return patterns.some(p => p.test(text));
    },

    isFalseDilemma: (text: string): boolean => {
        const patterns = [
            /\b(either|you must)\s+.*\s+(or|you must)\s+.*$/i,
            /\byou're\s+(either|with us|against us)\b/i
        ];
        return patterns.some(p => p.test(text));
    },

    isAppealToAuthority: (text: string): boolean => {
        const patterns = [
            /\b(experts?|scientists?|doctors?)\s+say\b(?!\s+(?:that|according to|research shows|found that))/i,
            /\b(they|authorities?)\s+claim\b(?!\s+with evidence)/i
        ];
        return patterns.some(p => p.test(text));
    },

    isHastyGeneralization: (text: string): boolean => {
        const patterns = [
            /\b(all|every|none of)\s+\w+\s+(always|never)\b/i,
            /\b\w+\s+(always|never)\s+\w+\b/i,
            /\b(everyone|all people)\s+(knows?|believes?)\b/i
        ];
        return patterns.some(p => p.test(text));
    },

    isSlipperySlope: (text: string): boolean => {
        const patterns = [
            /\b(will lead to|eventually|inevitably|soon)\s+.*\b/i,
            /\bif we.*then\s+\w+.*will\b/i
        ];
        return patterns.some(p => p.test(text));
    },

    isCircularReasoning: (text: string): boolean => {
        const patterns = [
            /because\s+.*\s+is\s+(true|real|correct|facts?)\b/i,
            /\b(it's true because|it works because)\s+it\s+\w+\b/i
        ];
        return patterns.some(p => p.test(text));
    },

    detectAll: (text: string) => {
        const fallacies = [];

        if (localFallacyDetector.isAdHominem(text)) {
            fallacies.push({
                type: 'Ad Hominem',
                description: 'Attacks the person rather than the argument',
                severity: 'high'
            });
        }

        if (localFallacyDetector.isStrawMan(text)) {
            fallacies.push({
                type: 'Straw Man',
                description: 'Misrepresents the opposing viewpoint',
                severity: 'high'
            });
        }

        if (localFallacyDetector.isFalseDilemma(text)) {
            fallacies.push({
                type: 'False Dilemma',
                description: 'Presents only two options when more exist',
                severity: 'high'
            });
        }

        if (localFallacyDetector.isAppealToAuthority(text)) {
            fallacies.push({
                type: 'Appeal to Authority',
                description: 'Cites authority without specific evidence',
                severity: 'medium'
            });
        }

        if (localFallacyDetector.isHastyGeneralization(text)) {
            fallacies.push({
                type: 'Hasty Generalization',
                description: 'Makes sweeping claims without sufficient evidence',
                severity: 'medium'
            });
        }

        if (localFallacyDetector.isSlipperySlope(text)) {
            fallacies.push({
                type: 'Slippery Slope',
                description: 'Assumes chain reaction without evidence',
                severity: 'medium'
            });
        }

        if (localFallacyDetector.isCircularReasoning(text)) {
            fallacies.push({
                type: 'Circular Reasoning',
                description: 'Uses conclusion as its own premise',
                severity: 'high'
            });
        }

        return fallacies;
    }
};

// ============================================================================
// COGNITIVE BIAS DETECTION (from EnhancedTruthCheckerService.js)
// ============================================================================

export const cognitiveBlasDetector = {
    detectConfirmationBias: (text: string): boolean => {
        const patterns = [
            /\b(obviously|clearly|of course|everyone knows|it's obvious)\b/i,
            /\b(as we all know|surely you agree)\b/i
        ];
        return patterns.some(p => p.test(text));
    },

    detectAvailabilityHeuristic: (text: string): boolean => {
        const patterns = [
            /\b(recently|just (saw|read|heard|learned))\b/i,
            /\b(went viral|trending|breaking news)\b/i,
            /\b(just happened|just occurred)\b/i
        ];
        return patterns.some(p => p.test(text));
    },

    detectAppealToFear: (text: string): boolean => {
        const patterns = [
            /\b(will destroy|will kill|deadly|dangerous threat|existential threat|catastrophic)\b/i,
            /\b(we must|act now|urgent|immediately)\b/i
        ];
        return patterns.some(p => p.test(text));
    },

    detectBandwagon: (text: string): boolean => {
        const patterns = [
            /\b(everyone|most people|the majority|most scientists)\s+(believes?|knows?|agrees?)\b/i,
            /\b(it's popular|everyone is doing)\b/i
        ];
        return patterns.some(p => p.test(text));
    },

    detectEmotionalManipulation: (text: string): boolean => {
        const patterns = [
            /\b(terrifying|horrifying|shocking|unbelievable|outrageous|disgusting)\b/i,
            /\b(heartbreaking|soul-crushing|devastating)\b/i
        ];
        return patterns.some(p => p.test(text));
    },

    detectAll: (text: string) => {
        const biases = [];

        if (cognitiveBlasDetector.detectConfirmationBias(text)) {
            biases.push({
                type: 'Confirmation Bias',
                description: 'Uses language that assumes agreement without evidence',
                riskLevel: 'medium'
            });
        }

        if (cognitiveBlasDetector.detectAvailabilityHeuristic(text)) {
            biases.push({
                type: 'Availability Heuristic',
                description: 'May overweight recent or memorable cases',
                riskLevel: 'low'
            });
        }

        if (cognitiveBlasDetector.detectAppealToFear(text)) {
            biases.push({
                type: 'Appeal to Fear',
                description: 'Uses fear-based language without proportional evidence',
                riskLevel: 'high'
            });
        }

        if (cognitiveBlasDetector.detectBandwagon(text)) {
            biases.push({
                type: 'Bandwagon Fallacy',
                description: 'Appeals to popularity rather than evidence',
                riskLevel: 'medium'
            });
        }

        if (cognitiveBlasDetector.detectEmotionalManipulation(text)) {
            biases.push({
                type: 'Emotional Manipulation',
                description: 'Uses heightened emotional language that may cloud judgment',
                riskLevel: 'high'
            });
        }

        return biases;
    }
};

// ============================================================================
// API LAYER (consolidated from truthApiService)
// ============================================================================

const truthApiMethods = {
    async verifyClaim(claim: string, depth = 'deep'): Promise<TruthVerificationResponseDto> {
        const response = await api.post('/truthengine/verify', { claim, depth });
        return response.data;
    },

    async verifyBatch(claims: string[]): Promise<BatchVerificationResponseDto> {
        const response = await api.post('/truthengine/verify-batch', { claims });
        return response.data;
    },

    async getTruthScore(content: string): Promise<TruthScoreDto> {
        const response = await api.post('/truthengine/score', { content });
        return response.data;
    },

    async findSources(claim: string): Promise<SourceDto[]> {
        const response = await api.post('/truthengine/sources', { claim });
        return response.data;
    },

    async getConsensus(claimId: string): Promise<ConsensusResponseDto> {
        const response = await api.get(`/truthengine/consensus/${encodeURIComponent(claimId)}`);
        return response.data;
    },

    async voteOnClaim(claimId: string, vote: boolean, confidence = 5): Promise<ConsensusResponseDto> {
        const response = await api.post('/truthengine/vote', { claimId, vote, confidence });
        return response.data;
    },

    async detectContradictions(claim: string): Promise<ContradictionResponseDto> {
        const response = await api.post('/truthengine/contradictions', { claim });
        return response.data;
    },

    async analyzeTemporal(claim: string): Promise<TemporalAnalysisResponseDto> {
        const response = await api.post('/truthengine/temporal', { claim });
        return response.data;
    },

    async getStats(): Promise<TruthStatsResponseDto> {
        const response = await api.get('/truthengine/stats');
        return response.data;
    },

    async addToKnowledgeBase(fact: {
        claim: string;
        isTrue: boolean;
        confidence: number;
        sources?: string[];
        explanation?: string;
        category?: string;
    }) {
        const response = await api.post('/truthengine/knowledge-base', fact);
        return response.data;
    },

    async assessClaim(claim: string) {
        const response = await api.post('/truthengine/assess-comprehensive', {
            claim: claim.trim()
        });
        return response.data;
    },

    async detectMisbeliefs(text: string) {
        const response = await api.post('/truthengine/detect-misbeliefs', {
            text: text.trim()
        });
        return response.data;
    },

    async detectFallacies(text: string) {
        const response = await api.post('/truthengine/detect-fallacies', {
            text: text.trim()
        });
        return response.data;
    },

    async detectCognitiveBiases(text: string) {
        const response = await api.post('/truthengine/detect-biases', {
            text: text.trim()
        });
        return response.data;
    },

    async getMisbeliefTrends(timeframe = '7days') {
        const response = await api.get('/truthengine/trends', {
            params: { timeframe }
        });
        return response.data;
    }
};

// ============================================================================
// UNIFIED VERIFICATION RESULT TYPE
// ============================================================================

export interface UnifiedVerificationResult {
    id?: string;
    claim: string;
    normalizedClaim: string;
    isTrue: boolean | null;
    isIntent?: boolean;
    isQuestion?: boolean;
    isOpinion?: boolean;
    isPoliticalAssertion?: boolean;
    confidenceScore: number;
    explanation: string;
    sources: SourceDto[];
    breakdown: {
        knowledgeBaseScore: number;
        aiScore: number;
        sourceScore: number;
        temporalScore: number;
        consensusScore: number;
    };
    timestamp: Date | string;
    verificationDepth: string;
}

// ============================================================================
// PUBLIC API - MAIN TRUTH SERVICE FACADE
// ============================================================================

export const truthService = {
    // --------
    // PRIMARY: Claim Verification
    // --------

    async verifyClaim(input: unknown, depth = 'deep'): Promise<UnifiedVerificationResult> {
        const claimText = toClaimText(input);
        if (!claimText) {
            throw new Error('Claim text cannot be empty.');
        }

        const localFindings = truthEngine.analyzeContent(claimText);
        const firstLocal = localFindings[0] || null;

        let remoteResult: TruthVerificationResponseDto | null = null;

        try {
            remoteResult = await truthApiMethods.verifyClaim(claimText, depth);
        } catch {
            remoteResult = null;
        }

        const isIntent = truthEngine.isIntent(claimText) || (firstLocal?.isIntent ?? false);
        const isQuestion = truthEngine.isQuestion(claimText) || (firstLocal?.isQuestion ?? false);
        const isOpinion = truthEngine.isOpinion(claimText) || (firstLocal?.isOpinion ?? false);
        const isPoliticalAssertion = truthEngine.isPoliticalAssertion(claimText) || (firstLocal?.isPoliticalAssertion ?? false) || Boolean((remoteResult as any)?.isPoliticalAssertion);

        const normalizedClaim = remoteResult?.normalizedClaim || truthEngine.normalizeClaim(claimText);
        let isTrue: boolean | null = remoteResult ? remoteResult.isTrue : (firstLocal ? firstLocal.isTrue : null);
        let confidenceScore = remoteResult ? Number(remoteResult.confidenceScore) : (firstLocal ? Number(firstLocal.confidence) : 0.5);

        if (isIntent) {
            isTrue = true;
            confidenceScore = 1.0;
        } else if (isPoliticalAssertion) {
            isTrue = null;
            confidenceScore = 0.50;
        }

        const explanation = remoteResult?.explanation
            || firstLocal?.correction
            || (isTrue === true ? 'Verified as true by system truth algorithms.' : isTrue === false ? 'Debunked by verified truth algorithms.' : 'Inconclusive empirical evidence.');

        const sources: SourceDto[] = (remoteResult?.sources && remoteResult.sources.length > 0)
            ? remoteResult.sources
            : (firstLocal?.source ? [{ url: `source://${firstLocal.source.toLowerCase()}`, title: firstLocal.source, sourceType: 'Authority', reliabilityScore: 0.95, verdict: firstLocal.isTrue ? 'Supports' : 'Contradicts' }] : []);

        const breakdown = remoteResult?.breakdown || {
            knowledgeBaseScore: firstLocal?.evidenceType === 'knowledge_base_exact' ? 0.95 : 0.60,
            aiScore: remoteResult ? 0.85 : 0.50,
            sourceScore: sources.length > 0 ? 0.80 : 0.50,
            temporalScore: 0.75,
            consensusScore: 0.70
        };

        const result: UnifiedVerificationResult = {
            id: `verify-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            claim: claimText,
            normalizedClaim,
            isTrue,
            isIntent,
            isQuestion,
            isOpinion,
            isPoliticalAssertion,
            confidenceScore,
            explanation,
            sources,
            breakdown,
            timestamp: remoteResult?.timestamp || new Date().toISOString(),
            verificationDepth: depth
        };

        const history = safeReadHistory();
        safeSaveHistory([result, ...history.filter((h: any) => h.claim !== result.claim)]);

        return result;
    },

    async verifyBatch(claims: string[]): Promise<UnifiedVerificationResult[]> {
        const list = Array.isArray(claims) ? claims : [];
        const results = await Promise.all(list.map((claim) => this.verifyClaim(claim, 'quick')));
        return results;
    },

    // --------
    // SCORING & SOURCES
    // --------

    async getTruthScore(content: string) {
        const text = String(content || '').trim();
        let remoteScore = null;

        try {
            remoteScore = await truthApiMethods.getTruthScore(text);
        } catch {
            remoteScore = null;
        }

        const localScore = truthEngine.getTruthScore(text);
        const blendedScore = remoteScore ? Math.round(((remoteScore.score * 100) + localScore) / 2) : localScore;
        const badge = truthEngine.getTruthBadge(blendedScore);

        return {
            score: blendedScore,
            confidence: remoteScore?.confidence ?? (blendedScore / 100),
            accuracy: remoteScore?.accuracy ?? (blendedScore / 100),
            badge,
            claims: remoteScore?.claims || []
        };
    },

    async findSources(content: string) {
        const text = String(content || '').trim();
        try {
            const sources = await truthApiMethods.findSources(text);
            if (Array.isArray(sources) && sources.length > 0) {
                return sources;
            }
        } catch {
            // Fallback to local engine
        }

        const localFindings = truthEngine.analyzeContent(text);
        return localFindings.map((f: any) => ({
            url: `source://${String(f.source || 'truth-engine').toLowerCase()}`,
            title: String(f.source || 'Truth Engine Reference'),
            sourceType: f.evidenceType || 'General',
            reliabilityScore: f.confidence || 0.75,
            verdict: f.isTrue === true ? 'Supports' : f.isTrue === false ? 'Contradicts' : 'Neutral'
        }));
    },

    // --------
    // CONSENSUS & VOTING (from truthConsensusService)
    // --------

    async getConsensus(claimId: string): Promise<ConsensusResponseDto> {
        try {
            const remote = await truthApiMethods.getConsensus(claimId);
            return remote;
        } catch {
            const votes = safeReadVotes();
            const userVote = votes[claimId];
            return {
                claimId,
                confidence: userVote ? 0.75 : 0.50,
                consensusStatus: userVote ? (userVote.vote ? 'Supported' : 'Contradicted') : 'Uncertain',
                totalVotes: userVote ? 1 : 0,
                supportVotes: userVote && userVote.vote ? 1 : 0,
                againstVotes: userVote && !userVote.vote ? 1 : 0
            };
        }
    },

    async voteOnClaim(claimId: string, vote: boolean, confidence = 5): Promise<ConsensusResponseDto> {
        const votes = safeReadVotes();
        votes[claimId] = { vote, confidence, timestamp: new Date().toISOString() };
        safeSaveVotes(votes);

        try {
            const response = await truthApiMethods.voteOnClaim(claimId, vote, confidence);
            return response;
        } catch {
            return {
                claimId,
                confidence,
                consensusStatus: vote ? 'Supported' : 'Contradicted',
                totalVotes: 1,
                supportVotes: vote ? 1 : 0,
                againstVotes: !vote ? 1 : 0
            };
        }
    },

    // --------
    // CONTRADICTION DETECTION (from truthContradictionService)
    // --------

    async detectContradictions(claim: string): Promise<ContradictionResponseDto> {
        const localFindings = truthEngine.analyzeContent(claim);
        const localContradictions = localFindings
            .filter((f: any) => f.isTrue === false && f.confidence > 0.8)
            .map((f: any) => ({
                existingClaim: f.claim,
                existingVerdict: false,
                confidence: f.confidence
            }));

        try {
            const remote = await truthApiMethods.detectContradictions(claim);
            const combined = [
                ...remote.contradictions,
                ...localContradictions.filter((lc: any) => !remote.contradictions.some((rc) => rc.existingClaim.toLowerCase() === lc.existingClaim.toLowerCase()))
            ];

            return {
                claim,
                hasContradictions: combined.length > 0,
                contradictions: combined
            };
        } catch {
            return {
                claim,
                hasContradictions: localContradictions.length > 0,
                contradictions: localContradictions
            };
        }
    },

    // --------
    // TEMPORAL ANALYSIS (from truthTemporalService)
    // --------

    async analyzeTemporal(claim: string): Promise<TemporalAnalysisResponseDto> {
        try {
            const remote = await truthApiMethods.analyzeTemporal(claim);
            return remote;
        } catch {
            return {
                claim,
                firstAppearance: new Date().toISOString(),
                evolution: [
                    {
                        timestamp: new Date().toISOString(),
                        verdict: null,
                        confidence: 0.50
                    }
                ],
                trend: 'Stable'
            };
        }
    },

    // --------
    // CONTENT ANALYSIS
    // --------

    async analyzeContent(content: string) {
        const text = String(content || '').trim();
        return truthEngine.analyzeContent(text);
    },

    // --------
    // ENHANCED ASSESSMENT (from EnhancedTruthCheckerService)
    // --------

    async assessClaim(claim: string) {
        if (!claim || !claim.trim()) {
            return {
                claim: '',
                truthScore: 100,
                isReliable: true,
                misbeliefs: [],
                verdict: 'No claim to assess'
            };
        }

        try {
            return await truthApiMethods.assessClaim(claim);
        } catch {
            return this._createFallbackAssessment(claim);
        }
    },

    async detectMisbeliefs(text: string) {
        try {
            return await truthApiMethods.detectMisbeliefs(text);
        } catch {
            return { misbeliefs: [], confidence: 0 };
        }
    },

    async detectFallacies(text: string) {
        try {
            return await truthApiMethods.detectFallacies(text);
        } catch {
            return { fallacies: localFallacyDetector.detectAll(text), totalCount: 0 };
        }
    },

    async detectCognitiveBiases(text: string) {
        try {
            return await truthApiMethods.detectCognitiveBiases(text);
        } catch {
            return { biases: cognitiveBlasDetector.detectAll(text), riskLevel: 'medium' };
        }
    },

    async getMisbeliefTrends(timeframe = '7days') {
        try {
            return await truthApiMethods.getMisbeliefTrends(timeframe);
        } catch {
            return { topMisbeliefs: [], topFallacies: [], topBiases: [] };
        }
    },

    // --------
    // STATISTICS & HISTORY
    // --------

    async getStats() {
        try {
            return await truthApiMethods.getStats();
        } catch {
            return truthEngine.getTruthAnalytics('week');
        }
    },

    async getVerificationHistory(page = 1, pageSize = 20) {
        const history = safeReadHistory();
        const start = Math.max(0, (page - 1) * pageSize);
        const items = history.slice(start, start + pageSize);

        return {
            items,
            page,
            pageSize,
            total: history.length
        };
    },

    async addToKnowledgeBase(fact: {
        claim: string;
        isTrue: boolean;
        confidence: number;
        sources?: string[];
        explanation?: string;
        category?: string;
    }) {
        try {
            return await truthApiMethods.addToKnowledgeBase(fact);
        } catch {
            return { success: false, message: 'Failed to add to knowledge base' };
        }
    },

    // --------
    // INTERNAL HELPERS
    // --------

    _createFallbackAssessment(claim: string) {
        const fallacies = localFallacyDetector.detectAll(claim);
        const biases = cognitiveBlasDetector.detectAll(claim);
        const hasSignificantIssues = fallacies.some(f => f.severity === 'high') || 
                                      biases.some(b => b.riskLevel === 'high');

        return {
            claim,
            truthScore: hasSignificantIssues ? 30 : 60,
            isReliable: !hasSignificantIssues,
            misbeliefs: [],
            fallacies,
            biases,
            verdict: hasSignificantIssues ? 'High probability of misleading content' : 'Claim contains some issues',
            riskLevel: hasSignificantIssues ? 'high' : 'medium',
            offline: true
        };
    }
};

export default truthService;
