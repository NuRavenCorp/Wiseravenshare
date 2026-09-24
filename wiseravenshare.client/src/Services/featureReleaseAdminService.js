/**
 * Feature Release Admin Service
 * 
 * Admin endpoints for managing feature compartment locks and releases.
 * Used by AdminPanelPage to enable/disable features for the platform.
 */

const API_BASE = '/api/admin/feature-release';

export const featureReleaseAdminService = {
  /**
   * Fetch all features with lock status and tier requirements
   */
  async getCatalog() {
    const res = await fetch(`${API_BASE}/catalog`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error(`Failed to fetch catalog: ${res.status}`);
    return res.json();
  },

  /**
   * Release a single feature (unlock for all eligible users)
   */
  async releaseFeature(key, reason = null) {
    const res = await fetch(`${API_BASE}/${key}/release`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    if (!res.ok) throw new Error(`Failed to release feature: ${res.status}`);
    return res.json();
  },

  /**
   * Gate a single feature (lock behind tier)
   */
  async gateFeature(key, reason = null) {
    const res = await fetch(`${API_BASE}/${key}/gate`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    if (!res.ok) throw new Error(`Failed to gate feature: ${res.status}`);
    return res.json();
  },

  /**
   * Release ALL features at once (bulk operation)
   */
  async releaseAll(reason = null) {
    const res = await fetch(`${API_BASE}/release-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    if (!res.ok) throw new Error(`Failed to release all features: ${res.status}`);
    return res.json();
  },

  /**
   * Gate ALL features at once (bulk operation for rollback)
   */
  async gateAll(reason = null) {
    const res = await fetch(`${API_BASE}/gate-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    if (!res.ok) throw new Error(`Failed to gate all features: ${res.status}`);
    return res.json();
  },

  /**
   * ADMIN GATEWAY: Enable all podcast control room features at once
   * This is the primary flow for releasing podcast functionality to all eligible users.
   */
  async enablePodcastGateway(reason = null) {
    const res = await fetch(`${API_BASE}/podcast-gateway/enable-all`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason: reason || 'Podcast control room enabled by administrator'
      })
    });
    if (!res.ok) throw new Error(`Failed to enable podcast gateway: ${res.status}`);
    return res.json();
  },

  /**
   * ADMIN GATEWAY: Disable all podcast control room features at once
   * Used for maintenance or rollback (gating all podcast features behind 'podcast-pro' tier).
   */
  async disablePodcastGateway(reason = null) {
    const res = await fetch(`${API_BASE}/podcast-gateway/disable-all`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason: reason || 'Podcast control room disabled by administrator'
      })
    });
    if (!res.ok) throw new Error(`Failed to disable podcast gateway: ${res.status}`);
    return res.json();
  }
};

export default featureReleaseAdminService;
