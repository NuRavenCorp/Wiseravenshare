import { truthApiService } from './truthApiService.ts';
import type { ConsensusResponseDto } from './truthApiService.ts';

const VOTE_CACHE_KEY = 'wiseTruthVotes';

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

export const truthConsensusService = {
    async getConsensus(claimId: string): Promise<ConsensusResponseDto> {
        try {
            const remote = await truthApiService.getConsensus(claimId);
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

    async castVote(claimId: string, vote: boolean, confidence = 5): Promise<ConsensusResponseDto> {
        const votes = safeReadVotes();
        votes[claimId] = { vote, confidence, timestamp: new Date().toISOString() };
        safeSaveVotes(votes);

        try {
            const response = await truthApiService.voteOnClaim(claimId, vote, confidence);
            return response;
        } catch {
            return {
                claimId,
                confidence: confidence / 10,
                consensusStatus: vote ? 'Supported (Local)' : 'Contradicted (Local)',
                totalVotes: 1,
                supportVotes: vote ? 1 : 0,
                againstVotes: vote ? 0 : 1
            };
        }
    },

    getUserVote(claimId: string) {
        const votes = safeReadVotes();
        return votes[claimId] || null;
    }
};

export default truthConsensusService;
