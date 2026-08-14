import axios from 'axios';
import { getAuthToken, setAuthToken, clearAuthToken } from './authStorage.js';

const VITE_DEV_PORTS = new Set(['5173', '4173']);

const ensureApiBase = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return /\/api$/i.test(raw) ? raw : `${raw.replace(/\/+$/, '')}/api`;
};

const resolveApiBaseUrl = () => {
    const configured = ensureApiBase(import.meta.env.VITE_API_URL || '');
    const localhostApi = 'http://localhost:5242/api';
    const productionApi = 'https://wise-ravens.com/api';

    if (typeof window === 'undefined') {
        return configured || localhostApi;
    }

    const host = (window.location.hostname || '').toLowerCase();
    const protocol = (window.location.protocol || '').toLowerCase();
    const isLocalHost = host === 'localhost' || host === '127.0.0.1';
    const isViteDevServer = VITE_DEV_PORTS.has(window.location.port);
    const isHybridRuntime = protocol === 'capacitor:' || protocol === 'file:';

    // Hybrid runtimes do not host the API at localhost from the device perspective.
    if (isHybridRuntime) {
        return configured || productionApi;
    }

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

const isAuthEndpoint = (url = '') => {
    const value = String(url || '').toLowerCase();
    return value.includes('/auth/login')
        || value.includes('/auth/register')
        || value.includes('/auth/verify')
        || value.includes('/auth/forgot-password')
        || value.includes('/auth/reset-password')
        || value.includes('/auth/status');
};

const handleUnauthorized = () => {
    clearAuthToken();
    try {
        localStorage.removeItem('user_data');
        localStorage.removeItem('wiseSocialFeeds');
    } catch {
        // Ignore storage cleanup failures.
    }

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('wiseraven:auth-expired'));
    }
};

const buildMediaUploadUrls = (type = '') => {
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
    const ravensightRoutes = [];

    if (type === 'video') {
        ravensightRoutes.push('/ravensight/videos/upload', '/ravensight/media/videos/save');
    } else if (type === 'photo') {
        ravensightRoutes.push('/ravensight/media/photos/save');
    } else if (type === 'audio') {
        ravensightRoutes.push('/ravensight/media/music/save');
    }

    for (const base of bases) {
        if (!base) continue;
        for (const route of [...ravensightRoutes, ...routes]) {
            endpoints.push(`${base}${route}`);
        }
    }

    return [...new Set(endpoints)];
};

const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json'
    }
});

const normalizeRequestPath = (url = '', baseUrl = '') => {
    if (typeof url !== 'string' || url.length === 0) {
        return url;
    }

    if (/^https?:\/\//i.test(url) || url.startsWith('//')) {
        return url;
    }

    const trimmedBase = String(baseUrl || '').replace(/\/+$/, '');
    let trimmedUrl = url.replace(/^\/+/, '');

    if (!trimmedBase) {
        return trimmedUrl;
    }

    if (trimmedBase.endsWith('/api') && trimmedUrl.startsWith('api/')) {
        trimmedUrl = trimmedUrl.replace(/^api\//, '');
    }

    return trimmedUrl;
};

const normalizeApiError = (error, fallbackMessage) => {
    const status = error?.response?.status;
    const data = error?.response?.data;

    if (status === 401 || status === 403) {
        const authError = new Error('Your session expired. Please sign in again and retry.');
        authError.status = status;
        authError.response = error?.response;
        return authError;
    }

    if (typeof data?.message === 'string' && data.message.trim().length > 0) {
        const normalized = new Error(data.message.trim());
        normalized.status = status;
        normalized.response = error.response;
        return normalized;
    }

    if (typeof data?.title === 'string' && data.title.trim().length > 0) {
        let details = '';
        if (data?.errors && typeof data.errors === 'object') {
            const parts = Object.values(data.errors)
                .flatMap((value) => Array.isArray(value) ? value : [value])
                .filter((value) => typeof value === 'string' && value.trim().length > 0);
            if (parts.length > 0) {
                details = ` ${parts[0].trim()}`;
            }
        }

        const normalized = new Error(`${data.title.trim()}${details}`.trim());
        normalized.status = status;
        normalized.response = error.response;
        return normalized;
    }

    if (error?.code === 'ECONNABORTED') {
        const timeoutError = new Error('Post request timed out. Please try again.');
        timeoutError.status = status || 0;
        timeoutError.response = error?.response;
        return timeoutError;
    }

    if (!error?.response) {
        const networkError = new Error('Network error while saving post. Please check your connection and retry.');
        networkError.status = 0;
        return networkError;
    }

    const normalized = new Error(fallbackMessage);
    normalized.status = status;
    normalized.response = error?.response;
    return normalized;
};

const toArrayPayload = (payload) => {
    if (Array.isArray(payload)) {
        return payload;
    }

    if (payload && typeof payload === 'object') {
        if (Array.isArray(payload.items)) return payload.items;
        if (Array.isArray(payload.posts)) return payload.posts;
        if (Array.isArray(payload.videos)) return payload.videos;
        if (Array.isArray(payload.data)) return payload.data;
    }

    return [];
};

const toTrendingTopics = (payload) => {
    const source = toArrayPayload(payload?.articles ? payload.articles : payload);

    return source
        .map((item, index) => ({
            id: item?.id || `topic-${index}`,
            name: String(item?.name || item?.topic || item?.label || item?.title || '').trim(),
            count: Number(item?.count ?? item?.posts ?? item?.mentions ?? 0)
        }))
        .filter((item) => item.name.length > 0);
};

const safeReadJson = (key, fallback) => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
};

