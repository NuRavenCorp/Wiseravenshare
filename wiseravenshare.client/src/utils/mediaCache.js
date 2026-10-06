import { storage } from './storage';
import { KEYS } from './storageKeys';

const MAX_PAGES = 20;
const MAX_AGE_MS = 1000 * 60 * 30;

export function loadCache() {
  const cache = storage.get(KEYS.CACHE, { pages: {}, stats: null, timestamp: 0 });
  if (!cache || typeof cache !== 'object') {
    return { pages: {}, stats: null, timestamp: 0 };
  }

  if (Date.now() - (cache.timestamp || 0) > MAX_AGE_MS) {
    return { pages: {}, stats: null, timestamp: 0 };
  }

  const entries = Object.entries(cache.pages || {});
  if (entries.length > MAX_PAGES) {
    const keep = entries.slice(-MAX_PAGES);
    cache.pages = Object.fromEntries(keep);
  }

  return cache;
}

export function saveCache(cache) {
  storage.set(KEYS.CACHE, cache);
}

export function clearCache() {
  storage.remove(KEYS.CACHE);
}

