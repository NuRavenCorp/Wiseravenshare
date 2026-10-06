import { useCallback, useRef, useState } from 'react';
import { loadCache, saveCache, clearCache } from '../utils/mediaCache';

const FRESH_MS = 1000 * 60 * 10;

export function useMediaCache() {
  const [cache, setCache] = useState(() => loadCache());
  const persistRef = useRef(null);

  const schedulePersist = (next) => {
    if (persistRef.current) clearTimeout(persistRef.current);
    persistRef.current = setTimeout(() => saveCache(next), 250);
  };

  const keyFor = (page, pageSize, tab, filterType, visibility) =>
    `${page}:${pageSize}:${tab}:${filterType || 'any'}:${visibility ?? 'any'}`;

  const read = useCallback((page, pageSize, tab, filterType, visibility) => {
    const key = keyFor(page, pageSize, tab, filterType, visibility);
    const items = cache.pages[key];
    const isFresh = Date.now() - cache.timestamp < FRESH_MS;
    return { items, isFresh, stats: cache.stats };
  }, [cache]);

  const write = useCallback((page, pageSize, tab, filterType, visibility, items) => {
    const key = keyFor(page, pageSize, tab, filterType, visibility);
    const next = {
      ...cache,
      pages: { ...cache.pages, [key]: items },
      timestamp: Date.now(),
    };
    setCache(next);
    schedulePersist(next);
  }, [cache]);

  const writeStats = useCallback((stats) => {
    const next = { ...cache, stats };
    setCache(next);
    schedulePersist(next);
  }, [cache]);

  const invalidate = useCallback(() => {
    setCache({ pages: {}, stats: null, timestamp: 0 });
    clearCache();
  }, []);

  return { read, write, writeStats, invalidate, timestamp: cache.timestamp };
}

