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
            const now = new Date();
            const defaultDate = new Date(now);
            if (column === 'day') defaultDate.setHours(now.getHours() + 2);
            if (column === 'week') defaultDate.setDate(now.getDate() + 3);
            if (column === 'month') defaultDate.setDate(now.getDate() + 14);
            setDueDate(defaultDate.toISOString().slice(0, 16));
        }
    }, [isOpen, column]);

    const handleSubmit = () => {
        if (!title.trim()) return;
        plannerState.addTask(column, { title, description, priority, dueDate, estimate });
        onClose();
        setTitle('');
        setDescription('');
        setPriority('medium');
        setEstimate(1);
    };

    if (!isOpen) return null;

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
            <div style={{ background: 'var(--card-bg)', padding: '30px', borderRadius: '12px', width: '90%', maxWidth: '500px', border: '1px solid var(--border-color)' }} onClick={(e) => e.stopPropagation()}>
                <h3 style={{ marginBottom: '20px' }}>Add Task to {column?.charAt(0).toUpperCase() + column?.slice(1)}</h3>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" style={{ width: '100%', marginBottom: '10px', padding: '10px' }} />
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows="3" placeholder="Description" style={{ width: '100%', marginBottom: '10px', padding: '10px' }} />
                <select value={priority} onChange={(e) => setPriority(e.target.value)} style={{ width: '100%', marginBottom: '10px', padding: '10px' }}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                </select>
                <input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ width: '100%', marginBottom: '10px', padding: '10px' }} />
                <input type="number" value={estimate} onChange={(e) => setEstimate(parseFloat(e.target.value))} min="0.5" step="0.5" style={{ width: '100%', marginBottom: '14px', padding: '10px' }} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button onClick={onClose}>Cancel</button>
                    <button onClick={handleSubmit}>Add Task</button>
                </div>
            </div>
        </div>
    );
};

export default TaskModal;
