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

const normalizeVideoRecord = (video) => {
    if (!video || typeof video !== 'object') {
        return null;
    }

    return {
        ...video,
        id: video.id || video.videoId || '',
        videoUrl: video.videoUrl || video.mediaUrl || video.filePath || '',
        mediaUrl: video.mediaUrl || video.videoUrl || video.filePath || '',
        likes: Number(video.likes ?? video.likesCount ?? 0),
        likesCount: Number(video.likesCount ?? video.likes ?? 0),
        comments: Number(video.comments ?? video.commentsCount ?? 0),
        commentsCount: Number(video.commentsCount ?? video.comments ?? 0),
        views: Number(video.views ?? video.viewsCount ?? 0),
        viewsCount: Number(video.viewsCount ?? video.views ?? 0)
    };
};

const normalizeVideoCollectionPayload = (payload, requestedLimit = 10) => {
    if (Array.isArray(payload)) {
        return {
            videos: payload.map(normalizeVideoRecord).filter(Boolean),
            hasMore: payload.length >= Math.max(1, Number(requestedLimit) || 10),
            persistenceStatus: 'ready'
        };
    }

    if (payload && typeof payload === 'object') {
        const source = Array.isArray(payload.videos)
            ? payload.videos
            : Array.isArray(payload.items)
                ? payload.items
                : [];

        return {
            videos: source.map(normalizeVideoRecord).filter(Boolean),
            hasMore: Boolean(payload.hasMore),
            persistenceStatus: payload.persistenceStatus || 'ready'
        };
    }

    return { videos: [], hasMore: false, persistenceStatus: 'degraded' };
};

