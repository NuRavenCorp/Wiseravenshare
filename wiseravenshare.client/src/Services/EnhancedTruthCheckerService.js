// wiseravenshare.client/src/Services/EnhancedTruthCheckerService.js
import { apiService } from './api';

/**
 * Enhanced Truth Checker Service
 * Integrates with backend DeepSeek-powered truth verification engine
 * Detects misbeliefs, logical fallacies, false premises, and cognitive biases
 */
export const enhancedTruthCheckerService = {
    /**
     * Comprehensive claim assessment
     * Returns detailed misbelief analysis, fallacy detection, and truth score
     */
    assessClaim: async (claim) => {
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
            const response = await apiService.post('/truthengine/assess-comprehensive', {
                claim: claim.trim()
            });

            return response.data || createDefaultAssessment(claim);
        } catch (error) {
            console.error('Truth assessment failed:', error);
            return createFallbackAssessment(claim);
        }
    },

    /**
     * Quick misbelief detection
     * Fast check for obvious false claims, logical fallacies
     */
    detectMisbeliefs: async (text) => {
        try {
            const response = await apiService.post('/truthengine/detect-misbeliefs', {
                text: text.trim()
            });
            return response.data || { misbeliefs: [], confidence: 0 };
        } catch (error) {
            console.error('Misbelief detection failed:', error);
            return { misbeliefs: [], confidence: 0 };
        }
    },

    /**
     * Logical fallacy detection
     * Identifies ad hominem, straw man, false dilemma, etc.
     */
    detectFallacies: async (text) => {
        try {
            const response = await apiService.post('/truthengine/detect-fallacies', {
                text: text.trim()
            });
            return response.data || { fallacies: [], totalCount: 0 };
        } catch (error) {
            console.error('Fallacy detection failed:', error);
            return { fallacies: [], totalCount: 0 };
        }
    },

    /**
     * Analyzes statement for cognitive biases
     * Detects confirmation bias, availability heuristic, appeal to fear, etc.
     */
    detectCognitiveBiases: async (text) => {
        try {
            const response = await apiService.post('/truthengine/detect-biases', {
                text: text.trim()
            });
            return response.data || { biases: [], riskLevel: 'low' };
        } catch (error) {
            console.error('Bias detection failed:', error);
            return { biases: [], riskLevel: 'low' };
        }
    },

    /**
     * Batch verification
     * Verify multiple claims at once
     */
    verifyClaims: async (claims) => {
        if (!Array.isArray(claims) || claims.length === 0) {
            return [];
        }

        try {
            const response = await apiService.post('/truthengine/verify-batch', {
                claims: claims.map(c => c.trim()).filter(Boolean)
            });
            return response.data || [];
        } catch (error) {
            console.error('Batch verification failed:', error);
            return claims.map(c => createFallbackAssessment(c));
        }
    },

    /**
     * Get misbelief trend report
     * Shows most common misbeliefs detected in a time period
     */
    getMisbeliefTrends: async (timeframe = '7days') => {
        try {
            const response = await apiService.get('/truthengine/trends', {
                params: { timeframe }
            });
            return response.data || {
                topMisbeliefs: [],
                topFallacies: [],
                topBiases: []
            };
        } catch (error) {
            console.error('Failed to fetch trends:', error);
            return { topMisbeliefs: [], topFallacies: [], topBiases: [] };
        }
    }
};

/**
 * Local fallacy detection (for offline support)
 * Pattern-based detection that works without backend
 */
