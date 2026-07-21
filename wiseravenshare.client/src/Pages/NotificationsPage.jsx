import React, { useMemo, useState } from 'react';
import { useNotification } from '../Contexts/NotificationContext';

const NotificationsPage = () => {
    const [filter, setFilter] = useState('all');
    const {
        notifications: appNotifications,
        markAsRead: markAppNotificationAsRead,
        markAllAsRead: markAllAppNotificationsAsRead,
        deleteNotification: deleteAppNotification
    } = useNotification();
    const [fallbackNotifications, setFallbackNotifications] = useState([
        {
            id: 1,
            type: 'like',
            user: { name: 'Sarah Johnson', avatar: 'SJ' },
            content: 'liked your post: "The future of social media is decentralized..."',
            time: '2 hours ago',
            unread: true
        },
        {
            id: 2,
            type: 'follow',
            user: { name: 'Michael Chen', avatar: 'MC' },
            content: 'started following you',
            time: '5 hours ago',
            unread: true
        },
        {
            id: 3,
            type: 'mention',
            user: { name: 'Emma Wilson', avatar: 'EW' },
            content: 'mentioned you in a comment: "Great point @RavenBlackbeak!"',
            time: '1 day ago',
            unread: false
        },
        {
            id: 4,
            type: 'comment',
            user: { name: 'David Kim', avatar: 'DK' },
            content: 'commented on your photo: "Amazing shot! The lighting is perfect."',
            time: '2 days ago',
            unread: false
        }
    ]);

    const notifications = useMemo(() => {
        if (appNotifications.length === 0) {
            return fallbackNotifications;
        }

        return appNotifications.map((notification) => ({
            id: notification.id,
            type: notification.type || 'alert',
            user: {
                name: notification.title || 'Planner alert',
                avatar: (notification.title || 'PA').slice(0, 2).toUpperCase()
            },
            content: notification.message,
            time: new Date(notification.timestamp).toLocaleString(),
            unread: !notification.read
        }));
    }, [appNotifications, fallbackNotifications]);

    const getTypeIcon = (type) => {
        switch (type) {
            case 'like': return '❤️';
            case 'follow': return '👥';
            case 'mention': return '@';
            case 'comment': return '💬';
            case 'alert': return '🔔';
            default: return '🔔';
        }
    };

    const handleMarkAsRead = (id) => {
        if (appNotifications.length > 0) {
            return markAppNotificationAsRead(id);
        }

        setFallbackNotifications(prev => prev.map(notif =>
            notif.id === id ? { ...notif, unread: false } : notif
        ));
    };

    const handleMarkAllAsRead = () => {
        if (appNotifications.length > 0) {
            return markAllAppNotificationsAsRead();
        }

        setFallbackNotifications(prev => prev.map(notif => ({ ...notif, unread: false })));
    };

    const handleRemoveNotification = (id) => {
        if (appNotifications.length > 0) {
            return deleteAppNotification(id);
        }

        setFallbackNotifications(prev => prev.filter(notif => notif.id !== id));
    };

    const filteredNotifications = notifications.filter(notif => {
        if (filter === 'all') return true;
        if (filter === 'unread') return notif.unread;
        return notif.type === filter;
    });

    const filters = [
        { id: 'all', label: 'All' },
        { id: 'unread', label: 'Unread' },
        { id: 'mention', label: 'Mentions' },
        { id: 'follow', label: 'Follows' },
        { id: 'like', label: 'Likes' }
    ];

    return (
        <div>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px'
            }}>
                <h1 style={{ color: 'var(--light-color)' }}>Notifications</h1>
                <button
                    onClick={handleMarkAllAsRead}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--highlight-color)',
                        cursor: 'pointer',
                        fontSize: '14px'
                    }}
                >
                    Mark all as read
                </button>
            </div>

            <div style={{
                display: 'flex',
                gap: '10px',
                marginBottom: '20px',
                flexWrap: 'wrap'
            }}>
                {filters.map(f => (
                    <button
                        key={f.id}
                        onClick={() => setFilter(f.id)}
                        style={{
                            padding: '8px 15px',
                            borderRadius: '20px',
                            border: '1px solid var(--border-color)',
                            background: filter === f.id ? 'var(--highlight-color)' : 'var(--card-bg)',
                            color: 'var(--text-color)',
                            cursor: 'pointer',
                            transition: 'all 0.3s'
                        }}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {filteredNotifications.map(notif => (
                    <div
                        key={notif.id}
                        onClick={() => handleMarkAsRead(notif.id)}
                        style={{
                            background: 'var(--card-bg)',
                            borderRadius: '12px',
                            padding: '20px',
                            border: '1px solid var(--border-color)',
                            borderLeft: notif.unread ? `4px solid var(--highlight-color)` : '1px solid var(--border-color)',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '15px',
                            cursor: 'pointer',
                            transition: 'all 0.3s',
                            position: 'relative'
                        }}
                    >
                        <div style={{
                            width: '50px',
                            height: '50px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, var(--highlight-color), var(--accent-color))',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 'bold',
                            fontSize: '20px'
                        }}>{notif.user.avatar}</div>

                        <div style={{ flex: 1 }}>
                            <div>
                                <strong>{notif.user.name}</strong> {notif.content}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--highlight-color)', marginTop: '5px' }}>
                                {notif.time}
                            </div>
                            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                <button style={{
                                    padding: '5px 12px',
                                    borderRadius: '15px',
                                    background: 'var(--highlight-color)',
                                    border: 'none',
                                    color: 'white',
                                    cursor: 'pointer',
                                    fontSize: '12px'
                                }} onClick={() => handleMarkAsRead(notif.id)}>View</button>
                                <button style={{
                                    padding: '5px 12px',
                                    borderRadius: '15px',
                                    background: 'transparent',
                                    border: '1px solid var(--border-color)',
                                    color: 'var(--text-color)',
                                    cursor: 'pointer',
                                    fontSize: '12px'
                                }} onClick={() => handleRemoveNotification(notif.id)}>Dismiss</button>
                            </div>
                        </div>

                        <div style={{ fontSize: '24px' }}>
                            {getTypeIcon(notif.type)}
                        </div>
                    </div>
                ))}
            </div>

            {filteredNotifications.length === 0 && (
                <div style={{
                    textAlign: 'center',
                    padding: '50px 0',
                    color: 'var(--highlight-color)'
                }}>
                    <i className="fas fa-bell-slash" style={{ fontSize: '50px', marginBottom: '15px' }}></i>
                    <p>No notifications to show</p>
                </div>
            )}
        </div>
    );
};

export default NotificationsPage;