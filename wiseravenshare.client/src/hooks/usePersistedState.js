import { useEffect, useMemo, useState } from 'react';

function resolveDefault(defaultValue) {
  return typeof defaultValue === 'function' ? defaultValue() : defaultValue;
}

/**
 * useState that persists to localStorage (or any Storage-like object).
 * Handles SSR, JSON parse errors, and cross-tab sync via storage event.
 */
export function usePersistedState(key, defaultValue, options = {}) {
  const storage = useMemo(() => {
    if (Object.prototype.hasOwnProperty.call(options, 'storage')) {
      return options.storage;
    }
    if (typeof window === 'undefined') {
      return null;
    }
    return window.localStorage;
  }, [options]);

  const [state, setState] = useState(() => {
    if (!storage) {
      return resolveDefault(defaultValue);
    }
    try {
      const raw = storage.getItem(key);
      return raw != null ? JSON.parse(raw) : resolveDefault(defaultValue);
    } catch {
      return resolveDefault(defaultValue);
    }
  });

  useEffect(() => {
    if (!storage) return;
    try {
      storage.setItem(key, JSON.stringify(state));
    } catch (err) {
      console.warn(`[usePersistedState] Failed to persist "${key}"`, err);
    }
  }, [key, state, storage]);

  useEffect(() => {
    if (!storage || typeof window === 'undefined') return undefined;

    const onStorage = (event) => {
      if (event.key !== key || event.newValue == null) return;
      try {
        setState(JSON.parse(event.newValue));
      } catch {
        // Ignore malformed external writes.
      }
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key, storage]);

  return [state, setState];
}