const normalizeVideoEntityPayload = (payload) => {
    if (!payload) {
        return null;
    }

    if (payload.video && typeof payload.video === 'object') {
        return normalizeVideoRecord(payload.video);
    }

    if (payload.file && typeof payload.file === 'object') {
        return normalizeVideoRecord({
            ...payload.file,
            id: payload.file.id || payload.mediaAssetId || payload.fileName,
            videoUrl: payload.mediaUrl || payload.file.mediaUrl || payload.file.publicUrl || payload.file.filePath,
            mediaUrl: payload.mediaUrl || payload.file.mediaUrl || payload.file.publicUrl || payload.file.filePath,
            title: payload.file.title || payload.title || payload.fileName || 'Uploaded Video',
            description: payload.file.description || payload.description || '',
            status: payload.persistenceStatus === 'degraded' ? 'degraded' : 'published',
            privacyStatus: payload.privacyStatus || 'unlisted'
        });
    }

    return normalizeVideoRecord(payload);
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
                if (!config.skipAuth && token) {
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

    async requestWithFallback(method, urls, config = {}) {
        let lastError = null;

        for (const url of urls) {
            try {
                return await this.api.request({ method, url, ...config });
            } catch (error) {
                lastError = error;
                const status = Number(error?.response?.status || 0);
                if (status !== 404 && status !== 405) {
                    throw error;
                }
            }
        }

        throw lastError || new Error('Ravensight API route is unavailable.');
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

        const response = await this.requestWithFallback('post', [
            '/videos/upload',
            '/media/videos/save',
            `${this.generalApiBaseUrl}/media/upload`
        ], {
            data: formData,
            ...requestConfig
        }).catch((error) => {
            throw new Error(extractErrorMessage(error, 'Video upload failed.'));
        });

        const payload = response?.data || {};
        const normalizedVideo = normalizeVideoEntityPayload(payload);

        return {
            ...payload,
            video: normalizedVideo,
            mediaUrl: payload.mediaUrl || normalizedVideo?.mediaUrl || normalizedVideo?.videoUrl || '',
            filePath: payload.filePath || normalizedVideo?.videoUrl || normalizedVideo?.mediaUrl || ''
        };
    }

    // Get Video Feed
    async getVideoFeed(params = {}) {
        const sameOriginApiBase = typeof window !== 'undefined' && window.location?.origin
            ? `${window.location.origin.replace(/\/+$/, '')}/api`
            : null;

        const candidateUrls = [
            '/videos/feed',
            '/feed',
            `${this.generalApiBaseUrl}/ravensight/videos/feed`,
            sameOriginApiBase ? `${sameOriginApiBase}/ravensight/videos/feed` : null
        ].filter(Boolean);

        const requestedFilter = String(params?.filter || 'all').toLowerCase();
        const shouldUseAnonymousFirst = requestedFilter !== 'my_videos';

        const requestModes = shouldUseAnonymousFirst
            ? [{ skipAuth: true }, { skipAuth: false }]
            : [{ skipAuth: false }, { skipAuth: true }];

        let lastError = null;
        for (const mode of requestModes) {
            for (const url of candidateUrls) {
                try {
                    const response = await this.api.get(url, {
                        params,
                        skipAuth: mode.skipAuth
                    });
                    return normalizeVideoCollectionPayload(response.data, params?.limit);
                } catch (error) {
                    lastError = error;
                    const status = error?.status ?? error?.response?.status ?? 0;

                    // Retry only for missing route or auth mode mismatch.
                    if (status === 404 || status === 405) {
                        continue;
                    }

                    if ((status === 401 || status === 403) && mode.skipAuth) {
                        continue;
                    }

                    throw error;
                }
            }
        }

        throw lastError || new Error('Failed to load Ravensight video feed.');
    }

    // Get User Videos
    async getUserVideos(userId = null) {
        const targetUrls = userId
            ? [`/videos/user/${encodeURIComponent(userId)}`, `${this.generalApiBaseUrl}/video/user/${encodeURIComponent(userId)}`, '/videos/user']
            : ['/videos/user'];

        const response = await this.requestWithFallback('get', targetUrls, {
            params: { page: 1, limit: 50, pageSize: 50 }
        });

        const normalized = normalizeVideoCollectionPayload(response?.data, 50);
        return {
            ...response?.data,
            videos: normalized.videos,
            persistenceStatus: normalized.persistenceStatus
        };
    }

    // Get Single Video
    async getVideo(videoId) {
        const response = await this.requestWithFallback('get', [
            `/videos/${videoId}`,
            `${this.generalApiBaseUrl}/video/${videoId}`
        ]);
        return normalizeVideoEntityPayload(response?.data);
    }

    // Update Video
    async updateVideo(videoId, updates) {
        const response = await this.requestWithFallback('put', [
            `/videos/${videoId}`,
            `${this.generalApiBaseUrl}/video/${videoId}`
        ], {
            data: updates
        });
        return normalizeVideoEntityPayload(response?.data);
    }

    // Delete Video
    async deleteVideo(videoId) {
        const response = await this.requestWithFallback('delete', [
            `/videos/${videoId}`,
            `${this.generalApiBaseUrl}/video/${videoId}`
        ]);
        return response?.data || { success: true };
    }

    // Like Video
    async likeVideo(videoId) {
        const response = await this.requestWithFallback('post', [
            `/videos/${videoId}/like`,
            `${this.generalApiBaseUrl}/video/${videoId}/like`
        ]);
        return response?.data || { success: true };
    }

    // Unlike Video
    async unlikeVideo(videoId) {
        const response = await this.requestWithFallback('delete', [
            `/videos/${videoId}/like`,
            `${this.generalApiBaseUrl}/video/${videoId}/like`
        ]);
        return response?.data || { success: true };
    }

    // Add Comment
    async addComment(videoId, comment) {
        const response = await this.requestWithFallback('post', [
            `/videos/${videoId}/comments`
        ], {
            data: { comment }
        });
        return response?.data;
    }

    // Get Comments
    async getComments(videoId, page = 1) {
        const response = await this.requestWithFallback('get', [
            `/videos/${videoId}/comments`
        ], {
            params: { page }
        });
        const payload = response?.data;
        if (Array.isArray(payload)) {
            return { comments: payload, page };
        }
        if (payload && Array.isArray(payload.comments)) {
            return payload;
        }
        return { comments: [], page };
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
