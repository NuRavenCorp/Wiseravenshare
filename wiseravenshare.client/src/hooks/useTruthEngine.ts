// src/hooks/useTruthEngine.ts
import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { truthService } from '../services/truthService';

interface TruthVerificationResult {
    id?: string;
    claim: string;
    normalizedClaim: string;
    isTrue: boolean | null;
    confidenceScore: number;
    explanation: string;
    sources: Source[];
    breakdown: VerificationBreakdown;
    timestamp: Date;
    verificationDepth: string;
}

interface Source {
    url: string;
    title: string;
    sourceType: string;
    reliabilityScore: number;
    verdict: string;
    publishedDate?: Date;
}

interface VerificationBreakdown {
    knowledgeBaseScore: number;
    aiScore: number;
    sourceScore: number;
    temporalScore: number;
    consensusScore: number;
}

export const useTruthEngine = () => {
    const queryClient = useQueryClient();
    const [currentVerification, setCurrentVerification] = useState<TruthVerificationResult | null>(null);
    const [isVerifying, setIsVerifying] = useState(false);

    // Verify a single claim
    const verifyClaim = useMutation({
        mutationFn: async (claim: string) => {
            setIsVerifying(true);
            try {
                const result = await truthService.verifyClaim(claim);
                setCurrentVerification(result);
                return result;
            } finally {
                setIsVerifying(false);
            }
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['truth-history'] });
        }
    });

    // Verify in batch
    const verifyBatch = useMutation({
        mutationFn: async (claims: string[]) => {
            return await truthService.verifyBatch(claims);
        }
    });

    // Get truth score for content
    const getTruthScore = useMutation({
        mutationFn: async (content: string) => {
            return await truthService.getTruthScore(content);
        }
    });

    // Find sources
    const findSources = useMutation({
        mutationFn: async (claim: string) => {
            return await truthService.findSources(claim);
        }
    });

    // Get consensus
    const getConsensus = useMutation({
        mutationFn: async (claimId: string) => {
            return await truthService.getConsensus(claimId);
        }
    });

    // Vote on claim
    const voteOnClaim = useMutation({
        mutationFn: async ({ claimId, vote }: { claimId: string; vote: boolean }) => {
            return await truthService.voteOnClaim(claimId, vote);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['consensus'] });
        }
    });

    // Analyze content for misinformation
    const analyzeContent = useMutation({
        mutationFn: async (content: string) => {
            return await truthService.analyzeContent(content);
        }
    });

    // Get truth stats
    const useTruthStats = () => {
        return useQuery({
            queryKey: ['truth-stats'],
            queryFn: () => truthService.getStats(),
            refetchInterval: 60000,
        });
    };

    // Get verification history
    const useVerificationHistory = (page: number = 1, pageSize: number = 20) => {
        return useQuery({
            queryKey: ['truth-history', page, pageSize],
            queryFn: () => truthService.getVerificationHistory(page, pageSize),
        });
    };

    return {
        verifyClaim: verifyClaim.mutateAsync,
        verifyBatch: verifyBatch.mutateAsync,
        getTruthScore: getTruthScore.mutateAsync,
        findSources: findSources.mutateAsync,
        getConsensus: getConsensus.mutateAsync,
        voteOnClaim: voteOnClaim.mutateAsync,
        analyzeContent: analyzeContent.mutateAsync,
        useTruthStats,
        useVerificationHistory,
        currentVerification,
        isVerifying,
        isPending: verifyClaim.isPending || verifyBatch.isPending
    };
};