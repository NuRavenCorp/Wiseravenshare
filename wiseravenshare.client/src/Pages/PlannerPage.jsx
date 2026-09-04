import React, { useEffect, useMemo, useState } from 'react';
import Compartment from '../Components/Common/Compartment';
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

    const plannerOutline = useMemo(() => {
        const allGoals = Object.values(state.goals || {}).flat();
        const allTasks = Object.values(state.tasks || {}).flat();
        const allCalendarEntries = state.calendarEvents || [];
        const allAnalyticsEntries = state.analyticsEntries || [];

        const toOutlineRows = (items, titleSelector, dateSelector, limit = 3) => (
            [...items]
                .sort((left, right) => {
                    const leftTime = new Date(dateSelector(left) || 0).getTime();
                    const rightTime = new Date(dateSelector(right) || 0).getTime();
                    return rightTime - leftTime;
                })
                .slice(0, limit)
                .map((item) => titleSelector(item))
                .filter(Boolean)
        );

        return [
            {
                id: 'tasks',
                label: 'Tasks',
                count: allTasks.length,
                lines: toOutlineRows(allTasks, (item) => item.title, (item) => item.createdAt || item.dueDate)
            },
            {
                id: 'goals',
                label: 'Goals',
                count: allGoals.length,
                lines: toOutlineRows(allGoals, (item) => item.title, (item) => item.createdAt || item.dueDate)
            },
            {
                id: 'calendar',
                label: 'Calendar',
                count: allCalendarEntries.length,
                lines: toOutlineRows(allCalendarEntries, (item) => item.title, (item) => item.updatedAt || item.startAt)
            },
            {
                id: 'analytics',
                label: 'Analytics',
                count: allAnalyticsEntries.length,
                lines: toOutlineRows(allAnalyticsEntries, (item) => item.title, (item) => item.updatedAt || item.createdAt)
            }
        ];
    }, [state.analyticsEntries, state.calendarEvents, state.goals, state.tasks]);

    const openDialog = (section) => {
        setDialogSection(section);
        setDialogOpen(true);
    };

    return (
        <Compartment badge="Planner" title="Content & Workflow Planner">
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
                    background: 'var(--card-bg)',
                    padding: '20px',
                    borderRadius: '12px',
                    marginBottom: '20px',
                    border: '1px solid var(--border-color)'
                }}
            >
                <div style={{ fontWeight: 700, marginBottom: '12px', color: 'var(--light-color)' }}>
                    Planner Outline (Saved Content)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
                    {plannerOutline.map((section) => (
                        <div
                            key={section.id}
                            style={{
                                border: '1px solid var(--border-color)',
                                borderRadius: '10px',
                                padding: '12px',
                                background: 'rgba(255, 255, 255, 0.03)'
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <strong>{section.label}</strong>
                                <span style={{ color: 'var(--highlight-color)', fontSize: '12px' }}>{section.count}</span>
                            </div>
                            {section.lines.length > 0 ? (
                                <div style={{ display: 'grid', gap: '6px' }}>
                                    {section.lines.map((line) => (
                                        <div key={`${section.id}-${line}`} style={{ fontSize: '12px', color: 'var(--light-color)' }}>
                                            - {line}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ fontSize: '12px', color: 'var(--light-color)' }}>No entries saved yet.</div>
                            )}
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
        </Compartment>
    );
};

export default PlannerPage;
