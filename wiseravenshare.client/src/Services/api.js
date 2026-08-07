import axios from 'axios';
import { getAuthToken, setAuthToken, clearAuthToken } from './authStorage.js';

const VITE_DEV_PORTS = new Set(['5173', '4173']);

const resolveApiBaseUrl = () => {
    const configured = (import.meta.env.VITE_API_URL || '').trim();
    const localhostApi = 'http://localhost:5242/api';

    if (typeof window === 'undefined') {
        return configured || localhostApi;
    }

    const host = (window.location.hostname || '').toLowerCase();
    const isLocalHost = host === 'localhost' || host === '127.0.0.1';
    const isViteDevServer = VITE_DEV_PORTS.has(window.location.port);

    if (isLocalHost || isViteDevServer) {
        return configured || localhostApi;
    }

    // In production/non-local environments prefer configured API host when provided.
    if (configured) {
        return configured;
    }

    // Fallback for same-origin ingress deployments.
    return `${window.location.origin}/api`;
};

const API_BASE_URL = resolveApiBaseUrl();

const buildMediaUploadUrls = () => {
    const toApiBase = (value) => {
        const raw = String(value || '').trim();
        if (!raw) return '';
        if (/\/api$/i.test(raw)) return raw;
        return `${raw.replace(/\/+$/, '')}/api`;
    };

    const bases = new Set();
    bases.add(API_BASE_URL.replace(/\/+$/, ''));

    const configured = (import.meta.env.VITE_API_URL || '').trim();
    if (configured) {
        bases.add(toApiBase(configured));
    }

    const ravensightApi = (import.meta.env.VITE_RAVENSIGHT_API_URL || '').trim();
    if (ravensightApi) {
        const trimmed = ravensightApi.replace(/\/+$/, '');
        bases.add(trimmed.replace(/\/api\/ravensight$/i, '/api'));
        bases.add(toApiBase(trimmed));
    }

    if (typeof window !== 'undefined' && window.location?.origin) {
        bases.add(`${window.location.origin.replace(/\/+$/, '')}/api`);
    }

    const endpoints = [];
    const routes = ['/media/upload', '/fileupload/upload'];
    for (const base of bases) {
        if (!base) continue;
        for (const route of routes) {
            endpoints.push(`${base}${route}`);
        }
    }

    return [...new Set(endpoints)];
};

const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Request interceptor
api.interceptors.request.use(
    (config) => {
        const token = getAuthToken();
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        // Do not force logout globally on every 401.
        // AuthContext/AuthService owns token lifecycle decisions.
        return Promise.reject(error);
    }
);

