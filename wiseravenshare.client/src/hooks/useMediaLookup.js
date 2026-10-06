import { useMemo } from 'react';

export function useMediaLookup(items) {
  return useMemo(() => {
    const map = Object.create(null);
    for (const item of items || []) {
      if (item && item.id != null) {
        map[item.id] = item;
      }
    }
    return map;
  }, [items]);
}

