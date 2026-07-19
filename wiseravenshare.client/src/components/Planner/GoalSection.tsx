// src/components/planner/GoalSection.tsx
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { plannerService } from '../../services/plannerService';
import {
    FiPlus,
    FiTarget,
    FiClock,
    FiCheckCircle,
    FiMoreVertical,
    FiEdit2,
    FiTrash2
} from 'react-icons/fi';

export const GoalSection: React.FC = () => {
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [selectedGoal, setSelectedGoal] = useState<any>(null);
    const [newGoal, setNewGoal] = useState({
        title: '',
        description: '',
        type: 'LongTerm',
        priority: 'Medium',
        dueDate: '',
    });

    const queryClient = useQueryClient();

    const { data: goals, isLoading } = useQuery({
        queryKey: ['goals'],
        queryFn: plannerService.getGoals,
    });

    const createGoalMutation = useMutation({
        mutationFn: plannerService.createGoal,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['goals'] });
            setShowCreateModal(false);
            setNewGoal({ title: '', description: '', type: 'LongTerm', priority: 'Medium', dueDate: '' });
            toast.success('Goal created successfully!');
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to create goal');
        },
    });

    const updateGoalMutation = useMutation({
        mutationFn: ({ id, data }: any) => plannerService.updateGoal(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['goals'] });
            toast.success('Goal updated successfully!');
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to update goal');
        },
    });

    const deleteGoalMutation = useMutation({
        mutationFn: plannerService.deleteGoal,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['goals'] });
            toast.success('Goal deleted successfully!');
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to delete goal');
        },
    });

    const handleCreateGoal = async () => {
        if (!newGoal.title.trim()) {
            toast.error('Please enter a goal title');
            return;
        }
        createGoalMutation.mutate(newGoal);
    };

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'LongTerm': return 'text-blue-400 bg-blue-500/10';
            case 'ShortTerm': return 'text-green-400 bg-green-500/10';
            case 'NextAction': return 'text-orange-400 bg-orange-500/10';
            default: return 'text-gray-400 bg-white/5';
        }
    };

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'Urgent': return 'text-red-400 bg-red-500/10';
            case 'High': return 'text-orange-400 bg-orange-500/10';
            case 'Medium': return 'text-yellow-400 bg-yellow-500/10';
            case 'Low': return 'text-green-400 bg-green-500/10';
            default: return 'text-gray-400 bg-white/5';
        }
    };

    if (isLoading) {
        return (
            <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Your Goals</h2>
                <Button onClick={() => setShowCreateModal(true)}>
                    <FiPlus className="mr-2" />
                    New Goal
                </Button>
            </div>

            {/* Goals Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {goals?.map((goal: any) => (
                    <motion.div
                        key={goal.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        <Card className="p-4 hover:shadow-lg transition">
                            <div className="flex items-start justify-between">
                                <div>
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${getTypeColor(goal.type)}`}>
                                        {goal.type}
                                    </span>
                                    <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${getPriorityColor(goal.priority)}`}>
                                        {goal.priority}
                                    </span>
                                </div>
                                <div className="relative">
                                    <button
                                        onClick={() => setSelectedGoal(goal)}
                                        className="p-1 rounded-lg hover:bg-white/5"
                                    >
                                        <FiMoreVertical className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            <h3 className="text-lg font-semibold mt-2">{goal.title}</h3>
                            {goal.description && (
                                <p className="text-sm text-gray-400 mt-1 line-clamp-2">
                                    {goal.description}
                                </p>
                            )}

                            <div className="mt-4">
                                <div className="flex items-center justify-between text-sm text-gray-400 mb-1">
                                    <span>Progress</span>
                                    <span>{goal.progress}%</span>
                                </div>
                                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-500"
                                        style={{ width: `${goal.progress}%` }}
                                    />
                                </div>
                            </div>

                            {goal.dueDate && (
                                <div className="mt-3 flex items-center gap-2 text-sm text-gray-400">
                                    <FiClock className="w-4 h-4" />
                                    <span>Due: {new Date(goal.dueDate).toLocaleDateString()}</span>
                                </div>
                            )}

                            <div className="mt-3 flex items-center gap-2 text-sm text-gray-400">
                                <FiTarget className="w-4 h-4" />
                                <span>{goal.tasks?.length || 0} tasks</span>
                            </div>
                        </Card>
                    </motion.div>
                ))}
            </div>

            {/* Create Goal Modal */}
            <Modal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                title="Create New Goal"
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">
                            Title *
                        </label>
                        <input
                            type="text"
                            value={newGoal.title}
                            onChange={(e) => setNewGoal(prev => ({ ...prev, title: e.target.value }))}
                            placeholder="Enter goal title"
                            className="w-full px-3 py-2 bg-white/5 border border-border rounded-lg focus:border-primary focus:ring-1 focus:ring-primary transition"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">
                            Description
                        </label>
                        <textarea
                            value={newGoal.description}
                            onChange={(e) => setNewGoal(prev => ({ ...prev, description: e.target.value }))}
                            placeholder="Enter goal description"
                            rows={3}
                            className="w-full px-3 py-2 bg-white/5 border border-border rounded-lg focus:border-primary focus:ring-1 focus:ring-primary transition resize-none"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">
                                Type
                            </label>
                            <select
                                value={newGoal.type}
                                onChange={(e) => setNewGoal(prev => ({ ...prev, type: e.target.value }))}
                                className="w-full px-3 py-2 bg-white/5 border border-border rounded-lg focus:border-primary focus:ring-1 focus:ring-primary transition"
                            >
                                <option value="LongTerm">Long Term</option>
                                <option value="ShortTerm">Short Term</option>
                                <option value="NextAction">Next Action</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">
                                Priority
                            </label>
                            <select
                                value={newGoal.priority}
                                onChange={(e) => setNewGoal(prev => ({ ...prev, priority: e.target.value }))}
                                className="w-full px-3 py-2 bg-white/5 border border-border rounded-lg focus:border-primary focus:ring-1 focus:ring-primary transition"
                            >
                                <option value="Low">Low</option>
                                <option value="Medium">Medium</option>
                                <option value="High">High</option>
                                <option value="Urgent">Urgent</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">
                            Due Date
                        </label>
                        <input
                            type="date"
                            value={newGoal.dueDate}
                            onChange={(e) => setNewGoal(prev => ({ ...prev, dueDate: e.target.value }))}
                            className="w-full px-3 py-2 bg-white/5 border border-border rounded-lg focus:border-primary focus:ring-1 focus:ring-primary transition"
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="ghost" onClick={() => setShowCreateModal(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleCreateGoal}
                            disabled={createGoalMutation.isPending}
                        >
                            {createGoalMutation.isPending ? 'Creating...' : 'Create Goal'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};