// src/pages/EvolutionDashboard.tsx
import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
    LineChart, Line, AreaChart, Area, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell
} from 'recharts';
import { useEvolution } from '../contexts/EvolutionContext';
import { useSignalR } from '../hooks/useSignalR';
import { Card } from '../components/ui/Card';
import { AgentCard } from '../components/evolution/AgentCard';
import { EvolutionTimeline } from '../components/evolution/EvolutionTimeline';
import { SystemStatus } from '../components/evolution/SystemStatus';
import { api } from '../services/api';

const EvolutionDashboard: React.FC = () => {
    const { agents, evolutions, systemStatus, refreshData } = useEvolution();
    const { connection } = useSignalR('/hubs/evolution');
    const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

    // Subscribe to real-time evolution events
    useEffect(() => {
        if (connection) {
            connection.on('AgentEvolved', (data) => {
                refreshData();
            });

            connection.on('SystemMetrics', (data) => {
                // Update metrics in real-time
            });

            return () => {
                connection.off('AgentEvolved');
                connection.off('SystemMetrics');
            };
        }
    }, [connection, refreshData]);

    // Fetch evolution analytics
    const { data: analytics } = useQuery({
        queryKey: ['evolution-analytics'],
        queryFn: () => api.getEvolutionAnalytics(),
        refetchInterval: 30000,
    });

    const COLORS = ['#667eea', '#764ba2', '#10b981', '#f59e0b', '#ef4444'];

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="container py-8"
        >
            {/* Header */}
            <div className="flex-between mb-8">
                <div>
                    <h1 className="text-4xl font-bold gradient-text">Evolution Dashboard</h1>
                    <p className="text-gray-400 mt-2">
                        Monitor and control the self-evolving AI ecosystem
                    </p>
                </div>
                <div className="flex gap-4">
                    <button
                        onClick={() => refreshData()}
                        className="px-6 py-3 rounded-xl bg-primary hover:bg-primary-dark transition-all"
                    >
                        <i className="fas fa-sync-alt mr-2"></i>
                        Refresh
                    </button>
                    <button
                        onClick={() => window.location.href = '/evolution/configure'}
                        className="px-6 py-3 rounded-xl border border-border hover:bg-white/5 transition-all"
                    >
                        <i className="fas fa-cog mr-2"></i>
                        Configure
                    </button>
                </div>
            </div>

            {/* System Status */}
            <SystemStatus status={systemStatus} />

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <Card className="p-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                            <i className="fas fa-robot text-2xl text-primary"></i>
                        </div>
                        <div>
                            <p className="text-sm text-gray-400">Total Agents</p>
                            <p className="text-2xl font-bold">{systemStatus?.totalAgents || 0}</p>
                        </div>
                    </div>
                </Card>
                <Card className="p-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center">
                            <i className="fas fa-chart-line text-2xl text-success"></i>
                        </div>
                        <div>
                            <p className="text-sm text-gray-400">Avg Fitness</p>
                            <p className="text-2xl font-bold">{systemStatus?.avgFitness?.toFixed(1) || 0}%</p>
                        </div>
                    </div>
                </Card>
                <Card className="p-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-warning/20 flex items-center justify-center">
                            <i className="fas fa-bolt text-2xl text-warning"></i>
                        </div>
                        <div>
                            <p className="text-sm text-gray-400">Evolutions</p>
                            <p className="text-2xl font-bold">{systemStatus?.totalEvolutions || 0}</p>
                        </div>
                    </div>
                </Card>
                <Card className="p-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-info/20 flex items-center justify-center">
                            <i className="fas fa-users text-2xl text-info"></i>
                        </div>
                        <div>
                            <p className="text-sm text-gray-400">Active Agents</p>
                            <p className="text-2xl font-bold">{systemStatus?.activeAgents || 0}</p>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <Card className="p-6">
                    <h3 className="text-lg font-semibold mb-4">Fitness Evolution</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={analytics?.fitnessHistory || []}>
                                <defs>
                                    <linearGradient id="fitnessGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#667eea" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#667eea" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                                <XAxis dataKey="timestamp" stroke="var(--highlight-color)" />
                                <YAxis stroke="var(--highlight-color)" />
                                <Tooltip
                                    contentStyle={{
                                        background: 'var(--card-bg)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '8px',
                                    }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="value"
                                    stroke="#667eea"
                                    fill="url(#fitnessGradient)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                <Card className="p-6">
                    <h3 className="text-lg font-semibold mb-4">Agent Distribution</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={analytics?.agentDistribution || []}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    dataKey="value"
                                >
                                    {(analytics?.agentDistribution || []).map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            </div>

            {/* Agent Grid */}
            <div className="mb-8">
                <h3 className="text-xl font-semibold mb-4">Active Agents</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {agents?.map(agent => (
                        <AgentCard
                            key={agent.id}
                            agent={agent}
                            onClick={() => setSelectedAgent(agent.id)}
                            isSelected={selectedAgent === agent.id}
                        />
                    ))}
                </div>
            </div>

            {/* Evolution Timeline */}
            <div>
                <h3 className="text-xl font-semibold mb-4">Evolution Timeline</h3>
                <EvolutionTimeline evolutions={evolutions} />
            </div>

            {/* Real-time Metrics Footer */}
            {connection && connection.state === 'Connected' && (
                <div className="fixed bottom-4 right-4 flex items-center gap-2 px-4 py-2 rounded-full bg-success/20 border border-success/30 text-success text-sm">
                    <span className="w-2 h-2 rounded-full bg-success animate-pulse"></span>
                    Live Connection
                </div>
            )}
        </motion.div>
    );
};

export default EvolutionDashboard;