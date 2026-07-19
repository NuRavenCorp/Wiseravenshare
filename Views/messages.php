<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WiseRaven - Messages</title>
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
            height: 100vh;
            overflow: hidden;
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
            max-width: 1400px;
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
            display: grid;
            grid-template-columns: 350px 1fr;
            height: calc(100vh - 70px);
            max-width: 1400px;
            margin: 0 auto;
        }

        .sidebar {
            background: var(--card-bg);
            border-right: 1px solid var(--border-color);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .search-bar {
            padding: 20px;
            border-bottom: 1px solid var(--border-color);
        }

        .search-input {
            width: 100%;
            padding: 12px 20px;
            border-radius: 25px;
            border: 1px solid var(--border-color);
            background: rgba(255, 255, 255, 0.05);
            color: var(--text-color);
            outline: none;
            transition: all 0.3s ease;
        }

            .search-input:focus {
                border-color: var(--highlight-color);
                box-shadow: 0 0 0 2px rgba(113, 128, 150, 0.3);
            }

        .conversation-list {
            flex: 1;
            overflow-y: auto;
            padding: 10px 0;
        }

        .conversation-item {
            display: flex;
            align-items: center;
            padding: 15px 20px;
            cursor: pointer;
            transition: all 0.3s ease;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

            .conversation-item:hover {
                background: rgba(255, 255, 255, 0.05);
            }

            .conversation-item.active {
                background: rgba(113, 128, 150, 0.2);
                border-left: 3px solid var(--highlight-color);
            }

        .conversation-avatar {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            object-fit: cover;
            margin-right: 15px;
            border: 2px solid var(--highlight-color);
        }

        .conversation-info {
            flex: 1;
            min-width: 0;
        }

        .conversation-name {
            font-weight: 600;
            margin-bottom: 5px;
            color: var(--light-color);
        }

        .conversation-preview {
            font-size: 0.9rem;
            color: var(--highlight-color);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .conversation-meta {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 5px;
        }

        .conversation-time {
            font-size: 0.8rem;
            color: var(--highlight-color);
        }

        .unread-badge {
            background: var(--highlight-color);
            color: white;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.8rem;
            font-weight: 600;
        }

        .message-area {
            display: flex;
            flex-direction: column;
            background: var(--card-bg);
            overflow: hidden;
        }

        .message-header {
            padding: 20px;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .message-header-info {
            display: flex;
            align-items: center;
            gap: 15px;
        }

        .message-header-avatar {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            object-fit: cover;
            border: 2px solid var(--highlight-color);
        }

        .message-header-name {
            font-weight: 600;
            font-size: 1.2rem;
            color: var(--light-color);
        }

        .message-header-status {
            font-size: 0.9rem;
            color: var(--highlight-color);
        }

            .message-header-status.online {
                color: var(--success-color);
            }

        .message-header-actions {
            display: flex;
            gap: 15px;
        }

        .message-header-btn {
            background: none;
            border: none;
            color: var(--highlight-color);
            font-size: 1.2rem;
            cursor: pointer;
            transition: all 0.3s ease;
        }

            .message-header-btn:hover {
                color: var(--light-color);
                transform: scale(1.1);
            }

        .message-content {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 15px;
        }

        .message {
            max-width: 70%;
            padding: 12px 16px;
            border-radius: 18px;
            position: relative;
            word-wrap: break-word;
        }

        .message-incoming {
            align-self: flex-start;
            background: rgba(255, 255, 255, 0.05);
            border-top-left-radius: 5px;
        }

        .message-outgoing {
            align-self: flex-end;
            background: linear-gradient(135deg, var(--secondary-color), var(--accent-color));
            color: var(--text-color);
            border-top-right-radius: 5px;
        }

        .message-time {
            font-size: 0.75rem;
            margin-top: 5px;
            text-align: right;
            color: rgba(255, 255, 255, 0.6);
        }

        .message-incoming .message-time {
            color: var(--highlight-color);
        }

        .message-input-area {
            padding: 20px;
            border-top: 1px solid var(--border-color);
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .message-input {
            flex: 1;
            padding: 12px 15px;
            border-radius: 25px;
            border: 1px solid var(--border-color);
            outline: none;
            resize: none;
            height: 45px;
            max-height: 120px;
            background: rgba(255, 255, 255, 0.05);
            color: var(--text-color);
            transition: all 0.3s ease;
            font-family: inherit;
        }

            .message-input:focus {
                border-color: var(--highlight-color);
                box-shadow: 0 0 0 2px rgba(113, 128, 150, 0.3);
            }

        .message-send-btn {
            background: linear-gradient(135deg, var(--secondary-color), var(--accent-color));
            color: var(--text-color);
            border: none;
            border-radius: 50%;
            width: 45px;
            height: 45px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
        }

            .message-send-btn:hover {
                transform: scale(1.1);
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
            }

            .message-send-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

        .file-attach-btn {
            background: none;
            border: none;
            color: var(--highlight-color);
            font-size: 1.2rem;
            cursor: pointer;
            transition: all 0.3s ease;
        }

            .file-attach-btn:hover {
                color: var(--light-color);
                transform: scale(1.1);
            }

        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: var(--highlight-color);
            text-align: center;
        }

        .empty-state-icon {
            font-size: 3rem;
            margin-bottom: 1rem;
            opacity: 0.5;
        }

        .typing-indicator {
            display: flex;
            align-items: center;
            gap: 5px;
            padding: 10px 15px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 20px;
            width: fit-content;
            font-size: 0.9rem;
            color: var(--highlight-color);
        }

        .typing-dots {
            display: flex;
            gap: 3px;
        }

        .typing-dot {
            width: 6px;
            height: 6px;
            background: var(--highlight-color);
            border-radius: 50%;
            animation: typing 1.4s infinite;
        }

            .typing-dot:nth-child(2) {
                animation-delay: 0.2s;
            }

            .typing-dot:nth-child(3) {
                animation-delay: 0.4s;
            }

        @keyframes typing {
            0%, 60%, 100% {
                transform: translateY(0);
            }

            30% {
                transform: translateY(-5px);
            }
        }

        .message-date-divider {
            text-align: center;
            margin: 20px 0;
            position: relative;
        }

            .message-date-divider::before {
                content: '';
                position: absolute;
                left: 0;
                top: 50%;
                width: 100%;
                height: 1px;
                background: var(--border-color);
                z-index: 1;
            }

            .message-date-divider span {
                background: var(--card-bg);
                padding: 5px 15px;
                border-radius: 15px;
                font-size: 0.8rem;
                color: var(--highlight-color);
                position: relative;
                z-index: 2;
            }

        /* Loading skeletons */
        .skeleton-conversation {
            display: flex;
            align-items: center;
            padding: 15px 20px;
        }

        .skeleton-avatar {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background: linear-gradient(90deg, var(--border-color) 25%, var(--accent-color) 50%, var(--border-color) 75%);
            background-size: 200% 100%;
            animation: loading 1.5s infinite;
            margin-right: 15px;
        }

        .skeleton-text {
            flex: 1;
            height: 1em;
            background: linear-gradient(90deg, var(--border-color) 25%, var(--accent-color) 50%, var(--border-color) 75%);
            background-size: 200% 100%;
            animation: loading 1.5s infinite;
            border-radius: 4px;
            margin-bottom: 5px;
        }

            .skeleton-text.short {
                width: 60%;
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
            max-width: 400px;
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
                grid-template-columns: 1fr;
            }

            .sidebar {
                display: none;
            }

                .sidebar.active {
                    display: flex;
                    position: fixed;
                    top: 70px;
                    left: 0;
                    width: 100%;
                    height: calc(100vh - 70px);
                    z-index: 100;
                }

            .mobile-menu-btn {
                display: block;
            }
        }

        .mobile-menu-btn {
            display: none;
            background: none;
            border: none;
            color: var(--highlight-color);
            font-size: 1.5rem;
            cursor: pointer;
            padding: 10px;
        }
    </style>
</head>
<body>
    <header class="header">
        <div class="header-container">
            <h1><i class="fas fa-crow"></i> WiseRaven Messages</h1>
            <div class="user-controls">
                <button class="mobile-menu-btn" id="mobileMenuBtn">
                    <i class="fas fa-bars"></i>
                </button>
                <button id="logout-btn">Logout</button>
            </div>
        </div>
    </header>
    <?php if (isAdmin() || isModerator()): ?>
    <li class="nav-item">
        <a href="/admin/index.php" class="nav-link">
            <i class="fas fa-shield-alt"></i>
            <span>Admin Panel</span>
        </a>
    </li>
    <?php endif; ?>

    <div class="container">
        <div class="sidebar" id="sidebar">
            <div class="search-bar">
                <input type="text" placeholder="Search conversations..." class="search-input" id="searchInput">
            </div>
            <div class="conversation-list" id="conversationList">
                <!-- Conversations loaded via API -->
                <div class="skeleton-conversation">
                    <div class="skeleton-avatar"></div>
                    <div style="flex: 1;">
                        <div class="skeleton-text"></div>
                        <div class="skeleton-text short"></div>
                    </div>
                </div>
            </div>
        </div>

        <div class="message-area">
            <div class="message-header" id="messageHeader" style="display: none;">
                <div class="message-header-info">
                    <img src="" alt="" class="message-header-avatar" id="currentAvatar">
                    <div>
                        <div class="message-header-name" id="currentUserName">Select a conversation</div>
                        <div class="message-header-status" id="currentUserStatus"></div>
                    </div>
                </div>
                <div class="message-header-actions">
                    <button class="message-header-btn" title="Video Call" id="videoCallBtn">
                        <i class="fas fa-video"></i>
                    </button>
                    <button class="message-header-btn" title="Audio Call" id="audioCallBtn">
                        <i class="fas fa-phone"></i>
                    </button>
                    <button class="message-header-btn" title="Info" id="infoBtn">
                        <i class="fas fa-info-circle"></i>
                    </button>
                </div>
            </div>

            <div class="message-content" id="messageContent">
                <div class="empty-state" id="emptyState">
                    <div class="empty-state-icon">
                        <i class="fas fa-comments"></i>
                    </div>
                    <h3>No conversation selected</h3>
                    <p>Select a conversation from the list to start messaging</p>
                </div>
            </div>

            <div class="message-input-area" id="messageInputArea" style="display: none;">
                <button class="file-attach-btn" id="fileAttachBtn" title="Attach File">
                    <i class="fas fa-paperclip"></i>
                </button>
                <textarea class="message-input" placeholder="Type a message..." id="messageInput"></textarea>
                <button class="message-send-btn" id="sendMessageBtn" title="Send Message">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </div>
        </div>
    </div>

    <!-- Loading Overlay -->
    <div class="loading-overlay" id="loadingOverlay">
        <div class="spinner"></div>
        <div style="margin-top: 20px;">Loading messages...</div>
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
        const MESSAGES_CONFIG = {
            BASE_URL: 'https://api.wiseraven.social/v1',
            ENDPOINTS: {
                CONVERSATIONS: '/messages/conversations',
                MESSAGES: '/messages',
                SEND_MESSAGE: '/messages/send',
                MARK_READ: '/messages/mark-read',
                SEARCH: '/messages/search',
                TYPING: '/messages/typing',
                USER_STATUS: '/users/status'
            },
            POLL_INTERVAL: 5000, // 5 seconds
            TYPING_TIMEOUT: 3000 // 3 seconds
        };

        // ===================== STATE MANAGEMENT =====================
        const MessagesState = {
            conversations: [],
            currentConversation: null,
            messages: [],
            typingUsers: new Set(),
            currentUser: null,
            isLoading: false,
            pollInterval: null,
            typingTimeout: null,
            lastMessageId: null
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
                    const response = await fetch(`${MESSAGES_CONFIG.BASE_URL}/auth/verify`, {
                        method: 'GET',
                        headers: this.getAuthHeaders()
                    });

                    if (response.ok) {
                        MessagesState.currentUser = this.userData;
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
                    await fetch(`${MESSAGES_CONFIG.BASE_URL}/auth/logout`, {
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

        // ===================== MESSAGES MANAGER =====================
        class MessagesManager {
            constructor() {
                this.authManager = new AuthManager();
            }

            async loadConversations() {
                try {
                    const response = await fetch(
                        `${MESSAGES_CONFIG.BASE_URL}${MESSAGES_CONFIG.ENDPOINTS.CONVERSATIONS}`,
                        {
                            method: 'GET',
                            headers: this.authManager.getAuthHeaders()
                        }
                    );

                    if (!response.ok) throw new Error('Failed to load conversations');

                    const data = await response.json();
                    MessagesState.conversations = data.conversations || [];
                    this.renderConversations(MessagesState.conversations);
                } catch (error) {
                    this.showError('Failed to load conversations');
                    console.error('Conversations load error:', error);
                }
            }

            async loadMessages(conversationId) {
                try {
                    const response = await fetch(
                        `${MESSAGES_CONFIG.BASE_URL}${MESSAGES_CONFIG.ENDPOINTS.MESSAGES}/${conversationId}`,
                        {
                            method: 'GET',
                            headers: this.authManager.getAuthHeaders()
                        }
                    );

                    if (!response.ok) throw new Error('Failed to load messages');

                    const data = await response.json();
                    MessagesState.messages = data.messages || [];
                    MessagesState.lastMessageId = data.lastMessageId;

                    this.renderMessages(MessagesState.messages);
                    this.markConversationAsRead(conversationId);
                } catch (error) {
                    this.showError('Failed to load messages');
                    console.error('Messages load error:', error);
                }
            }

            async sendMessage(conversationId, content, attachments = []) {
                try {
                    const formData = new FormData();
                    formData.append('content', content);
                    formData.append('conversationId', conversationId);

                    attachments.forEach((file, index) => {
                        formData.append(`attachment${index}`, file);
                    });

                    const response = await fetch(
                        `${MESSAGES_CONFIG.BASE_URL}${MESSAGES_CONFIG.ENDPOINTS.SEND_MESSAGE}`,
                        {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${this.authManager.token}`
                            },
                            body: formData
                        }
                    );

                    if (!response.ok) throw new Error('Failed to send message');

                    const data = await response.json();
                    return data.message;
                } catch (error) {
                    this.showError('Failed to send message');
                    throw error;
                }
            }

            async markConversationAsRead(conversationId) {
                try {
                    await fetch(
                        `${MESSAGES_CONFIG.BASE_URL}${MESSAGES_CONFIG.ENDPOINTS.MARK_READ}/${conversationId}`,
                        {
                            method: 'POST',
                            headers: this.authManager.getAuthHeaders()
                        }
                    );
                } catch (error) {
                    console.error('Failed to mark as read:', error);
                }
            }

            async sendTypingIndicator(conversationId) {
                try {
                    await fetch(
                        `${MESSAGES_CONFIG.BASE_URL}${MESSAGES_CONFIG.ENDPOINTS.TYPING}/${conversationId}`,
                        {
                            method: 'POST',
                            headers: this.authManager.getAuthHeaders()
                        }
                    );
                } catch (error) {
                    console.error('Failed to send typing indicator:', error);
                }
            }

            async searchConversations(query) {
                try {
                    const response = await fetch(
                        `${MESSAGES_CONFIG.BASE_URL}${MESSAGES_CONFIG.ENDPOINTS.SEARCH}?q=${encodeURIComponent(query)}`,
                        {
                            method: 'GET',
                            headers: this.authManager.getAuthHeaders()
                        }
                    );

                    if (!response.ok) throw new Error('Failed to search conversations');

                    const data = await response.json();
                    this.renderConversations(data.conversations || []);
                } catch (error) {
                    console.error('Search error:', error);
                }
            }

            startPolling(conversationId) {
                if (MessagesState.pollInterval) {
                    clearInterval(MessagesState.pollInterval);
                }

                MessagesState.pollInterval = setInterval(async () => {
                    await this.pollNewMessages(conversationId);
                    await this.pollTypingIndicators(conversationId);
                }, MESSAGES_CONFIG.POLL_INTERVAL);
            }

            stopPolling() {
                if (MessagesState.pollInterval) {
                    clearInterval(MessagesState.pollInterval);
                    MessagesState.pollInterval = null;
                }
            }

            async pollNewMessages(conversationId) {
                try {
                    const url = `${MESSAGES_CONFIG.BASE_URL}${MESSAGES_CONFIG.ENDPOINTS.MESSAGES}/${conversationId}`;
                    const query = MessagesState.lastMessageId ? `?since=${MessagesState.lastMessageId}` : '';

                    const response = await fetch(url + query, {
                        method: 'GET',
                        headers: this.authManager.getAuthHeaders()
                    });

                    if (!response.ok) return;

                    const data = await response.json();
                    if (data.messages && data.messages.length > 0) {
                        MessagesState.messages.push(...data.messages);
                        MessagesState.lastMessageId = data.lastMessageId;
                        this.appendMessages(data.messages);
                    }
                } catch (error) {
                    console.error('Poll error:', error);
                }
            }

            async pollTypingIndicators(conversationId) {
                try {
                    const response = await fetch(
                        `${MESSAGES_CONFIG.BASE_URL}${MESSAGES_CONFIG.ENDPOINTS.TYPING}/${conversationId}`,
                        {
                            method: 'GET',
                            headers: this.authManager.getAuthHeaders()
                        }
                    );

                    if (!response.ok) return;

                    const data = await response.json();
                    this.updateTypingIndicators(data.typingUsers || []);
                } catch (error) {
                    console.error('Typing poll error:', error);
                }
            }

            renderConversations(conversations) {
                const container = document.getElementById('conversationList');
                if (!container) return;

                container.innerHTML = '';

                if (conversations.length === 0) {
                    container.innerHTML = `
                                <div class="empty-state">
                                    <div class="empty-state-icon">
                                        <i class="fas fa-comments"></i>
                                    </div>
                                    <p>No conversations yet</p>
                                </div>
                            `;
                    return;
                }

                conversations.forEach(conversation => {
                    const conversationElement = this.createConversationElement(conversation);
                    container.appendChild(conversationElement);
                });
            }

            createConversationElement(conversation) {
                const div = document.createElement('div');
                div.className = `conversation-item ${conversation.id === MessagesState.currentConversation?.id ? 'active' : ''}`;
                div.dataset.conversationId = conversation.id;
                div.onclick = () => this.selectConversation(conversation);

                const lastMessage = conversation.lastMessage || {};
                const unreadCount = conversation.unreadCount || 0;
                const timeAgo = this.formatTimeAgo(lastMessage.timestamp);

                div.innerHTML = `
                            <img src="${conversation.avatar || 'default-avatar.jpg'}"
                                 alt="${conversation.name}"
                                 class="conversation-avatar">
                            <div class="conversation-info">
                                <div class="conversation-name">${this.escapeHtml(conversation.name)}</div>
                                <div class="conversation-preview">${this.escapeHtml(lastMessage.content || '')}</div>
                            </div>
                            <div class="conversation-meta">
                                <div class="conversation-time">${timeAgo}</div>
                                ${unreadCount > 0 ? `<div class="unread-badge">${unreadCount}</div>` : ''}
                            </div>
                        `;

                return div;
            }

            renderMessages(messages) {
                const container = document.getElementById('messageContent');
                if (!container) return;

                container.innerHTML = '';
                this.emptyState.style.display = 'none';

                if (messages.length === 0) {
                    this.showEmptyConversation();
                    return;
                }

                // Group messages by date
                const groupedMessages = this.groupMessagesByDate(messages);

                Object.keys(groupedMessages).forEach(date => {
                    const dateDivider = document.createElement('div');
                    dateDivider.className = 'message-date-divider';
                    dateDivider.innerHTML = `<span>${date}</span>`;
                    container.appendChild(dateDivider);

                    groupedMessages[date].forEach(message => {
                        const messageElement = this.createMessageElement(message);
                        container.appendChild(messageElement);
                    });
                });

                // Scroll to bottom
                container.scrollTop = container.scrollHeight;
            }

            appendMessages(messages) {
                const container = document.getElementById('messageContent');
                if (!container) return;

                messages.forEach(message => {
                    const messageElement = this.createMessageElement(message);
                    container.appendChild(messageElement);
                });

                // Scroll to bottom if user is near bottom
                const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
                if (isNearBottom) {
                    container.scrollTop = container.scrollHeight;
                }
            }

            createMessageElement(message) {
                const div = document.createElement('div');
                const isOutgoing = message.senderId === MessagesState.currentUser?.id;
                div.className = `message ${isOutgoing ? 'message-outgoing' : 'message-incoming'}`;
                div.dataset.messageId = message.id;

                const time = new Date(message.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                });

                div.innerHTML = `
                            <div class="message-content">${this.escapeHtml(message.content)}</div>
                            ${message.attachments?.length > 0 ? this.renderAttachments(message.attachments) : ''}
                            <div class="message-time">${time}</div>
                        `;

                return div;
            }

            renderAttachments(attachments) {
                return attachments.map(attachment => {
                    if (attachment.type.startsWith('image/')) {
                        return `<img src="${attachment.url}" alt="Attachment" style="max-width: 200px; border-radius: 8px; margin-top: 5px;">`;
                    } else if (attachment.type.startsWith('video/')) {
                        return `<video controls style="max-width: 200px; border-radius: 8px; margin-top: 5px;">
                                          <source src="${attachment.url}" type="${attachment.type}">
                                        </video>`;
                    } else {
                        return `<a href="${attachment.url}" target="_blank" class="attachment-link">📎 ${attachment.name}</a>`;
                    }
                }).join('');
            }

            updateTypingIndicators(typingUsers) {
                const container = document.getElementById('messageContent');
                const existingIndicator = container.querySelector('.typing-indicator');

                // Remove existing indicator
                if (existingIndicator) {
                    existingIndicator.remove();
                }

                // Add new indicator if there are typing users
                if (typingUsers.length > 0) {
                    const typingDiv = document.createElement('div');
                    typingDiv.className = 'typing-indicator';
                    typingDiv.innerHTML = `
                                <span>${typingUsers.map(u => u.name).join(', ')} ${typingUsers.length === 1 ? 'is' : 'are'} typing</span>
                                <div class="typing-dots">
                                    <div class="typing-dot"></div>
                                    <div class="typing-dot"></div>
                                    <div class="typing-dot"></div>
                                </div>
                            `;
                    container.appendChild(typingDiv);
                    container.scrollTop = container.scrollHeight;
                }
            }

            selectConversation(conversation) {
                MessagesState.currentConversation = conversation;

                // Update UI
                document.querySelectorAll('.conversation-item').forEach(item => {
                    item.classList.remove('active');
                });
                document.querySelector(`[data-conversation-id="${conversation.id}"]`)?.classList.add('active');

                // Show message area
                this.messageHeader.style.display = 'flex';
                this.messageInputArea.style.display = 'flex';
                this.emptyState.style.display = 'none';

                // Update header
                this.currentAvatar.src = conversation.avatar || 'default-avatar.jpg';
                this.currentUserName.textContent = conversation.name;
                this.currentUserStatus.textContent = conversation.online ? 'Online' : 'Offline';
                this.currentUserStatus.className = `message-header-status ${conversation.online ? 'online' : ''}`;

                // Load messages
                this.loadMessages(conversation.id);

                // Start polling for new messages
                this.startPolling(conversation.id);

                // Close mobile sidebar
                if (window.innerWidth <= 768) {
                    this.sidebar.classList.remove('active');
                }
            }

            showEmptyConversation() {
                const container = document.getElementById('messageContent');
                container.innerHTML = `
                            <div class="empty-state">
                                <div class="empty-state-icon">
                                    <i class="fas fa-comments"></i>
                                </div>
                                <h3>No messages yet</h3>
                                <p>Start the conversation!</p>
                            </div>
                        `;
            }

            groupMessagesByDate(messages) {
                const groups = {};

                messages.forEach(message => {
                    const date = new Date(message.timestamp).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    });

                    if (!groups[date]) {
                        groups[date] = [];
                    }

                    groups[date].push(message);
                });

                return groups;
            }

            formatTimeAgo(timestamp) {
                if (!timestamp) return '';

                const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
                let interval = seconds / 31536000;

                if (interval > 1) return Math.floor(interval) + "y";
                interval = seconds / 2592000;
                if (interval > 1) return Math.floor(interval) + "mo";
                interval = seconds / 86400;
                if (interval > 1) return Math.floor(interval) + "d";
                interval = seconds / 3600;
                if (interval > 1) return Math.floor(interval) + "h";
                interval = seconds / 60;
                if (interval > 1) return Math.floor(interval) + "m";
                return "Just now";
            }

            escapeHtml(text) {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
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

            // Getters for DOM elements
            get messageHeader() { return document.getElementById('messageHeader'); }
            get messageInputArea() { return document.getElementById('messageInputArea'); }
            get emptyState() { return document.getElementById('emptyState'); }
            get currentAvatar() { return document.getElementById('currentAvatar'); }
            get currentUserName() { return document.getElementById('currentUserName'); }
            get currentUserStatus() { return document.getElementById('currentUserStatus'); }
            get sidebar() { return document.getElementById('sidebar'); }
        }

        // ===================== MAIN APPLICATION =====================
        class MessagesApp {
            constructor() {
                this.authManager = new AuthManager();
                this.messagesManager = new MessagesManager();
            }

            async initialize() {
                console.log('Initializing Messages...');

                // Show loading overlay
                document.getElementById('loadingOverlay').style.display = 'flex';

                // Verify authentication
                const isAuthenticated = await this.authManager.verifyAuthentication();
                if (!isAuthenticated) return;

                // Load conversations
                await this.messagesManager.loadConversations();

                // Setup event listeners
                this.setupEventListeners();

                // Hide loading overlay
                setTimeout(() => {
                    document.getElementById('loadingOverlay').style.display = 'none';
                }, 1000);

                console.log('Messages initialized');
            }

            setupEventListeners() {
                // Logout button
                document.getElementById('logout-btn').addEventListener('click', () => {
                    this.authManager.logout();
                });

                // Search input
                const searchInput = document.getElementById('searchInput');
                let searchTimeout;
                searchInput.addEventListener('input', () => {
                    clearTimeout(searchTimeout);
                    searchTimeout = setTimeout(() => {
                        const query = searchInput.value.trim();
                        if (query) {
                            this.messagesManager.searchConversations(query);
                        } else {
                            this.messagesManager.loadConversations();
                        }
                    }, 300);
                });

                // Send message
                const messageInput = document.getElementById('messageInput');
                const sendMessageBtn = document.getElementById('sendMessageBtn');

                const sendMessage = async () => {
                    const content = messageInput.value.trim();
                    if (!content || !MessagesState.currentConversation) return;

                    sendMessageBtn.disabled = true;
                    sendMessageBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

                    try {
                        await this.messagesManager.sendMessage(
                            MessagesState.currentConversation.id,
                            content
                        );

                        messageInput.value = '';
                        messageInput.style.height = 'auto';

                        // Reload messages to show the new one
                        await this.messagesManager.loadMessages(MessagesState.currentConversation.id);
                    } catch (error) {
                        console.error('Send message error:', error);
                    } finally {
                        sendMessageBtn.disabled = false;
                        sendMessageBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
                    }
                };

                sendMessageBtn.addEventListener('click', sendMessage);
                messageInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                    }
                });

                // Typing indicator
                let typingTimeout;
                messageInput.addEventListener('input', () => {
                    if (!MessagesState.currentConversation) return;

                    // Clear existing timeout
                    clearTimeout(typingTimeout);

                    // Send typing indicator
                    this.messagesManager.sendTypingIndicator(MessagesState.currentConversation.id);

                    // Set timeout to stop typing indicator
                    typingTimeout = setTimeout(() => {
                        // Typing stopped
                    }, MESSAGES_CONFIG.TYPING_TIMEOUT);
                });

                // File attachment
                document.getElementById('fileAttachBtn').addEventListener('click', () => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.multiple = true;
                    input.accept = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.txt';

                    input.onchange = async (e) => {
                        const files = Array.from(e.target.files);
                        if (files.length === 0 || !MessagesState.currentConversation) return;

                        sendMessageBtn.disabled = true;
                        sendMessageBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

                        try {
                            await this.messagesManager.sendMessage(
                                MessagesState.currentConversation.id,
                                'Sent files',
                                files
                            );

                            await this.messagesManager.loadMessages(MessagesState.currentConversation.id);
                        } catch (error) {
                            console.error('Send files error:', error);
                        } finally {
                            sendMessageBtn.disabled = false;
                            sendMessageBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
                        }
                    };

                    input.click();
                });

                // Auto-resize textarea
                messageInput.addEventListener('input', function () {
                    this.style.height = 'auto';
                    this.style.height = (this.scrollHeight) + 'px';
                });

                // Video call button
                document.getElementById('videoCallBtn').addEventListener('click', () => {
                    this.messagesManager.showError('Video calls coming soon!');
                });

                // Audio call button
                document.getElementById('audioCallBtn').addEventListener('click', () => {
                    this.messagesManager.showError('Audio calls coming soon!');
                });

                // Info button
                document.getElementById('infoBtn').addEventListener('click', () => {
                    this.messagesManager.showError('Conversation info coming soon!');
                });

                // Mobile menu button
                const mobileMenuBtn = document.getElementById('mobileMenuBtn');
                if (mobileMenuBtn) {
                    mobileMenuBtn.addEventListener('click', () => {
                        const sidebar = document.getElementById('sidebar');
                        sidebar.classList.toggle('active');
                    });
                }

                // Close sidebar when clicking outside on mobile
                window.addEventListener('click', (e) => {
                    const sidebar = document.getElementById('sidebar');
                    const mobileMenuBtn = document.getElementById('mobileMenuBtn');

                    if (window.innerWidth <= 768 &&
                        sidebar.classList.contains('active') &&
                        !sidebar.contains(e.target) &&
                        !mobileMenuBtn.contains(e.target)) {
                        sidebar.classList.remove('active');
                    }
                });

                // Stop polling when leaving page
                window.addEventListener('beforeunload', () => {
                    this.messagesManager.stopPolling();
                });
            }
        }

        // ===================== INITIALIZE APPLICATION =====================
        document.addEventListener('DOMContentLoaded', () => {
            const app = new MessagesApp();
            app.initialize();
        });
    </script>
</body>
</html>