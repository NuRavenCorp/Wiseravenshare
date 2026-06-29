import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:10000/api';

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
        formData.append('youTubeChannelOrEmail', options.youTubeChannelOrEmail || '');
        formData.append('tikTokUsername', options.tikTokUsername || '');
        formData.append('youTubePermissionGranted', String(Boolean(options.youTubePermissionGranted)));
        formData.append('tikTokPermissionGranted', String(Boolean(options.tikTokPermissionGranted)));
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
    getTrending: () => api.get('/trending')
};

export default api;