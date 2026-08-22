import { truthEngine } from './TruthDetectionEngine.js';
import { truthApiService } from './truthApiService.ts';
import type { TruthVerificationResponseDto, SourceDto } from './truthApiService.ts';
import { truthConsensusService } from './truthConsensusService.ts';
import { truthContradictionService } from './truthContradictionService.ts';
import { truthTemporalService } from './truthTemporalService.ts';

const VERIFICATION_HISTORY_KEY = 'wiseTruthHistory';

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

export const truthService = {
    async verifyClaim(input: unknown, depth = 'deep'): Promise<UnifiedVerificationResult> {
        const claimText = toClaimText(input);
        if (!claimText) {
            throw new Error('Claim text cannot be empty.');
        }

        // 1. Instant local engine evaluation (client-side tandem layer)
        const localFindings = truthEngine.analyzeContent(claimText);
        const firstLocal = localFindings[0] || null;

        let remoteResult: TruthVerificationResponseDto | null = null;

        // 2. Execute backend deep verification algorithm in tandem
        try {
            remoteResult = await truthApiService.verifyClaim(claimText, depth);
        } catch {
            remoteResult = null;
        }

        // Fast-path local handling for subjective intent / questions / opinions / political slogans
        const isIntent = truthEngine.isIntent(claimText) || (firstLocal?.isIntent ?? false);
        const isQuestion = truthEngine.isQuestion(claimText) || (firstLocal?.isQuestion ?? false);
        const isOpinion = truthEngine.isOpinion(claimText) || (firstLocal?.isOpinion ?? false);
        const isPoliticalAssertion = truthEngine.isPoliticalAssertion(claimText) || (firstLocal?.isPoliticalAssertion ?? false) || Boolean((remoteResult as any)?.isPoliticalAssertion);

        // 3. Synthesize backend truth results with local engine findings
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

        // Save to verification history
        const history = safeReadHistory();
        safeSaveHistory([result, ...history.filter((h: any) => h.claim !== result.claim)]);

        return result;
    },

    async verifyBatch(claims: string[]): Promise<UnifiedVerificationResult[]> {
        const list = Array.isArray(claims) ? claims : [];
        const results = await Promise.all(list.map((claim) => this.verifyClaim(claim, 'quick')));
        return results;
    },

    async getTruthScore(content: string) {
        const text = String(content || '').trim();
        let remoteScore = null;

        try {
            remoteScore = await truthApiService.getTruthScore(text);
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
            const sources = await truthApiService.findSources(text);
            if (Array.isArray(sources) && sources.length > 0) {
                return sources;
            }
        } catch {
            // Fallback to local engine source corroboration
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

    async getConsensus(claimId: string) {
        return truthConsensusService.getConsensus(claimId);
    },

    async voteOnClaim(claimId: string, vote: boolean, confidence = 5) {
        return truthConsensusService.castVote(claimId, vote, confidence);
    },

    async detectContradictions(claim: string) {
        return truthContradictionService.detectContradictions(claim);
    },

    async analyzeTemporal(claim: string) {
        return truthTemporalService.analyzeTemporal(claim);
    },

    async analyzeContent(content: string) {
        const text = String(content || '').trim();
        const local = truthEngine.analyzeContent(text);
        return local;
    },

    async getStats() {
        try {
            const remote = await truthApiService.getStats();
            return remote;
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
    }
};

export default truthService;
