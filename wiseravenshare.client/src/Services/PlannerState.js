// JavaScript source code
// Planner State Management System
import { computeTaskPriorityScore, getRecommendedPriority } from './EngagementAlgorithms';
import { apiService } from './api';
import { getAuthToken } from './authStorage';

class PlannerState {
    constructor() {
        this.goals = {
            long: [],
            short: [],
            next: []
        };
        this.tasks = {
            day: [],
            week: [],
            month: []
        };
        this.calendarEvents = [];
        this.analyticsEntries = [];
        this.completedTasks = [];
        this.settings = {
            theme: 'dark',
            notifications: true,
            autoSave: true,
            pomodoroDuration: 25,
            breakDuration: 5
        };
        this.stats = {
            dailyCompleted: 0,
            weeklyCompleted: 0,
            monthlyCompleted: 0,
            productivityScore: 0,
            pendingTasks: 0,
            goalsAchieved: 0
        };
        this.reminderDispatchInFlight = new Set();
        this.deadlineNotificationLog = {};
        this.listeners = [];
        this.loadState();
        this.startReminderWatcher();
    }

    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    notify() {
        this.listeners.forEach(listener => listener(this.getState()));
    }

    getState() {
        return {
            goals: this.goals,
            tasks: this.tasks,
            calendarEvents: this.calendarEvents,
            analyticsEntries: this.analyticsEntries,
            completedTasks: this.completedTasks,
            settings: this.settings,
            stats: this.stats
        };
    }

    emitPlannerNotification(notification) {
        if (typeof window === 'undefined') {
            return;
        }

        window.dispatchEvent(new CustomEvent('wise-planner-notification', {
            detail: {
                id: `planner-${Date.now()}`,
                type: 'info',
                toastType: 'info',
                ...notification
            }
        }));
    }

    getReminderMessage(label, dueDate) {
        if (!dueDate) {
            return null;
        }

        const targetDate = new Date(dueDate);
        if (Number.isNaN(targetDate.getTime())) {
            return null;
        }

        const hoursLeft = (targetDate.getTime() - Date.now()) / (1000 * 60 * 60);
        if (hoursLeft < 0) {
            return `${label} is overdue.`;
        }

        if (hoursLeft <= 24) {
            return `${label} is due within the next 24 hours.`;
        }

        return null;
    }

    getDeadlineAlertWindow(dueDate) {
        if (!dueDate) {
            return null;
        }

        const targetDate = new Date(dueDate);
        if (Number.isNaN(targetDate.getTime())) {
            return null;
        }

        const hoursLeft = (targetDate.getTime() - Date.now()) / (1000 * 60 * 60);
        if (hoursLeft < 0) {
            return { kind: 'overdue', hoursLeft };
        }

        if (hoursLeft <= 24) {
            return { kind: 'due-24h', hoursLeft };
        }

        if (hoursLeft <= 72) {
            return { kind: 'due-72h', hoursLeft };
        }

        return null;
    }

    getDeadlineAlertMessage(itemType, title, alertWindow) {
        if (!alertWindow) {
            return null;
        }

        const safeType = itemType === 'goal' ? 'Goal' : 'Task';
        if (alertWindow.kind === 'overdue') {
            return `${safeType} "${title}" is overdue.`;
        }
        if (alertWindow.kind === 'due-24h') {
            return `${safeType} "${title}" is due within 24 hours.`;
        }
        return `${safeType} "${title}" is due within 72 hours.`;
    }

    shouldEmitDeadlineAlert(itemId, alertKind) {
        const alertKey = `${itemId}:${alertKind}`;
        const lastSentIso = this.deadlineNotificationLog[alertKey];
        if (!lastSentIso) {
            return true;
        }

        const lastSentAt = new Date(lastSentIso);
        if (Number.isNaN(lastSentAt.getTime())) {
            return true;
        }

        const cooldownMs = 12 * 60 * 60 * 1000;
        return Date.now() - lastSentAt.getTime() >= cooldownMs;
    }

    markDeadlineAlertEmitted(itemId, alertKind) {
        const nowIso = new Date().toISOString();
        this.deadlineNotificationLog[`${itemId}:${alertKind}`] = nowIso;

        const cutoff = Date.now() - (14 * 24 * 60 * 60 * 1000);
        const nextLog = {};
        Object.entries(this.deadlineNotificationLog).forEach(([key, value]) => {
            const parsed = new Date(value);
            if (!Number.isNaN(parsed.getTime()) && parsed.getTime() >= cutoff) {
                nextLog[key] = value;
            }
        });
        this.deadlineNotificationLog = nextLog;
    }

