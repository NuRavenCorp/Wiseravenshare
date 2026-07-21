<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WiseRaven - Notifications</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --primary-color: #1a1f2b;
            --secondary-color: #2d3748;
            --accent-color: #4a5568;
            --highlight-color: #718096;
            --light-color: #e2e8f0;
            --text-color: #f8fafc;
            --bg-color: #0f1419;
            --card-bg: #1e293b;
            --border-color: #334155;
            --success-color: #10b981;
            --warning-color: #f59e0b;
            --error-color: #ef4444;
            --info-color: #3b82f6;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: var(--bg-color);
            color: var(--text-color);
            line-height: 1.6;
        }

        .header {
            background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
            color: var(--text-color);
            padding: 1rem 0;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            position: sticky;
            top: 0;
            z-index: 100;
        }

        .header-container {
            display: flex;
            justify-content: space-between;
            align-items: center;
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 20px;
        }

        .header h1 {
            font-size: 1.8rem;
            display: flex;
            align-items: center;
            gap: 10px;
            font-weight: 700;
        }

        .user-controls {
            display: flex;
            align-items: center;
            gap: 15px;
        }

        #logout-btn {
            background: var(--accent-color);
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 20px;
            cursor: pointer;
            transition: all 0.3s ease;
            font-weight: 600;
        }

            #logout-btn:hover {
                background: var(--highlight-color);
                transform: translateY(-2px);
            }

        .container {
            max-width: 1200px;
            margin: 20px auto;
            padding: 0 20px;
        }

        .notification-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            padding-bottom: 15px;
            border-bottom: 1px solid var(--border-color);
        }

        .notification-title {
            font-size: 2rem;
            color: var(--light-color);
        }

        .notification-actions {
            display: flex;
            gap: 10px;
        }

        .mark-all-read-btn {
            background: var(--accent-color);
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 20px;
            cursor: pointer;
            transition: all 0.3s ease;
            font-weight: 600;
        }

            .mark-all-read-btn:hover {
                background: var(--highlight-color);
                transform: translateY(-2px);
            }

        .filter-tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }

        .filter-tab {
            padding: 8px 16px;
            border-radius: 20px;
            border: 1px solid var(--border-color);
            background: var(--card-bg);
            color: var(--text-color);
            cursor: pointer;
            transition: all 0.3s ease;
            font-weight: 500;
        }

            .filter-tab:hover {
                background: var(--accent-color);
            }

            .filter-tab.active {
                background: var(--highlight-color);
                color: white;
                border-color: var(--highlight-color);
            }

        .notification-list {
            display: flex;
            flex-direction: column;
            gap: 15px;
        }

        .notification-item {
            background: var(--card-bg);
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            display: flex;
            align-items: flex-start;
            gap: 15px;
            transition: all 0.3s ease;
            border: 1px solid var(--border-color);
            position: relative;
        }

            .notification-item:hover {
                transform: translateY(-3px);
                box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
            }

            .notification-item.unread {
                border-left: 4px solid var(--highlight-color);
                background: rgba(113, 128, 150, 0.1);
            }

        .notification-avatar {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            object-fit: cover;
            border: 2px solid var(--highlight-color);
        }

        .notification-content {
            flex: 1;
        }

        .notification-text {
            margin-bottom: 10px;
            line-height: 1.5;
        }

            .notification-text strong {
                color: var(--light-color);
            }

        .notification-meta {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 10px;
        }

        .notification-time {
            font-size: 0.9rem;
            color: var(--highlight-color);
        }

        .notification-actions-buttons {
            display: flex;
            gap: 10px;
        }

        .action-btn {
            padding: 6px 12px;
            border-radius: 15px;
            border: 1px solid var(--border-color);
            background: transparent;
            color: var(--text-color);
            cursor: pointer;
            font-size: 0.9rem;
            transition: all 0.3s ease;
        }

            .action-btn:hover {
                transform: translateY(-2px);
                background: rgba(255, 255, 255, 0.05);
            }

            .action-btn.primary {
                background: var(--highlight-color);
                border-color: var(--highlight-color);
                color: white;
            }

        .notification-type-icon {
            position: absolute;
            top: 15px;
            right: 15px;
            font-size: 1.2rem;
            color: var(--highlight-color);
        }

        .notification-type-like {
            color: #e0245e;
        }

        .notification-type-comment {
            color: #3b82f6;
        }

        .notification-type-follow {
            color: #10b981;
        }

        .notification-type-mention {
            color: #f59e0b;
        }

        .notification-type-share {
            color: #8b5cf6;
        }

        .empty-state {
            text-align: center;
            padding: 60px 0;
            color: var(--highlight-color);
        }

        .empty-state-icon {
            font-size: 4rem;
            margin-bottom: 20px;
            opacity: 0.5;
        }

        .empty-state-title {
            font-size: 1.5rem;
            margin-bottom: 10px;
            color: var(--light-color);
        }

        .empty-state-text {
            font-size: 1rem;
            max-width: 400px;
            margin: 0 auto;
        }

        .notification-count {
            background: var(--highlight-color);
            color: white;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 0.8rem;
            margin-left: 5px;
        }

        .loading-skeleton {
            display: flex;
            align-items: flex-start;
            gap: 15px;
            padding: 20px;
            background: var(--card-bg);
            border-radius: 12px;
            margin-bottom: 15px;
        }

        .skeleton-avatar {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background: linear-gradient(90deg, var(--border-color) 25%, var(--accent-color) 50%, var(--border-color) 75%);
            background-size: 200% 100%;
            animation: loading 1.5s infinite;
        }

        .skeleton-content {
            flex: 1;
        }

        .skeleton-line {
            height: 12px;
            background: linear-gradient(90deg, var(--border-color) 25%, var(--accent-color) 50%, var(--border-color) 75%);
            background-size: 200% 100%;
            animation: loading 1.5s infinite;
            border-radius: 4px;
            margin-bottom: 8px;
        }

            .skeleton-line.short {
                width: 60%;
            }

            .skeleton-line.medium {
                width: 80%;
            }

        @keyframes loading {
            0% {
                background-position: 200% 0;
            }

            100% {
                background-position: -200% 0;
            }
        }

        /* Alert styles */
        .alert {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 8px;
            display: none;
            z-index: 1001;
            animation: slideIn 0.3s ease;
        }

        .alert-error {
            background-color: rgba(239, 68, 68, 0.2);
            border-left: 4px solid var(--error-color);
            color: var(--text-color);
        }

        .alert-success {
            background-color: rgba(16, 185, 129, 0.2);
            border-left: 4px solid var(--success-color);
            color: var(--text-color);
        }

        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }

            to {
                transform: translateX(0);
                opacity: 1;
            }
        }

        /* Loading overlay */
        .loading-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 9999;
        }

        .spinner {
            width: 50px;
            height: 50px;
            border: 5px solid var(--border-color);
            border-top-color: var(--highlight-color);
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            to {
                transform: rotate(360deg);
            }
        }

        /* API Status Indicator */
        .api-status {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: var(--card-bg);
            padding: 10px 15px;
            border-radius: 20px;
            font-size: 0.8rem;
            display: flex;
            align-items: center;
            gap: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            z-index: 1000;
        }

            .api-status.connected {
                border-left: 3px solid var(--success-color);
            }

            .api-status.disconnected {
                border-left: 3px solid var(--error-color);
            }

        .status-indicator {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            display: inline-block;
        }

        .connected .status-indicator {
            background-color: var(--success-color);
            animation: pulse 2s infinite;
        }

        .disconnected .status-indicator {
            background-color: var(--error-color);
        }

        @keyframes pulse {
            0% {
                opacity: 1;
            }

            50% {
                opacity: 0.5;
            }

            100% {
                opacity: 1;
            }
        }

        /* Responsive design */
        @media (max-width: 768px) {
            .container {
                padding: 10px;
            }

            .notification-header {
                flex-direction: column;
                align-items: flex-start;
                gap: 15px;
            }

            .notification-actions {
                width: 100%;
                justify-content: flex-end;
            }

            .filter-tabs {
                overflow-x: auto;
                padding-bottom: 10px;
            }
        }
    </style>
