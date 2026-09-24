// TaskModal.jsx
import React, { useState, useEffect } from 'react';
import { plannerState } from '../../Services/PlannerState';

const TaskModal = ({ isOpen, onClose, column }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState('medium');
    const [dueDate, setDueDate] = useState('');
    const [estimate, setEstimate] = useState(1);

    useEffect(() => {
        if (isOpen) {
            // Set default due date based on column
            const now = new Date();
            let defaultDate = new Date();

            if (column === 'day') {
                defaultDate.setHours(now.getHours() + 2);
            } else if (column === 'week') {
                defaultDate.setDate(now.getDate() + 3);
            } else if (column === 'month') {
                defaultDate.setDate(now.getDate() + 14);
            }

            setDueDate(defaultDate.toISOString().slice(0, 16));
        }
    }, [isOpen, column]);

    const handleSubmit = () => {
        if (!title.trim()) return;

        plannerState.addTask(column, {
            title,
            description,
            priority,
            dueDate,
            estimate
        });
        onClose();

        // Reset form
        setTitle('');
        setDescription('');
        setPriority('medium');
        setEstimate(1);
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
                <h3 style={{ marginBottom: '20px' }}>Add Task to {column?.charAt(0).toUpperCase() + column?.slice(1)}</h3>

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
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--light-color)' }}>Due Date & Time</label>
                    <input
                        type="datetime-local"
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

                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--light-color)' }}>Time Estimate (hours)</label>
                    <input
                        type="number"
                        value={estimate}
                        onChange={(e) => setEstimate(parseFloat(e.target.value))}
                        min="0.5"
                        step="0.5"
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
                    }}>Add Task</button>
                </div>
            </div>
        </div>
    );
};

export default TaskModal;