import { NAMESPACE_PREFIX } from './storageKeys';

const memoryStore = new Map();
const hasLS = (() => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    const testKey = '__wr_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
})();

const backend = {
  getItem: (key) => (hasLS ? window.localStorage.getItem(key) : (memoryStore.get(key) ?? null)),
  setItem: (key, value) => {
    if (hasLS) window.localStorage.setItem(key, value);
    else memoryStore.set(key, value);
  },
  removeItem: (key) => {
    if (hasLS) window.localStorage.removeItem(key);
    else memoryStore.delete(key);
  },
  keys: () => (hasLS ? Object.keys(window.localStorage) : Array.from(memoryStore.keys())),
};

export const storage = {
  get(key, fallback = null) {
    try {
      const raw = backend.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (error) {
      console.warn(`[storage.get] ${key}`, error);
      return fallback;
    }
  },

  set(key, value) {
    try {
      backend.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      if (error?.name === 'QuotaExceededError' || error?.code === 22) {
        console.warn('[storage.set] quota exceeded, pruning cache');
        pruneNamespace(`${NAMESPACE_PREFIX}ml:cache:`);
        try {
          backend.setItem(key, JSON.stringify(value));
          return true;
        } catch (retryError) {
          console.error('[storage.set] still failing after prune', retryError);
        }
      } else {
        console.warn(`[storage.set] ${key}`, error);
      }
      return false;
    }
  },

  remove(key) {
    try {
      backend.removeItem(key);
    } catch {
      // Ignore storage remove failures.
    }
  },

  keys() {
    try {
      return backend.keys();
    } catch {
      return [];
    }
  },

  prune(prefix) {
    const keys = storage.keys();
    let removed = 0;
    keys.forEach((key) => {
      if (key.startsWith(prefix)) {
        storage.remove(key);
        removed += 1;
      }
    });
    return removed;
  },

  usageBytes() {
    let bytes = 0;
    storage.keys().forEach((key) => {
      if (!key.startsWith(NAMESPACE_PREFIX)) return;
      const value = backend.getItem(key) || '';
      bytes += (key.length + value.length) * 2;
    });
    return bytes;
  },
};

function pruneNamespace(prefix) {
  storage.prune(prefix);
}

