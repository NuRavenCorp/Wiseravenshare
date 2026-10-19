import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const api = axios.create({
  baseURL: `${baseURL}/api`,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('nr_token');
  const apiKey = localStorage.getItem('nr_api_key');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (apiKey) config.headers['X-API-Key'] = apiKey;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('nr_token');
    }
    return Promise.reject(error);
  }
);

export const endpoints = {
  clients: '/clients',
  conversations: '/conversations',
  knowledge: '/knowledge',
  ingestion: '/ingestion',
  craft: '/craft',
  models: '/models',
  learning: '/learning',
  analytics: '/analytics',
  governance: '/governance',
};
