import React, { useEffect, useMemo, useState } from 'react';
import { plannerState } from '../../Services/PlannerState';
import GoalSection from '../Planner/GoalSection';
import TaskBoard from '../Planner/TaskBoard';
import CalendarWidget from '../Planner/CalendarWidget';

const tabs = ['tasks', 'goals', 'calendar', 'analytics'];

const PlannerDialog = ({ isOpen, onClose, section = 'tasks' }) => {
    const [activeSection, setActiveSection] = useState(section);
    const [state, setState] = useState(plannerState.getState());

    const [calendarTitle, setCalendarTitle] = useState('');
    const [calendarDescription, setCalendarDescription] = useState('');
    const [calendarStartAt, setCalendarStartAt] = useState('');
    const [calendarEndAt, setCalendarEndAt] = useState('');
    const [calendarReminderMinutes, setCalendarReminderMinutes] = useState(30);
    const [editingCalendarId, setEditingCalendarId] = useState(null);

    const [analyticsTitle, setAnalyticsTitle] = useState('');
    const [analyticsInsight, setAnalyticsInsight] = useState('');
    const [analyticsMetric, setAnalyticsMetric] = useState('');
    const [editingAnalyticsId, setEditingAnalyticsId] = useState(null);

    useEffect(() => {
        setActiveSection(section);
    }, [section]);

    useEffect(() => {
        const unsubscribe = plannerState.subscribe(setState);
        return () => unsubscribe();
    }, []);

    const sortedCalendarEvents = useMemo(() => {
        return [...(state.calendarEvents || [])].sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
    }, [state.calendarEvents]);

    const sortedAnalyticsEntries = useMemo(() => {
        return [...(state.analyticsEntries || [])].sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    }, [state.analyticsEntries]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        if (activeSection === 'calendar' && !calendarStartAt) {
            const defaultStart = new Date();
            defaultStart.setHours(defaultStart.getHours() + 1, 0, 0, 0);
            setCalendarStartAt(defaultStart.toISOString().slice(0, 16));
            const defaultEnd = new Date(defaultStart);
            defaultEnd.setHours(defaultEnd.getHours() + 1);
            setCalendarEndAt(defaultEnd.toISOString().slice(0, 16));
        }
    }, [activeSection, calendarStartAt, isOpen]);

    const closeAndReset = () => {
        onClose();
        setEditingCalendarId(null);
        setEditingAnalyticsId(null);
        setCalendarTitle('');
        setCalendarDescription('');
        setCalendarStartAt('');
        setCalendarEndAt('');
        setCalendarReminderMinutes(30);
        setAnalyticsTitle('');
        setAnalyticsInsight('');
        setAnalyticsMetric('');
    };

    const saveCalendarEntry = () => {
        if (!calendarTitle.trim() || !calendarStartAt) {
            return;
        }

        const payload = {
            title: calendarTitle.trim(),
            description: calendarDescription.trim(),
            startAt: calendarStartAt,
            endAt: calendarEndAt,
            reminderMinutes: Number(calendarReminderMinutes) || 0
        };

        if (editingCalendarId) {
            plannerState.updateCalendarEntry(editingCalendarId, payload);
        } else {
            plannerState.addCalendarEntry(payload);
        }

        setEditingCalendarId(null);
        setCalendarTitle('');
        setCalendarDescription('');
        setCalendarStartAt('');
        setCalendarEndAt('');
        setCalendarReminderMinutes(30);
    };

    const editCalendarEntry = (entry) => {
        setEditingCalendarId(entry.id);
        setCalendarTitle(entry.title || '');
        setCalendarDescription(entry.description || '');
        setCalendarStartAt(entry.startAt || '');
        setCalendarEndAt(entry.endAt || '');
        setCalendarReminderMinutes(entry.reminderMinutes || 30);
        setActiveSection('calendar');
    };

    const saveAnalyticsEntry = () => {
        if (!analyticsTitle.trim() || !analyticsInsight.trim()) {
            return;
        }

        const payload = {
            title: analyticsTitle.trim(),
            insight: analyticsInsight.trim(),
            metric: analyticsMetric.trim()
        };

        if (editingAnalyticsId) {
            plannerState.updateAnalyticsEntry(editingAnalyticsId, payload);
        } else {
            plannerState.addAnalyticsEntry(payload);
        }

        setEditingAnalyticsId(null);
        setAnalyticsTitle('');
        setAnalyticsInsight('');
        setAnalyticsMetric('');
    };

    const editAnalyticsEntry = (entry) => {
        setEditingAnalyticsId(entry.id);
        setAnalyticsTitle(entry.title || '');
        setAnalyticsInsight(entry.insight || '');
        setAnalyticsMetric(entry.metric || '');
        setActiveSection('analytics');
    };

    if (!isOpen) {
        return null;
    }

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.78)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1200,
                padding: '20px'
            }}
            onClick={closeAndReset}
        >
            <div
                style={{
                    width: 'min(1180px, 100%)',
                    maxHeight: '92vh',
                    overflow: 'auto',
                    background: 'var(--card-bg)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '18px',
                    padding: '24px'
                }}
                onClick={(event) => event.stopPropagation()}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '18px' }}>
                    <div>
                        <h2 style={{ marginBottom: '6px' }}>Planner Studio</h2>
                        <p style={{ margin: 0, color: 'var(--light-color)' }}>Record, edit, and review work from one dialog.</p>
                    </div>
                    <button onClick={closeAndReset} style={{ background: 'none', border: 'none', color: 'var(--text-color)', cursor: 'pointer', fontSize: '20px' }}>×</button>
                </div>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
                    {tabs.map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveSection(tab)}
                            style={{
                                padding: '10px 16px',
                                borderRadius: '999px',
                                border: '1px solid var(--border-color)',
                                background: activeSection === tab ? 'var(--highlight-color)' : 'transparent',
                                color: 'var(--text-color)',
                                cursor: 'pointer'
                            }}
                        >
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                    ))}
                </div>

                {activeSection === 'tasks' && (
                    <div style={{ display: 'grid', gap: '16px' }}>
                        <TaskBoard />
                    </div>
                )}

                {activeSection === 'goals' && (
                    <div style={{ display: 'grid', gap: '16px' }}>
                        <GoalSection type="long" title="Long Term Goals" />
                        <GoalSection type="short" title="Short Term Goals" />
                        <GoalSection type="next" title="Next Moves" />
                    </div>
                )}

                {activeSection === 'calendar' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(320px, 0.9fr)', gap: '18px' }}>
                        <CalendarWidget />
                        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '18px' }}>
                            <h3 style={{ marginTop: 0 }}>{editingCalendarId ? 'Edit Calendar Entry' : 'Record Calendar Entry'}</h3>
                            <input value={calendarTitle} onChange={(event) => setCalendarTitle(event.target.value)} placeholder="Title" style={{ width: '100%', marginBottom: '10px', padding: '10px' }} />
                            <textarea value={calendarDescription} onChange={(event) => setCalendarDescription(event.target.value)} placeholder="Description" rows="4" style={{ width: '100%', marginBottom: '10px', padding: '10px' }} />
                            <input type="datetime-local" value={calendarStartAt} onChange={(event) => setCalendarStartAt(event.target.value)} style={{ width: '100%', marginBottom: '10px', padding: '10px' }} />
                            <input type="datetime-local" value={calendarEndAt} onChange={(event) => setCalendarEndAt(event.target.value)} style={{ width: '100%', marginBottom: '10px', padding: '10px' }} />
                            <input type="number" min="0" step="5" value={calendarReminderMinutes} onChange={(event) => setCalendarReminderMinutes(event.target.value)} placeholder="Reminder minutes before" style={{ width: '100%', marginBottom: '12px', padding: '10px' }} />
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button onClick={saveCalendarEntry} style={{ padding: '10px 14px', borderRadius: '10px', border: 'none', background: 'var(--highlight-color)', color: 'white', cursor: 'pointer' }}>
                                    {editingCalendarId ? 'Update Entry' : 'Save Entry'}
                                </button>
                                {editingCalendarId && (
                                    <button onClick={() => {
                                        setEditingCalendarId(null);
                                        setCalendarTitle('');
                                        setCalendarDescription('');
                                        setCalendarStartAt('');
                                        setCalendarEndAt('');
                                        setCalendarReminderMinutes(30);
                                    }} style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-color)', cursor: 'pointer' }}>
                                        Reset
                                    </button>
                                )}
                            </div>

                            <div style={{ marginTop: '18px' }}>
                                <h4>Saved entries</h4>
                                <div style={{ display: 'grid', gap: '10px' }}>
                                    {sortedCalendarEvents.map((entry) => (
                                        <div key={entry.id} style={{ padding: '12px', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
                                            <strong>{entry.title}</strong>
                                            <div style={{ fontSize: '12px', color: 'var(--light-color)', marginTop: '4px' }}>{entry.description}</div>
                                            <div style={{ fontSize: '12px', marginTop: '6px' }}>{entry.startAt ? new Date(entry.startAt).toLocaleString() : 'No time set'}</div>
                                            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                                <button onClick={() => editCalendarEntry(entry)} style={{ padding: '6px 10px', borderRadius: '999px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-color)', cursor: 'pointer' }}>Edit</button>
                                                <button onClick={() => plannerState.deleteCalendarEntry(entry.id)} style={{ padding: '6px 10px', borderRadius: '999px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--error-color)', cursor: 'pointer' }}>Delete</button>
                                            </div>
                                        </div>
                                    ))}
                                    {sortedCalendarEvents.length === 0 && <div style={{ color: 'var(--light-color)' }}>No calendar entries recorded yet.</div>}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeSection === 'analytics' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 0.9fr) minmax(0, 1.1fr)', gap: '18px' }}>
                        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '18px' }}>
                            <h3 style={{ marginTop: 0 }}>{editingAnalyticsId ? 'Edit Analytics Note' : 'Record Analytics Note'}</h3>
                            <input value={analyticsTitle} onChange={(event) => setAnalyticsTitle(event.target.value)} placeholder="Title" style={{ width: '100%', marginBottom: '10px', padding: '10px' }} />
                            <textarea value={analyticsInsight} onChange={(event) => setAnalyticsInsight(event.target.value)} placeholder="Insight or observation" rows="4" style={{ width: '100%', marginBottom: '10px', padding: '10px' }} />
                            <input value={analyticsMetric} onChange={(event) => setAnalyticsMetric(event.target.value)} placeholder="Metric or value" style={{ width: '100%', marginBottom: '12px', padding: '10px' }} />
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button onClick={saveAnalyticsEntry} style={{ padding: '10px 14px', borderRadius: '10px', border: 'none', background: 'var(--highlight-color)', color: 'white', cursor: 'pointer' }}>
                                    {editingAnalyticsId ? 'Update Note' : 'Save Note'}
                                </button>
                                {editingAnalyticsId && (
                                    <button onClick={() => {
                                        setEditingAnalyticsId(null);
                                        setAnalyticsTitle('');
                                        setAnalyticsInsight('');
                                        setAnalyticsMetric('');
                                    }} style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-color)', cursor: 'pointer' }}>
                                        Reset
                                    </button>
                                )}
                            </div>
                        </div>

                        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '18px' }}>
                            <h3 style={{ marginTop: 0 }}>Productivity Analytics</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                                <div style={{ padding: '12px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)' }}>
                                    <div style={{ fontSize: '12px', color: 'var(--light-color)' }}>Pending Tasks</div>
                                    <strong>{state.stats.pendingTasks}</strong>
                                </div>
                                <div style={{ padding: '12px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)' }}>
                                    <div style={{ fontSize: '12px', color: 'var(--light-color)' }}>Productivity</div>
                                    <strong>{state.stats.productivityScore}%</strong>
                                </div>
                                <div style={{ padding: '12px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)' }}>
                                    <div style={{ fontSize: '12px', color: 'var(--light-color)' }}>Goals Achieved</div>
                                    <strong>{state.stats.goalsAchieved}</strong>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gap: '10px' }}>
                                {sortedAnalyticsEntries.map((entry) => (
                                    <div key={entry.id} style={{ padding: '12px', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
                                        <strong>{entry.title}</strong>
                                        <div style={{ fontSize: '12px', color: 'var(--light-color)', marginTop: '4px' }}>{entry.insight}</div>
                                        {entry.metric && <div style={{ fontSize: '12px', marginTop: '6px' }}>Metric: {entry.metric}</div>}
                                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                            <button onClick={() => editAnalyticsEntry(entry)} style={{ padding: '6px 10px', borderRadius: '999px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-color)', cursor: 'pointer' }}>Edit</button>
                                            <button onClick={() => plannerState.deleteAnalyticsEntry(entry.id)} style={{ padding: '6px 10px', borderRadius: '999px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--error-color)', cursor: 'pointer' }}>Delete</button>
                                        </div>
                                    </div>
                                ))}
                                {sortedAnalyticsEntries.length === 0 && <div style={{ color: 'var(--light-color)' }}>No analytics notes recorded yet.</div>}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PlannerDialog;