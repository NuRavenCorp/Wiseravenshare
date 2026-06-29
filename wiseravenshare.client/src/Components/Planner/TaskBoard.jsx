import React, { useState } from 'react';
import { plannerState } from '../../Services/PlannerState';
import TaskModal from '../Modal/TaskModal.jsx';
import { rankTasksForExecution } from '../../Services/EngagementAlgorithms';

const TaskBoard = () => {
    const [state, setState] = useState(plannerState.getState());
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedColumn, setSelectedColumn] = useState(null);
    const [draggedTask, setDraggedTask] = useState(null);

    React.useEffect(() => {
        const unsubscribe = plannerState.subscribe(setState);
        return () => unsubscribe();
    }, []);

    const columns = [
        { id: 'day', title: 'Today', icon: '☀️' },
        { id: 'week', title: 'This Week', icon: '📅' },
        { id: 'month', title: 'This Month', icon: '📆' }
    ];

    const handleDragStart = (e, taskId) => {
        setDraggedTask(taskId);
        e.dataTransfer.setData('text/plain', taskId);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };

    const handleDrop = (e, columnId) => {
        e.preventDefault();
        if (draggedTask) {
            plannerState.moveTask(draggedTask, columnId);
            setDraggedTask(null);
        }
    };

    const getPriorityColor = (priority) => {
        switch (priority) {
            case 'urgent': return '#ef4444';
            case 'high': return '#f59e0b';
            case 'medium': return '#10b981';
            case 'low': return '#3b82f6';
            default: return 'var(--highlight-color)';
        }
    };

    return (
        <>
            <div style={{
                display: 'flex',
                gap: '25px',
                overflowX: 'auto',
                padding: '15px 0'
            }}>
                {columns.map(column => (
                    <div
                        key={column.id}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, column.id)}
                        style={{
                            minWidth: '320px',
                            padding: '20px',
                            background: 'var(--secondary-color)',
                            borderRadius: '12px',
                            border: '1px solid var(--border-color)',
                            display: 'flex',
                            flexDirection: 'column',
                            height: '600px'
                        }}
                    >
                        <h4 style={{
                            color: 'var(--light-color)',
                            marginBottom: '20px',
                            paddingBottom: '15px',
                            borderBottom: '1px solid var(--border-color)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <span>{column.icon} {column.title}</span>
                            <span style={{
                                background: 'rgba(255, 255, 255, 0.1)',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                fontSize: '12px'
                            }}>{state.tasks[column.id].length}</span>
                        </h4>

                        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '5px' }}>
                            {rankTasksForExecution(state.tasks[column.id]).map(task => (
                                <div
                                    key={task.id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, task.id)}
                                    style={{
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        padding: '15px',
                                        margin: '10px 0',
                                        borderRadius: '8px',
                                        cursor: 'move',
                                        borderLeft: `4px solid ${getPriorityColor(task.priority)}`,
                                        transition: 'all 0.3s ease',
                                        position: 'relative'
                                    }}
                                >
                                    <strong>{task.title}</strong>
                                    <p style={{ margin: '5px 0', fontSize: '12px', opacity: 0.8 }}>
                                        {task.description}
                                    </p>
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        marginTop: '8px',
                                        fontSize: '12px',
                                        color: 'var(--light-color)'
                                    }}>
                                        <span style={{
                                            padding: '2px 8px',
                                            borderRadius: '12px',
                                            background: 'rgba(255,255,255,0.12)',
                                            color: getPriorityColor(task.priority)
                                        }}>
                                            {task.priority}
                                        </span>
                                        <span style={{ color: 'var(--highlight-color)' }}>AI rank {task.priorityScore ?? '-'}</span>
                                        {task.estimate && <span>⏱️ {task.estimate}h</span>}
                                    </div>
                                    {task.recommendedPriority && task.recommendedPriority !== task.priority && (
                                        <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--highlight-color)' }}>
                                            Suggested priority: {task.recommendedPriority}
                                        </div>
                                    )}

                                    <div style={{
                                        position: 'absolute',
                                        right: '10px',
                                        top: '10px',
                                        display: 'flex',
                                        gap: '8px',
                                        opacity: 0,
                                        transition: 'opacity 0.3s'
                                    }}>
                                        <button
                                            onClick={() => plannerState.completeTask(task.id)}
                                            style={{
                                                background: 'rgba(255, 255, 255, 0.1)',
                                                border: 'none',
                                                color: 'var(--text-color)',
                                                width: '24px',
                                                height: '24px',
                                                borderRadius: '4px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            ✓
                                        </button>
                                        <button
                                            onClick={() => plannerState.deleteTask(task.id)}
                                            style={{
                                                background: 'rgba(255, 255, 255, 0.1)',
                                                border: 'none',
                                                color: 'var(--error-color)',
                                                width: '24px',
                                                height: '24px',
                                                borderRadius: '4px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            ✗
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={() => {
                                setSelectedColumn(column.id);
                                setModalOpen(true);
                            }}
                            style={{
                                background: 'var(--highlight-color)',
                                color: 'var(--text-color)',
                                border: 'none',
                                padding: '10px 16px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                marginTop: '10px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px'
                            }}
                        >
                            <i className="fas fa-plus"></i> Add Task
                        </button>
                    </div>
                ))}
            </div>

            <TaskModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                column={selectedColumn}
            />
        </>
    );
};

export default TaskBoard;
