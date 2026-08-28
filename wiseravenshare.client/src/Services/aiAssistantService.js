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
    },

    /**
     * Streams a chat reply via SSE. Calls onToken(fragment) for each delta.
     * Returns the full concatenated reply, or throws on failure.
     */
    chatStream: async (message, history = [], model = null, onToken = () => {}, signal = null) => {
        const base = resolveBase();
        const token = getAuthToken();
        const response = await fetch(`${base}/aiassistant/chat/stream`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ message, history, ...(model ? { model } : {}) }),
            signal: signal || undefined
        });

        if (!response.ok || !response.body) {
            if (response.status === 401 || response.status === 403) {
                throw new Error('Please sign in to use the AI assistant.');
            }
            throw new Error('The AI assistant is unavailable right now.');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let full = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const events = buffer.split('\n\n');
            buffer = events.pop() ?? '';

            for (const evt of events) {
                const line = evt.split('\n').find((l) => l.startsWith('data:'));
                if (!line) continue;
                const data = line.slice(5).trim();
                if (!data || data === '[DONE]') continue;
                try {
                    const fragment = JSON.parse(data);
                    if (fragment) {
                        full += fragment;
                        onToken(fragment);
                    }
                } catch {
                    // Ignore malformed frames.
                }
            }
        }

        return full;
    },

    /**
     * Runs a fire-and-poll AI generation through the background job queue
     * (captions, hashtags, drafts — bursty creator features).
     * Returns { success, reply, model, error? } when the job completes.
     * pollMs: poll interval, timeoutMs: give up point.
     */
    generate: async (message, history = [], model = null, { pollMs = 1200, timeoutMs = 120000 } = {}) => {
        try {
            const enqueue = await client.post('/aiassistant/jobs', {
                message,
                history,
                ...(model ? { model } : {})
            });

            const job = enqueue?.data;
            // Cached jobs come back already Succeeded with the reply inline.
            if (job?.status === 'Succeeded') {
                return { success: true, reply: job.reply ?? '', model: job.model ?? model };
            }
            if (job?.status === 'Failed') {
                return { success: false, reply: '', error: job.error || 'AI generation failed.' };
            }

            const jobId = job?.jobId;
            if (!jobId) {
                return { success: false, reply: '', error: 'Could not start AI generation.' };
            }

            const deadline = Date.now() + timeoutMs;
            while (Date.now() < deadline) {
                await new Promise((r) => setTimeout(r, pollMs));
                const poll = await client.get(`/aiassistant/jobs/${jobId}`);
                const snap = poll?.data;
                if (snap?.status === 'Succeeded') {
                    return { success: true, reply: snap.reply ?? '', model: snap.model ?? model };
                }
                if (snap?.status === 'Failed') {
                    return { success: false, reply: '', error: snap.error || 'AI generation failed.' };
                }
            }
            return { success: false, reply: '', error: 'AI generation timed out — please try again.' };
        } catch (error) {
            const status = error?.response?.status;
            if (status === 401 || status === 403) {
                return { success: false, reply: '', error: 'Please sign in to use AI features.' };
            }
            if (status === 404) {
                return { success: false, reply: '', error: 'AI generation expired — please try again.' };
            }
            return { success: false, reply: '', error: 'AI features are unavailable right now.' };
        }
    }
};

export default aiAssistantService;
