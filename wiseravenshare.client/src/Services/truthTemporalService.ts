import { truthApiService } from './truthApiService.ts';
import type { TemporalAnalysisResponseDto } from './truthApiService.ts';

export const truthTemporalService = {
    async analyzeTemporal(claim: string): Promise<TemporalAnalysisResponseDto> {
        try {
            const remote = await truthApiService.analyzeTemporal(claim);
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
    }
};

export default truthTemporalService;