const safeWriteJson = (key, value) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Ignore storage write failures.
    }
};

const getStoredComments = () => {
    const data = safeReadJson('wisePostComments', {});
    return data && typeof data === 'object' ? data : {};
};

const setStoredComments = (commentsByPost) => {
    safeWriteJson('wisePostComments', commentsByPost);
};

const getStoredMessages = () => {
    const data = safeReadJson('wiseMessages', {});
    return data && typeof data === 'object' ? data : {};
};

const setStoredMessages = (messagesByConversation) => {
    safeWriteJson('wiseMessages', messagesByConversation);
};

const getStoredNotifications = () => {
    const data = safeReadJson('wiseNotifications', []);
    return Array.isArray(data) ? data : [];
};

const setStoredNotifications = (items) => {
    safeWriteJson('wiseNotifications', Array.isArray(items) ? items : []);
};

const buildLocalComment = (postId, content) => {
    const user = safeReadJson('user_data', null);
    return {
        id: `local-comment-${Date.now()}`,
        postId,
        content: String(content || '').trim(),
        createdAt: new Date().toISOString(),
        user: {
            id: user?.id || 'local-user',
            name: user?.name || user?.username || 'You',
            avatar: user?.avatar || null
        }
    };
};

const isMissingEndpointStatus = (status) => status === 404 || status === 405 || status === 501;

