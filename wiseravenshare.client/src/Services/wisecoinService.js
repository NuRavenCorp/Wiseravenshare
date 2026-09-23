// wiseravenshare.client/src/Services/wisecoinService.js
import { getAuthToken } from './authStorage.js';

const API_BASE = '/api/wisecoin';

const getHeaders = (includeContentType = true) => {
  const headers = { 'Authorization': `Bearer ${getAuthToken() || ''}` };
  if (includeContentType) headers['Content-Type'] = 'application/json';
  return headers;
};

// Returns null on 401/403/404; throws on other errors.
const safeFetch = async (url, opts = {}) => {
  const res = await fetch(url, opts);
  if (res.status === 401 || res.status === 403 || res.status === 404) return null;
  if (!res.ok) {
    let msg = res.statusText || 'Request failed';
    try { const body = await res.json(); msg = body?.error || body?.message || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
};

export const wisecoinService = {
  async getBalance() {
    return safeFetch(`${API_BASE}/balance`, { headers: getHeaders() });
  },

  async getTransactionHistory(page = 1, pageSize = 20) {
    return safeFetch(`${API_BASE}/transactions?page=${page}&pageSize=${pageSize}`, {
      headers: getHeaders(false)
    });
  },

  async getValuation() {
    return safeFetch(`${API_BASE}/valuation`);
  },

  async getBadges() {
    return safeFetch(`${API_BASE}/badges`, { headers: getHeaders(false) });
  },

  async getAvailableBadges() {
    return safeFetch(`${API_BASE}/badges/available`, { headers: getHeaders(false) });
  },

  async claimBadge(badgeId) {
    return safeFetch(`${API_BASE}/badges/${badgeId}/claim`, {
      method: 'POST',
      headers: getHeaders(false)
    });
  },

  async transfer(recipientId, amount, message = null) {
    const res = await fetch(`${API_BASE}/transfer`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ recipientId, amount, message })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Transfer failed');
    }
    return res.json();
  },

  async stake(amount, durationDays, type = 'Flexible') {
    return safeFetch(`${API_BASE}/stake`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ amount, durationDays, type })
    });
  },

  async unstake(stakeId) {
    return safeFetch(`${API_BASE}/unstake/${stakeId}`, {
      method: 'POST',
      headers: getHeaders(false)
    });
  },

  async claimInitialAllocation() {
    const res = await fetch(`${API_BASE}/rollout/claim-initial`, {
      method: 'POST',
      headers: getHeaders(false)
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Claim failed');
    }
    return res.json();
  },

  async getRolloutStatus() {
    return safeFetch(`${API_BASE}/rollout/status`);
  },

  async allocateAll(amountPerUser = 100) {
    return safeFetch(`${API_BASE}/rollout/allocate-all`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ amountPerUser })
    });
  }
};
