import api from './api.js';

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

export const truthApiService = {
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
    }
};

export default truthApiService;
