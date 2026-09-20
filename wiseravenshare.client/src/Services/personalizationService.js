import { getAuthToken } from './authStorage.js';

const API_BASE = (import.meta?.env?.VITE_API_URL || '').trim().replace(/\/+$/, '') || 'http://localhost:5242/api';

/**
 * Personalization service - handles user profile, recommendations, and personalized trending
 */
export const personalizationService = {
  /**
   * Get personalized crawler trending (blends platform trends with user history)
   * @param {string} [countryCode] - Optional: country code for regional filtering (e.g. 'US')
   * @param {string} [userCategory] - Optional: specific category to focus on
   * @param {number} [count=12] - Number of recommendations to return
   * @returns {Promise<Array>} Array of personalized trending recommendations
   */
  async getPersonalizedTrending(countryCode, userCategory, count = 12) {
    try {
      const token = getAuthToken();
      if (!token) {
        console.warn('No auth token available for personalized trending');
        return [];
      }

      const params = new URLSearchParams();
      if (countryCode) params.append('countryCode', countryCode);
      if (userCategory) params.append('userCategory', userCategory);
      if (count) params.append('count', count);

      const url = `${API_BASE}/personalization/trending/personalized?${params.toString()}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.error(`Failed to fetch personalized trending: ${response.status}`);
        return [];
      }

      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('Error fetching personalized trending:', error);
      return [];
    }
  },

  /**
   * Track a user interaction (view, like, bookmark, etc.)
   * @param {string} type - Interaction type (View, Like, Dislike, Comment, Share, Bookmark, Follow, Search, Play, Skip, Complete, Dismiss, Rate)
   * @param {string} targetType - Type of target (e.g. 'Post', 'Video', 'Page')
   * @param {string} targetId - ID of the target
   * @param {object} [metadata] - Optional metadata (title, category, tags, etc.)
   * @returns {Promise<void>}
   */
  async trackInteraction(type, targetType, targetId, metadata = {}) {
    try {
      const token = getAuthToken();
      if (!token) return;

      const payload = {
        type,
        targetType,
        targetId: targetId || null,
        targetTitle: metadata.title || null,
        targetCategory: metadata.category || null,
        targetTags: metadata.tags || null,
        engagementScore: metadata.engagementScore || null,
        durationSeconds: metadata.durationSeconds || null,
        deviceType: getDeviceType(),
        countryCode: metadata.countryCode || null,
        regionCode: metadata.regionCode || null,
      };

      await fetch(`${API_BASE}/personalization/track`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error('Error tracking interaction:', error);
      // Non-critical, don't throw
    }
  },

  /**
   * Get personalized content recommendations for the current user
   * @param {number} [count=20] - Number of recommendations
   * @returns {Promise<Array>} Array of recommendations
   */
  async getRecommendations(count = 20) {
    try {
      const token = getAuthToken();
      if (!token) return [];

      const url = `${API_BASE}/personalization/recommendations?count=${count}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) return [];

      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('Error fetching recommendations:', error);
      return [];
    }
  },

  /**
   * Get user's interest embedding (tag → weight vector)
   * @returns {Promise<object>} Dictionary of tag → weight
   */
  async getUserEmbedding() {
    try {
      const token = getAuthToken();
      if (!token) return {};

      const url = `${API_BASE}/personalization/embedding`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) return {};

      const data = await response.json();
      return data || {};
    } catch (error) {
      console.error('Error fetching user embedding:', error);
      return {};
    }
  },

  /**
   * Get regional trending topics
   * @param {string} [countryCode='GLOBAL'] - Country code for filtering
   * @param {string} [category='General'] - Category filter
   * @returns {Promise<Array>} Array of trending items
   */
  async getRegionalTrends(countryCode = 'GLOBAL', category = 'General') {
    try {
      const url = `${API_BASE}/personalization/trending?countryCode=${countryCode}&category=${category}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) return [];

      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('Error fetching regional trends:', error);
      return [];
    }
  },
};

/**
 * Helper to determine device type
 * @returns {string}
 */
function getDeviceType() {
  if (typeof window === 'undefined') return 'unknown';

  const ua = navigator.userAgent.toLowerCase();
  if (/mobile|android|iphone|ipad/.test(ua)) return 'mobile';
  if (/tablet|ipad/.test(ua)) return 'tablet';
  return 'desktop';
}

export default personalizationService;
