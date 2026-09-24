import { getAuthToken } from './authStorage.js';

const API_BASE = '/api/site-crawler';

const authHeaders = async () => {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('Not authenticated.');
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  };
};

const parseError = async (response) => {
  let detail = '';
  try {
    detail = await response.text();
  } catch {
    detail = '';
  }

  const suffix = detail ? ` - ${detail}` : '';
  throw new Error(`Crawler API error: ${response.status}${suffix}`);
};

export const siteAuditCrawlerService = {
  async startCrawl(request) {
    const startUrl = request?.startUrl || request?.rootUrl;
    if (!startUrl) {
      throw new Error('Crawler start URL is required.');
    }

    const payload = {
      ...request,
      startUrl,
    };
    delete payload.rootUrl;

    const response = await fetch(`${API_BASE}/jobs`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      await parseError(response);
    }

    return response.json();
  },

  async getJobs(all = true) {
    const response = await fetch(`${API_BASE}/jobs?all=${String(all)}`, {
      headers: await authHeaders()
    });

    if (!response.ok) {
      await parseError(response);
    }

    return response.json();
  },

  async getJob(jobId) {
    const response = await fetch(`${API_BASE}/jobs/${jobId}`, {
      headers: await authHeaders()
    });

    if (!response.ok) {
      await parseError(response);
    }

    return response.json();
  },

  async getIssues(jobId, { page = 1, pageSize = 100, category, severity, code } = {}) {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (category) params.set('category', category);
    if (severity) params.set('severity', severity);
    if (code) params.set('code', code);

    const response = await fetch(`${API_BASE}/jobs/${jobId}/issues?${params}`, {
      headers: await authHeaders()
    });

    if (!response.ok) {
      await parseError(response);
    }

    return response.json();
  },

  async getPages(jobId, { page = 1, pageSize = 100 } = {}) {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    const response = await fetch(`${API_BASE}/jobs/${jobId}/pages?${params}`, {
      headers: await authHeaders()
    });

    if (!response.ok) {
      await parseError(response);
    }

    return response.json();
  },

  async getMetrics(jobId) {
    const response = await fetch(`${API_BASE}/jobs/${jobId}/metrics`, {
      headers: await authHeaders()
    });

    if (!response.ok) {
      await parseError(response);
    }

    return response.json();
  },

  async cancelJob(jobId) {
    const response = await fetch(`${API_BASE}/jobs/${jobId}/cancel`, {
      method: 'POST',
      headers: await authHeaders()
    });

    if (!response.ok) {
      await parseError(response);
    }
  },

  async deleteJob(jobId) {
    const response = await fetch(`${API_BASE}/jobs/${jobId}`, {
      method: 'DELETE',
      headers: await authHeaders()
    });

    if (!response.ok) {
      await parseError(response);
    }
  },

  async downloadReport(jobId, format = 'Json') {
    const response = await fetch(`${API_BASE}/jobs/${jobId}/report?format=${encodeURIComponent(format)}`, {
      headers: await authHeaders()
    });

    if (!response.ok) {
      await parseError(response);
    }

    if (format === 'Json') {
      return response.json();
    }

    return response.blob();
  }
};