export const apiService = {
    // Auth endpoints
    login: (email, password) => api.post('/auth/login', { email, password }),
    register: (userData) => api.post('/auth/register', userData),
    logout: () => api.post('/auth/logout'),
    verifyToken: (token) => api.post('/auth/verify', { token }),
    updateProfile: (userId, updates) => api.put(`/users/${userId}`, updates),
    getSocialFeeds: (userId) => api.get(`/users/${userId}/feeds`),
    updateSocialFeeds: (userId, feeds) => api.put(`/users/${userId}/feeds`, feeds),

    // Posts endpoints
    getPosts: (params = {}) => {
        const page = Number(params.page) > 0 ? Number(params.page) : 1;
        const pageSize = Number(params.pageSize || params.limit) > 0 ? Number(params.pageSize || params.limit) : 20;

        if (params.userId) {
            return api.get(`/posts/user/${encodeURIComponent(params.userId)}`, {
                params: { page, pageSize }
            });
        }

        if (String(params.sort || '').toLowerCase() === 'trending') {
            return api.get('/posts/trending', { params: { count: pageSize } });
        }

        return api.get('/posts/feed', {
            params: { page, pageSize }
        });
    },
    getPost: (postId) => api.get(`/posts/${postId}`),
    createPost: (postData) => api.post('/posts', postData),
    updatePost: (postId, updates) => api.put(`/posts/${postId}`, updates),
    deletePost: (postId) => api.delete(`/posts/${postId}`),
    likePost: (postId) => api.post(`/posts/${postId}/like`),
    repostPost: (postId) => api.post(`/posts/${postId}/repost`),

    // Comments endpoints
    getComments: (postId) => api.get(`/posts/${postId}/comments`),
    addComment: (postId, content) => api.post(`/posts/${postId}/comments`, { content }),
    deleteComment: (commentId) => api.delete(`/comments/${commentId}`),

    // User endpoints
    getUser: (userId) => api.get(`/users/${userId}`),
    getUsers: (params) => api.get('/users', { params }),
    followUser: (userId) => api.post(`/users/${userId}/follow`),
    unfollowUser: (userId) => api.delete(`/users/${userId}/follow`),
    getFollowers: (userId) => api.get(`/users/${userId}/followers`),
    getFollowing: (userId) => api.get(`/users/${userId}/following`),

    // Notifications endpoints
    getNotifications: (params) => api.get('/notifications', { params }),
    markNotificationRead: (notificationId) => api.put(`/notifications/${notificationId}/read`),
    markAllNotificationsRead: () => api.put('/notifications/read-all'),

    // Messages endpoints
    getConversations: () => api.get('/messages/conversations'),
    getMessages: (conversationId) => api.get(`/messages/${conversationId}`),
    sendMessage: (conversationId, content) => api.post(`/messages/${conversationId}`, { content }),
    createConversation: (userId) => api.post('/messages/conversations', { userId }),

    // Bookmark endpoints
    getBookmarks: () => api.get('/bookmarks'),
    addBookmark: (postId) => api.post(`/bookmarks/${postId}`),
    removeBookmark: (postId) => api.delete(`/bookmarks/${postId}`),

    // Media endpoints
    uploadMedia: async (file, type, options = {}) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', options.title || file?.name || 'Uploaded media');
        formData.append('description', options.description || 'Uploaded from Wise-Raven');
        formData.append('publishToYouTube', String(Boolean(options.publishToYouTube && type === 'video')));
        formData.append('publishToTikTok', String(Boolean(options.publishToTikTok && type === 'video')));
        formData.append('publishToFacebook', String(Boolean(options.publishToFacebook && type === 'video')));
        formData.append('youTubeChannelOrEmail', options.youTubeChannelOrEmail || '');
        formData.append('tikTokUsername', options.tikTokUsername || '');
        formData.append('facebookPageOrProfile', options.facebookPageOrProfile || '');
        formData.append('youTubePermissionGranted', String(Boolean(options.youTubePermissionGranted)));
        formData.append('tikTokPermissionGranted', String(Boolean(options.tikTokPermissionGranted)));
        formData.append('facebookPermissionGranted', String(Boolean(options.facebookPermissionGranted)));

        const requestConfig = {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (progressEvent) => {
                Math.round((progressEvent.loaded * 100) / progressEvent.total);
            }
        };

        const candidateUrls = buildMediaUploadUrls();
        let lastError = null;

        for (const url of candidateUrls) {
            try {
                return await axios.post(url, formData, {
                    ...requestConfig,
                    headers: {
                        ...requestConfig.headers,
                        ...(getAuthToken()
                            ? { Authorization: `Bearer ${getAuthToken()}` }
                            : {})
                    }
                });
            } catch (error) {
                lastError = error;
                const status = error?.response?.status;

                // Preserve validation/auth failures from the first attempted route.
                if (status && status !== 404 && status !== 405) {
                    throw error;
                }
            }
        }

        throw lastError || new Error('Media upload failed.');
    },

    // Search endpoints
    search: (query, type) => api.get('/search', { params: { q: query, type } }),

    // Trends endpoints
    getTrending: () => api.get('/trending'),

    // Market data endpoints
    getMarketQuotes: (symbols = []) => api.get('/market/quotes', {
        params: {
            ...(Array.isArray(symbols) && symbols.length > 0
                ? { symbols: symbols.join(',') }
                : {})
        }
    }),

    // Payments endpoints
    createCheckoutSession: (payload) => api.post('/payments/checkout-session', payload),
    getPaymentsConfig: () => api.get('/payments/config'),

    // Planner reminder endpoints
    sendCalendarReminder: (payload) => api.post('/notifications/reminder', payload),

    // Admin diagnostics endpoints
    getPersistenceStatus: (refresh = false) => api.get('/persistence/status', { params: { refresh } }),

    // Growth/onboarding endpoints
    getOnboardingState: () => api.get('/growth/onboarding'),
    trackGrowthEvent: (eventName, metadata = {}) => api.post('/growth/events', { eventName, metadata }),
    getGrowthFunnelSummary: (days = 30) => api.get('/growth/funnel', { params: { days } }),
    createReferralInvite: (inviteeEmail, message = '') => api.post('/growth/referrals/invite', { inviteeEmail, message }),
    getReferralStats: () => api.get('/growth/referrals'),
    initializeRevenueAgent: () => api.post('/growth/revenue/initialize'),
    getRevenueAgent: () => api.get('/growth/revenue/agent'),
    getRevenueSummary: () => api.get('/growth/revenue/summary'),
    getRevenueActions: (weekNumber, status = 'all') =>
        api.get('/growth/revenue/actions', {
            params: {
                ...(Number.isFinite(weekNumber) ? { weekNumber } : {}),
                status
            }
        }),
    updateRevenueActionStatus: (actionId, status) =>
        api.post(`/growth/revenue/actions/${encodeURIComponent(actionId)}/status`, { status }),
    addRevenueEvidence: (payload) => api.post('/growth/revenue/evidence', payload),
    verifyRevenueEvidence: (evidenceId, verified) =>
        api.post(`/growth/revenue/evidence/${encodeURIComponent(evidenceId)}/verify`, { verified }),
    getRevenueEvidence: (weekNumber, verified) =>
        api.get('/growth/revenue/evidence', {
            params: {
                ...(Number.isFinite(weekNumber) ? { weekNumber } : {}),
                ...(typeof verified === 'boolean' ? { verified } : {})
            }
        }),

    // Moderation and anti-spam endpoints
    checkModeration: (content) => api.post('/growth/moderation/check', { content }),
    submitModerationReport: (targetType, targetId, reason, details = '') =>
        api.post('/growth/moderation/report', { targetType, targetId, reason, details }),
    getModerationReports: (options = {}) => {
        const page = Number.isFinite(options.page) ? options.page : 1;
        const pageSize = Number.isFinite(options.pageSize) ? options.pageSize : 20;
        const status = typeof options.status === 'string' ? options.status : 'open';
        const targetType = typeof options.targetType === 'string' ? options.targetType : 'all';
        const includeResolved = Boolean(options.includeResolved);

        return api.get('/growth/moderation/reports', {
            params: { page, pageSize, status, targetType, includeResolved }
        });
    },
    resolveModerationReport: (reportId, outcome, notes = '') =>
        api.post(`/growth/moderation/reports/${encodeURIComponent(reportId)}/resolve`, { outcome, notes })
};

export default api;