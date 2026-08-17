import React, { createContext, useState, useContext, useCallback, useEffect, useRef } from 'react';
import { createHubConnection } from '../Services/realtimeHub.js';

const NotificationContext = createContext();

export const useNotification = () => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotification must be used within NotificationProvider');
    }
    return context;
};

export const NotificationProvider = ({ children }) => {
    const [notifications, setNotifications] = useState([]);
    const [toasts, setToasts] = useState([]);
    const notificationConnectionRef = useRef(null);

    const addNotification = useCallback((notification) => {
        const newNotification = {
            id: Date.now(),
            read: false,
            timestamp: new Date(),
            ...notification
        };
        setNotifications(prev => [newNotification, ...prev]);

        // Request browser notification permission
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification(notification.title, {
                body: notification.message,
                icon: '/favicon.ico'
            });
        }

        return newNotification.id;
    }, []);

    const addToast = useCallback((message, type = 'info', duration = 5000) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        setToasts(prev => [...prev, { id, message, type }]);

        setTimeout(() => {
            setToasts(prev => prev.filter(toast => toast.id !== id));
        }, duration);

        return id;
    }, []);

    const markAsRead = useCallback((id) => {
        setNotifications(prev => prev.map(notif =>
            notif.id === id ? { ...notif, read: true } : notif
        ));
    }, []);

    const markAllAsRead = useCallback(() => {
        setNotifications(prev => prev.map(notif => ({ ...notif, read: true })));
    }, []);

    const deleteNotification = useCallback((id) => {
        setNotifications(prev => prev.filter(notif => notif.id !== id));
    }, []);

    useEffect(() => {
        const handlePlannerNotification = (event) => {
            const detail = event?.detail || {};
            const message = detail.message || detail.title || 'Planner update';
            addNotification({
                title: detail.title || 'Planner update',
                message,
                type: detail.type || 'info'
            });
            addToast(message, detail.toastType || detail.type || 'info');
        };

        window.addEventListener('wise-planner-notification', handlePlannerNotification);
        return () => window.removeEventListener('wise-planner-notification', handlePlannerNotification);
    }, [addNotification, addToast]);

    useEffect(() => {
        let isMounted = true;

        const getCurrentUserId = () => {
            try {
                const parsed = JSON.parse(localStorage.getItem('user_data') || 'null');
                const id = String(parsed?.id || '').trim().toLowerCase();
                return id || '';
            } catch {
                return '';
            }
        };

        const bindUserChannel = async () => {
            const userId = getCurrentUserId();
            const connection = notificationConnectionRef.current;

            if (!connection || !userId || connection.state !== 'Connected') {
                return;
            }

            try {
                await connection.invoke('JoinUserChannel', userId);
            } catch {
                // Ignore channel join errors; reconnect flow will retry.
            }
        };

        const connectNotificationsHub = async () => {
            const connection = createHubConnection('/api/hubs/notifications');

            connection.on('PersonnelNotification', (payload) => {
                const sender = String(payload?.sender || 'Wiseravenshare Personnel').trim();
                const title = String(payload?.title || 'Announcement').trim();
                const messageBody = String(payload?.message || '').trim();

                addNotification({
                    title: sender,
                    message: messageBody ? `${title}: ${messageBody}` : title,
                    type: String(payload?.type || 'alert').trim() || 'alert',
                    source: 'personnel',
                    fromPersonnel: true
                });
                addToast(`${title}${messageBody ? ` - ${messageBody}` : ''}`, 'info');
            });

            connection.onreconnected(async () => {
                await bindUserChannel();
            });

            try {
                await connection.start();
                if (!isMounted) {
                    await connection.stop();
                    return;
                }

                notificationConnectionRef.current = connection;
                await bindUserChannel();
            } catch {
                // Keep notifications functional via local context even if hub connection fails.
            }
        };

        const handleSocialUpdate = () => {
            bindUserChannel().catch(() => null);
        };

        connectNotificationsHub();
        window.addEventListener('wiseraven:social-updated', handleSocialUpdate);

        return () => {
            isMounted = false;
            window.removeEventListener('wiseraven:social-updated', handleSocialUpdate);

            const connection = notificationConnectionRef.current;
            notificationConnectionRef.current = null;
            if (connection) {
                connection.stop().catch(() => null);
            }
        };
    }, [addNotification, addToast]);

    const clearAll = useCallback(() => {
        setNotifications([]);
    }, []);

    const unreadCount = notifications.filter(n => !n.read).length;

    const value = {
        notifications,
        toasts,
        unreadCount,
        addNotification,
        addToast,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearAll
    };

    return (
        <NotificationContext.Provider value={value}>
            {children}
            <ToastContainer toasts={toasts} />
        </NotificationContext.Provider>
    );
};

const ToastContainer = ({ toasts }) => {
    return (
        <div style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: 1000
        }}>
            {toasts.map(toast => (
                <div
                    key={toast.id}
                    className="toast"
                    style={{
                        borderLeftColor: toast.type === 'success' ? '#4caf50' :
                            toast.type === 'error' ? '#f44336' :
                                toast.type === 'warning' ? '#ff9800' : '#2196f3'
                    }}
                >
                    {toast.message}
                </div>
            ))}
        </div>
    );
};