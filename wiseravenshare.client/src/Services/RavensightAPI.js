import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const RAVENSIGHT_API_URL = import.meta.env.VITE_RAVENSIGHT_API_URL || `${API_BASE_URL}/ravensight`;

class RavensightAPI {
    constructor() {
        this.api = axios.create({
            baseURL: RAVENSIGHT_API_URL,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // Add token to requests
        this.api.interceptors.request.use(
            (config) => {
                const token = localStorage.getItem('auth_token');
                if (token) {
                    config.headers.Authorization = `Bearer ${token}`;
                }
                return config;
            },
            (error) => Promise.reject(error)
        );
    }

    // Video Upload
    async uploadVideo(formData, onProgress) {
        const response = await this.api.post('/videos/upload', formData, {
            headers: {
                'Content-Type': 'multipart/form-data'
            },
            onUploadProgress: (progressEvent) => {
                if (onProgress) {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    onProgress(percentCompleted);
                }
            }
        });
        return response.data;
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
