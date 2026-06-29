import React, { useState } from 'react';
import { plannerState } from '../../Services/PlannerState';

const CalendarWidget = () => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [state, setState] = useState(plannerState.getState());
    const [editingEvent, setEditingEvent] = useState(null);
    const [eventForm, setEventForm] = useState({
        title: '',
        description: '',
        startAt: '',
        endAt: '',
        reminderMinutes: 30
    });

    React.useEffect(() => {
        const unsubscribe = plannerState.subscribe(setState);
        return () => unsubscribe();
    }, []);

    const changeMonth = (delta) => {
        const newDate = new Date(currentDate);
        newDate.setMonth(currentDate.getMonth() + delta);
        setCurrentDate(newDate);
    };

    const hasTaskOnDate = (date) => {
        const dateString = date.toDateString();
        for (const column in state.tasks) {
            for (const task of state.tasks[column]) {
                if (task.dueDate) {
                    const taskDate = new Date(task.dueDate).toDateString();
                    if (taskDate === dateString && !task.completed) {
                        return true;
                    }
                }
            }
        }
        return false;
    };

    const getEventsOnDate = (date) => {
        const dateString = date.toDateString();
        return (state.calendarEvents || []).filter((event) => {
            if (!event.startAt) return false;
            return new Date(event.startAt).toDateString() === dateString;
        });
    };

        const getSharedItemsOnDate = (date) => {
            const dateString = date.toDateString();

            const goalItems = Object.values(state.goals || {})
                .flat()
                .filter((goal) => goal?.dueDate && new Date(goal.dueDate).toDateString() === dateString)
                .map((goal) => ({
                    id: goal.id,
                    type: 'goal',
                    title: goal.title,
                    details: goal.description,
                    timeLabel: goal.dueDate ? 'Goal due' : 'Goal'
                }));

            const taskItems = Object.values(state.tasks || {})
                .flat()
                .filter((task) => task?.dueDate && !task.completed && new Date(task.dueDate).toDateString() === dateString)
                .map((task) => ({
                    id: task.id,
                    type: 'task',
                    title: task.title,
                    details: task.description,
                    timeLabel: task.dueDate ? 'Task due' : 'Task'
                }));

            const analyticsItems = (state.analyticsEntries || [])
                .filter((entry) => {
                    const entryDate = entry?.updatedAt || entry?.createdAt;
                    return entryDate && new Date(entryDate).toDateString() === dateString;
                })
                .map((entry) => ({
                    id: entry.id,
                    type: 'analytics',
                    title: entry.title,
                    details: entry.insight,
                    timeLabel: 'Analytics note'
                }));

            return [...goalItems, ...taskItems, ...analyticsItems];
        };
    const selectDate = (date) => {
        setSelectedDate(date);
        setEditingEvent(null);
    };

    const selectedEvents = getEventsOnDate(selectedDate);
        const selectedSharedItems = getSharedItemsOnDate(selectedDate);

    const resetEventForm = () => {
        setEditingEvent(null);
        setEventForm({
            title: '',
            description: '',
            startAt: '',
            endAt: '',
            reminderMinutes: 30
        });
    };

    const beginEditEvent = (event) => {
        setEditingEvent(event);
        setEventForm({
            title: event.title || '',
            description: event.description || '',
            startAt: event.startAt || '',
            endAt: event.endAt || '',
            reminderMinutes: event.reminderMinutes || 30
        });
    };

    const saveEditedEvent = () => {
        if (!editingEvent || !eventForm.title.trim() || !eventForm.startAt) {
            return;
        }

        plannerState.updateCalendarEntry(editingEvent.id, {
            title: eventForm.title.trim(),
            description: eventForm.description.trim(),
            startAt: eventForm.startAt,
            endAt: eventForm.endAt,
            reminderMinutes: Number(eventForm.reminderMinutes) || 0
        });
        resetEventForm();
    };

    const renderCalendar = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDay = firstDay.getDay();

        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const calendarDays = [];

        // Add day headers
        days.forEach(day => {
            calendarDays.push(
                <div key={`header-${day}`} style={{
                    textAlign: 'center',
                    fontWeight: 'bold',
                    padding: '8px',
                    color: 'var(--highlight-color)'
                }}>
                    {day}
                </div>
            );
        });

        // Empty cells for starting days
        for (let i = 0; i < startingDay; i++) {
            calendarDays.push(<div key={`empty-${i}`} style={{ padding: '8px' }}></div>);
        }

        // Calendar days
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const isToday = date.toDateString() === new Date().toDateString();
                    const isSelected = date.toDateString() === selectedDate.toDateString();
            const hasTask = hasTaskOnDate(date);
                    const dayEvents = getEventsOnDate(date);
                        const daySharedItems = getSharedItemsOnDate(date);

            calendarDays.push(
                <div
                    key={day}
                    onClick={() => selectDate(date)}
                    style={{
                        textAlign: 'center',
                        padding: '8px',
                        borderRadius: '8px',
                        background: isSelected
                            ? 'rgba(99, 102, 241, 0.35)'
                            : isToday
                                ? 'var(--highlight-color)'
                                : 'transparent',
                        color: isToday ? 'white' : 'var(--text-color)',
                        cursor: 'pointer',
                        position: 'relative',
                        transition: 'all 0.3s',
                        border: isSelected ? '1px solid var(--highlight-color)' : '1px solid transparent'
                    }}
                    onMouseEnter={(e) => {
                        if (!isToday) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                        if (!isToday && !isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                >
                    {day}
                    {hasTask && !isToday && (
                        <div style={{
                            position: 'absolute',
                            bottom: '2px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            width: '4px',
                            height: '4px',
                            borderRadius: '50%',
                            background: 'var(--success-color)'
                        }}></div>
                    )}
                    {dayEvents.length > 0 && (
                        <div style={{
                            position: 'absolute',
                            top: '4px',
                            right: '4px',
                            minWidth: '18px',
                            height: '18px',
                            borderRadius: '999px',
                            background: 'var(--highlight-color)',
                            color: 'white',
                            fontSize: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0 4px'
                        }}>
                            {dayEvents.length}
                        </div>
                    )}
                    {dayEvents.length === 0 && daySharedItems.length > 0 && (
                        <div style={{
                            position: 'absolute',
                            top: '4px',
                            right: '4px',
                            minWidth: '18px',
                            height: '18px',
                            borderRadius: '999px',
                            background: 'var(--success-color)',
                            color: 'white',
                            fontSize: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0 4px'
                        }}>
                            {daySharedItems.length}
                        </div>
                    )}
                </div>
            );
        }

        return calendarDays;
    };

    const monthTaskCount = Object.values(state.tasks)
        .flat()
        .filter((task) => {
            if (!task.dueDate || task.completed) return false;
            const taskDate = new Date(task.dueDate);
            return (
                taskDate.getMonth() === currentDate.getMonth() &&
                taskDate.getFullYear() === currentDate.getFullYear()
            );
        }).length;

    return (
        <div style={{
            background: 'var(--card-bg)',
            padding: '20px',
            borderRadius: '12px',
            border: '1px solid var(--border-color)'
        }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px'
            }}>
                <button
                    onClick={() => changeMonth(-1)}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-color)',
                        cursor: 'pointer',
                        padding: '5px 10px'
                    }}
                >
                    ←
                </button>
                <h3>
                    {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </h3>
                <button
                    onClick={() => changeMonth(1)}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-color)',
                        cursor: 'pointer',
                        padding: '5px 10px'
                    }}
                >
                    →
                </button>
            </div>
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: '4px'
            }}>
                {renderCalendar()}
            </div>
            <p style={{ marginTop: '12px', fontSize: '13px', color: 'var(--highlight-color)' }}>
                Open tasks this month: {monthTaskCount}
            </p>

            <div style={{
                marginTop: '16px',
                padding: '16px',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--border-color)'
            }}>
                <h4 style={{ marginTop: 0, marginBottom: '10px' }}>
                    Saved events for {selectedDate.toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                    })}
                </h4>
                <div style={{ display: 'grid', gap: '10px', marginBottom: '14px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--light-color)' }}>
                        Shared planner items from goals, tasks, and analytics appear here too.
                    </div>
                </div>

                {selectedEvents.length > 0 || selectedSharedItems.length > 0 ? (
                    <div style={{ display: 'grid', gap: '10px' }}>
                        {selectedEvents.map((event) => (
                            <div
                                key={event.id}
                                style={{
                                    padding: '12px',
                                    borderRadius: '10px',
                                    border: '1px solid var(--border-color)',
                                    background: 'rgba(255, 255, 255, 0.03)'
                                }}
                            >
                                <strong>{event.title}</strong>
                                <div style={{ fontSize: '12px', color: 'var(--light-color)', marginTop: '4px' }}>
                                    {event.description || 'No description provided.'}
                                </div>
                                <div style={{ fontSize: '12px', marginTop: '6px', color: 'var(--highlight-color)' }}>
                                    {event.startAt ? new Date(event.startAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'No start time'}
                                    {event.endAt ? ` - ${new Date(event.endAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}
                                </div>
                                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                                    <button
                                        onClick={() => beginEditEvent(event)}
                                        style={{
                                            padding: '6px 10px',
                                            borderRadius: '999px',
                                            border: '1px solid var(--border-color)',
                                            background: 'transparent',
                                            color: 'var(--text-color)',
                                            cursor: 'pointer',
                                            fontSize: '12px'
                                        }}
                                    >
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => plannerState.deleteCalendarEntry(event.id)}
                                        style={{
                                            padding: '6px 10px',
                                            borderRadius: '999px',
                                            border: '1px solid var(--border-color)',
                                            background: 'transparent',
                                            color: 'var(--error-color)',
                                            cursor: 'pointer',
                                            fontSize: '12px'
                                        }}
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        ))}
                        {selectedSharedItems.map((item) => (
                            <div
                                key={item.id}
                                style={{
                                    padding: '12px',
                                    borderRadius: '10px',
                                    border: '1px solid var(--border-color)',
                                    background: 'rgba(255, 255, 255, 0.03)'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                                    <strong>{item.title}</strong>
                                    <span style={{ fontSize: '11px', color: 'var(--highlight-color)', textTransform: 'uppercase' }}>
                                        {item.type}
                                    </span>
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--light-color)', marginTop: '4px' }}>
                                    {item.details || 'No details provided.'}
                                </div>
                                <div style={{ fontSize: '12px', marginTop: '6px', color: 'var(--highlight-color)' }}>
                                    {item.timeLabel}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ color: 'var(--light-color)', fontSize: '13px' }}>
                        No saved events or shared planner items for this date.
                    </div>
                )}

                {editingEvent && (
                    <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border-color)' }}>
                        <h5 style={{ marginTop: 0, marginBottom: '10px' }}>Edit Saved Event</h5>
                        <input
                            value={eventForm.title}
                            onChange={(e) => setEventForm(prev => ({ ...prev, title: e.target.value }))}
                            placeholder="Title"
                            style={{ width: '100%', marginBottom: '10px', padding: '10px' }}
                        />
                        <textarea
                            value={eventForm.description}
                            onChange={(e) => setEventForm(prev => ({ ...prev, description: e.target.value }))}
                            placeholder="Description"
                            rows="3"
                            style={{ width: '100%', marginBottom: '10px', padding: '10px' }}
                        />
                        <input
                            type="datetime-local"
                            value={eventForm.startAt}
                            onChange={(e) => setEventForm(prev => ({ ...prev, startAt: e.target.value }))}
                            style={{ width: '100%', marginBottom: '10px', padding: '10px' }}
                        />
                        <input
                            type="datetime-local"
                            value={eventForm.endAt}
                            onChange={(e) => setEventForm(prev => ({ ...prev, endAt: e.target.value }))}
                            style={{ width: '100%', marginBottom: '10px', padding: '10px' }}
                        />
                        <input
                            type="number"
                            min="0"
                            step="5"
                            value={eventForm.reminderMinutes}
                            onChange={(e) => setEventForm(prev => ({ ...prev, reminderMinutes: e.target.value }))}
                            style={{ width: '100%', marginBottom: '12px', padding: '10px' }}
                        />
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                onClick={saveEditedEvent}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '999px',
                                    border: 'none',
                                    background: 'var(--highlight-color)',
                                    color: 'white',
                                    cursor: 'pointer'
                                }}
                            >
                                Save Changes
                            </button>
                            <button
                                onClick={resetEventForm}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '999px',
                                    border: '1px solid var(--border-color)',
                                    background: 'transparent',
                                    color: 'var(--text-color)',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CalendarWidget;