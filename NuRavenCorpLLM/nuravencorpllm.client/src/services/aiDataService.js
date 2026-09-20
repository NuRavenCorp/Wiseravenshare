import api from './api';

export const aiDataService = {
  ask: async (prompt) => api.post('/api/ai-data/ask', { prompt }),
  sources: async () => api.get('/api/ai-data/sources'),
  templates: async () => api.get('/api/ai-data/templates'),
  history: async (limit = 50) => api.get(`/api/ai-data/history?limit=${limit}`)
};
