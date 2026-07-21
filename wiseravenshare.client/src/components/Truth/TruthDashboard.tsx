// src/components/truth/TruthDashboard.tsx
import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Card } from '../ui/Card';
import { truthService } from '../../services/truthService';
import {
    FiShield,
    FiCheckCircle,
    FiXCircle,
    FiAlertCircle,
    FiTrendingUp,
    FiUsers,
    FiAward
} from 'react-icons/fi';

export const TruthDashboard: React.FC = () => {
    const { data: stats, isLoading } = useQuery({
        queryKey: ['truth-stats'],
        queryFn: truthService.getStats,
        refetchInterval: 60000,
    });

    const statCards = [
        {
            icon: FiCheckCircle,
            label: 'Verified Claims',
            value: stats?.verifiedClaims || 0,
            color: 'text-green-400',
            bg: 'bg-green-500/10',
        },
        {
            icon: FiXCircle,
            label: 'False Claims',
            value: stats?.falseClaims || 0,
            color: 'text-red-400',
            bg: 'bg-red-500/10',
        },
        {
            icon: FiAlertCircle,
            label: 'Disputed Claims',
            value: stats?.disputedClaims || 0,
            color: 'text-yellow-400',
            bg: 'bg-yellow-500/10',
        },
        {
            icon: FiTrendingUp,
            label: 'Avg Truth Score',
            value: `${stats?.avgTruthScore || 0}%`,
            color: 'text-primary',
            bg: 'bg-primary/10',
        },
    ];

    const userStats = [
        {
            icon: FiUsers,
            label: 'Active Verifiers',
            value: stats?.activeVerifiers || 0,
        },
        {
            icon: FiAward,
            label: 'Top Verifier',
            value: stats?.topVerifier || 'None',
        },
        {
            icon: FiShield,
            label: 'Community Accuracy',
            value: `${stats?.communityAccuracy || 0}%`,
        },
    ];

    if (isLoading) {
        return (
            <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {statCards.map((stat, index) => (
                    <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                    >
                        <Card className="p-6">
                            <div className="flex items-center gap-4">
                                <div className={`p-3 rounded-xl ${stat.bg}`}>
                                    <stat.icon className={`w-6 h-6 ${stat.color}`} />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold">{stat.value}</p>
                                    <p className="text-sm text-gray-400">{stat.label}</p>
                                </div>
                            </div>
                        </Card>
                    </motion.div>
                ))}
            </div>

            {/* User Stats */}
            <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">Community Truth Stats</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {userStats.map((stat) => (
                        <div key={stat.label} className="text-center p-4 bg-white/5 rounded-lg">
                            <stat.icon className="w-8 h-8 mx-auto mb-2 text-primary" />
                            <p className="text-2xl font-bold">{stat.value}</p>
                            <p className="text-sm text-gray-400">{stat.label}</p>
                        </div>
                    ))}
                </div>
            </Card>

            {/* Recent Verifications */}
            <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">Recent Verifications</h3>
                <div className="space-y-3">
                    {stats?.recentVerifications?.map((item: any, idx: number) => (
                        <div
                            key={idx}
                            className="flex items-center gap-3 p-3 bg-white/5 rounded-lg"
                        >
                            {item.isTrue ? (
                                <FiCheckCircle className="w-5 h-5 text-green-400" />
                            ) : (
                                <FiXCircle className="w-5 h-5 text-red-400" />
                            )}
                            <div className="flex-1">
                                <p className="text-sm">{item.claim}</p>
                                <p className="text-xs text-gray-400">{item.source}</p>
                            </div>
                            <span className="text-xs text-gray-400">
                                {new Date(item.timestamp).toLocaleTimeString()}
                            </span>
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
};