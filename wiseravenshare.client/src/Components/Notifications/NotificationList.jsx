import React from 'react';
import { formatDate, formatNumber } from '../../utils/helpers';

const NotificationList = ({ notifications, onMarkRead, onDelete }) => {
    const getIcon = (type) => {
        switch (type) {
            case 'like': return '❤️';
            case 'follow': return '👥';
            case 'mention': return '@';
            case 'comment': return '💬';
            case 'repost': return '🔁';
            default: return '🔔';
        }
    };

    const getActionText = (type) => {
        switch (type) {
            case 'like': return 'liked your post';
            case 'follow': return 'started following you';
            case 'mention': return 'mentioned you';
            case 'comment': return 'commented on your post';
            case 'repost': return 'reposted your post';
            default: return 'sent a notification';
        }
    };

    if (notifications.length === 0) {
        return (
            <div style={{
                textAlign: 'center',
                padding: '50px',
                color: 'var(--highlight-color)'
            }}>
                <i className="fas fa-bell-slash" style={{ fontSize: '50px', marginBottom: '15px' }}></i>
                <p>No notifications yet</p>
            </div>
        );
    }

    return (
        <div>
            {notifications.map(notif => (
                <div
                    key={notif.id}
                    style={{
                        background: notif.read ? 'transparent' : 'rgba(113, 128, 150, 0.1)',
                        padding: '15px',
                        borderBottom: '1px solid var(--border-color)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.3s'
                    }}
                    onClick={() => onMarkRead(notif.id)}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
                    onMouseLeave={(e) => {
                        if (!notif.read) {
                            e.currentTarget.style.background = 'rgba(113, 128, 150, 0.1)';
                        } else {
                            e.currentTarget.style.background = 'transparent';
                        }
                    }}
                >
                    <div style={{ fontSize: '24px' }}>
                        {getIcon(notif.type)}
                    </div>
                    <div style={{ flex: 1 }}>
                        <div>
                            <strong>{notif.user.name}</strong> {getActionText(notif.type)}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>
                            {formatDate(notif.createdAt)}
                        </div>
                    </div>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(notif.id);
                        }}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--highlight-color)',
                            cursor: 'pointer',
                            padding: '5px'
                        }}
                    >
                        <i className="fas fa-times"></i>
                    </button>
                </div>
            ))}
        </div>
    );
};

export default NotificationList;