import { useEffect } from 'react';

export function useCrossTabSync(key, onChange) {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handler = (event) => {
      if (event.key !== key || event.newValue == null) return;
      try {
        onChange(JSON.parse(event.newValue));
      } catch (error) {
        console.warn('[cross-tab] parse failed', error);
      }
    };

    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [key, onChange]);
}

