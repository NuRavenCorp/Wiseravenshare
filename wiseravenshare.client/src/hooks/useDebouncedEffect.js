import { useEffect, useRef } from 'react';

export function useDebouncedEffect(effect, deps, delay = 400) {
  const callbackRef = useRef(effect);

  useEffect(() => {
    callbackRef.current = effect;
  }, [effect]);

  useEffect(() => {
    const timer = setTimeout(() => callbackRef.current(), delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, delay]);
}

