import React, { useEffect, useState } from 'react';
import { plannerState } from '../Services/PlannerState';
import PlannerDialog from '../Components/Modal/PlannerDialog.jsx';

const PlannerPage = () => {
    const [state, setState] = useState(plannerState.getState());
    const [dialogSection, setDialogSection] = useState('tasks');
    const [dialogOpen, setDialogOpen] = useState(false);

    useEffect(() => {
        const unsubscribe = plannerState.subscribe(setState);
        return () => unsubscribe();
    }, []);

    const stats = [
        { label: 'Completed Today', value: state.stats.dailyCompleted, icon: 'CD' },
        { label: 'Pending Tasks', value: state.stats.pendingTasks, icon: 'PT' },
        { label: 'Productivity', value: `${state.stats.productivityScore}%`, icon: 'PR' },
        { label: 'Goals Achieved', value: state.stats.goalsAchieved, icon: 'GA' }
    ];

    const openDialog = (section) => {
        setDialogSection(section);
        setDialogOpen(true);
    };

    return (
        <div>
            <div
                style={{
                    background: 'var(--card-bg)',
                    padding: '20px',
                    borderRadius: '12px',
                    marginBottom: '20px',
                    border: '1px solid var(--border-color)'
                }}
            >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px' }}>
                    {stats.map((stat) => (
                        <div
                            key={stat.label}
                            style={{
                                textAlign: 'center',
                                padding: '15px',
                                background: 'rgba(255, 255, 255, 0.05)',
                                borderRadius: '8px'
                            }}
                        >
                            <div
                                style={{
                                    fontSize: '20px',
                                    fontWeight: 'bold',
                                    color: 'var(--highlight-color)',
                                    marginBottom: '5px'
                                }}
                            >
                                {stat.icon} {stat.value}
                            </div>
                            <div
                                style={{
                                    fontSize: '12px',
                                    color: 'var(--light-color)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '1px'
                                }}
                            >
                                {stat.label}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '12px',
                    marginBottom: '20px'
                }}
            >
                {['tasks', 'goals', 'calendar', 'analytics'].map((tab) => (
                    <button
                        key={tab}
                        onClick={() => openDialog(tab)}
                        style={{
                            padding: '14px 18px',
                            borderRadius: '14px',
                            border: '1px solid var(--border-color)',
                            background: 'var(--card-bg)',
                            color: 'var(--text-color)',
                            cursor: 'pointer',
                            transition: 'all 0.3s',
                            textAlign: 'left'
                        }}
                    >
                        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--light-color)' }}>
                            Open record and edit dialog
                        </div>
                    </button>
                ))}
            </div>

            <PlannerDialog
                isOpen={dialogOpen}
                onClose={() => setDialogOpen(false)}
                section={dialogSection}
                state={state}
            />
        </div>
    );
};

export default PlannerPage;
