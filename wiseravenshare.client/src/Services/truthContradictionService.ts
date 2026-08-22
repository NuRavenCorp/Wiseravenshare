import { truthApiService } from './truthApiService.ts';
import type { ContradictionResponseDto } from './truthApiService.ts';
import { truthEngine } from './TruthDetectionEngine.js';

export const truthContradictionService = {
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
            const remote = await truthApiService.detectContradictions(claim);
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
    }
};

export default truthContradictionService;