    processDeadlineNotifications() {
        if (typeof window === 'undefined') {
            return;
        }

        let didUpdateLog = false;
        const activeTasks = Object.values(this.tasks || {})
            .flat()
            .filter((task) => task && !task.completed);
        const activeGoals = Object.values(this.goals || {})
            .flat()
            .filter((goal) => goal && !goal.completed && Number(goal.progress || 0) < 100);

        const dueItems = [
            ...activeTasks.map((task) => ({ id: task.id, itemType: 'task', title: task.title, dueDate: task.dueDate })),
            ...activeGoals.map((goal) => ({ id: goal.id, itemType: 'goal', title: goal.title, dueDate: goal.dueDate }))
        ];

        dueItems.forEach((item) => {
            const alertWindow = this.getDeadlineAlertWindow(item.dueDate);
            if (!alertWindow || !item.id || !item.title) {
                return;
            }

            if (!this.shouldEmitDeadlineAlert(item.id, alertWindow.kind)) {
                return;
            }

            const message = this.getDeadlineAlertMessage(item.itemType, item.title, alertWindow);
            if (!message) {
                return;
            }

            this.emitPlannerNotification({
                type: alertWindow.kind === 'overdue' ? 'warning' : 'info',
                toastType: 'warning',
                title: 'Planner deadline alert',
                message
            });
            this.markDeadlineAlertEmitted(item.id, alertWindow.kind);
            didUpdateLog = true;
        });

        if (didUpdateLog) {
            this.saveState();
        }
    }

    saveState() {
        this.calculateStats();
        const state = {
            goals: this.goals,
            tasks: this.tasks,
            calendarEvents: this.calendarEvents,
            analyticsEntries: this.analyticsEntries,
            completedTasks: this.completedTasks,
            settings: this.settings,
            stats: this.stats,
            deadlineNotificationLog: this.deadlineNotificationLog,
            lastSave: new Date().toISOString()
        };
        localStorage.setItem('wiseRavenState', JSON.stringify(state));
        this.notify();
    }

    loadState() {
        const saved = localStorage.getItem('wiseRavenState');
        if (saved) {
            const state = JSON.parse(saved);
            this.goals = state.goals || this.goals;
            this.tasks = state.tasks || this.tasks;
            this.calendarEvents = (state.calendarEvents || this.calendarEvents).map((entry) => this.normalizeCalendarEntry(entry));
            this.analyticsEntries = state.analyticsEntries || this.analyticsEntries;
            this.completedTasks = state.completedTasks || this.completedTasks;
            this.settings = state.settings || this.settings;
            this.stats = state.stats || this.stats;
            this.deadlineNotificationLog = state.deadlineNotificationLog || this.deadlineNotificationLog;
        } else {
            this.addSampleData();
        }
        this.recomputeTaskSignals();
        this.calculateStats();
    }

    normalizeCalendarEntry(entry) {
        const safeEntry = entry || {};
        return {
            ...safeEntry,
            reminderMinutes: Number(safeEntry.reminderMinutes) || 0,
            sendEmailReminder: Boolean(safeEntry.sendEmailReminder),
            reminderEmail: String(safeEntry.reminderEmail || '').trim(),
            sendSmsReminder: Boolean(safeEntry.sendSmsReminder),
            reminderPhone: String(safeEntry.reminderPhone || '').trim(),
            reminderDispatch: {
                emailSentAt: safeEntry?.reminderDispatch?.emailSentAt || null,
                smsSentAt: safeEntry?.reminderDispatch?.smsSentAt || null,
                lastAttemptAt: safeEntry?.reminderDispatch?.lastAttemptAt || null,
                lastError: safeEntry?.reminderDispatch?.lastError || ''
            }
        };
    }

    startReminderWatcher() {
        if (typeof window === 'undefined') {
            return;
        }

        this.processCalendarReminders();
        this.processDeadlineNotifications();
        window.setInterval(() => {
            this.processCalendarReminders();
            this.processDeadlineNotifications();
        }, 60 * 1000);
    }

