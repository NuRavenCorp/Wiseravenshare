import React, { useState, useEffect } from 'react';
import { plannerState } from '../../Services/PlannerState';

const GoalModal = ({ isOpen, onClose, type, editingGoal }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState('medium');
    const [dueDate, setDueDate] = useState('');

    useEffect(() => {
        if (editingGoal) {
            setTitle(editingGoal.title || '');
            setDescription(editingGoal.description || '');
            setPriority(editingGoal.priority || 'medium');
            setDueDate(editingGoal.dueDate || '');
            return;
        }
        setTitle('');
        setDescription('');
        setPriority('medium');
        setDueDate('');
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
            <div style={{ background: 'var(--card-bg)', padding: '30px', borderRadius: '12px', width: '90%', maxWidth: '500px', border: '1px solid var(--border-color)' }} onClick={(e) => e.stopPropagation()}>
                <h3 style={{ marginBottom: '20px' }}>{editingGoal ? 'Edit Goal' : `Add ${type === 'next' ? 'Action' : 'Goal'}`}</h3>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" style={{ width: '100%', marginBottom: '10px', padding: '10px' }} />
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows="3" placeholder="Description" style={{ width: '100%', marginBottom: '10px', padding: '10px' }} />
                <select value={priority} onChange={(e) => setPriority(e.target.value)} style={{ width: '100%', marginBottom: '10px', padding: '10px' }}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                </select>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ width: '100%', marginBottom: '14px', padding: '10px' }} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button onClick={onClose}>Cancel</button>
                    <button onClick={handleSubmit}>Save</button>
                </div>
            </div>
        </div>
    );
};

export default GoalModal;
