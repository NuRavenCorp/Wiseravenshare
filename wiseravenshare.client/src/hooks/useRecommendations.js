import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RecommendationEngine } from '../lib/ml/index.js';

/**
 * useRecommendations (WiseRavenShare edition)
 *
 * Runs the in-browser ML recommendation engine on WiseRavenShare content.
 * Converts posts, music tracks, and videos into ContentItems and interaction
 * history into ViewingEvents so the same algorithm serves both apps.
 *
 * @param {{
 *   userId: string,
 *   catalog: import('../lib/ml/types.js').ContentItem[],
 *   history: import('../lib/ml/types.js').ViewingEvent[],
 *   topK?: number,
 *   enabled?: boolean
 * }} opts
 */
export function useRecommendations({
  userId,
  catalog = [],
  history = [],
  topK = 12,
  enabled = true,
}) {
  const engineRef    = useRef(null);
  const catalogSig   = useRef('');
  const [profile,         setProfile]         = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [ready,           setReady]           = useState(false);

  const sig = catalog.length > 0 ? `${catalog.length}:${catalog[0]?.contentId ?? ''}` : '';

  useEffect(() => {
    if (!enabled || catalog.length === 0) return;
    if (sig === catalogSig.current && engineRef.current) return;
    catalogSig.current = sig;

    const engine = new RecommendationEngine({
      profileWeight:   0.70,
      diversityLambda: 0.30,
      alsFactors:      32,
      alsIterations:   history.length > 100 ? 20 : 10,
      persistALS:      true,
    });
    engine.loadCatalog(catalog);
    if (history.length > 0) engine.trainALS(history);
    engineRef.current = engine;
    setReady(true);
  }, [sig, enabled]);

  const refresh = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !enabled) return;
    const result = engine.recommend(userId || 'anon', history, { topK, explain: true });
    setProfile(result.profile);
    setRecommendations(result.recommendations);
  }, [userId, history, topK, enabled, ready]);

  useEffect(() => { if (ready) refresh(); }, [refresh, ready]);

  return { profile, recommendations, refresh, ready };
}

// ── Content adapters ──────────────────────────────────────────────────────────

/**
 * Convert a WiseRavenShare post to ContentItem.
 * @param {{ id, title?, content?, tags?, category?, mediaType?, createdAt? }} post
 */
export function postToContentItem(post) {
  const text   = String(post.title || post.content || post.text || '').slice(0, 200);
  const tags   = Array.isArray(post.tags) ? post.tags : [];
  const cat    = String(post.category || post.mediaType || 'post').toLowerCase();
  const genres = cat ? [cat] : ['post'];

  const isVideo  = /video|stream/i.test(cat);
  const isMusic  = /music|audio|podcast/i.test(cat);
  const isNews   = /news|article|report/i.test(cat);

  return {
    contentId:   String(post.id ?? post._id ?? Math.random()),
    title:       text || 'Untitled',
    genres,
    tags,
    mood:        [],
    pacing:      isVideo ? 'fast' : isMusic ? 'medium' : 'slow',
    complexity:  isNews ? 0.65 : isMusic ? 0.3 : 0.5,
    violence:    0.0,
    humor:       isMusic ? 0.4 : 0.1,
    romance:     0.0,
    duration:    isVideo ? 600 : isMusic ? 210 : 120,
    releaseYear: post.createdAt ? new Date(post.createdAt).getFullYear() : new Date().getFullYear(),
    language:    'en',
  };
}

/**
 * Convert a WiseRavenShare interaction to ViewingEvent.
 * Works for: view, like, play, save, share — maps to engagement signals.
 * @param {{ id?, targetId?, targetType?, durationSeconds?, userId?, timestamp? }} interaction
 * @param {string} fallbackUserId
 */
export function interactionToEvent(interaction, fallbackUserId) {
  const watchSecs     = Number(interaction.durationSeconds || interaction.watchSeconds || 30);
  const contentDur    = watchSecs > 0 ? Math.max(watchSecs * 1.5, 60) : 60;
  const type          = String(interaction.type || '').toLowerCase();
  const rewatchCount  = (type === 'like' || type === 'save' || type === 'bookmark') ? 1 : 0;
  const skipEvents    = type === 'skip' ? 1 : 0;
  const rewindEvents  = type === 'replay' ? 1 : 0;

  return {
    userId:          String(interaction.userId || fallbackUserId || 'anon'),
    contentId:       String(interaction.targetId || interaction.id || 'unknown'),
    timestamp:       interaction.timestamp
                       ? new Date(interaction.timestamp).getTime() / 1000
                       : Date.now() / 1000,
    watchSeconds:    watchSecs,
    contentDuration: contentDur,
    rewatchCount,
    skipEvents,
    rewindEvents,
    timeOfDay:       new Date().getHours(),
    sessionId:       `wrs_session_${String(interaction.userId || fallbackUserId || 'anon')}`,
  };
}

/**
 * Convert a music track to ContentItem.
 */
export function trackToContentItem(track) {
  return {
    contentId:   String(track.id ?? track._id ?? Math.random()),
    title:       String(track.title || track.name || 'Untitled Track'),
    genres:      Array.isArray(track.genres) ? track.genres : [track.genre || 'music'],
    tags:        Array.isArray(track.tags) ? track.tags : [],
    mood:        [],
    pacing:      'medium',
    complexity:  0.3,
    violence:    0.0,
    humor:       0.2,
    romance:     (track.genre || '').toLowerCase().includes('r&b') ? 0.6 : 0.15,
    duration:    Number(track.durationSeconds || track.duration || 210),
    releaseYear: track.releaseYear || new Date().getFullYear(),
    language:    String(track.language || 'en'),
  };
}
