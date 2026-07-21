// src/components/truth/ClaimChecker.tsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { truthService } from '../../services/truthService';
import {
    FiSearch,
    FiCheckCircle,
    FiXCircle,
    FiAlertCircle,
    FiLink,
    FiMic,
    FiFileText
} from 'react-icons/fi';

export const ClaimChecker: React.FC = () => {
    const [claim, setClaim] = useState('');
    const [inputMethod, setInputMethod] = useState<'text' | 'voice' | 'url'>('text');

    const verifyMutation = useMutation({
        mutationFn: truthService.verifyClaim,
        onSuccess: (data) => {
            setResult(data);
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to verify claim');
        }
    });

    const [result, setResult] = useState<any>(null);

    const handleVerify = async () => {
        if (!claim.trim()) {
            toast.error('Please enter a claim to verify');
            return;
        }
        verifyMutation.mutate({ claimText: claim });
    };

    const getResultColor = (score: number) => {
        if (score > 70) return 'text-green-400 border-green-500/20 bg-green-500/10';
        if (score > 40) return 'text-yellow-400 border-yellow-500/20 bg-yellow-500/10';
        return 'text-red-400 border-red-500/20 bg-red-500/10';
    };

    const getResultIcon = (score: number) => {
        if (score > 70) return <FiCheckCircle className="w-12 h-12 text-green-400" />;
        if (score > 40) return <FiAlertCircle className="w-12 h-12 text-yellow-400" />;
        return <FiXCircle className="w-12 h-12 text-red-400" />;
    };

    return (
        <div className="space-y-6">
            {/* Input Section */}
            <Card className="p-6">
                <div className="space-y-4">
                    <div className="flex gap-2">
                        <button
                            onClick={() => setInputMethod('text')}
                            className={`px-4 py-2 rounded-lg transition ${inputMethod === 'text'
                                    ? 'bg-primary text-white'
                                    : 'bg-white/5 hover:bg-white/10'
                                }`}
                        >
                            <FiFileText className="inline mr-2" />
                            Text
                        </button>
                        <button
                            onClick={() => setInputMethod('voice')}
                            className={`px-4 py-2 rounded-lg transition ${inputMethod === 'voice'
                                    ? 'bg-primary text-white'
                                    : 'bg-white/5 hover:bg-white/10'
                                }`}
                        >
                            <FiMic className="inline mr-2" />
                            Voice
                        </button>
                        <button
                            onClick={() => setInputMethod('url')}
                            className={`px-4 py-2 rounded-lg transition ${inputMethod === 'url'
                                    ? 'bg-primary text-white'
                                    : 'bg-white/5 hover:bg-white/10'
                                }`}
                        >
                            <FiLink className="inline mr-2" />
                            URL
                        </button>
                    </div>

                    <div className="flex gap-3">
                        <input
                            type="text"
                            value={claim}
                            onChange={(e) => setClaim(e.target.value)}
                            placeholder="Enter a claim to verify..."
                            className="flex-1 px-4 py-3 bg-white/5 border border-border rounded-lg focus:border-primary focus:ring-1 focus:ring-primary transition"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleVerify();
                            }}
                        />
                        <Button
                            onClick={handleVerify}
                            disabled={verifyMutation.isPending}
                        >
                            <FiSearch className="mr-2" />
                            {verifyMutation.isPending ? 'Verifying...' : 'Verify'}
                        </Button>
                    </div>

                    {inputMethod === 'voice' && (
                        <div className="p-6 bg-white/5 rounded-lg text-center border border-dashed border-border">
                            <p className="text-gray-400">🎤 Click to start speaking</p>
                            <p className="text-xs text-gray-500 mt-1">
                                Supported in Chrome, Edge, and Safari
                            </p>
                        </div>
                    )}

                    {inputMethod === 'url' && (
                        <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                            <p className="text-sm text-yellow-400">
                                ⚠️ We'll extract claims from the URL and verify each one
                            </p>
                        </div>
                    )}
                </div>
            </Card>

            {/* Results */}
            {result && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <Card className={`p-6 border-2 ${getResultColor(result.truthScore)}`}>
                        <div className="flex items-start gap-6">
                            <div className="flex-shrink-0">
                                {getResultIcon(result.truthScore)}
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                    <h3 className="text-lg font-semibold">
                                        {result.truthScore > 70 ? 'Verified ✅' :
                                            result.truthScore > 40 ? 'Questionable ⚠️' :
                                                'Debunked ❌'}
                                    </h3>
                                    <span className="text-sm text-gray-400">
                                        Confidence: {result.confidence}%
                                    </span>
                                </div>

                                <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-4">
                                    <div
                                        className={`h-full rounded-full transition-all duration-1000 ${result.truthScore > 70 ? 'bg-green-500' :
                                                result.truthScore > 40 ? 'bg-yellow-500' :
                                                    'bg-red-500'
                                            }`}
                                        style={{ width: `${result.truthScore}%` }}
                                    />
                                </div>

                                <div className="space-y-3">
                                    {result.correction && (
                                        <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                                            <p className="text-sm font-medium text-green-400">Correction:</p>
                                            <p className="text-sm">{result.correction}</p>
                                        </div>
                                    )}

                                    {result.explanation && (
                                        <div>
                                            <p className="text-sm font-medium text-gray-400">Explanation:</p>
                                            <p className="text-sm">{result.explanation}</p>
                                        </div>
                                    )}

                                    {result.sources && result.sources.length > 0 && (
                                        <div>
                                            <p className="text-sm font-medium text-gray-400 mb-2">Sources:</p>
                                            <div className="space-y-2">
                                                {result.sources.map((source: any, idx: number) => (
                                                    <div
                                                        key={idx}
                                                        className="flex items-center justify-between p-2 bg-white/5 rounded-lg text-sm"
                                                    >
                                                        <span>{source.name}</span>
                                                        <span className={`text-xs ${source.verdict === 'supports'
                                                                ? 'text-green-400'
                                                                : 'text-red-400'
                                                            }`}>
                                                            {source.verdict === 'supports' ? '✓ Supports' : '✗ Contradicts'}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </Card>
                </motion.div>
            )}
        </div>
    );
};