    shouldDispatchReminder(entry) {
        if (!entry || !entry.startAt) {
            return false;
        }

        if (!entry.sendEmailReminder && !entry.sendSmsReminder) {
            return false;
        }

        const startAt = new Date(entry.startAt);
        if (Number.isNaN(startAt.getTime())) {
            return false;
        }

        const reminderOffsetMs = Math.max(Number(entry.reminderMinutes) || 0, 0) * 60 * 1000;
        const dueAt = startAt.getTime() - reminderOffsetMs;
        if (Date.now() < dueAt) {
            return false;
        }

        const lastAttemptAt = entry.reminderDispatch?.lastAttemptAt
            ? new Date(entry.reminderDispatch.lastAttemptAt).getTime()
            : 0;
        const retryCooldownMs = 10 * 60 * 1000;
        if (lastAttemptAt && Date.now() - lastAttemptAt < retryCooldownMs) {
            return false;
        }

        if (entry.sendEmailReminder && !entry.reminderDispatch?.emailSentAt) {
            return true;
        }

        if (entry.sendSmsReminder && !entry.reminderDispatch?.smsSentAt) {
            return true;
        }

        return false;
    }

    getFallbackReminderEmail() {
        try {
            const rawUser = localStorage.getItem('user_data');
            if (!rawUser) {
                return '';
            }

            const parsed = JSON.parse(rawUser);
            return String(parsed?.email || '').trim();
        } catch {
            return '';
        }
    }

    updateReminderDispatch(entryId, updates) {
        const index = this.calendarEvents.findIndex((entry) => entry.id === entryId);
        if (index === -1) {
            return;
        }

        this.calendarEvents[index] = {
            ...this.calendarEvents[index],
            reminderDispatch: {
                ...(this.calendarEvents[index].reminderDispatch || {}),
                ...updates
            },
            updatedAt: new Date().toISOString()
        };

        this.saveState();
    }

    async processCalendarReminders() {
        const hasAuthToken = typeof window !== 'undefined' && Boolean(getAuthToken());
        if (!hasAuthToken) {
            return;
        }

        const entries = [...(this.calendarEvents || [])];
        for (const entry of entries) {
            if (!entry?.id || this.reminderDispatchInFlight.has(entry.id)) {
                continue;
            }

            if (!this.shouldDispatchReminder(entry)) {
                continue;
            }

            this.reminderDispatchInFlight.add(entry.id);
            try {
                const emailTo = String(entry.reminderEmail || '').trim() || this.getFallbackReminderEmail();
                const phoneTo = String(entry.reminderPhone || '').trim();
                const response = await apiService.sendCalendarReminder({
                    title: entry.title,
                    description: entry.description,
                    startAt: entry.startAt,
                    reminderMinutes: Number(entry.reminderMinutes) || 0,
                    sendEmail: Boolean(entry.sendEmailReminder),
                    emailTo,
                    sendSms: Boolean(entry.sendSmsReminder),
                    phoneTo
                });

                const dispatchResult = response?.data || {};
                const now = new Date().toISOString();
                this.updateReminderDispatch(entry.id, {
                    emailSentAt: dispatchResult.emailSent ? now : entry.reminderDispatch?.emailSentAt || null,
                    smsSentAt: dispatchResult.smsSent ? now : entry.reminderDispatch?.smsSentAt || null,
                    lastAttemptAt: now,
                    lastError: ''
                });

                const partialFailure = (dispatchResult.emailRequested && !dispatchResult.emailSent)
                    || (dispatchResult.smsRequested && !dispatchResult.smsSent);

                if (partialFailure) {
                    this.emitPlannerNotification({
                        type: 'warning',
                        toastType: 'warning',
                        title: 'Reminder partially sent',
                        message: `${entry.title}: verify your email/SMS provider settings.`
                    });
                } else {
                    this.emitPlannerNotification({
                        type: 'success',
                        toastType: 'success',
                        title: 'Reminder sent',
                        message: `Reminder delivered for ${entry.title}.`
                    });
                }
            } catch (error) {
                const now = new Date().toISOString();
                this.updateReminderDispatch(entry.id, {
                    lastAttemptAt: now,
                    lastError: String(error?.message || 'Reminder dispatch failed')
                });

                this.emitPlannerNotification({
                    type: 'warning',
                    toastType: 'warning',
                    title: 'Reminder failed',
                    message: `Could not send reminder for ${entry.title}.`
                });
            } finally {
                this.reminderDispatchInFlight.delete(entry.id);
            }
        }
    }

    recomputeTaskSignals() {
        for (const column in this.tasks) {
            this.tasks[column] = this.tasks[column].map((task) => {
                const priorityScore = computeTaskPriorityScore(task);
                return {
                    ...task,
                    priorityScore,
                    recommendedPriority: getRecommendedPriority(priorityScore)
                };
            });
        }
    }

