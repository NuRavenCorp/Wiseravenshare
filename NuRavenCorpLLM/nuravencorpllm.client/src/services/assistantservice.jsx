// src/services/assistantService.js
import api from './api';

export const assistantService = {
    listConversations: async () => api.get('/assistant/conversations'),
    getConversation: async (id) => api.get(`/assistant/conversations/${id}`),
    createConversation: async (payload) => api.post('/assistant/conversations', payload),

    sendMessage: async (id, text, isVoice = false) =>
        api.post(`/assistant/conversations/${id}/messages`, { text, isVoice }),

    transcribeAudio: async (blob) => {
        const form = new FormData();
        form.append('audio', blob, 'audio.webm');
        return api.post('/assistant/audio/transcribe', form, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
    },

    speak: async (text, voiceId) => {
        return api.post('/assistant/audio/speak', { text, voiceId }, { responseType: 'blob' });
    },

    submitFeedback: async (messageId, payload) => {
        await api.post(`/assistant/messages/${messageId}/feedback`, payload);
    }
};