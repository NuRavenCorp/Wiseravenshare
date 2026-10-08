import { useEffect, useRef, useState } from 'react';
import { storage } from '../Services/unifiedStorage';

function resolveDefault(defaultValue) {
  return typeof defaultValue === 'function' ? defaultValue() : defaultValue;
}

export function usePersistedState(key, defaultValue, options = {}) {
  const { deserialize = JSON.parse } = options;
  const [state, setState] = useState(() => {
    const fallback = resolveDefault(defaultValue);
    const storedValue = storage.get(key, fallback);
    return storedValue == null ? fallback : storedValue;
  });
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }

    storage.set(key, state);
  }, [key, state]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handler = (event) => {
      if (event.key !== key || event.newValue == null) return;
      try {
        if (deserialize === JSON.parse) {
          setState(JSON.parse(event.newValue));
        } else {
          setState(deserialize(event.newValue));
        }
      } catch {
        // Ignore malformed cross-tab values.
      }
    };

    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [deserialize, key]);

  return [state, setState];
}