    calculateStats() {
        const allTasks = [...this.tasks.day, ...this.tasks.week, ...this.tasks.month];
        const allGoals = Object.values(this.goals || {}).flat();
        const today = new Date().toDateString();

        this.stats.dailyCompleted = this.completedTasks.filter(
            task => new Date(task.completedAt).toDateString() === today
        ).length;

        this.stats.pendingTasks = allTasks.filter(task => !task.completed).length;

        if (allTasks.length > 0) {
            const completedCount = allTasks.filter(task => task.completed).length;
            this.stats.productivityScore = Math.round((completedCount / allTasks.length) * 100);
        } else {
            this.stats.productivityScore = 0;
        }

        this.stats.goalsAchieved = allGoals.filter(
            goal => goal.completed || Number(goal.progress || 0) >= 100
        ).length;
    }

    addSampleData() {
        this.addGoal('long', {
            title: 'Become financially independent',
            description: 'Achieve $1M net worth through investments and business',
            priority: 'high',
            dueDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        });

        this.addGoal('short', {
            title: 'Complete professional certification',
            description: 'Finish AI/ML certification within 3 months',
            priority: 'medium',
            dueDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        });

        this.addTask('day', {
            title: 'Morning review and planning',
            description: 'Review yesterday\'s accomplishments and plan today\'s priorities',
            priority: 'medium',
            estimate: 0.5,
            dueDate: new Date().setHours(10, 0, 0, 0)
        });
    }

    addGoal(type, data) {
        const goal = {
            id: 'goal-' + Date.now(),
            type: type,
            title: data.title,
            description: data.description,
            priority: data.priority,
            dueDate: data.dueDate,
            createdAt: new Date().toISOString(),
            completed: false,
            progress: 0,
            tasks: []
        };
        this.goals[type].push(goal);
        this.saveState();
        this.emitPlannerNotification({
            type: 'info',
            toastType: 'success',
            title: 'Goal recorded',
            message: `${goal.title} was saved to ${type} goals.`
        });
        const reminderMessage = this.getReminderMessage(goal.title, goal.dueDate);
        if (reminderMessage) {
            this.emitPlannerNotification({
                type: 'warning',
                toastType: 'warning',
                title: 'Goal reminder',
                message: reminderMessage
            });
        }
        return goal;
    }

    updateGoal(goalId, updates) {
        for (const type in this.goals) {
            const index = this.goals[type].findIndex(g => g.id === goalId);
            if (index !== -1) {
                this.goals[type][index] = { ...this.goals[type][index], ...updates };
                this.saveState();
                this.emitPlannerNotification({
                    type: 'info',
                    toastType: 'info',
                    title: 'Goal updated',
                    message: `${this.goals[type][index].title} was updated.`
                });
                const reminderMessage = this.getReminderMessage(this.goals[type][index].title, this.goals[type][index].dueDate);
                if (reminderMessage) {
                    this.emitPlannerNotification({
                        type: 'warning',
                        toastType: 'warning',
                        title: 'Goal reminder',
                        message: reminderMessage
                    });
                }
                return true;
            }
        }
        return false;
    }

    deleteGoal(goalId) {
        for (const type in this.goals) {
            this.goals[type] = this.goals[type].filter(g => g.id !== goalId);
        }
        this.saveState();
    }

    addTask(column, data) {
        const priorityScore = computeTaskPriorityScore(data);
        const task = {
            id: 'task-' + Date.now(),
            column: column,
            title: data.title,
            description: data.description,
            priority: data.priority,
            dueDate: data.dueDate,
            estimate: data.estimate,
            createdAt: new Date().toISOString(),
            completed: false,
            completedAt: null,
            timeSpent: 0,
            priorityScore,
            recommendedPriority: getRecommendedPriority(priorityScore)
        };
        this.tasks[column].push(task);
        this.saveState();
        this.emitPlannerNotification({
            type: 'info',
            toastType: 'success',
            title: 'Task recorded',
            message: `${task.title} was added to ${column}.`
        });
        const reminderMessage = this.getReminderMessage(task.title, task.dueDate);
        if (reminderMessage) {
            this.emitPlannerNotification({
                type: 'warning',
                toastType: 'warning',
                title: 'Task reminder',
                message: reminderMessage
            });
        }
        return task;
    }

