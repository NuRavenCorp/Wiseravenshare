import axios from 'axios';
import { getAuthToken } from './authStorage.js';

const ensureApiBase = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return /\/api$/i.test(raw) ? raw : `${raw.replace(/\/+$/, '')}/api`;
};

const extractErrorMessage = (error, fallback) => {
    const responseData = error?.response?.data;
    if (typeof responseData === 'string' && responseData.trim().length > 0) {
        return responseData;
    }

    const serverMessage = responseData?.message || responseData?.error || responseData?.title;
    if (typeof serverMessage === 'string' && serverMessage.trim().length > 0) {
        return serverMessage;
    }

    if (typeof error?.message === 'string' && error.message.trim().length > 0) {
        return error.message;
    }

    return fallback;
};

const resolveRavensightBaseUrl = () => {
    const configured = (import.meta.env.VITE_RAVENSIGHT_API_URL || '').trim();
    if (configured) {
        const normalized = configured.replace(/\/+$/, '');
        if (/\/api\/ravensight\/videos$/i.test(normalized)) {
            return normalized.replace(/\/videos$/i, '');
        }
        if (/\/api\/ravensight$/i.test(normalized)) {
            return normalized;
        }
        if (/\/api$/i.test(normalized)) {
            return `${normalized}/ravensight`;
        }
        return `${normalized}/api/ravensight`;
    }

    if (typeof window === 'undefined') {
        return 'http://localhost:5242/api/ravensight';
    }

    const host = (window.location.hostname || '').toLowerCase();
    const protocol = (window.location.protocol || '').toLowerCase();
    const isLocalHost = host === 'localhost' || host === '127.0.0.1';
    const isViteDevServer = window.location.port === '5173' || window.location.port === '4173';
    const isHybridRuntime = protocol === 'capacitor:' || protocol === 'file:';

    if (isHybridRuntime) {
        const configuredApi = ensureApiBase(import.meta.env.VITE_API_URL || '');
        const base = configuredApi || 'https://wise-ravens.com/api';
        return `${base.replace(/\/+$/, '')}/ravensight`;
    }

    if (isLocalHost || isViteDevServer) {
        const apiBase = ensureApiBase(import.meta.env.VITE_API_URL || '') || 'http://localhost:5242/api';
        return `${apiBase.replace(/\/+$/, '')}/ravensight`;
    }

    // In production/non-local environments prefer configured API host when provided.
    const configuredApi = ensureApiBase(import.meta.env.VITE_API_URL || '');
    if (configuredApi) {
        return `${configuredApi.replace(/\/+$/, '')}/ravensight`;
    }

    // Fallback for same-origin ingress deployments.
    return `${window.location.origin}/api/ravensight`;
};

const RAVENSIGHT_API_URL = resolveRavensightBaseUrl();

const resolveGeneralApiBaseUrl = () => {
    const configuredApi = ensureApiBase(import.meta.env.VITE_API_URL || '');
    if (configuredApi) {
        return configuredApi.replace(/\/+$/, '');
    }

    if (typeof window !== 'undefined') {
        return `${window.location.origin}/api`;
    }

    return 'http://localhost:5242/api';
};

class RavensightAPI {
    constructor() {
        this.generalApiBaseUrl = resolveGeneralApiBaseUrl();
        this.api = axios.create({
            baseURL: RAVENSIGHT_API_URL,
            headers: {}
        });

        // Add token to requests
        this.api.interceptors.request.use(
            (config) => {
                const token = getAuthToken();
                if (token) {
                    config.headers.Authorization = `Bearer ${token}`;
                }
                return config;
            },
            (error) => Promise.reject(error)
        );

        this.api.interceptors.response.use(
            (response) => response,
            (error) => {
                const status = error?.response?.status;
                if (status === 401 || status === 403) {
                    const authError = new Error('Session expired. Please sign in again.');
                    authError.status = status;
                    authError.response = error?.response;
                    return Promise.reject(authError);
                }

                return Promise.reject(error);
            }
        );
    }

    // Video Upload
    async uploadVideo(formData, onProgress) {
        const requestConfig = {
            onUploadProgress: (progressEvent) => {
                if (onProgress) {
                    const total = progressEvent.total || progressEvent.loaded || 1;
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / total);
                    onProgress(percentCompleted);
                }
            }
        };

        const candidateUrls = [
            '/videos/upload',
            '/media/videos/save',
            `${this.generalApiBaseUrl}/media/upload`
        ];

        let lastError = null;

        for (const url of candidateUrls) {
            try {
                const response = await (url.startsWith('http') ? this.api.post(url, formData, requestConfig) : this.api.post(url, formData, requestConfig));
                return response.data;
            } catch (error) {
                lastError = error;
                const status = error?.response?.status;
                if (status !== 404 && status !== 405) {
                    throw new Error(extractErrorMessage(error, 'Video upload failed.'));
                }
            }
        }

        throw new Error(extractErrorMessage(lastError, 'Video upload failed.'));
    }

    // Get Video Feed
    async getVideoFeed(params = {}) {
        const response = await this.api.get('/videos/feed', { params });
        return response.data;
    }

    // Get User Videos
    async getUserVideos() {
        const response = await this.api.get('/videos/user');
        return response.data;
    }

    // Get Single Video
    async getVideo(videoId) {
        const response = await this.api.get(`/videos/${videoId}`);
        return response.data;
    }

    // Update Video
    async updateVideo(videoId, updates) {
        const response = await this.api.put(`/videos/${videoId}`, updates);
        return response.data;
    }

    // Delete Video
    async deleteVideo(videoId) {
        const response = await this.api.delete(`/videos/${videoId}`);
        return response.data;
    }

    // Like Video
    async likeVideo(videoId) {
        const response = await this.api.post(`/videos/${videoId}/like`);
        return response.data;
    }

    // Unlike Video
    async unlikeVideo(videoId) {
        const response = await this.api.delete(`/videos/${videoId}/like`);
        return response.data;
    }

    // Add Comment
    async addComment(videoId, comment) {
        const response = await this.api.post(`/videos/${videoId}/comments`, { comment });
        return response.data;
    }

    // Get Comments
    async getComments(videoId, page = 1) {
        const response = await this.api.get(`/videos/${videoId}/comments`, { params: { page } });
        return response.data;
    }

    // YouTube Integration
    async connectYouTube(authCode) {
        const response = await this.api.post('/youtube/connect', { authCode });
        return response.data;
    }

    async getYouTubeStatus() {
        const response = await this.api.get('/youtube/status');
        return response.data;
    }

    async disconnectYouTube() {
        const response = await this.api.delete('/youtube/disconnect');
        return response.data;
    }

    // Get YouTube Analytics
    async getYouTubeAnalytics(videoId) {
        const response = await this.api.get(`/youtube/analytics/${videoId}`);
        return response.data;
    }

    // Recording Helpers
    async startRecording() {
        const response = await this.api.post('/recording/start');
        return response.data;
    }

    async stopRecording(recordingId) {
        const response = await this.api.post(`/recording/${recordingId}/stop`);
        return response.data;
    }

    async getRecordingStatus(recordingId) {
        const response = await this.api.get(`/recording/${recordingId}/status`);
        return response.data;
    }
}

export const ravensightAPI = new RavensightAPI();
