import { useCallback, useEffect, useRef } from 'react';
import api, { apiService } from '../Services/api';

// ─── usePersonalization ───────────────────────────────────────────────────────
// Lightweight hook that:
//  1. Sends interaction events to /api/personalization/track (fire-and-forget)
//  2. Fetches personalized recommendations and regional trending topics
//  3. Cross-links site features: FM radio genres, music library tags,
//     discover topics, and feed posts all share the same interaction stream.
//
// Usage:
//   const { track, getRecommendations, getTrending } = usePersonalization();
//   track('Like', 'Post', post.id, { title: post.title, tags: post.tags });

const QUEUE_FLUSH_MS = 3_000;

export const usePersonalization = () => {
  const queueRef    = useRef([]);
  const flushTimer  = useRef(null);
  const countryCode = useRef(resolveCountryCode());

  // ── Flush interaction queue ───────────────────────────────────────────────
  const flush = useCallback(async () => {
    const items = queueRef.current.splice(0);
    if (items.length === 0) return;

    for (const item of items) {
      try {
        await api.post('/personalization/track', item);
      } catch {
        // Interaction tracking is non-critical — silently discard failures.
      }
    }
  }, []);

  useEffect(() => {
    // Flush on page-hide so we don't lose events on tab close.
    const handleHide = () => flush();
    window.addEventListener('pagehide', handleHide);
    return () => {
      window.removeEventListener('pagehide', handleHide);
      if (flushTimer.current) clearTimeout(flushTimer.current);
      flush();
    };
  }, [flush]);

  // ── Public: track an interaction ─────────────────────────────────────────
  const track = useCallback((
    type,        // 'View' | 'Like' | 'Play' | 'Skip' | 'Bookmark' | 'Share' | ...
    targetType,  // 'Post' | 'Music' | 'Video' | 'FMStation' | 'Podcast' | 'Topic' | ...
    targetId,
    {
      title    = '',
      category = '',
      tags     = [],
      duration = null,
      score    = null,
    } = {}
  ) => {
    const event = {
      type,
      targetType,
      targetId,
      targetTitle:    title    || undefined,
      targetCategory: category || undefined,
      targetTags:     tags.length ? tags : undefined,
      engagementScore: score    ?? undefined,
      durationSeconds: duration ?? undefined,
      deviceType:      guessDeviceType(),
      countryCode:     countryCode.current || undefined,
    };

    queueRef.current.push(event);

    // Debounce flush.
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(flush, QUEUE_FLUSH_MS);
  }, [flush]);

  // ── Public: fetch recommendations ────────────────────────────────────────
  const getRecommendations = useCallback(async (count = 20) => {
    try {
      const res = await api.get(`/personalization/recommendations?count=${count}`);
      return Array.isArray(res?.data) ? res.data : [];
    } catch {
      return [];
    }
  }, []);

  // ── Public: regional trending (cross-feature signal) ─────────────────────
  // category: 'General' | 'Music' | 'News' | 'Video' | 'Podcast'
  const getTrending = useCallback(async (category = 'General') => {
    const cc = countryCode.current || 'GLOBAL';
    try {
      const res = await api.get(
        `/personalization/trending?countryCode=${cc}&category=${encodeURIComponent(category)}`
      );
      return Array.isArray(res?.data) ? res.data : [];
    } catch {
      // Fall back to the existing trending endpoint the app already uses.
      try {
        const fallback = await apiService.getTrending();
        return Array.isArray(fallback?.data) ? fallback.data.map((t) => ({
          topic: t.topic || t.name || '',
          score: t.count || t.posts || 0,
          source: 'WiseRaven',
          category,
        })) : [];
      } catch {
        return [];
      }
    }
  }, []);

  // ── Public: submit crawled/discovered content ─────────────────────────────
  const submitCrawledContent = useCallback(async (contentType, contentId, content, tags = []) => {
    try {
      await api.post('/personalization/crawled', {
        contentType,
        contentId,
        content,
        tags,
        countryCode: countryCode.current || 'GLOBAL',
      });
    } catch { /* non-critical */ }
  }, []);

  const submitCrawledBatch = useCallback(async (items = [], overrideCountryCode = '') => {
    const normalizedItems = (Array.isArray(items) ? items : [])
      .filter((item) => item && item.contentType && item.contentId && item.content)
      .map((item) => ({
        contentType: item.contentType,
        contentId: item.contentId,
        content: item.content,
        tags: Array.isArray(item.tags) ? item.tags : [],
        countryCode: item.countryCode || overrideCountryCode || countryCode.current || 'GLOBAL'
      }));

    if (normalizedItems.length === 0) {
      return;
    }

    try {
      await api.post('/personalization/crawled/batch', {
        items: normalizedItems,
        countryCode: overrideCountryCode || countryCode.current || 'GLOBAL'
      });
    } catch {
      for (const item of normalizedItems) {
        await submitCrawledContent(item.contentType, item.contentId, item.content, item.tags);
      }
    }
  }, [submitCrawledContent]);

  return { track, getRecommendations, getTrending, submitCrawledContent, submitCrawledBatch };
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function resolveCountryCode() {
  try {
    // Try to infer from browser timezone.
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const TZ_TO_CC = {
      'America/New_York':    'US', 'America/Chicago':     'US',
      'America/Los_Angeles': 'US', 'America/Denver':      'US',
      'Europe/London':       'GB', 'Europe/Paris':        'FR',
      'Europe/Berlin':       'DE', 'Europe/Madrid':       'ES',
      'Africa/Lagos':        'NG', 'Africa/Nairobi':      'KE',
      'Africa/Johannesburg': 'ZA', 'Africa/Accra':        'GH',
      'Asia/Tokyo':          'JP', 'Asia/Shanghai':       'CN',
      'Asia/Kolkata':        'IN', 'Asia/Dubai':          'AE',
      'America/Sao_Paulo':   'BR', 'America/Mexico_City': 'MX',
      'America/Toronto':     'CA', 'Australia/Sydney':    'AU',
    };
    return TZ_TO_CC[tz] || 'GLOBAL';
  } catch {
    return 'GLOBAL';
  }
}

function guessDeviceType() {
  if (typeof window === 'undefined') return 'server';
  const ua = window.navigator.userAgent.toLowerCase();
  if (/tablet|ipad/.test(ua))          return 'tablet';
  if (/mobile|iphone|android/.test(ua)) return 'mobile';
  return 'desktop';
}
