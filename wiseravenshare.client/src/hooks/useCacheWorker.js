import { useEffect } from 'react';
import { storage } from '../Services/unifiedStorage';
import { NAMESPACE_PREFIX } from '../utils/storageKeys';

export function useCacheWorker(intervalMs = 1000 * 60 * 5) {
  useEffect(() => {
    if (typeof window === 'undefined' || !('Worker' in window)) return undefined;

    const worker = new Worker(new URL('../workers/mediaCacheWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (event) => {
      if (event.data?.type === 'prune-request') {
        storage.prune(`${NAMESPACE_PREFIX}ml:cache:`);
      }
    };

    worker.postMessage({ type: 'prune' });
    const timer = setInterval(() => worker.postMessage({ type: 'prune' }), intervalMs);

    return () => {
      clearInterval(timer);
      worker.terminate();
    };
  }, [intervalMs]);
}