    moveTask(taskId, newColumn) {
        let task = null;
        let oldColumn = null;

        for (const column in this.tasks) {
            const index = this.tasks[column].findIndex(t => t.id === taskId);
            if (index !== -1) {
                task = this.tasks[column][index];
                oldColumn = column;
                this.tasks[column].splice(index, 1);
                break;
            }
        }

        if (task && oldColumn !== newColumn) {
            task.column = newColumn;
            this.tasks[newColumn].push(task);
            this.saveState();
            this.emitPlannerNotification({
                type: 'info',
                toastType: 'info',
                title: 'Task moved',
                message: `${task.title} moved to ${newColumn}.`
            });
            return true;
        }
        return false;
    }

    completeTask(taskId) {
        for (const column in this.tasks) {
            const index = this.tasks[column].findIndex(t => t.id === taskId);
            if (index !== -1) {
                this.tasks[column][index].completed = true;
                this.tasks[column][index].completedAt = new Date().toISOString();
                this.completedTasks.push(this.tasks[column][index]);
                this.saveState();
                this.emitPlannerNotification({
                    type: 'success',
                    toastType: 'success',
                    title: 'Task completed',
                    message: `${this.tasks[column][index].title} is complete.`
                });
                return true;
            }
        }
        return false;
    }

    deleteTask(taskId) {
        for (const column in this.tasks) {
            this.tasks[column] = this.tasks[column].filter(t => t.id !== taskId);
        }
        this.saveState();
    }

    addCalendarEntry(data) {
        const normalizedEntry = this.normalizeCalendarEntry({
            id: 'calendar-' + Date.now(),
            title: data.title,
            description: data.description,
            startAt: data.startAt,
            endAt: data.endAt,
            reminderMinutes: data.reminderMinutes,
            sendEmailReminder: data.sendEmailReminder,
            reminderEmail: data.reminderEmail,
            sendSmsReminder: data.sendSmsReminder,
            reminderPhone: data.reminderPhone,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });

        this.calendarEvents.push(normalizedEntry);
        this.saveState();
        this.emitPlannerNotification({
            type: 'info',
            toastType: 'success',
            title: 'Calendar event recorded',
            message: `${normalizedEntry.title} was added to your calendar.`
        });
        this.processCalendarReminders();
        return normalizedEntry;
    }

    updateCalendarEntry(entryId, updates) {
        const index = this.calendarEvents.findIndex(entry => entry.id === entryId);
        if (index === -1) {
            return false;
        }

        this.calendarEvents[index] = this.normalizeCalendarEntry({
            ...this.calendarEvents[index],
            ...updates,
            updatedAt: new Date().toISOString()
        });
        this.saveState();
        this.emitPlannerNotification({
            type: 'info',
            toastType: 'info',
            title: 'Calendar event updated',
            message: `${this.calendarEvents[index].title} was updated.`
        });
        this.processCalendarReminders();
        return true;
    }

    deleteCalendarEntry(entryId) {
        this.calendarEvents = this.calendarEvents.filter(entry => entry.id !== entryId);
        this.saveState();
        this.emitPlannerNotification({
            type: 'warning',
            toastType: 'warning',
            title: 'Calendar event removed',
            message: 'A calendar entry was removed.'
        });
    }

    addAnalyticsEntry(data) {
        const entry = {
            id: 'analytics-' + Date.now(),
            title: data.title,
            insight: data.insight,
            metric: data.metric,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.analyticsEntries.push(entry);
        this.saveState();
        this.emitPlannerNotification({
            type: 'info',
            toastType: 'success',
            title: 'Analytics note saved',
            message: `${entry.title} was recorded.`
        });
        return entry;
    }

    updateAnalyticsEntry(entryId, updates) {
        const index = this.analyticsEntries.findIndex(entry => entry.id === entryId);
        if (index === -1) {
            return false;
        }

        this.analyticsEntries[index] = {
            ...this.analyticsEntries[index],
            ...updates,
            updatedAt: new Date().toISOString()
        };
        this.saveState();
        this.emitPlannerNotification({
            type: 'info',
            toastType: 'info',
            title: 'Analytics note updated',
            message: `${this.analyticsEntries[index].title} was updated.`
        });
        return true;
    }

    deleteAnalyticsEntry(entryId) {
        this.analyticsEntries = this.analyticsEntries.filter(entry => entry.id !== entryId);
        this.saveState();
        this.emitPlannerNotification({
            type: 'warning',
            toastType: 'warning',
            title: 'Analytics note removed',
            message: 'An analytics note was removed.'
        });
    }
}

export const plannerState = new PlannerState();