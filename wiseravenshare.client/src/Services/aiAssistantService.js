// Wiseravenshare.client/src/Services/aiAssistantService.js
import axios from 'axios';
import { getAuthToken } from './authStorage.js';

const resolveBase = () => {
    const configured = String(import.meta?.env?.VITE_API_URL || '').trim();
    if (configured) {
        return `${configured.replace(/\/+$/, '').replace(/\/api$/i, '')}/api`;
    }
    if (typeof window !== 'undefined' && ['5173', '4173'].includes(window.location.port)) {
        return 'http://localhost:5242/api';
    }
    return '/api';
};

const client = axios.create({ timeout: 120000 });

client.interceptors.request.use((config) => {
    config.baseURL = resolveBase();
    const token = getAuthToken();
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export const aiAssistantService = {
    /** Lists models available on the backend's Ollama instance. */
    getModels: async () => {
        try {
            const response = await client.get('/aiassistant/models');
            return Array.isArray(response?.data?.models) ? response.data.models : [];
        } catch {
            return [];
        }
    },

    /**
     * Sends a chat message with conversation history.
     * history: [{ role: 'user'|'assistant', content: string }, ...]
     * Returns { success, reply, model, error? }
     */
    chat: async (message, history = [], model = null) => {
        try {
            const response = await client.post('/aiassistant/chat', {
                message,
                history,
                ...(model ? { model } : {})
            });
            return response.data;
        } catch (error) {
            const status = error?.response?.status;
            if (status === 401 || status === 403) {
                return { success: false, reply: '', error: 'Please sign in to use the AI assistant.' };
            }
            return { success: false, reply: '', error: 'The AI assistant is unavailable right now.' };
        }
    }
};

export default aiAssistantService;