export const localFallacyDetector = {
    /**
     * Ad Hominem - Attacking the person instead of the argument
     */
    isAdHominem: (text) => {
        const patterns = [
            /\b(person|guy|she|he|they)\s+(is|are)\s+(stupid|idiotic|dumb|crazy|insane)\b/i,
            /\b(you|they)\s+(are|is)\s+(an? )?(fool|idiot|moron|retard)/i,
            /\byou\s+(can't|don't|won't)\s+understand\b/i
        ];
        return patterns.some(p => p.test(text));
    },

    /**
     * Straw Man - Misrepresenting opponent's argument
     */
    isStrawMan: (text) => {
        const patterns = [
            /\b(they|you|opponents?)\s+want\s+to\s+(ban|destroy|eliminate|get rid of)\b/i,
            /\bso you're\s+saying\s+that\b/i,
            /\byour\s+argument\s+(is|amounts to)\b/i
        ];
        return patterns.some(p => p.test(text));
    },

    /**
     * False Dilemma - Only two options when more exist
     */
    isFalseDilemma: (text) => {
        const patterns = [
            /\b(either|you must)\s+.*\s+(or|you must)\s+.*$/i,
            /\byou're\s+(either|with us|against us)\b/i
        ];
        return patterns.some(p => p.test(text));
    },

    /**
     * Appeal to Authority without evidence
     */
    isAppealToAuthority: (text) => {
        const patterns = [
            /\b(experts?|scientists?|doctors?)\s+say\b(?!\s+(?:that|according to|research shows|found that))/i,
            /\b(they|authorities?)\s+claim\b(?!\s+with evidence)/i
        ];
        return patterns.some(p => p.test(text));
    },

    /**
     * Hasty Generalization - Sweeping claim without evidence
     */
    isHastyGeneralization: (text) => {
        const patterns = [
            /\b(all|every|none of)\s+\w+\s+(always|never)\b/i,
            /\b\w+\s+(always|never)\s+\w+\b/i,
            /\b(everyone|all people)\s+(knows?|believes?)\b/i
        ];
        return patterns.some(p => p.test(text));
    },

    /**
     * Slippery Slope - Assumes chain reaction without evidence
     */
    isSlipperySlope: (text) => {
        const patterns = [
            /\b(will lead to|eventually|inevitably|soon)\s+.*\b/i,
            /\bif we.*then\s+\w+.*will\b/i
        ];
        return patterns.some(p => p.test(text));
    },

    /**
     * Circular Reasoning - Uses conclusion as premise
     */
    isCircularReasoning: (text) => {
        const patterns = [
            /because\s+.*\s+is\s+(true|real|correct|facts?)\b/i,
            /\b(it's true because|it works because)\s+it\s+\w+\b/i
        ];
        return patterns.some(p => p.test(text));
    },

    /**
     * Detect all fallacies in text
     */
    detectAll: (text) => {
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

/**
 * Cognitive Bias Detector
 */
export const cognitiveBlasDetector = {
    /**
     * Confirmation Bias - seeking info that confirms existing beliefs
     */
    detectConfirmationBias: (text) => {
        const patterns = [
            /\b(obviously|clearly|of course|everyone knows|it's obvious)\b/i,
            /\b(as we all know|surely you agree)\b/i
        ];
        return patterns.some(p => p.test(text));
    },

    /**
     * Availability Heuristic - overweighting recent/memorable events
     */
    detectAvailabilityHeuristic: (text) => {
        const patterns = [
            /\b(recently|just (saw|read|heard|learned))\b/i,
            /\b(went viral|trending|breaking news)\b/i,
            /\b(just happened|just occurred)\b/i
        ];
        return patterns.some(p => p.test(text));
    },

    /**
     * Appeal to Fear - Using fear without proportional evidence
     */
    detectAppealToFear: (text) => {
        const patterns = [
            /\b(will destroy|will kill|deadly|dangerous threat|existential threat|catastrophic)\b/i,
            /\b(we must|act now|urgent|immediately)\b/i
        ];
        return patterns.some(p => p.test(text));
    },

    /**
     * Bandwagon - Appeal to popularity
     */
    detectBandwagon: (text) => {
        const patterns = [
            /\b(everyone|most people|the majority|most scientists)\s+(believes?|knows?|agrees?)\b/i,
            /\b(it's popular|everyone is doing)\b/i
        ];
        return patterns.some(p => p.test(text));
    },

    /**
     * Emotional Language indicating potential manipulation
     */
    detectEmotionalManipulation: (text) => {
        const patterns = [
            /\b(terrifying|horrifying|shocking|unbelievable|outrageous|disgusting)\b/i,
            /\b(heartbreaking|soul-crushing|devastating)\b/i
        ];
        return patterns.some(p => p.test(text));
    },

    /**
     * Detect all biases
     */
    detectAll: (text) => {
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

// Helper functions
function createDefaultAssessment(claim) {
    return {
        claim,
        truthScore: 50,
        isReliable: false,
        misbeliefs: [],
        fallacies: [],
        biases: [],
        verdict: 'Unable to assess claim',
        riskLevel: 'medium'
    };
}

function createFallbackAssessment(claim) {
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
