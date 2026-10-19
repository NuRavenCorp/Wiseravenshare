import api from './api';

export const aiDataService = {
  ask: async (prompt) => api.post('/ai-data/ask', { prompt }),
  sources: async () => api.get('/ai-data/sources'),
  templates: async () => api.get('/ai-data/templates'),
  history: async (limit = 50) => api.get(`/ai-data/history?limit=${limit}`)
};
