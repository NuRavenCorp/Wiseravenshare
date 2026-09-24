// src/hooks/useInfiniteScroll.ts
import { useEffect, useRef } from 'react';

export const useInfiniteScroll = (
    callback: () => void,
    hasMore: boolean,
    loading: boolean
) => {
    const observerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (loading || !hasMore) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    callback();
                }
            },
            {
                root: null,
                rootMargin: '0px',
                threshold: 0.1,
            }
        );

        if (observerRef.current) {
            observer.observe(observerRef.current);
        }

        return () => {
            if (observerRef.current) {
                observer.unobserve(observerRef.current);
            }
        };
    }, [callback, hasMore, loading]);

    return observerRef;
};