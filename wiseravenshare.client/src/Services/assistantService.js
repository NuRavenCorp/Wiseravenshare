import api from './api';

export const assistantService = {
  listConversations: async () => (await api.get('/assistant/conversations')).data,
  getConversation: async (id) => (await api.get(`/assistant/conversations/${id}`)).data,
  createConversation: async (payload) => (await api.post('/assistant/conversations', payload)).data,

  sendMessage: async (id, text, isVoice = false) =>
    (await api.post(`/assistant/conversations/${id}/messages`, { text, isVoice })).data,

  transcribeAudio: async (blob) => {
    const form = new FormData();
    form.append('audio', blob, 'audio.webm');
    return (await api.post('/assistant/audio/transcribe', form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })).data;
  },

  speak: async (text, voiceId) => {
    const res = await api.post('/assistant/audio/speak', { text, voiceId }, { responseType: 'blob' });
    return res.data;
  },

  submitFeedback: async (messageId, payload) => {
    await api.post(`/assistant/messages/${messageId}/feedback`, payload);
  }
};
