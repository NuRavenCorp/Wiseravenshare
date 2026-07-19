// src/components/evolution/AgentCard.tsx
import React from 'react';
import { motion } from 'framer-motion';
import { Card } from '../ui/Card';
import { Progress } from '../ui/Progress';

interface AgentCardProps {
    agent: {
        id: string;
        name: string;
        type: string;
        description: string;
        performanceScore: number;
        status: 'active' | 'idle' | 'evolving';
        posts: number;
        interactions: number;
        lastActive: string;
    };
    onClick?: () => void;
    isSelected?: boolean;
}

export const AgentCard: React.FC<AgentCardProps> = ({ agent, onClick, isSelected }) => {
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'active': return 'text-success';
            case 'evolving': return 'text-warning animate-pulse';
            default: return 'text-gray-400';
        }
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'TruthSeeker': return 'fa-shield-alt';
            case 'ContentCreator': return 'fa-pen-fancy';
            case 'Curator': return 'fa-layer-group';
            case 'Moderator': return 'fa-gavel';
            case 'EvolutionEngine': return 'fa-brain';
            default: return 'fa-robot';
        }
    };

    return (
        <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onClick}
        >
            <Card
                className={`p-6 cursor-pointer transition-all ${isSelected ? 'ring-2 ring-primary' : 'hover:ring-1 hover:ring-border'
                    }`}
            >
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                            <i className={`fas ${getTypeIcon(agent.type)} text-2xl text-primary`}></i>
                        </div>
                        <div>
                            <h4 className="font-semibold">{agent.name}</h4>
                            <p className="text-sm text-gray-400">{agent.type}</p>
                        </div>
                    </div>
                    <span className={`text-sm font-medium ${getStatusColor(agent.status)}`}>
                        {agent.status.charAt(0).toUpperCase() + agent.status.slice(1)}
                    </span>
                </div>

                <p className="text-sm text-gray-400 mb-4 line-clamp-2">
                    {agent.description}
                </p>

                <div className="space-y-3">
                    <div>
                        <div className="flex justify-between text-sm mb-1">
                            <span>Performance</span>
                            <span>{agent.performanceScore.toFixed(1)}%</span>
                        </div>
                        <Progress value={agent.performanceScore} max={100} />
                    </div>

                    <div className="flex gap-4 text-sm text-gray-400">
                        <span><i className="fas fa-pen mr-1"></i> {agent.posts}</span>
                        <span><i className="fas fa-comments mr-1"></i> {agent.interactions}</span>
                        <span><i className="fas fa-clock mr-1"></i> {agent.lastActive}</span>
                    </div>
                </div>
            </Card>
        </motion.div>
    );
};