// src/components/planner/TaskBoard.tsx
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { plannerService } from '../../services/plannerService';
import { FiPlus, FiClock, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';

export const TaskBoard: React.FC = () => {
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [selectedColumn, setSelectedColumn] = useState('day');
    const [newTask, setNewTask] = useState({
        title: '',
        description: '',
        priority: 'Medium',
        column: 'day',
        dueDate: '',
        estimatedHours: 1,
        goalId: '',
    });

    const queryClient = useQueryClient();

    const { data: tasks, isLoading } = useQuery({
        queryKey: ['tasks'],
        queryFn: plannerService.getTasks,
    });

    const createTaskMutation = useMutation({
        mutationFn: plannerService.createTask,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
            setShowCreateModal(false);
            setNewTask({ title: '', description: '', priority: 'Medium', column: 'day', dueDate: '', estimatedHours: 1, goalId: '' });
            toast.success('Task created successfully!');
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to create task');
        },
    });

    const updateTaskMutation = useMutation({
        mutationFn: ({ id, data }: any) => plannerService.updateTask(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
        },
    });

    const deleteTaskMutation = useMutation({
        mutationFn: plannerService.deleteTask,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
            toast.success('Task deleted successfully!');
        },
    });

    const columns = [
        { id: 'day', title: 'Today', icon: '☀️' },
        { id: 'week', title: 'This Week', icon: '📅' },
        { id: 'month', title: 'This Month', icon: '📆' },
    ];

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'Urgent': return 'border-red-500 bg-red-500/10';
            case 'High': return 'border-orange-500 bg-orange-500/10';
            case 'Medium': return 'border-yellow-500 bg-yellow-500/10';
            case 'Low': return 'border-green-500 bg-green-500/10';
            default: return 'border-gray-500 bg-white/5';
        }
    };

    const handleDragEnd = (result: any) => {
        if (!result.destination) return;

        const { draggableId, destination } = result;
        const task = tasks?.find((t: any) => t.id === draggableId);
        if (task && task.column !== destination.droppableId) {
            updateTaskMutation.mutate({
                id: task.id,
                data: { column: destination.droppableId },
            });
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
        <>
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">Task Board</h2>
                <Button onClick={() => {
                    setSelectedColumn('day');
                    setShowCreateModal(true);
                }}>
                    <FiPlus className="mr-2" />
                    Add Task
                </Button>
            </div>

            <DragDropContext onDragEnd={handleDragEnd}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {columns.map((column) => (
                        <Droppable key={column.id} droppableId={column.id}>
                            {(provided, snapshot) => (
                                <div
                                    ref={provided.innerRef}
                                    {...provided.droppableProps}
                                    className={`rounded-xl border border-border bg-card/50 p-4 min-h-[400px] transition ${snapshot.isDraggingOver ? 'bg-primary/5 border-primary' : ''
                                        }`}
                                >
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="font-semibold">
                                            {column.icon} {column.title}
                                        </h3>
                                        <span className="text-sm text-gray-400">
                                            {tasks?.filter((t: any) => t.column === column.id).length || 0}
                                        </span>
                                    </div>

                                    <div className="space-y-3">
                                        {tasks
                                            ?.filter((task: any) => task.column === column.id)
                                            .map((task: any, index: number) => (
                                                <Draggable
                                                    key={task.id}
                                                    draggableId={task.id}
                                                    index={index}
                                                >
                                                    {(provided, snapshot) => (
                                                        <motion.div
                                                            ref={provided.innerRef}
                                                            {...provided.draggableProps}
                                                            {...provided.dragHandleProps}
                                                            className={`p-3 rounded-lg border ${getPriorityColor(task.priority)} ${snapshot.isDragging ? 'shadow-lg scale-105' : ''
                                                                }`}
                                                            initial={{ opacity: 0, y: 20 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            transition={{ delay: index * 0.05 }}
                                                        >
                                                            <div className="flex items-start justify-between">
                                                                <div className="flex-1">
                                                                    <h4 className="font-medium text-sm">{task.title}</h4>
                                                                    {task.description && (
                                                                        <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                                                                            {task.description}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                                <button
                                                                    onClick={() => {
                                                                        if (window.confirm('Delete this task?')) {
                                                                            deleteTaskMutation.mutate(task.id);
                                                                        }
                                                                    }}
                                                                    className="p-1 rounded-lg hover:bg-white/5 text-gray-400 hover:text-red-400 transition"
                                                                >
                                                                    <FiAlertCircle className="w-3 h-3" />
                                                                </button>
                                                            </div>
                                                            <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                                                                {task.dueDate && (
                                                                    <span className="flex items-center gap-1">
                                                                        <FiClock className="w-3 h-3" />
                                                                        {new Date(task.dueDate).toLocaleDateString()}
                                                                    </span>
                                                                )}
                                                                {task.estimatedHours && (
                                                                    <span>{task.estimatedHours}h est.</span>
                                                                )}
                                                                {task.status === 'Completed' && (
                                                                    <span className="text-green-400 flex items-center gap-1">
                                                                        <FiCheckCircle className="w-3 h-3" />
                                                                        Done
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </Draggable>
                                            ))}
                                        {provided.placeholder}
                                    </div>

                                    <button
                                        onClick={() => {
                                            setSelectedColumn(column.id);
                                            setShowCreateModal(true);
                                        }}
                                        className="w-full mt-3 p-2 rounded-lg border border-dashed border-border hover:border-primary hover:bg-primary/5 transition text-gray-400 hover:text-white"
                                    >
                                        <FiPlus className="inline mr-1" />
                                        Add Task
                                    </button>
                                </div>
                            )}
                        </Droppable>
                    ))}
                </div>
            </DragDropContext>

            {/* Create Task Modal */}
            <Modal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                title="Create New Task"
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">
                            Title *
                        </label>
                        <input
                            type="text"
                            value={newTask.title}
                            onChange={(e) => setNewTask(prev => ({ ...prev, title: e.target.value }))}
                            placeholder="Enter task title"
                            className="w-full px-3 py-2 bg-white/5 border border-border rounded-lg focus:border-primary focus:ring-1 focus:ring-primary transition"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">
                            Description
                        </label>
                        <textarea
                            value={newTask.description}
                            onChange={(e) => setNewTask(prev => ({ ...prev, description: e.target.value }))}
                            placeholder="Enter task description"
                            rows={2}
                            className="w-full px-3 py-2 bg-white/5 border border-border rounded-lg focus:border-primary focus:ring-1 focus:ring-primary transition resize-none"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">
                                Column
                            </label>
                            <select
                                value={newTask.column}
                                onChange={(e) => setNewTask(prev => ({ ...prev, column: e.target.value }))}
                                className="w-full px-3 py-2 bg-white/5 border border-border rounded-lg focus:border-primary focus:ring-1 focus:ring-primary transition"
                            >
                                <option value="day">Today</option>
                                <option value="week">This Week</option>
                                <option value="month">This Month</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">
                                Priority
                            </label>
                            <select
                                value={newTask.priority}
                                onChange={(e) => setNewTask(prev => ({ ...prev, priority: e.target.value }))}
                                className="w-full px-3 py-2 bg-white/5 border border-border rounded-lg focus:border-primary focus:ring-1 focus:ring-primary transition"
                            >
                                <option value="Low">Low</option>
                                <option value="Medium">Medium</option>
                                <option value="High">High</option>
                                <option value="Urgent">Urgent</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">
                                Due Date
                            </label>
                            <input
                                type="datetime-local"
                                value={newTask.dueDate}
                                onChange={(e) => setNewTask(prev => ({ ...prev, dueDate: e.target.value }))}
                                className="w-full px-3 py-2 bg-white/5 border border-border rounded-lg focus:border-primary focus:ring-1 focus:ring-primary transition"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">
                                Est. Hours
                            </label>
                            <input
                                type="number"
                                value={newTask.estimatedHours}
                                onChange={(e) => setNewTask(prev => ({ ...prev, estimatedHours: parseFloat(e.target.value) }))}
                                min="0.5"
                                step="0.5"
                                className="w-full px-3 py-2 bg-white/5 border border-border rounded-lg focus:border-primary focus:ring-1 focus:ring-primary transition"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="ghost" onClick={() => setShowCreateModal(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => {
                                if (!newTask.title.trim()) {
                                    toast.error('Please enter a task title');
                                    return;
                                }
                                createTaskMutation.mutate(newTask);
                            }}
                            disabled={createTaskMutation.isPending}
                        >
                            {createTaskMutation.isPending ? 'Creating...' : 'Create Task'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </>
    );
};