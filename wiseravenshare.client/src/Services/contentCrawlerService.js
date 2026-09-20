import { getAuthToken } from './authStorage';

const API_BASE = '/api/contentcrawler';

export const contentCrawlerService = {
  /**
   * Get trending user-generated content (posts, videos, music)
   */
  async getTrendingContent(options = {}) {
    const token = getAuthToken();
    if (!token) return { trendingContent: [], emergingTopics: [] };

    try {
      const params = new URLSearchParams();
      if (options.contentType) params.append('contentType', options.contentType);
      if (options.countryCode) params.append('countryCode', options.countryCode);
      if (options.topN) params.append('topN', options.topN);

      const response = await fetch(`${API_BASE}/trending?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) return { trendingContent: [], emergingTopics: [] };
      return await response.json();
    } catch (error) {
      console.error('[contentcrawlerService] Failed to fetch trending content:', error);
      return { trendingContent: [], emergingTopics: [] };
    }
  },

  /**
   * Get emerging topics/hashtags from trending content
   */
  async getEmergingTopics(countryCode = null) {
    const token = getAuthToken();
    if (!token) return [];

    try {
      const params = new URLSearchParams();
      if (countryCode) params.append('countryCode', countryCode);

      const response = await fetch(`${API_BASE}/trending/topics?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) return [];
      return await response.json();
    } catch (error) {
      console.error('[contentcrawlerService] Failed to fetch emerging topics:', error);
      return [];
    }
  },

  /**
   * Ingest user-generated content into the crawler
   * (Called from post/video/music creation endpoints)
   */
  async ingestContent(contentData) {
    try {
      const response = await fetch(`${API_BASE}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentId: contentData.id,
          contentType: contentData.type, // Post, Video, Music, Story
          title: contentData.title || '',
          creatorId: contentData.creatorId,
          creatorName: contentData.creatorName || '',
          tags: contentData.tags || [],
          countryCode: contentData.countryCode || 'GLOBAL',
        }),
      });

      if (!response.ok) {
        console.warn(`[contentcrawlerService] Failed to ingest content: ${response.status}`);
      }
    } catch (error) {
      console.error('[contentcrawlerService] Failed to ingest content:', error);
    }
  },

  /**
   * Update engagement metrics for content
   */
  async updateEngagement(contentId, metrics) {
    try {
      const response = await fetch(`${API_BASE}/engagement/${contentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          viewCount: metrics.views || 0,
          likeCount: metrics.likes || 0,
          shareCount: metrics.shares || 0,
        }),
      });

      if (!response.ok) {
        console.warn(`[contentcrawlerService] Failed to update engagement: ${response.status}`);
      }
    } catch (error) {
      console.error('[contentcrawlerService] Failed to update engagement:', error);
    }
  },

  /**
   * Get viral/trending content by type
   */
  async getTrendingByType(contentType, topN = 12) {
    return this.getTrendingContent({ contentType, topN });
  },

  /**
   * Format content for display
   */
  formatContent(content) {
    return {
      id: content.contentId,
      type: content.contentType,
      title: content.title || 'Untitled',
      creator: content.creatorName || 'Unknown Creator',
      creatorId: content.creatorId,
      engagement: {
        views: content.viewCount || 0,
        likes: content.likeCount || 0,
        shares: content.shareCount || 0,
        total: content.engagementCount || 0,
      },
      viral: {
        coefficient: content.viralCoefficient || 0,
        score: content.trendingScore || 0,
        badge: this.getViralBadge(content.viralCoefficient),
      },
      tags: content.tags || [],
      createdAt: content.createdAtUtc,
    };
  },

  /**
   * Get viral badge emoji based on viral coefficient
   */
  getViralBadge(coefficient) {
    if (coefficient >= 10) return '🔥🔥🔥'; // Mega viral
    if (coefficient >= 5) return '🔥🔥';   // Very viral
    if (coefficient >= 2) return '🔥';     // Trending
    return '⬆️';                          // Rising
  },

  /**
   * Get category icon
   */
  getTypeIcon(contentType) {
    const icons = {
      Post: '📝',
      Video: '🎥',
      Music: '🎵',
      Story: '📖',
    };
    return icons[contentType] || '📄';
  }
};
