// wiseravenshare.client/src/Services/wisecoinService.js
import { getAuthToken } from './authStorage.js';

const API_BASE = '/api/wisecoin';

const getHeaders = (includeContentType = true) => {
  const headers = { 'Authorization': `Bearer ${getAuthToken()}` };
  if (includeContentType) headers['Content-Type'] = 'application/json';
  return headers;
};

export const wisecoinService = {
  // Get user's WSC wallet and balance
  async getBalance() {
    const response = await fetch(`${API_BASE}/balance`, {
      headers: getHeaders()
    });
    if (!response.ok) throw new Error(`Balance fetch failed: ${response.statusText}`);
    return response.json();
  },

  // Get user's transaction history
  async getTransactionHistory(page = 1, pageSize = 20) {
    const response = await fetch(`${API_BASE}/transactions?page=${page}&pageSize=${pageSize}`, {
      headers: getHeaders(false)
    });
    if (!response.ok) throw new Error(`Transactions fetch failed`);
    return response.json();
  },

  // Get current WSC valuation (public)
  async getValuation() {
    const response = await fetch(`${API_BASE}/valuation`);
    if (!response.ok) throw new Error('Valuation fetch failed');
    return response.json();
  },

  // Get user's badges
  async getBadges() {
    const response = await fetch(`${API_BASE}/badges`, {
      headers: getHeaders(false)
    });
    if (!response.ok) throw new Error('Badges fetch failed');
    return response.json();
  },

  // Get available badges to earn
  async getAvailableBadges() {
    const response = await fetch(`${API_BASE}/badges/available`, {
      headers: getHeaders(false)
    });
    if (!response.ok) throw new Error('Available badges fetch failed');
    return response.json();
  },

  // Claim/award a badge
  async claimBadge(badgeId) {
    const response = await fetch(`${API_BASE}/badges/${badgeId}/claim`, {
      method: 'POST',
      headers: getHeaders(false)
    });
    if (!response.ok) throw new Error('Badge claim failed');
    return response.json();
  },

  // Transfer WSC to another user
  async transfer(recipientId, amount, message = null) {
    const response = await fetch(`${API_BASE}/transfer`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ recipientId, amount, message })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Transfer failed');
    }
    return response.json();
  },

  // Stake WSC tokens
  async stake(amount, durationDays, type = 'Flexible') {
    const response = await fetch(`${API_BASE}/stake`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ amount, durationDays, type })
    });
    if (!response.ok) throw new Error('Stake failed');
    return response.json();
  },

  // Unstake WSC tokens
  async unstake(stakeId) {
    const response = await fetch(`${API_BASE}/unstake/${stakeId}`, {
      method: 'POST',
      headers: getHeaders(false)
    });
    if (!response.ok) throw new Error('Unstake failed');
    return response.json();
  },

  // === Rollout Endpoints ===

  // Claim initial WSC allocation (one-time)
  async claimInitialAllocation() {
    const response = await fetch(`${API_BASE}/rollout/claim-initial`, {
      method: 'POST',
      headers: getHeaders(false)
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Claim failed');
    }
    return response.json();
  },

  // Get rollout status (public)
  async getRolloutStatus() {
    const response = await fetch(`${API_BASE}/rollout/status`);
    if (!response.ok) throw new Error('Rollout status fetch failed');
    return response.json();
  },

  // Batch allocate to all users (admin only)
  async allocateAll(amountPerUser = 100) {
    const response = await fetch(`${API_BASE}/rollout/allocate-all`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ amountPerUser })
    });
    if (!response.ok) throw new Error('Allocation failed');
    return response.json();
  }
};
