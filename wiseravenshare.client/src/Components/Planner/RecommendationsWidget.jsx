import React, { useState, useEffect } from 'react';
import { plannerState } from '../../services/plannerState';

const RecommendationsWidget = () => {
    const [recommendations, setRecommendations] = useState([]);
    const [state, setState] = useState(plannerState.getState());

    useEffect(() => {
        const unsubscribe = plannerState.subscribe(setState);
        generateRecommendations();
        return () => unsubscribe();
    }, [state]);

    const generateRecommendations = () => {
        const recs = [];
        const now = new Date();

        // Check for overdue tasks
        for (const column in state.tasks) {
            for (const task of state.tasks[column]) {
                if (!task.completed && task.dueDate) {
                    const dueDate = new Date(task.dueDate);
                    const hoursLeft = (dueDate - now) / (1000 * 60 * 60);

                    if (hoursLeft < 0) {
                        recs.push({
                            text: `Overdue: ${task.title}`,
                            priority: 'urgent',
                            action: () => plannerState.completeTask(task.id)
                        });
                    } else if (hoursLeft < 24) {
                        recs.push({
                            text: `Due soon: ${task.title} (${Math.ceil(hoursLeft)}h left)`,
                            priority: 'high',
                            action: () => plannerState.moveTask(task.id, 'day')
                        });
                    }
                }
            }
        }

        // Productivity tips
        const tips = [
            "Take a 5-minute break every 25 minutes",
            "Review your goals weekly",
            "Delegate low-priority tasks",
            "Batch similar tasks together",
            "Set specific time blocks for deep work",
            "Use the 2-minute rule for small tasks",
            "Plan your day the night before"
        ];

        recs.push({
            text: tips[Math.floor(Math.random() * tips.length)],
            priority: 'low',
            action: () => { }
        });

        setRecommendations(recs.slice(0, 5));
    };

    const getPriorityColor = (priority) => {
        switch (priority) {
            case 'urgent': return '#ef4444';
            case 'high': return '#f59e0b';
            case 'medium': return '#10b981';
            default: return '#3b82f6';
        }
    };

    return (
        <div style={{
            background: 'var(--card-bg)',
            padding: '20px',
            borderRadius: '12px',
            border: '1px solid var(--border-color)'
        }}>
            <h3 style={{ marginBottom: '15px' }}>
                <i className="fas fa-robot"></i> AI Recommendations
            </h3>

            {recommendations.map((rec, index) => (
                <div
                    key={index}
                    style={{
                        padding: '12px',
                        marginBottom: '10px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        borderRadius: '8px',
                        borderLeft: `3px solid ${getPriorityColor(rec.priority)}`,
                        cursor: 'pointer',
                        transition: 'all 0.3s'
                    }}
                    onClick={rec.action}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'translateX(5px)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'translateX(0)'}
                >
                    {rec.text}
                </div>
            ))}

            {recommendations.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--highlight-color)', padding: '20px' }}>
                    <i className="fas fa-check-circle"></i> All caught up!
                </div>
            )}
        </div>
    );
};

export default RecommendationsWidget;