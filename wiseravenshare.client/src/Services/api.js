import axios from 'axios';

const VITE_DEV_PORTS = new Set(['5173', '4173']);

const resolveApiBaseUrl = () => {
    const configured = (import.meta.env.VITE_API_URL || '').trim();
    const fallback = configured || 'http://localhost:5242/api';

    if (typeof window === 'undefined') {
        return fallback;
    }

    const host = (window.location.hostname || '').toLowerCase();
    const isLocalHost = host === 'localhost' || host === '127.0.0.1';
    const isViteDevServer = VITE_DEV_PORTS.has(window.location.port);

    // Keep API origin aligned with the currently hosted app outside Vite dev
    // to avoid mixed-content/CORS issues and stale-port drift.
    if (isLocalHost && !isViteDevServer) {
        return `${window.location.origin}/api`;
    }

    return fallback;
};

const API_BASE_URL = resolveApiBaseUrl();

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
        const token = localStorage.getItem('auth_token');
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
    getPosts: (params) => api.get('/posts', { params }),
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
    uploadMedia: (file, type, options = {}) => {
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
        return api.post('/media/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (progressEvent) => {
                Math.round((progressEvent.loaded * 100) / progressEvent.total);
            }
        });
    },

    // Search endpoints
    search: (query, type) => api.get('/search', { params: { q: query, type } }),

    // Trends endpoints
    getTrending: () => api.get('/trending'),

    // Payments endpoints
    createCheckoutSession: (payload) => api.post('/payments/checkout-session', payload),
    getPaymentsConfig: () => api.get('/payments/config')
};

export default api;