// src/components/truth/TruthVerifier.tsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTruthEngine } from '../../hooks/useTruthEngine';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { 
    FiCheckCircle, 
    FiXCircle, 
    FiAlertCircle, 
    FiInfo, 
    FiLink,
    FiFileText,
    FiUsers,
    FiAward,
    FiTrendingUp,
    FiShield
} from 'react-icons/fi';

export const TruthVerifier: React.FC = () => {
    const [claim, setClaim] = useState('');
    const [depth, setDepth] = useState<'quick' | 'standard' | 'deep'>('standard');
    const { verifyClaim, currentVerification, isVerifying } = useTruthEngine();

    const handleVerify = async () => {
        if (!claim.trim()) return;
        await verifyClaim(claim);
    };

    const getConfidenceColor = (score: number) => {
        if (score >= 0.80) return 'text-green-400';
        if (score >= 0.60) return 'text-yellow-400';
        if (score >= 0.40) return 'text-orange-400';
        return 'text-red-400';
    };

    const getConfidenceBackground = (score: number) => {
        if (score >= 0.80) return 'bg-green-500/20 border-green-500/30';
        if (score >= 0.60) return 'bg-yellow-500/20 border-yellow-500/30';
        if (score >= 0.40) return 'bg-orange-500/20 border-orange-500/30';
        return 'bg-red-500/20 border-red-500/30';
    };

    const getVerdictIcon = (isTrue: boolean | null) => {
        if (isTrue === true) return <FiCheckCircle className="w-8 h-8 text-green-400" />;
        if (isTrue === false) return <FiXCircle className="w-8 h-8 text-red-400" />;
        return <FiAlertCircle className="w-8 h-8 text-yellow-400" />;
    };

    const getVerdictText = (isTrue: boolean | null) => {
        if (isTrue === true) return 'Verified - This claim is TRUE';
        if (isTrue === false) return 'Debunked - This claim is FALSE';
        return 'Uncertain - Insufficient evidence';
    };

    return (
        <div className="space-y-6">
            {/* Input Section */}
            <Card className="p-6">
                <div className="space-y-4">
                    <h3 className="text-xl font-semibold flex items-center gap-2">
                        <FiShield className="text-primary" />
                        Truth Verifier
                    </h3>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">
                            Enter a claim to verify
                        </label>
                        <div className="flex gap-3">
                            <input
                                type="text"
                                value={claim}
                                onChange={(e) => setClaim(e.target.value)}
                                placeholder="e.g., 'The Earth is flat'"
                                className="flex-1 px-4 py-3 bg-white/5 border border-border rounded-lg focus:border-primary focus:ring-1 focus:ring-primary transition"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleVerify();
                                    }
                                }}
                            />
                            <Button 
                                onClick={handleVerify}
                                disabled={isVerifying || !claim.trim()}
                                className="min-w-[120px]"
                            >
                                {isVerifying ? (
                                    <LoadingSpinner size="sm" />
                                ) : (
                                    'Verify'
                                )}
                            </Button>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        {(['quick', 'standard', 'deep'] as const).map((d) => (
                            <button
                                key={d}
                                onClick={() => setDepth(d)}
                                className={`px-3 py-1.5 rounded-lg text-sm transition ${
                                    depth === d 
                                        ? 'bg-primary text-white' 
                                        : 'bg-white/5 hover:bg-white/10'
                                }`}
                            >
                                {d.charAt(0).toUpperCase() + d.slice(1)}
                            </button>
                        ))}
                    </div>

                    <p className="text-xs text-gray-500">
                        {depth === 'quick' && 'Fast verification using knowledge base only'}
                        {depth === 'standard' && 'Standard verification with AI and source checking'}
                        {depth === 'deep' && 'Comprehensive verification with all layers'}
                    </p>
                </div>
            </Card>

            {/* Results Section */}
            <AnimatePresence>
                {currentVerification && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                    >
                        <Card className={`p-6 border-2 ${getConfidenceBackground(currentVerification.confidenceScore)}`}>
                            {/* Header */}
                            <div className="flex items-start gap-4">
                                <div className="flex-shrink-0">
                                    {getVerdictIcon(currentVerification.isTrue)}
                                </div>
                                <div className="flex-1">
                                    <h4 className="text-lg font-semibold">
                                        {getVerdictText(currentVerification.isTrue)}
                                    </h4>
                                    <p className="text-sm text-gray-400 mt-1">
                                        {currentVerification.claim}
                                    </p>
                                </div>
                            </div>

                            {/* Confidence Score */}
                            <div className="mt-4">
                                <div className="flex justify-between text-sm mb-1">
                                    <span>Confidence Score</span>
                                    <span className={getConfidenceColor(currentVerification.confidenceScore)}>
                                        {(currentVerification.confidenceScore * 100).toFixed(1)}%
                                    </span>
                                </div>
                                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                    <div 
                                        className={`h-full transition-all duration-1000 ${
                                            currentVerification.confidenceScore >= 0.80 ? 'bg-green-500' :
                                            currentVerification.confidenceScore >= 0.60 ? 'bg-yellow-500' :
                                            currentVerification.confidenceScore >= 0.40 ? 'bg-orange-500' :
                                            'bg-red-500'
                                        }`}
                                        style={{ width: `${currentVerification.confidenceScore * 100}%` }}
                                    />
                                </div>
                            </div>

                            {/* Breakdown */}
                            {currentVerification.breakdown && (
                                <div className="mt-4 grid grid-cols-5 gap-2">
                                    <div className="text-center p-2 bg-white/5 rounded-lg">
                                        <div className="text-xs text-gray-400">Knowledge</div>
                                        <div className="text-sm font-semibold">
                                            {(currentVerification.breakdown.knowledgeBaseScore * 100).toFixed(0)}%
                                        </div>
                                    </div>
                                    <div className="text-center p-2 bg-white/5 rounded-lg">
                                        <div className="text-xs text-gray-400">AI</div>
                                        <div className="text-sm font-semibold">
                                            {(currentVerification.breakdown.aiScore * 100).toFixed(0)}%
                                        </div>
                                    </div>
                                    <div className="text-center p-2 bg-white/5 rounded-lg">
                                        <div className="text-xs text-gray-400">Sources</div>
                                        <div className="text-sm font-semibold">
                                            {(currentVerification.breakdown.sourceScore * 100).toFixed(0)}%
                                        </div>
                                    </div>
                                    <div className="text-center p-2 bg-white/5 rounded-lg">
                                        <div className="text-xs text-gray-400">Temporal</div>
                                        <div className="text-sm font-semibold">
                                            {(currentVerification.breakdown.temporalScore * 100).toFixed(0)}%
                                        </div>
                                    </div>
                                    <div className="text-center p-2 bg-white/5 rounded-lg">
                                        <div className="text-xs text-gray-400">Consensus</div>
                                        <div className="text-sm font-semibold">
                                            {(currentVerification.breakdown.consensusScore * 100).toFixed(0)}%
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Explanation */}
                            {currentVerification.explanation && (
                                <div className="mt-4 p-3 bg-white/5 rounded-lg">
                                    <p className="text-sm">{currentVerification.explanation}</p>
                                </div>
                            )}

                            {/* Sources */}
                            {currentVerification.sources && currentVerification.sources.length > 0 && (
                                <div className="mt-4">
                                    <h5 className="text-sm font-medium mb-2 flex items-center gap-2">
                                        <FiLink /> Sources ({currentVerification.sources.length})
                                    </h5>
                                    <div className="space-y-2 max-h-40 overflow-y-auto">
                                        {currentVerification.sources.slice(0, 5).map((source, index) => (
                                            <div 
                                                key={index}
                                                className="flex items-center justify-between p-2 bg-white/5 rounded-lg text-sm"
                                            >
                                                <div className="flex-1 truncate">
                                                    <a 
                                                        href={source.url} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className="hover:text-primary transition"
                                                    >
                                                        {source.title || source.url}
                                                    </a>
                                                </div>
                                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                                    source.verdict === 'supports' 
                                                        ? 'bg-green-500/20 text-green-400'
                                                        : source.verdict === 'contradicts'
                                                        ? 'bg-red-500/20 text-red-400'
                                                        : 'bg-yellow-500/20 text-yellow-400'
                                                }`}>
                                                    {source.verdict}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="mt-4 flex gap-2 pt-4 border-t border-border">
                                <Button variant="ghost" size="sm">
                                    <FiFileText className="mr-1" /> Copy Report
                                </Button>
                                <Button variant="ghost" size="sm">
                                    <FiUsers className="mr-1" /> Share
                                </Button>
                                <Button variant="ghost" size="sm" className="ml-auto">
                                    <FiInfo className="mr-1" /> Learn More
                                </Button>
                            </div>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};