</head>
<body>
    <?php if (isAdmin() || isModerator()): ?>
    <li class="nav-item">
        <a href="/admin/index.php" class="nav-link">
            <i class="fas fa-shield-alt"></i>
            <span>Admin Panel</span>
        </a>
    </li>
    <?php endif; ?>
    <header class="header">
        <div class="header-container">
            <h1><i class="fas fa-crow"></i> WiseRaven Notifications</h1>
            <div class="user-controls">
                <button id="logout-btn">Logout</button>
            </div>
        </div>
    </header>

    <div class="container">
        <div class="notification-header">
            <h2 class="notification-title">Notifications</h2>
            <div class="notification-actions">
                <button class="mark-all-read-btn" id="markAllReadBtn">
                    <i class="fas fa-check-double"></i> Mark all as read
                </button>
            </div>
        </div>

        <div class="filter-tabs" id="filterTabs">
            <button class="filter-tab active" data-filter="all">All</button>
            <button class="filter-tab" data-filter="unread">Unread</button>
            <button class="filter-tab" data-filter="likes">
                <i class="fas fa-heart"></i> Likes
                <span class="notification-count" id="likeCount">0</span>
            </button>
            <button class="filter-tab" data-filter="comments">
                <i class="fas fa-comment"></i> Comments
                <span class="notification-count" id="commentCount">0</span>
            </button>
            <button class="filter-tab" data-filter="follows">
                <i class="fas fa-user-plus"></i> Follows
                <span class="notification-count" id="followCount">0</span>
            </button>
            <button class="filter-tab" data-filter="mentions">
                <i class="fas fa-at"></i> Mentions
                <span class="notification-count" id="mentionCount">0</span>
            </button>
        </div>

        <div class="notification-list" id="notificationList">
            <!-- Notifications loaded via API -->
            <div class="loading-skeleton">
                <div class="skeleton-avatar"></div>
                <div class="skeleton-content">
                    <div class="skeleton-line medium"></div>
                    <div class="skeleton-line short"></div>
                    <div class="skeleton-line" style="width: 30%;"></div>
                </div>
            </div>
        </div>
    </div>

    <!-- Loading Overlay -->
    <div class="loading-overlay" id="loadingOverlay">
        <div class="spinner"></div>
        <div style="margin-top: 20px;">Loading notifications...</div>
    </div>

    <!-- API Status Indicator -->
    <div class="api-status connected" id="apiStatus">
        <span class="status-indicator"></span>
        <span id="apiStatusText">Connected to API</span>
    </div>

    <!-- Alert Container -->
    <div id="alertContainer"></div>

    <script>
        // ===================== CONFIGURATION =====================
        const NOTIFICATIONS_CONFIG = {
            BASE_URL: 'https://api.wiseraven.social/v1',
            ENDPOINTS: {
                NOTIFICATIONS: '/notifications',
                MARK_READ: '/notifications/mark-read',
                MARK_ALL_READ: '/notifications/mark-all-read',
                DELETE: '/notifications',
                STATS: '/notifications/stats'
            },
            POLL_INTERVAL: 10000 // 10 seconds
        };

        // ===================== STATE MANAGEMENT =====================
        const NotificationsState = {
            notifications: [],
            filteredNotifications: [],
            currentFilter: 'all',
            notificationStats: {
                total: 0,
                unread: 0,
                likes: 0,
                comments: 0,
                follows: 0,
                mentions: 0
            },
            pollInterval: null,
            isLoading: false
        };

        // ===================== AUTHENTICATION =====================
        class AuthManager {
            constructor() {
                this.token = localStorage.getItem('wise-raven-token');
                this.userData = JSON.parse(localStorage.getItem('wise-raven-user') || '{}');
            }

            getAuthHeaders() {
                return {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                };
            }

            async verifyAuthentication() {
                if (!this.token) {
                    this.redirectToLogin();
                    return false;
                }

                try {
                    const response = await fetch(`${NOTIFICATIONS_CONFIG.BASE_URL}/auth/verify`, {
                        method: 'GET',
                        headers: this.getAuthHeaders()
                    });

                    if (response.ok) {
                        return true;
                    } else {
                        this.redirectToLogin();
                        return false;
                    }
                } catch (error) {
                    console.error('Auth verification failed:', error);
                    this.redirectToLogin();
                    return false;
                }
            }

            redirectToLogin() {
                window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.pathname);
            }

            async logout() {
                try {
                    await fetch(`${NOTIFICATIONS_CONFIG.BASE_URL}/auth/logout`, {
                        method: 'POST',
                        headers: this.getAuthHeaders()
                    });
                } finally {
                    localStorage.removeItem('wise-raven-token');
                    localStorage.removeItem('wise-raven-user');
                    window.location.href = 'login.html';
                }
            }
        }

        // ===================== NOTIFICATIONS MANAGER =====================
        class NotificationsManager {
            constructor() {
                this.authManager = new AuthManager();
            }

            async loadNotifications() {
                try {
                    const response = await fetch(
                        `${NOTIFICATIONS_CONFIG.BASE_URL}${NOTIFICATIONS_CONFIG.ENDPOINTS.NOTIFICATIONS}`,
                        {
                            method: 'GET',
                            headers: this.authManager.getAuthHeaders()
                        }
                    );

                    if (!response.ok) throw new Error('Failed to load notifications');

                    const data = await response.json();
                    NotificationsState.notifications = data.notifications || [];
                    NotificationsState.filteredNotifications = [...NotificationsState.notifications];

                    this.calculateStats();
                    this.updateFilterCounts();
                    this.renderNotifications();
                } catch (error) {
                    this.showError('Failed to load notifications');
                    console.error('Notifications load error:', error);
                }
            }

            async loadNotificationStats() {
                try {
                    const response = await fetch(
                        `${NOTIFICATIONS_CONFIG.BASE_URL}${NOTIFICATIONS_CONFIG.ENDPOINTS.STATS}`,
                        {
                            method: 'GET',
                            headers: this.authManager.getAuthHeaders()
                        }
                    );

                    if (!response.ok) throw new Error('Failed to load notification stats');

                    const data = await response.json();
                    NotificationsState.notificationStats = data.stats || {};
                    this.updateFilterCounts();
                } catch (error) {
                    console.error('Stats load error:', error);
                }
            }

            async markAsRead(notificationId) {
                try {
                    const response = await fetch(
                        `${NOTIFICATIONS_CONFIG.BASE_URL}${NOTIFICATIONS_CONFIG.ENDPOINTS.MARK_READ}/${notificationId}`,
                        {
                            method: 'POST',
                            headers: this.authManager.getAuthHeaders()
                        }
                    );

                    if (!response.ok) throw new Error('Failed to mark as read');

                    // Update local state
                    const notification = NotificationsState.notifications.find(n => n.id === notificationId);
                    if (notification) {
                        notification.read = true;
                        this.calculateStats();
                        this.updateFilterCounts();
                        this.renderNotifications();
                    }

                    return true;
                } catch (error) {
                    this.showError('Failed to mark as read');
                    console.error('Mark as read error:', error);
                    return false;
                }
            }

            async markAllAsRead() {
                try {
                    const response = await fetch(
                        `${NOTIFICATIONS_CONFIG.BASE_URL}${NOTIFICATIONS_CONFIG.ENDPOINTS.MARK_ALL_READ}`,
                        {
                            method: 'POST',
                            headers: this.authManager.getAuthHeaders()
                        }
                    );

                    if (!response.ok) throw new Error('Failed to mark all as read');

                    // Update local state
                    NotificationsState.notifications.forEach(notification => {
                        notification.read = true;
                    });

                    this.calculateStats();
                    this.updateFilterCounts();
                    this.renderNotifications();

                    this.showSuccess('All notifications marked as read');
                    return true;
                } catch (error) {
                    this.showError('Failed to mark all as read');
                    console.error('Mark all as read error:', error);
                    return false;
                }
            }

            async deleteNotification(notificationId) {
                try {
                    const response = await fetch(
                        `${NOTIFICATIONS_CONFIG.BASE_URL}${NOTIFICATIONS_CONFIG.ENDPOINTS.DELETE}/${notificationId}`,
                        {
                            method: 'DELETE',
                            headers: this.authManager.getAuthHeaders()
                        }
                    );

                    if (!response.ok) throw new Error('Failed to delete notification');

                    // Remove from local state
                    NotificationsState.notifications = NotificationsState.notifications.filter(
                        n => n.id !== notificationId
                    );

                    this.calculateStats();
                    this.updateFilterCounts();
                    this.renderNotifications();

                    this.showSuccess('Notification deleted');
                    return true;
                } catch (error) {
                    this.showError('Failed to delete notification');
                    console.error('Delete notification error:', error);
                    return false;
                }
            }

            filterNotifications(filter) {
                NotificationsState.currentFilter = filter;

                switch (filter) {
                    case 'all':
                        NotificationsState.filteredNotifications = [...NotificationsState.notifications];
                        break;
                    case 'unread':
                        NotificationsState.filteredNotifications = NotificationsState.notifications.filter(
                            n => !n.read
                        );
                        break;
                    case 'likes':
                    case 'comments':
                    case 'follows':
                    case 'mentions':
                        NotificationsState.filteredNotifications = NotificationsState.notifications.filter(
                            n => n.type === filter
                        );
                        break;
                    default:
                        NotificationsState.filteredNotifications = [...NotificationsState.notifications];
                }

                this.renderNotifications();
                this.updateActiveTab();
            }

            calculateStats() {
                const stats = {
                    total: NotificationsState.notifications.length,
                    unread: 0,
                    likes: 0,
                    comments: 0,
                    follows: 0,
                    mentions: 0
                };

                NotificationsState.notifications.forEach(notification => {
                    if (!notification.read) stats.unread++;

                    switch (notification.type) {
                        case 'like':
                            stats.likes++;
                            break;
                        case 'comment':
                            stats.comments++;
                            break;
                        case 'follow':
                            stats.follows++;
                            break;
                        case 'mention':
                            stats.mentions++;
                            break;
                    }
                });

                NotificationsState.notificationStats = stats;
            }

            updateFilterCounts() {
                const stats = NotificationsState.notificationStats;

                document.getElementById('likeCount').textContent = stats.likes;
                document.getElementById('commentCount').textContent = stats.comments;
                document.getElementById('followCount').textContent = stats.follows;
                document.getElementById('mentionCount').textContent = stats.mentions;
            }

            updateActiveTab() {
                document.querySelectorAll('.filter-tab').forEach(tab => {
                    tab.classList.remove('active');
                    if (tab.dataset.filter === NotificationsState.currentFilter) {
                        tab.classList.add('active');
                    }
                });
            }

            renderNotifications() {
                const container = document.getElementById('notificationList');
                if (!container) return;

                container.innerHTML = '';

                if (NotificationsState.filteredNotifications.length === 0) {
                    this.showEmptyState();
                    return;
                }

                NotificationsState.filteredNotifications.forEach(notification => {
                    const notificationElement = this.createNotificationElement(notification);
                    container.appendChild(notificationElement);
                });
            }

            createNotificationElement(notification) {
                const div = document.createElement('div');
                div.className = `notification-item ${!notification.read ? 'unread' : ''}`;
                div.dataset.notificationId = notification.id;

                const timeAgo = this.formatTimeAgo(notification.timestamp);
                const typeIcon = this.getTypeIcon(notification.type);
                const typeClass = `notification-type-${notification.type}`;

                div.innerHTML = `
                            <img src="${notification.senderAvatar || 'default-avatar.jpg'}"
                                 alt="${notification.senderName}"
                                 class="notification-avatar">
                            <div class="notification-content">
                                <div class="notification-text">
                                    ${this.getNotificationText(notification)}
                                </div>
                                <div class="notification-meta">
                                    <div class="notification-time">${timeAgo}</div>
                                    <div class="notification-actions-buttons">
                                        ${!notification.read ? `
                                            <button class="action-btn primary mark-read-btn"
                                                    data-notification-id="${notification.id}">
                                                <i class="fas fa-check"></i> Mark as read
                                            </button>
                                        ` : ''}
                                        <button class="action-btn delete-btn"
                                                data-notification-id="${notification.id}">
                                            <i class="fas fa-trash"></i> Delete
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div class="notification-type-icon ${typeClass}">
                                ${typeIcon}
                            </div>
                        `;

                return div;
            }

            getNotificationText(notification) {
                const senderName = `<strong>${this.escapeHtml(notification.senderName)}</strong>`;
                const content = notification.content ? this.escapeHtml(notification.content) : '';

                switch (notification.type) {
                    case 'like':
                        return `${senderName} liked your post: "${content}"`;
                    case 'comment':
                        return `${senderName} commented on your post: "${content}"`;
                    case 'follow':
                        return `${senderName} started following you`;
                    case 'mention':
                        return `${senderName} mentioned you: "${content}"`;
                    case 'share':
                        return `${senderName} shared your post`;
                    case 'repost':
                        return `${senderName} reposted your content`;
                    default:
                        return notification.message || 'New notification';
                }
            }

            getTypeIcon(type) {
                switch (type) {
                    case 'like': return '<i class="fas fa-heart"></i>';
                    case 'comment': return '<i class="fas fa-comment"></i>';
                    case 'follow': return '<i class="fas fa-user-plus"></i>';
                    case 'mention': return '<i class="fas fa-at"></i>';
                    case 'share': return '<i class="fas fa-share"></i>';
                    case 'repost': return '<i class="fas fa-retweet"></i>';
                    default: return '<i class="fas fa-bell"></i>';
                }
            }

            showEmptyState() {
                const container = document.getElementById('notificationList');

                let message, icon;
                switch (NotificationsState.currentFilter) {
                    case 'all':
                        message = 'No notifications yet';
                        icon = 'fa-bell-slash';
                        break;
                    case 'unread':
                        message = 'No unread notifications';
                        icon = 'fa-check-circle';
                        break;
                    case 'likes':
                        message = 'No likes yet';
                        icon = 'fa-heart';
                        break;
                    case 'comments':
                        message = 'No comments yet';
                        icon = 'fa-comment';
                        break;
                    case 'follows':
                        message = 'No new followers';
                        icon = 'fa-user-plus';
                        break;
                    case 'mentions':
                        message = 'No mentions yet';
                        icon = 'fa-at';
                        break;
                    default:
                        message = 'No notifications';
                        icon = 'fa-bell';
                }

                container.innerHTML = `
                            <div class="empty-state">
                                <div class="empty-state-icon">
                                    <i class="fas ${icon}"></i>
                                </div>
                                <h3 class="empty-state-title">${message}</h3>
                                <p class="empty-state-text">You're all caught up!</p>
                            </div>
                        `;
            }

            formatTimeAgo(timestamp) {
                if (!timestamp) return '';

                const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
                let interval = seconds / 31536000;

                if (interval > 1) return Math.floor(interval) + " years ago";
                interval = seconds / 2592000;
                if (interval > 1) return Math.floor(interval) + " months ago";
                interval = seconds / 86400;
                if (interval > 1) return Math.floor(interval) + " days ago";
                interval = seconds / 3600;
                if (interval > 1) return Math.floor(interval) + " hours ago";
                interval = seconds / 60;
                if (interval > 1) return Math.floor(interval) + " minutes ago";
                return Math.floor(seconds) + " seconds ago";
            }

            escapeHtml(text) {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            }

            startPolling() {
                if (NotificationsState.pollInterval) {
                    clearInterval(NotificationsState.pollInterval);
                }

                NotificationsState.pollInterval = setInterval(async () => {
                    await this.pollNewNotifications();
                }, NOTIFICATIONS_CONFIG.POLL_INTERVAL);
            }

            stopPolling() {
                if (NotificationsState.pollInterval) {
                    clearInterval(NotificationsState.pollInterval);
                    NotificationsState.pollInterval = null;
                }
            }

            async pollNewNotifications() {
                try {
                    const response = await fetch(
                        `${NOTIFICATIONS_CONFIG.BASE_URL}${NOTIFICATIONS_CONFIG.ENDPOINTS.NOTIFICATIONS}`,
                        {
                            method: 'GET',
                            headers: this.authManager.getAuthHeaders()
                        }
                    );

                    if (!response.ok) return;

                    const data = await response.json();
                    const newNotifications = data.notifications || [];

                    // Check if there are new notifications
                    const existingIds = new Set(NotificationsState.notifications.map(n => n.id));
                    const actualNewNotifications = newNotifications.filter(n => !existingIds.has(n.id));

                    if (actualNewNotifications.length > 0) {
                        // Add new notifications to the beginning
                        NotificationsState.notifications = [
                            ...actualNewNotifications,
                            ...NotificationsState.notifications
                        ];

                        this.calculateStats();
                        this.updateFilterCounts();
                        this.renderNotifications();

                        // Show notification badge or alert for new notifications
                        this.showNewNotificationsAlert(actualNewNotifications.length);
                    }
                } catch (error) {
                    console.error('Poll error:', error);
                }
            }

            showNewNotificationsAlert(count) {
                if (count === 0) return;

                const alertDiv = document.createElement('div');
                alertDiv.className = 'alert alert-success';
                alertDiv.innerHTML = `
                            <i class="fas fa-bell"></i>
                            <span>${count} new notification${count > 1 ? 's' : ''}</span>
                        `;

                const container = document.getElementById('alertContainer');
                container.appendChild(alertDiv);

                setTimeout(() => {
                    alertDiv.style.display = 'block';
                    setTimeout(() => {
                        alertDiv.style.opacity = '0';
                        setTimeout(() => alertDiv.remove(), 300);
                    }, 3000);
                }, 10);
            }

            showError(message) {
                this.showAlert(message, 'error');
            }

            showSuccess(message) {
                this.showAlert(message, 'success');
            }

            showAlert(message, type) {
                const alertDiv = document.createElement('div');
                alertDiv.className = `alert alert-${type}`;
                alertDiv.innerHTML = `
                            <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
                            <span>${message}</span>
                        `;

                const container = document.getElementById('alertContainer');
                container.appendChild(alertDiv);

                setTimeout(() => {
                    alertDiv.style.display = 'block';
                    setTimeout(() => {
                        alertDiv.style.opacity = '0';
                        setTimeout(() => alertDiv.remove(), 300);
                    }, 3000);
                }, 10);
            }
        }

        // ===================== MAIN APPLICATION =====================
        class NotificationsApp {
            constructor() {
                this.authManager = new AuthManager();
                this.notificationsManager = new NotificationsManager();
            }

            async initialize() {
                console.log('Initializing Notifications...');

                // Show loading overlay
                document.getElementById('loadingOverlay').style.display = 'flex';

                // Verify authentication
                const isAuthenticated = await this.authManager.verifyAuthentication();
                if (!isAuthenticated) return;

                // Load notifications
                await this.notificationsManager.loadNotifications();
                await this.notificationsManager.loadNotificationStats();

                // Setup event listeners
                this.setupEventListeners();

                // Start polling for new notifications
                this.notificationsManager.startPolling();

                // Hide loading overlay
                setTimeout(() => {
                    document.getElementById('loadingOverlay').style.display = 'none';
                }, 1000);

                console.log('Notifications initialized');
            }

            setupEventListeners() {
                // Logout button
                document.getElementById('logout-btn').addEventListener('click', () => {
                    this.authManager.logout();
                });

                // Mark all as read button
                document.getElementById('markAllReadBtn').addEventListener('click', async () => {
                    const confirmed = confirm('Are you sure you want to mark all notifications as read?');
                    if (confirmed) {
                        await this.notificationsManager.markAllAsRead();
                    }
                });

                // Filter tabs
                document.querySelectorAll('.filter-tab').forEach(tab => {
                    tab.addEventListener('click', () => {
                        const filter = tab.dataset.filter;
                        this.notificationsManager.filterNotifications(filter);
                    });
                });

                // Event delegation for notification actions
                document.getElementById('notificationList').addEventListener('click', async (e) => {
                    const markReadBtn = e.target.closest('.mark-read-btn');
                    const deleteBtn = e.target.closest('.delete-btn');

                    if (markReadBtn) {
                        const notificationId = markReadBtn.dataset.notificationId;
                        await this.notificationsManager.markAsRead(notificationId);
                    }

                    if (deleteBtn) {
                        const notificationId = deleteBtn.dataset.notificationId;
                        const confirmed = confirm('Are you sure you want to delete this notification?');
                        if (confirmed) {
                            await this.notificationsManager.deleteNotification(notificationId);
                        }
                    }
                });

                // Notification item click (mark as read on click)
                document.getElementById('notificationList').addEventListener('click', async (e) => {
                    const notificationItem = e.target.closest('.notification-item');
                    if (notificationItem && !e.target.closest('.notification-actions-buttons')) {
                        const notificationId = notificationItem.dataset.notificationId;
                        const notification = NotificationsState.notifications.find(
                            n => n.id === notificationId
                        );

                        if (notification && !notification.read) {
                            await this.notificationsManager.markAsRead(notificationId);
                        }

                        // TODO: Navigate to the relevant content
                        this.notificationsManager.showSuccess('Notification opened');
                    }
                });

                // Stop polling when leaving page
                window.addEventListener('beforeunload', () => {
                    this.notificationsManager.stopPolling();
                });
            }
        }

        // ===================== INITIALIZE APPLICATION =====================
        document.addEventListener('DOMContentLoaded', () => {
            const app = new NotificationsApp();
            app.initialize();
        });
    </script>
</body>
</html>