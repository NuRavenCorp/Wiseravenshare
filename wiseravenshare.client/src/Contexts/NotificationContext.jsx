import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';

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