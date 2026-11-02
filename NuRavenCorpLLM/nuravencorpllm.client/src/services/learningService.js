import api from './api';

export const learningService = {
  submitConduit: async (payload) => api.post('/learning/conduit', payload)
};
