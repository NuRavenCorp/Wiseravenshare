import { getAuthToken } from './authStorage.js';

const API_BASE = '/api/sitecrawler';

export const crawlerService = {
  /**
   * Get a user-friendly summary of the crawler results
   * @param {string} [countryCode] - Filter by country code (default: auto-detect)
   * @param {string} [userCategory] - Filter related pages by category
   * @returns {Promise<Object>} Summary with top connected pages, categories, trending
   */
  async getSummary(countryCode, userCategory) {
    try {
      const token = await getAuthToken();
      if (!token) {
        console.warn('Not authenticated, crawler summary not available');
        return null;
      }

      const params = new URLSearchParams();
      if (countryCode) params.append('countryCode', countryCode);
      if (userCategory) params.append('userCategory', userCategory);

      const queryString = params.toString();
      const url = queryString ? `${API_BASE}/summary?${queryString}` : `${API_BASE}/summary`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          console.warn('Crawler API: unauthorized');
          return null;
        }
        throw new Error(`Crawler API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching crawler summary:', error);
      return null;
    }
  },

  /**
   * Get trending pages by region
   * @param {string} [countryCode] - Region to query
   * @returns {Promise<Array>} List of trending pages with scores
   */
  async getTrendingPages(countryCode = 'GLOBAL') {
    const summary = await this.getSummary(countryCode);
    return summary?.topConnectedPages ?? [];
  },

  /**
   * Get pages related to a specific category
   * @param {string} category - Category name (e.g., 'audio', 'studio', 'core')
   * @param {string} [countryCode] - Region to query
   * @returns {Promise<Array>} List of pages in that category
   */
  async getPagesInCategory(category, countryCode = 'GLOBAL') {
    const summary = await this.getSummary(countryCode, category);
    return summary?.relatedInCategory ?? [];
  },

  /**
   * Format a page summary for display
   * @param {Object} page - Page object from crawler
   * @returns {Object} Formatted page with icon and readable label
   */
  formatPage(page) {
    return {
      id: page.pageId,
      label: page.label,
      category: page.category,
      tags: page.tags || [],
      connections: page.incomingConnections,
      score: page.score,
      icon: this.getCategoryIcon(page.category)
    };
  },

  getCategoryIcon(category) {
    const iconMap = {
      'core': 'fas fa-home',
      'studio': 'fas fa-film',
      'audio': 'fas fa-music',
      'library': 'fas fa-book-open',
      'news': 'fas fa-newspaper',
      'team': 'fas fa-users',
      'intelligence': 'fas fa-brain',
      'productivity': 'fas fa-tasks',
      'account': 'fas fa-user',
      'legal': 'fas fa-file-contract',
      'admin': 'fas fa-shield-alt'
    };
    return iconMap[category?.toLowerCase()] || 'fas fa-compass';
  }
};
