// src/hooks/useTruthEngine.ts
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { truthService, UnifiedVerificationResult } from '../Services/truthService';

export const useTruthEngine = () => {
    const queryClient = useQueryClient();
    const [currentVerification, setCurrentVerification] = useState<UnifiedVerificationResult | null>(null);
    const [isVerifying, setIsVerifying] = useState(false);

    // Verify a single claim using tandem client/backend algorithms
    const verifyClaim = useMutation({
        mutationFn: async (claim: string | { claimText?: string; claim?: string }, depth = 'deep') => {
            setIsVerifying(true);
            try {
                const result = await truthService.verifyClaim(claim, depth);
                setCurrentVerification(result);
                return result;
            } finally {
                setIsVerifying(false);
            }
        },
        onSuccess: () => {
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
        mutationFn: async ({ claimId, vote, confidence }: { claimId: string; vote: boolean; confidence?: number }) => {
            return await truthService.voteOnClaim(claimId, vote, confidence);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['consensus'] });
        }
    });

    // Detect contradictions
    const detectContradictions = useMutation({
        mutationFn: async (claim: string) => {
            return await truthService.detectContradictions(claim);
        }
    });

    // Analyze temporal evolution
    const analyzeTemporal = useMutation({
        mutationFn: async (claim: string) => {
            return await truthService.analyzeTemporal(claim);
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
        detectContradictions: detectContradictions.mutateAsync,
        analyzeTemporal: analyzeTemporal.mutateAsync,
        analyzeContent: analyzeContent.mutateAsync,
        useTruthStats,
        useVerificationHistory,
        currentVerification,
        isVerifying,
        isPending: verifyClaim.isPending || verifyBatch.isPending
    };
};