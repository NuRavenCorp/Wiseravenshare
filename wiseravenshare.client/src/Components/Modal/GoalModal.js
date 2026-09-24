// GoalModal.jsx
import React, { useState, useEffect } from 'react';
import { plannerState } from '../../Services/PlannerState';

const GoalModal = ({ isOpen, onClose, type, editingGoal }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState('medium');
    const [dueDate, setDueDate] = useState('');

    useEffect(() => {
        if (editingGoal) {
            setTitle(editingGoal.title);
            setDescription(editingGoal.description);
            setPriority(editingGoal.priority);
            setDueDate(editingGoal.dueDate || '');
        } else {
            setTitle('');
            setDescription('');
            setPriority('medium');
            setDueDate('');
        }
    }, [editingGoal, isOpen]);

    const handleSubmit = () => {
        if (!title.trim()) return;

        if (editingGoal) {
            plannerState.updateGoal(editingGoal.id, { title, description, priority, dueDate });
        } else {
            plannerState.addGoal(type, { title, description, priority, dueDate });
        }
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
        }} onClick={onClose}>
            <div style={{
                background: 'var(--card-bg)',
                padding: '30px',
                borderRadius: '12px',
                width: '90%',
                maxWidth: '500px',
                border: '1px solid var(--border-color)'
            }} onClick={(e) => e.stopPropagation()}>
                <h3 style={{ marginBottom: '20px' }}>{editingGoal ? 'Edit Goal' : `Add ${type === 'next' ? 'Action' : 'Goal'}`}</h3>

                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--light-color)' }}>Title</label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '12px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            color: 'var(--text-color)'
                        }}
                    />
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--light-color)' }}>Description</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows="3"
                        style={{
                            width: '100%',
                            padding: '12px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            color: 'var(--text-color)',
                            resize: 'vertical'
                        }}
                    />
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--light-color)' }}>Priority</label>
                    <select
                        value={priority}
                        onChange={(e) => setPriority(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '12px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            color: 'var(--text-color)'
                        }}
                    >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                    </select>
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--light-color)' }}>Due Date</label>
                    <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '12px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            color: 'var(--text-color)'
                        }}
                    />
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button onClick={onClose} style={{
                        padding: '10px 20px',
                        borderRadius: '6px',
                        border: 'none',
                        background: 'rgba(255, 255, 255, 0.1)',
                        color: 'var(--text-color)',
                        cursor: 'pointer'
                    }}>Cancel</button>
                    <button onClick={handleSubmit} style={{
                        padding: '10px 20px',
                        borderRadius: '6px',
                        border: 'none',
                        background: 'var(--highlight-color)',
                        color: 'white',
                        cursor: 'pointer'
                    }}>Save</button>
                </div>
            </div>
        </div>
    );
};

export default GoalModal;