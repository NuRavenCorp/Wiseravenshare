export const API_ENDPOINTS = {
    AUTH: {
        LOGIN: '/auth/login',
        REGISTER: '/auth/register',
        LOGOUT: '/auth/logout',
        VERIFY: '/auth/verify',
        FORGOT_PASSWORD: '/auth/forgot-password',
        RESET_PASSWORD: '/auth/reset-password'
    },
    POSTS: {
        BASE: '/posts',
        LIKE: '/posts/:id/like',
        REPOST: '/posts/:id/repost',
        BOOKMARK: '/posts/:id/bookmark',
        COMMENTS: '/posts/:id/comments'
    },
    USERS: {
        BASE: '/users',
        FOLLOW: '/users/:id/follow',
        FOLLOWERS: '/users/:id/followers',
        FOLLOWING: '/users/:id/following'
    },
    MESSAGES: {
        CONVERSATIONS: '/messages/conversations',
        MESSAGES: '/messages/:conversationId'
    },
    NOTIFICATIONS: '/notifications',
    SEARCH: '/search',
    TRENDING: '/trending',
    MEDIA: '/media'
};

export const POST_TYPES = {
    TEXT: 'text',
    IMAGE: 'image',
    VIDEO: 'video',
    AUDIO: 'audio',
    PODCAST: 'podcast'
};

export const PRIORITY_LEVELS = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    URGENT: 'urgent'
};

export const NOTIFICATION_TYPES = {
    LIKE: 'like',
    COMMENT: 'comment',
    FOLLOW: 'follow',
    MENTION: 'mention',
    REPOST: 'repost',
    MESSAGE: 'message'
};

export const STORAGE_KEYS = {
    AUTH_TOKEN: 'auth_token',
    USER_DATA: 'user_data',
    THEME: 'theme',
    PLANNER_STATE: 'wiseRavenState'
};

export const TRUTH_SCORES = {
    VERIFIED: { min: 90, label: 'Verified', color: '#4caf50', icon: '✅' },
    PARTIAL: { min: 60, label: 'Partially Verified', color: '#2196f3', icon: '📊' },
    QUESTIONABLE: { min: 30, label: 'Questionable', color: '#ff9800', icon: '⚠️' },
    FALSE: { min: 0, label: 'Needs Fact Check', color: '#f44336', icon: '❗' }
};