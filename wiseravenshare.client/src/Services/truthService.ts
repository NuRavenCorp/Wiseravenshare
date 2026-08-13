import truthEngine from './truthEngine';

const toClaimText = (input: unknown): string => {
    if (typeof input === 'string') {
        return input;
    }

    if (input && typeof input === 'object' && 'claimText' in input) {
        return String((input as { claimText?: unknown }).claimText || '');
    }

    return '';
};

export const truthService = {
    async verifyClaim(input: unknown) {
        const claimText = toClaimText(input);
        return truthEngine.verifyClaim(claimText);
    },

    async verifyBatch(claims: string[]) {
        const values = Array.isArray(claims) ? claims : [];
        return values.map((claim) => truthEngine.verifyClaim(claim));
    },

    async getTruthScore(content: string) {
        const score = truthEngine.getTruthScore(content);
        return { score, badge: truthEngine.getTruthBadge(score) };
    },

    async findSources(content: string) {
        return truthEngine.verifyWithSources(content);
    },

    async getConsensus(claimId: string) {
        return {
            claimId,
            support: 0,
            contradict: 0,
            undecided: 0,
            consensusScore: 0
        };
    },

    async voteOnClaim({ claimId, vote }: { claimId: string; vote: boolean }) {
        return {
            claimId,
            acceptedVote: vote,
            updatedAt: new Date().toISOString()
        };
    },

    async analyzeContent(content: string) {
        return truthEngine.analyzeContent(content);
    },

    async getStats() {
        return truthEngine.getTruthAnalytics('week');
    },

    async getVerificationHistory(page = 1, pageSize = 20) {
        const history = Array.isArray(truthEngine.disputeHistory) ? truthEngine.disputeHistory : [];
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
