const normalizeApiBase = (value) => {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) return '/api';
  if (/\/api$/i.test(raw)) return raw;
  return `${raw}/api`;
};

const API_BASE = normalizeApiBase(import.meta.env.VITE_API_URL || '/api');

function normalizePath(path) {
  let normalized = String(path || '').trim();
  if (!normalized) return normalized;

  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }

  if (/\/api$/i.test(API_BASE)) {
    normalized = normalized.replace(/^\/api\//i, '/');
    normalized = normalized.replace(/^\/api$/i, '/');
  }

  return normalized;
}

async function request(path, options = {}) {
  const token = localStorage.getItem('accessToken');
  const isFormData = options.body instanceof FormData;
  const headers = {
    ...(options.headers || {})
  };

  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${normalizePath(path)}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  if (options.responseType === 'blob') {
    return response.blob();
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

const api = {
  get: (path, options = {}) => request(path, { method: 'GET', ...options }),
  post: (path, body, options = {}) => request(path, {
    method: 'POST',
    ...options,
    body: body instanceof FormData ? body : JSON.stringify(body)
  }),
  put: (path, body, options = {}) => request(path, {
    method: 'PUT',
    ...options,
    body: body instanceof FormData ? body : JSON.stringify(body)
  }),
  delete: (path, options = {}) => request(path, { method: 'DELETE', ...options })
};

export default api;