// Request interceptor
api.interceptors.request.use(
    (config) => {
        const token = getAuthToken();
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        if (config?.url) {
            config.url = normalizeRequestPath(config.url, config.baseURL || API_BASE_URL);
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
        const status = error?.response?.status;
        const requestUrl = String(error?.config?.url || '');
        const hasToken = Boolean(getAuthToken());
        if ((status === 401 || status === 403) && hasToken && !isAuthEndpoint(requestUrl)) {
            handleUnauthorized();
        }
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
    getPosts: async (params = {}) => {
        const page = Number(params.page) > 0 ? Number(params.page) : 1;
        const pageSize = Number(params.pageSize || params.limit) > 0 ? Number(params.pageSize || params.limit) : 20;

        if (params.userId) {
            const response = await api.get(`/posts/user/${encodeURIComponent(params.userId)}`, {
                params: { page, pageSize }
            });
            return {
                ...response,
                data: toArrayPayload(response?.data)
            };
        }

        if (String(params.sort || '').toLowerCase() === 'trending') {
            const response = await api.get('/posts/trending', { params: { count: pageSize } });
            return {
                ...response,
                data: toArrayPayload(response?.data)
            };
        }

        const response = await api.get('/posts/feed', {
            params: { page, pageSize }
        });
        return {
            ...response,
            data: toArrayPayload(response?.data)
        };
    },
    getPost: (postId) => api.get(`/posts/${postId}`),
    createPost: async (postData) => {
        try {
            return await api.post('/posts', postData);
        } catch (error) {
            const status = error?.response?.status;
            const isTimeout = error?.code === 'ECONNABORTED';
            const isTransientNetwork = !error?.response;

            // Single retry for transient connectivity/timeouts.
            if (isTimeout || isTransientNetwork || status === 502 || status === 503 || status === 504) {
                try {
                    return await api.post('/posts', postData);
                } catch (retryError) {
                    throw normalizeApiError(retryError, 'Failed to save post to server. Please try again.');
                }
            }

            throw normalizeApiError(error, 'Failed to save post to server. Please try again.');
        }
    },
    updatePost: (postId, updates) => api.put(`/posts/${postId}`, updates),
    deletePost: (postId) => api.delete(`/posts/${postId}`),
    likePost: async (postId) => {
        try {
            const response = await api.post(`/posts/${postId}/like`);
            return response.data;
        } catch (error) {
            throw normalizeApiError(error, 'Failed to update like. Please try again.');
        }
    },
    unlikePost: async (postId) => {
        try {
            const response = await api.delete(`/posts/${postId}/like`);
            return response.data;
        } catch (error) {
            throw normalizeApiError(error, 'Failed to update like. Please try again.');
        }
    },
    repostPost: async (postId) => {
        try {
            const response = await api.post(`/posts/${postId}/repost`);
            return response.data;
        } catch (error) {
            throw normalizeApiError(error, 'Failed to update repost. Please try again.');
        }
    },
    unrepostPost: async (postId) => {
        try {
            const response = await api.delete(`/posts/${postId}/repost`);
            return response.data;
        } catch (error) {
            throw normalizeApiError(error, 'Failed to update repost. Please try again.');
        }
    },

    // Comments endpoints
    getComments: async (postId) => {
        try {
            const response = await api.get(`/posts/${postId}/comments`);
            const payload = response?.data;
            if (Array.isArray(payload)) {
                return { ...response, data: payload };
            }

            if (payload && Array.isArray(payload.comments)) {
                return { ...response, data: payload.comments };
            }

            return { ...response, data: [] };
        } catch (error) {
            const status = Number(error?.response?.status || 0);
            if (!isMissingEndpointStatus(status)) {
                throw normalizeApiError(error, 'Failed to load comments. Please try again.');
            }

            const commentsByPost = getStoredComments();
            return { data: Array.isArray(commentsByPost[postId]) ? commentsByPost[postId] : [] };
        }
    },
    addComment: async (postId, content) => {
        try {
            return await api.post(`/posts/${postId}/comments`, { content });
        } catch (error) {
            const status = Number(error?.response?.status || 0);
            if (!isMissingEndpointStatus(status)) {
                throw normalizeApiError(error, 'Failed to add comment. Please try again.');
            }

            const commentsByPost = getStoredComments();
            const comment = buildLocalComment(postId, content);
            const existing = Array.isArray(commentsByPost[postId]) ? commentsByPost[postId] : [];
            commentsByPost[postId] = [comment, ...existing];
            setStoredComments(commentsByPost);
            return { data: comment };
        }
    },
    deleteComment: async (commentId) => {
        try {
            return await api.delete(`/comments/${commentId}`);
        } catch (error) {
            const status = Number(error?.response?.status || 0);
            if (!isMissingEndpointStatus(status)) {
                throw normalizeApiError(error, 'Failed to delete comment. Please try again.');
            }

            const commentsByPost = getStoredComments();
            Object.keys(commentsByPost).forEach((postId) => {
                commentsByPost[postId] = (commentsByPost[postId] || []).filter((item) => item?.id !== commentId);
            });
            setStoredComments(commentsByPost);
            return { data: { success: true } };
        }
    },

    // User endpoints
    getUser: (userId) => api.get(`/users/${userId}`),
    getUsers: (params) => api.get('/users', { params }),
    followUser: async (userId) => {
        try {
            return await api.post(`/users/${userId}/follow`);
        } catch (error) {
            const status = Number(error?.response?.status || 0);
            if (!isMissingEndpointStatus(status)) {
                throw normalizeApiError(error, 'Failed to follow user. Please try again.');
            }

            return { data: { success: true, fallback: true, userId } };
        }
    },
    unfollowUser: async (userId) => {
        try {
            return await api.delete(`/users/${userId}/follow`);
        } catch (error) {
            const status = Number(error?.response?.status || 0);
            if (!isMissingEndpointStatus(status)) {
                throw normalizeApiError(error, 'Failed to unfollow user. Please try again.');
            }

            return { data: { success: true, fallback: true, userId } };
        }
    },
    getFollowers: async (userId) => {
        try {
            return await api.get(`/users/${userId}/followers`);
        } catch (error) {
            const status = Number(error?.response?.status || 0);
            if (!isMissingEndpointStatus(status)) {
                throw normalizeApiError(error, 'Failed to load followers. Please try again.');
            }

            return { data: [] };
        }
    },
    getFollowing: async (userId) => {
        try {
            return await api.get(`/users/${userId}/following`);
        } catch (error) {
            const status = Number(error?.response?.status || 0);
            if (!isMissingEndpointStatus(status)) {
                throw normalizeApiError(error, 'Failed to load following users. Please try again.');
            }

            return { data: [] };
        }
    },

    // Notifications endpoints
    getNotifications: async (params) => {
        try {
            return await api.get('/notifications', { params });
        } catch (error) {
            const status = Number(error?.response?.status || 0);
            if (!isMissingEndpointStatus(status)) {
                throw normalizeApiError(error, 'Failed to load notifications. Please try again.');
            }

            return { data: getStoredNotifications() };
        }
    },
    markNotificationRead: async (notificationId) => {
        try {
            return await api.put(`/notifications/${notificationId}/read`);
        } catch (error) {
            const status = Number(error?.response?.status || 0);
            if (!isMissingEndpointStatus(status)) {
                throw normalizeApiError(error, 'Failed to update notification. Please try again.');
            }

            const items = getStoredNotifications().map((item) => (
                item?.id === notificationId ? { ...item, read: true } : item
            ));
            setStoredNotifications(items);
            return { data: { success: true } };
        }
    },
    markAllNotificationsRead: async () => {
        try {
            return await api.put('/notifications/read-all');
        } catch (error) {
            const status = Number(error?.response?.status || 0);
            if (!isMissingEndpointStatus(status)) {
                throw normalizeApiError(error, 'Failed to update notifications. Please try again.');
            }

            const items = getStoredNotifications().map((item) => ({ ...item, read: true }));
            setStoredNotifications(items);
            return { data: { success: true } };
        }
    },
    broadcastPersonnelNotification: (payload) => api.post('/notifications/personnel/broadcast', payload),

    // Messages endpoints
    getConversations: async () => {
        try {
            return await api.get('/messages/conversations');
        } catch (error) {
            const status = Number(error?.response?.status || 0);
            if (!isMissingEndpointStatus(status)) {
                throw normalizeApiError(error, 'Failed to load conversations. Please try again.');
            }

            const all = getStoredMessages();
            const conversations = Object.keys(all).map((id) => ({ id, messageCount: (all[id] || []).length }));
            return { data: conversations };
        }
    },
    getMessages: async (conversationId) => {
        try {
            return await api.get(`/messages/${conversationId}`);
        } catch (error) {
            const status = Number(error?.response?.status || 0);
            if (!isMissingEndpointStatus(status)) {
                throw normalizeApiError(error, 'Failed to load messages. Please try again.');
            }

            const all = getStoredMessages();
            return { data: Array.isArray(all[conversationId]) ? all[conversationId] : [] };
        }
    },
    sendMessage: async (conversationId, content) => {
        try {
            return await api.post(`/messages/${conversationId}`, { content });
        } catch (error) {
            const status = Number(error?.response?.status || 0);
            if (!isMissingEndpointStatus(status)) {
                throw normalizeApiError(error, 'Failed to send message. Please try again.');
            }

            const all = getStoredMessages();
            const message = {
                id: `local-message-${Date.now()}`,
                conversationId,
                content: String(content || '').trim(),
                createdAt: new Date().toISOString()
            };
            const existing = Array.isArray(all[conversationId]) ? all[conversationId] : [];
            all[conversationId] = [...existing, message];
            setStoredMessages(all);
            return { data: message };
        }
    },
    createConversation: async (userId) => {
        try {
            return await api.post('/messages/conversations', { userId });
        } catch (error) {
            const status = Number(error?.response?.status || 0);
            if (!isMissingEndpointStatus(status)) {
                throw normalizeApiError(error, 'Failed to create conversation. Please try again.');
            }

            const conversation = {
                id: `local-conversation-${userId}-${Date.now()}`,
                userId,
                createdAt: new Date().toISOString()
            };
            return { data: conversation };
        }
    },

    // Bookmark endpoints
    getBookmarks: async () => {
        try {
            return await api.get('/bookmarks');
        } catch (error) {
            const status = Number(error?.response?.status || 0);
            if (!isMissingEndpointStatus(status)) {
                throw normalizeApiError(error, 'Failed to load bookmarks. Please try again.');
            }

            return { data: safeReadJson('wiseBookmarks', []) };
        }
    },
    addBookmark: async (postId) => {
        try {
            return await api.post(`/bookmarks/${postId}`);
        } catch (error) {
            const status = Number(error?.response?.status || 0);
            if (!isMissingEndpointStatus(status)) {
                throw normalizeApiError(error, 'Failed to save bookmark. Please try again.');
            }

            const bookmarks = safeReadJson('wiseBookmarks', []);
            const normalized = Array.isArray(bookmarks) ? bookmarks : [];
            if (!normalized.some((item) => item?.id === postId)) {
                normalized.unshift({ id: postId, createdAt: new Date().toISOString() });
            }
            safeWriteJson('wiseBookmarks', normalized);
            return { data: { success: true, fallback: true } };
        }
    },
    removeBookmark: async (postId) => {
        try {
            return await api.delete(`/bookmarks/${postId}`);
        } catch (error) {
            const status = Number(error?.response?.status || 0);
            if (!isMissingEndpointStatus(status)) {
                throw normalizeApiError(error, 'Failed to remove bookmark. Please try again.');
            }

            const bookmarks = safeReadJson('wiseBookmarks', []);
            const normalized = (Array.isArray(bookmarks) ? bookmarks : []).filter((item) => item?.id !== postId);
            safeWriteJson('wiseBookmarks', normalized);
            return { data: { success: true, fallback: true } };
        }
    },

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
        formData.append('destinationFolder', options.destinationFolder || '');

        const requestConfig = {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (progressEvent) => {
                Math.round((progressEvent.loaded * 100) / progressEvent.total);
            }
        };

        const candidateUrls = buildMediaUploadUrls(type);
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
    search: async (query, type) => {
        const candidates = [
            { endpoint: '/search', params: { q: query, type } },
            { endpoint: '/news/search', params: { q: query, limit: 20 } }
        ];

        let lastError = null;
        for (const candidate of candidates) {
            try {
                return await api.get(candidate.endpoint, { params: candidate.params });
            } catch (error) {
                lastError = error;
                const status = Number(error?.response?.status || 0);
                if (!isMissingEndpointStatus(status)) {
                    throw normalizeApiError(error, 'Search is unavailable right now.');
                }
            }
        }

        throw normalizeApiError(lastError || new Error('Search is unavailable right now.'), 'Search is unavailable right now.');
    },

    // Trends endpoints
    getTrending: async () => {
        const candidates = ['/news/trending', '/posts/trending', '/trending'];
        let lastError = null;

        for (const endpoint of candidates) {
            try {
                const response = await api.get(endpoint);
                return {
                    ...response,
                    data: toTrendingTopics(response?.data)
                };
            } catch (error) {
                lastError = error;
                const status = Number(error?.response?.status || 0);
                if (status !== 404 && status !== 405) {
                    throw error;
                }
            }
        }

        throw lastError || new Error('Trending endpoint is unavailable.');
    },

    // Market data endpoints
    getMarketQuotes: (symbols = []) => api.get('/market/quotes', {
        params: {
            ...(Array.isArray(symbols) && symbols.length > 0
                ? { symbols: symbols.join(',') }
                : {})
        }
    }),

    // Payments endpoints
    createCheckoutSession: async (payload) => {
        const candidates = [
            '/payments/checkout-session',
            '/api/payments/checkout-session',
            `${window.location.origin}/api/payments/checkout-session`,
            'https://wise-ravens.com/api/payments/checkout-session'
        ];

        let lastError = null;
        for (const url of [...new Set(candidates.filter(Boolean))]) {
            try {
                return await api.post(url, payload);
            } catch (error) {
                lastError = error;
                const status = Number(error?.response?.status || 0);
                if (status !== 404 && status !== 405) {
                    throw error;
                }
            }
        }

        throw lastError || new Error('Sponsorship checkout is unavailable right now.');
    },
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