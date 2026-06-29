import React, { useState } from 'react';
import { plannerState } from '../../Services/PlannerState';
import GoalModal from '../Modal/GoalModal.jsx';

const GoalSection = ({ type, title }) => {
    const [state, setState] = useState(plannerState.getState());
    const [modalOpen, setModalOpen] = useState(false);
    const [editingGoal, setEditingGoal] = useState(null);

    React.useEffect(() => {
        const unsubscribe = plannerState.subscribe(setState);
        return () => unsubscribe();
    }, []);

    const goals = state.goals[type] || [];

    const getPriorityColor = (priority) => {
        switch (priority) {
            case 'urgent': return '#ef4444';
            case 'high': return '#f59e0b';
            case 'medium': return '#10b981';
            case 'low': return '#3b82f6';
            default: return 'var(--highlight-color)';
        }
    };

    const calculateDaysLeft = (dueDate) => {
        if (!dueDate) return null;
        const days = Math.ceil((new Date(dueDate) - new Date()) / (1000 * 60 * 60 * 24));
        return days;
    };

    return (
        <>
            <div style={{
                background: 'var(--card-bg)',
                padding: '20px',
                borderRadius: '12px',
                marginBottom: '20px',
                border: '1px solid var(--border-color)'
            }}>
                <h3 style={{
                    color: 'var(--light-color)',
                    marginBottom: '15px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    {title}
                    <span style={{
                        background: 'rgba(255, 255, 255, 0.1)',
                        padding: '2px 10px',
                        borderRadius: '20px',
                        fontSize: '14px'
                    }}>{goals.length}</span>
                </h3>

                <div>
                    {goals.map(goal => (
                        <div
                            key={goal.id}
                            style={{
                                background: 'rgba(255, 255, 255, 0.05)',
                                padding: '15px',
                                margin: '10px 0',
                                borderRadius: '8px',
                                borderLeft: `4px solid ${getPriorityColor(goal.priority)}`,
                                transition: 'all 0.3s ease',
                                position: 'relative'
                            }}
                        >
                            <strong>{goal.title}</strong>
                            <p style={{ margin: '5px 0', fontSize: '12px', opacity: 0.8 }}>
                                {goal.description}
                            </p>

                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginTop: '8px',
                                fontSize: '12px'
                            }}>
                                <span style={{
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    background: `rgba(${getPriorityColor(goal.priority)}, 0.2)`,
                                    color: getPriorityColor(goal.priority)
                                }}>
                                    {goal.priority}
                                </span>
                                {goal.dueDate && (
                                    <span>
                                        {calculateDaysLeft(goal.dueDate)} days left
                                    </span>
                                )}
                            </div>

                            <div style={{
                                height: '6px',
                                background: 'rgba(255, 255, 255, 0.1)',
                                borderRadius: '3px',
                                marginTop: '10px',
                                overflow: 'hidden'
                            }}>
                                <div style={{
                                    width: `${goal.progress || 0}%`,
                                    height: '100%',
                                    background: 'linear-gradient(90deg, var(--success-color), var(--medium))',
                                    transition: 'width 0.3s'
                                }}></div>
                            </div>

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
                                    onClick={() => {
                                        setEditingGoal(goal);
                                        setModalOpen(true);
                                    }}
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
                                    ✎
                                </button>
                                <button
                                    onClick={() => plannerState.deleteGoal(goal.id)}
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
                        setEditingGoal(null);
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
                        gap: '8px'
                    }}
                >
                    <i className="fas fa-plus"></i> Add {type === 'next' ? 'Action' : 'Goal'}
                </button>
            </div>

            <GoalModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                type={type}
                editingGoal={editingGoal}
            />
        </>
    );
};

export default GoalSection;